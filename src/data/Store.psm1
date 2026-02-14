Set-StrictMode -Version Latest

function Get-StorageRootPath {
  $moduleDir = Split-Path -Parent $PSCommandPath
  return (Join-Path $moduleDir "..\..\storage")
}

function Get-InventoryFilePath {
  return (Join-Path (Get-StorageRootPath) "inventory_items.json")
}

function Get-NotificationsFilePath {
  return (Join-Path (Get-StorageRootPath) "notifications.json")
}

function Get-OcrEventsFilePath {
  return (Join-Path (Get-StorageRootPath) "ocr_events.json")
}

function Get-CaptureSessionsFilePath {
  return (Join-Path (Get-StorageRootPath) "capture_sessions.json")
}

function Get-IngredientReviewQueueFilePath {
  return (Join-Path (Get-StorageRootPath) "ingredient_review_queue.json")
}

function Ensure-Storage {
  $root = Get-StorageRootPath
  if (-not (Test-Path -LiteralPath $root)) {
    New-Item -ItemType Directory -Path $root -Force | Out-Null
  }

  $files = @(
    (Get-InventoryFilePath),
    (Get-NotificationsFilePath),
    (Get-OcrEventsFilePath),
    (Get-CaptureSessionsFilePath),
    (Get-IngredientReviewQueueFilePath)
  )

  foreach ($file in $files) {
    if (-not (Test-Path -LiteralPath $file)) {
      Set-Content -LiteralPath $file -Value "[]"
    }
  }
}

function Read-JsonArray {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  Ensure-Storage
  $raw = Get-Content -LiteralPath $Path -Raw
  if ([string]::IsNullOrWhiteSpace($raw)) {
    return @()
  }

  $parsed = $raw | ConvertFrom-Json
  if ($null -eq $parsed) {
    return @()
  }

  return @($parsed)
}

function Write-JsonArray {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [AllowEmptyCollection()]
    [object[]]$Items
  )

  Ensure-Storage
  $json = $Items | ConvertTo-Json -Depth 16
  Set-Content -LiteralPath $Path -Value $json
}

function Add-InventoryItem {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Item
  )

  $path = Get-InventoryFilePath
  $items = Read-JsonArray -Path $path
  $new = @($items) + @($Item)
  Write-JsonArray -Path $path -Items $new
  return $Item
}

function Get-InventoryItems {
  param(
    [Parameter(Mandatory = $false)]
    [string]$UserId,
    [Parameter(Mandatory = $false)]
    [string]$Status
  )

  $items = Read-JsonArray -Path (Get-InventoryFilePath)
  if (-not [string]::IsNullOrWhiteSpace($UserId)) {
    $items = @($items | Where-Object { $_.user_id -eq $UserId })
  }
  if (-not [string]::IsNullOrWhiteSpace($Status)) {
    $items = @($items | Where-Object { $_.status -eq $Status })
  }
  return @($items)
}

function Get-InventoryItemById {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ItemId
  )

  $items = Read-JsonArray -Path (Get-InventoryFilePath)
  $found = @($items | Where-Object { $_.id -eq $ItemId } | Select-Object -First 1)
  if ($found.Count -eq 0) {
    return $null
  }

  return $found[0]
}

function Save-InventoryItems {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyCollection()]
    [object[]]$Items
  )

  Write-JsonArray -Path (Get-InventoryFilePath) -Items $Items
}

function Add-CaptureSession {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Session
  )

  $path = Get-CaptureSessionsFilePath
  $sessions = Read-JsonArray -Path $path
  $new = @($sessions) + @($Session)
  Write-JsonArray -Path $path -Items $new
  return $Session
}

function Get-CaptureSessions {
  param(
    [Parameter(Mandatory = $false)]
    [string]$UserId,
    [Parameter(Mandatory = $false)]
    [string]$Status
  )

  $items = Read-JsonArray -Path (Get-CaptureSessionsFilePath)
  if (-not [string]::IsNullOrWhiteSpace($UserId)) {
    $items = @($items | Where-Object { $_.user_id -eq $UserId })
  }
  if (-not [string]::IsNullOrWhiteSpace($Status)) {
    $items = @($items | Where-Object { $_.status -eq $Status })
  }
  return @($items)
}

function Get-CaptureSessionById {
  param(
    [Parameter(Mandatory = $true)]
    [string]$SessionId
  )

  $items = Read-JsonArray -Path (Get-CaptureSessionsFilePath)
  $found = @($items | Where-Object { $_.id -eq $SessionId } | Select-Object -First 1)
  if ($found.Count -eq 0) {
    return $null
  }

  return $found[0]
}

function Save-CaptureSessions {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyCollection()]
    [object[]]$Sessions
  )

  Write-JsonArray -Path (Get-CaptureSessionsFilePath) -Items $Sessions
}

function Add-OcrEvent {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Event
  )

  $path = Get-OcrEventsFilePath
  $events = Read-JsonArray -Path $path
  $new = @($events) + @($Event)
  Write-JsonArray -Path $path -Items $new
  return $Event
}

function Add-IngredientReviewQueueItem {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Item
  )

  $path = Get-IngredientReviewQueueFilePath
  $items = Read-JsonArray -Path $path
  $new = @($items) + @($Item)
  Write-JsonArray -Path $path -Items $new
  return $Item
}

function Get-IngredientReviewQueue {
  param(
    [Parameter(Mandatory = $false)]
    [string]$UserId,
    [Parameter(Mandatory = $false)]
    [string]$Status
  )

  $items = Read-JsonArray -Path (Get-IngredientReviewQueueFilePath)
  if (-not [string]::IsNullOrWhiteSpace($UserId)) {
    $items = @($items | Where-Object { $_.user_id -eq $UserId })
  }
  if (-not [string]::IsNullOrWhiteSpace($Status)) {
    $items = @($items | Where-Object { $_.status -eq $Status })
  }
  return @($items)
}

function Save-IngredientReviewQueue {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyCollection()]
    [object[]]$Items
  )

  Write-JsonArray -Path (Get-IngredientReviewQueueFilePath) -Items $Items
}

function Add-Notifications {
  param(
    [Parameter(Mandatory = $true)]
    [object[]]$Notifications
  )

  $path = Get-NotificationsFilePath
  $existing = Read-JsonArray -Path $path
  $new = @($existing) + @($Notifications)
  Write-JsonArray -Path $path -Items $new
  return @($Notifications)
}

function Get-Notifications {
  param(
    [Parameter(Mandatory = $false)]
    [string]$UserId,
    [Parameter(Mandatory = $false)]
    [string]$Status,
    [Parameter(Mandatory = $false)]
    [Nullable[datetime]]$DueUntil = $null
  )

  $items = Read-JsonArray -Path (Get-NotificationsFilePath)
  if (-not [string]::IsNullOrWhiteSpace($UserId)) {
    $items = @($items | Where-Object { $_.user_id -eq $UserId })
  }
  if (-not [string]::IsNullOrWhiteSpace($Status)) {
    $items = @($items | Where-Object { $_.status -eq $Status })
  }
  if ($null -ne $DueUntil) {
    $asOf = $DueUntil.Value
    $items = @($items | Where-Object { [datetime]$_.scheduled_at -le $asOf })
  }
  return @($items)
}

function Save-Notifications {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyCollection()]
    [object[]]$Notifications
  )

  Write-JsonArray -Path (Get-NotificationsFilePath) -Items $Notifications
}

function Clear-StorageData {
  Ensure-Storage
  Write-JsonArray -Path (Get-InventoryFilePath) -Items @()
  Write-JsonArray -Path (Get-NotificationsFilePath) -Items @()
  Write-JsonArray -Path (Get-OcrEventsFilePath) -Items @()
  Write-JsonArray -Path (Get-CaptureSessionsFilePath) -Items @()
  Write-JsonArray -Path (Get-IngredientReviewQueueFilePath) -Items @()
}

Export-ModuleMember -Function `
  Ensure-Storage, `
  Add-InventoryItem, `
  Get-InventoryItems, `
  Get-InventoryItemById, `
  Save-InventoryItems, `
  Add-CaptureSession, `
  Get-CaptureSessions, `
  Get-CaptureSessionById, `
  Save-CaptureSessions, `
  Add-OcrEvent, `
  Add-IngredientReviewQueueItem, `
  Get-IngredientReviewQueue, `
  Save-IngredientReviewQueue, `
  Add-Notifications, `
  Get-Notifications, `
  Save-Notifications, `
  Clear-StorageData
