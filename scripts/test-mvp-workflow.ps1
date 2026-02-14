Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$expirationModulePath = Join-Path $PSScriptRoot "..\src\expiration\ExpirationEngine.psm1"
$ocrModulePath = Join-Path $PSScriptRoot "..\src\ocr\OcrDateParser.psm1"
$storeModulePath = Join-Path $PSScriptRoot "..\src\data\Store.psm1"
$notificationModulePath = Join-Path $PSScriptRoot "..\src\notifications\NotificationEngine.psm1"

Import-Module $expirationModulePath -Force -DisableNameChecking
Import-Module $ocrModulePath -Force -DisableNameChecking
Import-Module $storeModulePath -Force -DisableNameChecking
Import-Module $notificationModulePath -Force -DisableNameChecking

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

function Run-WorkflowTest {
  Clear-StorageData

  $ocr = Parse-OcrExpirationDate -RawText "BEST BEFORE 2026-02-20"
  Assert-Equal -Actual $ocr.parsed_expiration_date -Expected "2026-02-20" -Message "OCR date should be parsed"
  Assert-Equal -Actual $ocr.parser_confidence -Expected "high" -Message "Keyword format should return high confidence"

  $suggestion = Get-ExpirationSuggestion `
    -IngredientName "milk" `
    -PurchasedAt "2026-02-13" `
    -StorageType "refrigerated" `
    -OcrExpirationDate $ocr.parsed_expiration_date `
    -AsOfDate ([datetime]"2026-02-13")

  Assert-Equal -Actual $suggestion.expiration_source -Expected "ocr" -Message "OCR should be top priority"
  Assert-Equal -Actual $suggestion.suggested_expiration_date -Expected "2026-02-20" -Message "OCR expiration date should be used"

  $itemId = ([guid]::NewGuid()).ToString()
  $item = [PSCustomObject]@{
    id = $itemId
    user_id = "demo-user"
    ingredient_name = "milk"
    ingredient_key = "milk"
    quantity = 1
    unit = "pack"
    storage_type = "refrigerated"
    purchased_at = "2026-02-13"
    opened_at = $null
    ocr_expiration_date = $ocr.parsed_expiration_date
    product_shelf_life_days = $null
    suggested_expiration_date = $suggestion.suggested_expiration_date
    range_min_date = $suggestion.range_min_date
    range_max_date = $suggestion.range_max_date
    expiration_source = $suggestion.expiration_source
    confidence = $suggestion.confidence
    status = $suggestion.status
    days_remaining = $suggestion.days_remaining
    created_at = "2026-02-13T09:00:00+09:00"
    updated_at = "2026-02-13T09:00:00+09:00"
  }

  Add-InventoryItem -Item $item | Out-Null
  $savedItems = @(Get-InventoryItems -UserId "demo-user")
  Assert-Equal -Actual $savedItems.Count -Expected 1 -Message "One inventory item should be stored"

  $notifications = New-ExpirationNotifications `
    -UserId "demo-user" `
    -InventoryItemId $itemId `
    -ExpirationDate ([datetime]$suggestion.suggested_expiration_date)

  Assert-Equal -Actual @($notifications).Count -Expected 3 -Message "Three notifications should be generated"
  Add-Notifications -Notifications $notifications | Out-Null

  $allNotifications = @(Get-Notifications -UserId "demo-user")
  Assert-Equal -Actual $allNotifications.Count -Expected 3 -Message "Notifications should be stored"

  $dispatchResult = Invoke-DispatchDueNotifications `
    -Notifications $allNotifications `
    -AsOfDateTime ([datetime]"2026-02-20T10:00:00+09:00")

  # By D-day morning, all three (D-3, D-1, D-day) are due.
  Assert-Equal -Actual $dispatchResult.sent_count -Expected 3 -Message "All due notifications should be sent"

  Save-Notifications -Notifications $dispatchResult.updated_notifications
  $sentNotifications = @(Get-Notifications -UserId "demo-user" -Status "sent")
  Assert-Equal -Actual $sentNotifications.Count -Expected 3 -Message "All notifications should be marked as sent"

  Write-Host "MVP workflow test passed."
}

Run-WorkflowTest
