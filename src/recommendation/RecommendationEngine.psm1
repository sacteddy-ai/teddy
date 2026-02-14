Set-StrictMode -Version Latest

$script:RecipeCache = $null
$script:BaselineCache = $null

function Get-RecipeFilePath {
  $moduleDir = Split-Path -Parent $PSCommandPath
  return (Join-Path $moduleDir "..\data\recipes.json")
}

function Get-ShoppingBaselineFilePath {
  $moduleDir = Split-Path -Parent $PSCommandPath
  return (Join-Path $moduleDir "..\data\shopping_baseline.json")
}

function Read-JsonFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "File not found: $Path"
  }

  $raw = Get-Content -LiteralPath $Path -Raw
  if ([string]::IsNullOrWhiteSpace($raw)) {
    throw "File is empty: $Path"
  }

  return ($raw | ConvertFrom-Json)
}

function Get-RecipeCatalog {
  param(
    [Parameter(Mandatory = $false)]
    [string]$RecipePath = (Get-RecipeFilePath)
  )

  if ($null -eq $script:RecipeCache) {
    $parsed = Read-JsonFile -Path $RecipePath
    if ($null -eq $parsed.recipes -or @($parsed.recipes).Count -eq 0) {
      throw "No recipes found in: $RecipePath"
    }
    $script:RecipeCache = @($parsed.recipes)
  }

  return @($script:RecipeCache)
}

function Get-ShoppingBaseline {
  param(
    [Parameter(Mandatory = $false)]
    [string]$BaselinePath = (Get-ShoppingBaselineFilePath)
  )

  if ($null -eq $script:BaselineCache) {
    $parsed = Read-JsonFile -Path $BaselinePath
    if ($null -eq $parsed.essential_ingredient_keys) {
      throw "No essential_ingredient_keys found in: $BaselinePath"
    }
    $script:BaselineCache = $parsed
  }

  return $script:BaselineCache
}

function Normalize-IngredientKey {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  return $Value.Trim().ToLowerInvariant().Replace(" ", "_")
}

function Get-IngredientKeyFromInventoryItem {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Item
  )

  if ($Item.PSObject.Properties["ingredient_key"] -and -not [string]::IsNullOrWhiteSpace($Item.ingredient_key)) {
    return (Normalize-IngredientKey -Value $Item.ingredient_key)
  }

  if ($Item.PSObject.Properties["ingredient_name"] -and -not [string]::IsNullOrWhiteSpace($Item.ingredient_name)) {
    return (Normalize-IngredientKey -Value $Item.ingredient_name)
  }

  return "unknown"
}

function Build-InventoryMap {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyCollection()]
    [object[]]$InventoryItems
  )

  $map = @{}

  foreach ($item in @($InventoryItems)) {
    $key = Get-IngredientKeyFromInventoryItem -Item $item
    $quantity = 0.0
    if ($item.PSObject.Properties["quantity"] -and $null -ne $item.quantity) {
      $quantity = [double]$item.quantity
    }

    $status = if ($item.PSObject.Properties["status"] -and -not [string]::IsNullOrWhiteSpace($item.status)) {
      $item.status
    }
    else {
      "fresh"
    }

    if (-not $map.ContainsKey($key)) {
      $map[$key] = [PSCustomObject]@{
        ingredient_key = $key
        total_quantity = 0.0
        has_fresh_or_soon = $false
        has_expired = $false
        expiring_soon_quantity = 0.0
      }
    }

    $entry = $map[$key]
    $entry.total_quantity = [double]$entry.total_quantity + $quantity

    if ($status -eq "expired") {
      $entry.has_expired = $true
    }
    else {
      $entry.has_fresh_or_soon = $true
    }

    if ($status -eq "expiring_soon") {
      $entry.expiring_soon_quantity = [double]$entry.expiring_soon_quantity + $quantity
    }
  }

  return $map
}

function Get-RecipeRecommendations {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyCollection()]
    [object[]]$InventoryItems,
    [Parameter(Mandatory = $false)]
    [int]$TopN = 10
  )

  if ($TopN -le 0) {
    throw "top_n must be greater than 0."
  }

  $recipes = Get-RecipeCatalog
  $inventoryMap = Build-InventoryMap -InventoryItems $InventoryItems

  $results = @()
  foreach ($recipe in $recipes) {
    $required = @($recipe.ingredient_keys | ForEach-Object { Normalize-IngredientKey -Value $_ })
    $matched = @()
    $missing = @()
    $expiringSoonUsedCount = 0

    foreach ($requiredKey in $required) {
      if ($inventoryMap.ContainsKey($requiredKey) -and $inventoryMap[$requiredKey].has_fresh_or_soon -and $inventoryMap[$requiredKey].total_quantity -gt 0) {
        $matched += $requiredKey
        if ($inventoryMap[$requiredKey].expiring_soon_quantity -gt 0) {
          $expiringSoonUsedCount += 1
        }
      }
      else {
        $missing += $requiredKey
      }
    }

    $requiredCount = @($required).Count
    $matchedCount = @($matched).Count
    $missingCount = @($missing).Count
    $matchRatio = if ($requiredCount -eq 0) { 0.0 } else { $matchedCount / [double]$requiredCount }
    $canMakeNow = ($missingCount -eq 0)

    $scoreBase = [math]::Round($matchRatio * 100, 2)
    $urgencyBoost = $expiringSoonUsedCount * 5
    $missingPenalty = $missingCount * 8
    $completionBonus = if ($canMakeNow) { 20 } else { 0 }
    $score = [math]::Round($scoreBase + $urgencyBoost + $completionBonus - $missingPenalty, 2)

    $results += [PSCustomObject]@{
      recipe_id = $recipe.id
      recipe_name = $recipe.name
      chef = $recipe.chef
      tags = @($recipe.tags)
      required_ingredient_keys = $required
      optional_ingredient_keys = @($recipe.optional_ingredient_keys)
      matched_ingredient_keys = $matched
      missing_ingredient_keys = $missing
      can_make_now = $canMakeNow
      expiring_soon_used_count = $expiringSoonUsedCount
      match_ratio = $matchRatio
      score = $score
    }
  }

  $ordered = @($results | Sort-Object -Property `
    @{ Expression = { if ($_.can_make_now) { 0 } else { 1 } } }, `
    @{ Expression = { -$_.score } }, `
    @{ Expression = { -$_.match_ratio } }, `
    @{ Expression = { $_.recipe_name } })

  return @($ordered | Select-Object -First $TopN)
}

function Add-OrUpdateSuggestion {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable]$Map,
    [Parameter(Mandatory = $true)]
    [string]$IngredientKey,
    [Parameter(Mandatory = $true)]
    [string]$Reason,
    [Parameter(Mandatory = $true)]
    [int]$Priority,
    [Parameter(Mandatory = $false)]
    [string]$RelatedRecipeId = $null
  )

  if (-not $Map.ContainsKey($IngredientKey)) {
    $Map[$IngredientKey] = [PSCustomObject]@{
      ingredient_key = $IngredientKey
      reasons = @($Reason)
      priority = $Priority
      related_recipe_ids = @()
    }
  }
  else {
    $existing = $Map[$IngredientKey]
    if (-not (@($existing.reasons) -contains $Reason)) {
      $existing.reasons = @($existing.reasons) + @($Reason)
    }
    if ($Priority -lt [int]$existing.priority) {
      $existing.priority = $Priority
    }
  }

  if (-not [string]::IsNullOrWhiteSpace($RelatedRecipeId)) {
    $entry = $Map[$IngredientKey]
    if (-not (@($entry.related_recipe_ids) -contains $RelatedRecipeId)) {
      $entry.related_recipe_ids = @($entry.related_recipe_ids) + @($RelatedRecipeId)
    }
  }
}

function Get-ShoppingSuggestions {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyCollection()]
    [object[]]$InventoryItems,
    [Parameter(Mandatory = $false)]
    [object[]]$RecipeRecommendations = @(),
    [Parameter(Mandatory = $false)]
    [int]$TopRecipeCount = 3,
    [Parameter(Mandatory = $false)]
    [Nullable[int]]$LowStockThreshold = $null
  )

  $inventoryMap = Build-InventoryMap -InventoryItems $InventoryItems
  $baseline = Get-ShoppingBaseline

  $threshold = if ($null -ne $LowStockThreshold) {
    [int]$LowStockThreshold
  }
  else {
    [int]$baseline.low_stock_threshold_default
  }

  $suggestionMap = @{}

  foreach ($key in $inventoryMap.Keys) {
    $entry = $inventoryMap[$key]
    if ($entry.has_expired) {
      Add-OrUpdateSuggestion -Map $suggestionMap -IngredientKey $key -Reason "expired_replace" -Priority 1
    }

    if ($entry.has_fresh_or_soon -and $entry.total_quantity -gt 0 -and $entry.total_quantity -le $threshold) {
      Add-OrUpdateSuggestion -Map $suggestionMap -IngredientKey $key -Reason "low_stock" -Priority 2
    }
  }

  foreach ($essential in @($baseline.essential_ingredient_keys)) {
    $key = Normalize-IngredientKey -Value $essential
    if (-not $inventoryMap.ContainsKey($key) -or $inventoryMap[$key].total_quantity -le 0 -or -not $inventoryMap[$key].has_fresh_or_soon) {
      Add-OrUpdateSuggestion -Map $suggestionMap -IngredientKey $key -Reason "essential_missing" -Priority 2
    }
  }

  $recipesForShopping = @($RecipeRecommendations | Select-Object -First $TopRecipeCount)
  foreach ($recipe in $recipesForShopping) {
    if ($recipe.can_make_now) {
      continue
    }
    foreach ($missingKey in @($recipe.missing_ingredient_keys)) {
      Add-OrUpdateSuggestion `
        -Map $suggestionMap `
        -IngredientKey (Normalize-IngredientKey -Value $missingKey) `
        -Reason "recipe_missing" `
        -Priority 3 `
        -RelatedRecipeId $recipe.recipe_id
    }
  }

  $items = @($suggestionMap.Values | Sort-Object -Property priority, ingredient_key)
  return [PSCustomObject]@{
    items = $items
    count = @($items).Count
    low_stock_threshold = $threshold
  }
}

Export-ModuleMember -Function Get-RecipeRecommendations, Get-ShoppingSuggestions
