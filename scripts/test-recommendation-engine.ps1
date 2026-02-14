Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$modulePath = Join-Path $PSScriptRoot "..\src\recommendation\RecommendationEngine.psm1"
Import-Module $modulePath -Force -DisableNameChecking

function Assert-Equal {
  param(
    [Parameter(Mandatory = $true)]$Actual,
    [Parameter(Mandatory = $true)]$Expected,
    [Parameter(Mandatory = $true)][string]$Message
  )

  if ($Actual -ne $Expected) {
    throw "Assertion failed: $Message. Expected='$Expected', Actual='$Actual'"
  }
}

function Assert-True {
  param(
    [Parameter(Mandatory = $true)][bool]$Condition,
    [Parameter(Mandatory = $true)][string]$Message
  )

  if (-not $Condition) {
    throw "Assertion failed: $Message"
  }
}

function Run-Tests {
  $inventory = @(
    [PSCustomObject]@{
      ingredient_key = "egg"
      ingredient_name = "egg"
      quantity = 0.5
      status = "fresh"
    },
    [PSCustomObject]@{
      ingredient_key = "kimchi"
      ingredient_name = "kimchi"
      quantity = 1
      status = "expiring_soon"
    },
    [PSCustomObject]@{
      ingredient_key = "green_onion"
      ingredient_name = "green_onion"
      quantity = 1
      status = "fresh"
    },
    [PSCustomObject]@{
      ingredient_key = "onion"
      ingredient_name = "onion"
      quantity = 1
      status = "expired"
    },
    [PSCustomObject]@{
      ingredient_key = "tofu"
      ingredient_name = "tofu"
      quantity = 1
      status = "fresh"
    }
  )

  $recommendations = @(Get-RecipeRecommendations -InventoryItems $inventory -TopN 5)
  Assert-Equal -Actual $recommendations.Count -Expected 5 -Message "TopN should be respected"

  $top = $recommendations[0]
  Assert-True -Condition ($top.can_make_now -eq $true) -Message "Top recipe should be fully makeable"
  Assert-True -Condition (@($top.missing_ingredient_keys).Count -eq 0) -Message "Top recipe should have no missing ingredients"

  $recipeIds = @($recommendations | ForEach-Object { $_.recipe_id })
  Assert-True -Condition ($recipeIds -contains "r001") -Message "Kimchi Fried Rice should be recommended"

  $shopping = Get-ShoppingSuggestions `
    -InventoryItems $inventory `
    -RecipeRecommendations $recommendations `
    -TopRecipeCount 3 `
    -LowStockThreshold 1

  Assert-True -Condition ($shopping.count -ge 3) -Message "Shopping list should include multiple suggestions"

  $shoppingKeys = @($shopping.items | ForEach-Object { $_.ingredient_key })
  Assert-True -Condition ($shoppingKeys -contains "onion") -Message "Expired onion should be suggested for replacement"
  Assert-True -Condition ($shoppingKeys -contains "egg") -Message "Low-stock egg should be suggested"
  Assert-True -Condition ($shoppingKeys -contains "milk") -Message "Missing essential milk should be suggested"

  $onion = @($shopping.items | Where-Object { $_.ingredient_key -eq "onion" } | Select-Object -First 1)[0]
  Assert-Equal -Actual $onion.priority -Expected 1 -Message "Expired replacement should have highest priority"

  $emptyInventory = @()
  $emptyRecommendations = @(Get-RecipeRecommendations -InventoryItems $emptyInventory -TopN 3)
  Assert-Equal -Actual $emptyRecommendations.Count -Expected 3 -Message "Recommendations should still return topN when inventory is empty"

  $emptyShopping = Get-ShoppingSuggestions -InventoryItems $emptyInventory -RecipeRecommendations $emptyRecommendations -TopRecipeCount 2
  Assert-True -Condition ($emptyShopping.count -gt 0) -Message "Shopping suggestions should not fail on empty inventory"
  $emptyKeys = @($emptyShopping.items | ForEach-Object { $_.ingredient_key })
  Assert-True -Condition ($emptyKeys -contains "egg") -Message "Essential missing item should be suggested for empty inventory"

  Write-Host "Recommendation engine tests passed."
}

Run-Tests
