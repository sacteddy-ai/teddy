Set-StrictMode -Version Latest

$expirationModulePath = Join-Path (Split-Path -Parent $PSCommandPath) "..\expiration\ExpirationEngine.psm1"
Import-Module $expirationModulePath -Force -DisableNameChecking

function Invoke-InventoryConsumption {
  param(
    [Parameter(Mandatory = $true)]
    [object[]]$InventoryItems,
    [Parameter(Mandatory = $true)]
    [string]$ItemId,
    [Parameter(Mandatory = $false)]
    [double]$ConsumedQuantity = 1.0,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [string]$OpenedAt = $null,
    [Parameter(Mandatory = $false)]
    [bool]$MarkOpened = $false,
    [Parameter(Mandatory = $false)]
    [datetime]$Now = (Get-Date)
  )

  if ($ConsumedQuantity -le 0) {
    throw "consumed_quantity must be greater than 0."
  }

  $found = $false
  $updated = @()
  $updatedItem = $null
  $removed = $false

  foreach ($item in @($InventoryItems)) {
    if ($item.id -ne $ItemId) {
      $updated += $item
      continue
    }

    $found = $true
    $nextQuantity = [double]$item.quantity - $ConsumedQuantity
    if ($nextQuantity -lt 0) {
      $nextQuantity = 0
    }
    $roundedQuantity = [math]::Round($nextQuantity, 2)

    $existingOpenedAt = if ($item.PSObject.Properties["opened_at"]) { $item.opened_at } else { $null }
    $resolvedOpenedAt = $existingOpenedAt

    if (-not [string]::IsNullOrWhiteSpace($OpenedAt)) {
      $resolvedOpenedAt = ([datetime]::Parse($OpenedAt)).ToString("yyyy-MM-dd")
    }
    elseif ($MarkOpened -and [string]::IsNullOrWhiteSpace($existingOpenedAt)) {
      $resolvedOpenedAt = $Now.ToString("yyyy-MM-dd")
    }

    $suggestion = Get-ExpirationSuggestion `
      -IngredientName $item.ingredient_name `
      -PurchasedAt $item.purchased_at `
      -StorageType $item.storage_type `
      -OpenedAt $resolvedOpenedAt `
      -OcrExpirationDate $item.ocr_expiration_date `
      -ProductShelfLifeDays $item.product_shelf_life_days `
      -AsOfDate $Now

    $updatedItem = [PSCustomObject]@{
      id = $item.id
      user_id = $item.user_id
      ingredient_name = $item.ingredient_name
      ingredient_key = $suggestion.ingredient_key
      quantity = $roundedQuantity
      unit = $item.unit
      storage_type = $item.storage_type
      purchased_at = $suggestion.purchased_at
      opened_at = $suggestion.opened_at
      ocr_expiration_date = $item.ocr_expiration_date
      product_shelf_life_days = $item.product_shelf_life_days
      suggested_expiration_date = $suggestion.suggested_expiration_date
      range_min_date = $suggestion.range_min_date
      range_max_date = $suggestion.range_max_date
      expiration_source = $suggestion.expiration_source
      confidence = $suggestion.confidence
      status = $suggestion.status
      days_remaining = $suggestion.days_remaining
      created_at = $item.created_at
      updated_at = $Now.ToString("yyyy-MM-ddTHH:mm:ssK")
    }

    if ($roundedQuantity -le 0) {
      $removed = $true
      continue
    }

    $updated += $updatedItem
  }

  if (-not $found) {
    throw "inventory item not found."
  }

  return [PSCustomObject]@{
    updated_items = @($updated)
    updated_item = $updatedItem
    removed = $removed
  }
}

Export-ModuleMember -Function Invoke-InventoryConsumption
