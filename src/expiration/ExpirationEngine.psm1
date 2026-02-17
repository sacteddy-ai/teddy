Set-StrictMode -Version Latest

$script:RuleCache = $null

function Get-RuleFilePath {
  $moduleDir = Split-Path -Parent $PSCommandPath
  return (Join-Path $moduleDir "..\data\shelf_life_rules.json")
}

function Parse-DateSafe {
  param(
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [object]$Value
  )

  if ($null -eq $Value) {
    return $null
  }

  if ($Value -is [datetime]) {
    return $Value.Date
  }

  if ([string]::IsNullOrWhiteSpace($Value.ToString())) {
    return $null
  }

  try {
    return ([datetime]::Parse($Value.ToString())).Date
  }
  catch {
    throw "Invalid date format: '$Value'. Use ISO date like 2026-02-13."
  }
}

function Get-ShelfLifeRules {
  param(
    [Parameter(Mandatory = $false)]
    [string]$RulesPath = (Get-RuleFilePath)
  )

  if (-not (Test-Path -LiteralPath $RulesPath)) {
    throw "Rules file not found: $RulesPath"
  }

  if ($null -eq $script:RuleCache) {
    $raw = Get-Content -LiteralPath $RulesPath -Raw
    $parsed = $raw | ConvertFrom-Json
    if ($null -eq $parsed.rules -or $parsed.rules.Count -eq 0) {
      throw "No shelf-life rules found in: $RulesPath"
    }
    $script:RuleCache = $parsed.rules
  }

  return $script:RuleCache
}

function Clear-ShelfLifeRuleCache {
  $script:RuleCache = $null
}

function Normalize-IngredientName {
  param(
    [Parameter(Mandatory = $true)]
    [string]$IngredientName
  )

  return $IngredientName.Trim().ToLowerInvariant()
}

function Find-Rule {
  param(
    [Parameter(Mandatory = $true)]
    [string]$IngredientName,
    [Parameter(Mandatory = $true)]
    [string]$StorageType,
    [Parameter(Mandatory = $true)]
    [string]$ConditionType,
    [Parameter(Mandatory = $false)]
    [string]$RulesPath = (Get-RuleFilePath)
  )

  $rules = Get-ShelfLifeRules -RulesPath $RulesPath
  $normalized = Normalize-IngredientName -IngredientName $IngredientName

  $pickFromCandidates = {
    param([array]$Candidates, [string]$Normalized)

    $exact = @($Candidates | Where-Object {
      $_.ingredient_key -eq $Normalized
    } | Select-Object -First 1)
    if ($exact.Count -gt 0) {
      return $exact[0]
    }

    $aliasMatch = @($Candidates | Where-Object {
      $aliases = @($_.aliases) | ForEach-Object { $_.ToString().Trim().ToLowerInvariant() }
      $aliases -contains $Normalized
    } | Select-Object -First 1)
    if ($aliasMatch.Count -gt 0) {
      return $aliasMatch[0]
    }

    $fallback = @($Candidates | Where-Object {
      $_.ingredient_key -eq "default_perishable"
    } | Select-Object -First 1)
    if ($fallback.Count -gt 0) {
      return $fallback[0]
    }

    return $null
  }

  $conditionAlt = if ($ConditionType -eq "opened") { "unopened" } else { "opened" }
  $scopes = @(
    @{ storage = $StorageType; condition = $ConditionType },
    @{ storage = $StorageType; condition = $conditionAlt },
    @{ storage = $StorageType; condition = $null },
    @{ storage = $null; condition = $ConditionType },
    @{ storage = $null; condition = $conditionAlt },
    @{ storage = $null; condition = $null }
  )

  foreach ($scope in $scopes) {
    $candidates = @($rules | Where-Object {
      ($null -eq $scope.storage -or $_.storage_type -eq $scope.storage) -and
      ($null -eq $scope.condition -or $_.condition_type -eq $scope.condition)
    })
    $picked = & $pickFromCandidates -Candidates $candidates -Normalized $normalized
    if ($null -ne $picked) {
      return $picked
    }
  }

  throw "No shelf-life rule found for '$IngredientName' ($StorageType, $ConditionType)."
}

function Get-ItemStatus {
  param(
    [Parameter(Mandatory = $true)]
    [datetime]$SuggestedExpirationDate,
    [Parameter(Mandatory = $false)]
    [datetime]$AsOfDate = (Get-Date).Date,
    [Parameter(Mandatory = $false)]
    [int]$ExpiringSoonThresholdDays = 3
  )

  $daysRemaining = ($SuggestedExpirationDate.Date - $AsOfDate.Date).Days

  if ($daysRemaining -lt 0) {
    return @{
      status = "expired"
      days_remaining = $daysRemaining
    }
  }

  if ($daysRemaining -le $ExpiringSoonThresholdDays) {
    return @{
      status = "expiring_soon"
      days_remaining = $daysRemaining
    }
  }

  return @{
    status = "fresh"
    days_remaining = $daysRemaining
  }
}

function Get-ExpirationSuggestion {
  param(
    [Parameter(Mandatory = $true)]
    [string]$IngredientName,
    [Parameter(Mandatory = $true)]
    [object]$PurchasedAt,
    [Parameter(Mandatory = $false)]
    [ValidateSet("refrigerated", "frozen", "room")]
    [string]$StorageType = "refrigerated",
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [object]$OpenedAt = $null,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [object]$OcrExpirationDate = $null,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [Nullable[int]]$ProductShelfLifeDays = $null,
    [Parameter(Mandatory = $false)]
    [string]$RulesPath = (Get-RuleFilePath),
    [Parameter(Mandatory = $false)]
    [datetime]$AsOfDate = (Get-Date).Date
  )

  $purchasedDate = Parse-DateSafe -Value $PurchasedAt
  if ($null -eq $purchasedDate) {
    throw "purchased_at is required."
  }

  $openedDate = Parse-DateSafe -Value $OpenedAt
  $ocrDate = Parse-DateSafe -Value $OcrExpirationDate

  if ($null -ne $openedDate -and $openedDate -lt $purchasedDate) {
    throw "opened_at cannot be earlier than purchased_at."
  }

  $conditionType = if ($null -ne $openedDate) { "opened" } else { "unopened" }
  $referenceDate = if ($conditionType -eq "opened") { $openedDate } else { $purchasedDate }

  $source = ""
  $confidence = ""
  $suggestedExpirationDate = $null
  $ruleContext = $null
  $rangeMinDate = $null
  $rangeMaxDate = $null

  if ($null -ne $ocrDate) {
    $source = "ocr"
    $confidence = "high"
    $suggestedExpirationDate = $ocrDate
  }
  elseif ($null -ne $ProductShelfLifeDays -and $ProductShelfLifeDays -gt 0) {
    $source = "product_profile"
    $confidence = "medium"
    $suggestedExpirationDate = $referenceDate.AddDays([int]$ProductShelfLifeDays)
  }
  else {
    $ruleContext = Find-Rule `
      -IngredientName $IngredientName `
      -StorageType $StorageType `
      -ConditionType $conditionType `
      -RulesPath $RulesPath

    $source = "average_rule"
    $confidence = $ruleContext.confidence
    $suggestedExpirationDate = $referenceDate.AddDays([int]$ruleContext.avg_days)
    $rangeMinDate = $referenceDate.AddDays([int]$ruleContext.min_days)
    $rangeMaxDate = $referenceDate.AddDays([int]$ruleContext.max_days)
  }

  $statusInfo = Get-ItemStatus -SuggestedExpirationDate $suggestedExpirationDate -AsOfDate $AsOfDate

  return [PSCustomObject]@{
    ingredient_name_input = $IngredientName
    ingredient_key = if ($ruleContext) { $ruleContext.ingredient_key } else { $null }
    storage_type = $StorageType
    condition_type = $conditionType
    purchased_at = $purchasedDate.ToString("yyyy-MM-dd")
    opened_at = if ($null -ne $openedDate) { $openedDate.ToString("yyyy-MM-dd") } else { $null }
    reference_date = $referenceDate.ToString("yyyy-MM-dd")
    suggested_expiration_date = $suggestedExpirationDate.ToString("yyyy-MM-dd")
    range_min_date = if ($null -ne $rangeMinDate) { $rangeMinDate.ToString("yyyy-MM-dd") } else { $null }
    range_max_date = if ($null -ne $rangeMaxDate) { $rangeMaxDate.ToString("yyyy-MM-dd") } else { $null }
    expiration_source = $source
    confidence = $confidence
    status = $statusInfo.status
    days_remaining = $statusInfo.days_remaining
    rule_source = if ($ruleContext) { $ruleContext.source } else { $null }
  }
}

Export-ModuleMember -Function Get-ExpirationSuggestion, Get-ShelfLifeRules, Get-ItemStatus, Clear-ShelfLifeRuleCache
