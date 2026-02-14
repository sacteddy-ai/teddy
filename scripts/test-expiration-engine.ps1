Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$modulePath = Join-Path $PSScriptRoot "..\src\expiration\ExpirationEngine.psm1"
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

function Run-Tests {
  $asOf = [datetime]"2026-02-13"

  $case1 = Get-ExpirationSuggestion `
    -IngredientName "milk" `
    -PurchasedAt "2026-02-13" `
    -StorageType "refrigerated" `
    -OcrExpirationDate "2026-02-20" `
    -ProductShelfLifeDays 12 `
    -AsOfDate $asOf
  Assert-Equal -Actual $case1.expiration_source -Expected "ocr" -Message "OCR must have highest priority"
  Assert-Equal -Actual $case1.suggested_expiration_date -Expected "2026-02-20" -Message "OCR date should be returned"

  $case2 = Get-ExpirationSuggestion `
    -IngredientName "milk" `
    -PurchasedAt "2026-02-13" `
    -StorageType "refrigerated" `
    -ProductShelfLifeDays 8 `
    -AsOfDate $asOf
  Assert-Equal -Actual $case2.expiration_source -Expected "product_profile" -Message "Product shelf-life should be second priority"
  Assert-Equal -Actual $case2.suggested_expiration_date -Expected "2026-02-21" -Message "Product shelf-life date should be purchase + days"

  $case3 = Get-ExpirationSuggestion `
    -IngredientName "eggs" `
    -PurchasedAt "2026-02-13" `
    -StorageType "refrigerated" `
    -AsOfDate $asOf
  Assert-Equal -Actual $case3.expiration_source -Expected "average_rule" -Message "Average rule should be fallback"
  Assert-Equal -Actual $case3.suggested_expiration_date -Expected "2026-03-13" -Message "Egg average 28 days should apply"
  Assert-Equal -Actual $case3.confidence -Expected "high" -Message "Egg refrigerated unopened confidence should be high"

  $case4 = Get-ExpirationSuggestion `
    -IngredientName "tofu" `
    -PurchasedAt "2026-02-13" `
    -OpenedAt "2026-02-14" `
    -StorageType "refrigerated" `
    -AsOfDate $asOf
  Assert-Equal -Actual $case4.condition_type -Expected "opened" -Message "Opened state should be derived"
  Assert-Equal -Actual $case4.reference_date -Expected "2026-02-14" -Message "Opened date should become reference"
  Assert-Equal -Actual $case4.suggested_expiration_date -Expected "2026-02-16" -Message "Opened tofu avg 2 days should apply"

  $case5 = Get-ExpirationSuggestion `
    -IngredientName "unknown_item" `
    -PurchasedAt "2026-02-13" `
    -StorageType "refrigerated" `
    -AsOfDate $asOf
  Assert-Equal -Actual $case5.ingredient_key -Expected "default_perishable" -Message "Unknown ingredient should fallback to default rule"
  Assert-Equal -Actual $case5.confidence -Expected "low" -Message "Fallback rule confidence should be low"
  Assert-Equal -Actual $case5.suggested_expiration_date -Expected "2026-02-18" -Message "Default avg 5 days should apply"

  Write-Host "All expiration-engine tests passed."
}

Run-Tests
