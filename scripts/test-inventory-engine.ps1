Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$modulePath = Join-Path $PSScriptRoot "..\src\inventory\InventoryEngine.psm1"
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

function Assert-Throws {
  param(
    [Parameter(Mandatory = $true)][scriptblock]$Action,
    [Parameter(Mandatory = $true)][string]$ExpectedMessage
  )

  $thrown = $false
  try {
    & $Action
  }
  catch {
    $thrown = $true
    if ($_.Exception.Message -ne $ExpectedMessage) {
      throw "Expected error '$ExpectedMessage' but got '$($_.Exception.Message)'"
    }
  }

  if (-not $thrown) {
    throw "Expected exception '$ExpectedMessage' but no exception was thrown."
  }
}

function Run-Tests {
  $items = @(
    [PSCustomObject]@{
      id = "item-1"
      user_id = "demo-user"
      ingredient_name = "milk"
      ingredient_key = "milk"
      quantity = 1.0
      unit = "pack"
      storage_type = "refrigerated"
      purchased_at = "2026-02-13"
      opened_at = $null
      ocr_expiration_date = $null
      product_shelf_life_days = $null
      suggested_expiration_date = "2026-02-19"
      range_min_date = "2026-02-18"
      range_max_date = "2026-02-20"
      expiration_source = "average_rule"
      confidence = "medium"
      status = "fresh"
      days_remaining = 6
      created_at = "2026-02-13T09:00:00+09:00"
      updated_at = "2026-02-13T09:00:00+09:00"
    }
  )

  $result = Invoke-InventoryConsumption `
    -InventoryItems $items `
    -ItemId "item-1" `
    -ConsumedQuantity 0.5 `
    -MarkOpened $true `
    -Now ([datetime]"2026-02-14")

  Assert-Equal -Actual @($result.updated_items).Count -Expected 1 -Message "Should return one updated item"
  Assert-Equal -Actual $result.updated_item.quantity -Expected 0.5 -Message "Quantity should be reduced"
  Assert-Equal -Actual $result.updated_item.opened_at -Expected "2026-02-14" -Message "opened_at should be set"
  Assert-Equal -Actual $result.updated_item.suggested_expiration_date -Expected "2026-02-17" -Message "Opened milk average should apply"
  Assert-Equal -Actual $result.updated_item.status -Expected "expiring_soon" -Message "As-of status should be recalculated"
  Assert-Equal -Actual $result.removed -Expected $false -Message "Partially consumed item should stay in inventory"

  $itemsForFullConsume = @(
    $items[0],
    [PSCustomObject]@{
      id = "item-2"
      user_id = "demo-user"
      ingredient_name = "egg"
      ingredient_key = "egg"
      quantity = 2.0
      unit = "ea"
      storage_type = "refrigerated"
      purchased_at = "2026-02-13"
      opened_at = $null
      ocr_expiration_date = $null
      product_shelf_life_days = $null
      suggested_expiration_date = "2026-02-20"
      range_min_date = "2026-02-18"
      range_max_date = "2026-02-22"
      expiration_source = "average_rule"
      confidence = "medium"
      status = "fresh"
      days_remaining = 7
      created_at = "2026-02-13T09:00:00+09:00"
      updated_at = "2026-02-13T09:00:00+09:00"
    }
  )

  $fullConsume = Invoke-InventoryConsumption `
    -InventoryItems $itemsForFullConsume `
    -ItemId "item-1" `
    -ConsumedQuantity 1 `
    -Now ([datetime]"2026-02-14")

  Assert-Equal -Actual @($fullConsume.updated_items).Count -Expected 1 -Message "Fully consumed item should be removed from updated list"
  Assert-Equal -Actual $fullConsume.updated_items[0].id -Expected "item-2" -Message "Non-consumed items should remain"
  Assert-Equal -Actual $fullConsume.updated_item.quantity -Expected 0 -Message "Consumed item quantity should resolve to zero"
  Assert-Equal -Actual $fullConsume.removed -Expected $true -Message "Fully consumed item should be marked removed"

  Assert-Throws -Action {
    Invoke-InventoryConsumption -InventoryItems $items -ItemId "missing-id" -ConsumedQuantity 1
  } -ExpectedMessage "inventory item not found."

  Write-Host "Inventory engine tests passed."
}

Run-Tests
