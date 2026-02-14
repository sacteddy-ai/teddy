Set-StrictMode -Version Latest

function New-ExpirationNotifications {
  param(
    [Parameter(Mandatory = $true)]
    [string]$UserId,
    [Parameter(Mandatory = $true)]
    [string]$InventoryItemId,
    [Parameter(Mandatory = $true)]
    [datetime]$ExpirationDate
  )

  $base = $ExpirationDate.Date

  $schedules = @(
    @{ notify_type = "d_minus_3"; scheduled_at = $base.AddDays(-3).AddHours(9) },
    @{ notify_type = "d_minus_1"; scheduled_at = $base.AddDays(-1).AddHours(9) },
    @{ notify_type = "d_day"; scheduled_at = $base.AddHours(9) }
  )

  $notifications = @()
  foreach ($entry in $schedules) {
    $notifications += [PSCustomObject]@{
      id = ([guid]::NewGuid()).ToString()
      user_id = $UserId
      inventory_item_id = $InventoryItemId
      notify_type = $entry.notify_type
      scheduled_at = ([datetime]$entry.scheduled_at).ToString("yyyy-MM-ddTHH:mm:ssK")
      sent_at = $null
      status = "pending"
      created_at = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
    }
  }

  return @($notifications)
}

function Invoke-DispatchDueNotifications {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyCollection()]
    [object[]]$Notifications,
    [Parameter(Mandatory = $false)]
    [datetime]$AsOfDateTime = (Get-Date)
  )

  $updated = @()
  $sent = @()

  foreach ($item in $Notifications) {
    $mutable = [PSCustomObject]@{
      id = $item.id
      user_id = $item.user_id
      inventory_item_id = $item.inventory_item_id
      notify_type = $item.notify_type
      scheduled_at = $item.scheduled_at
      sent_at = $item.sent_at
      status = $item.status
      created_at = $item.created_at
    }

    if ($mutable.status -eq "pending" -and ([datetime]$mutable.scheduled_at) -le $AsOfDateTime) {
      $mutable.status = "sent"
      $mutable.sent_at = $AsOfDateTime.ToString("yyyy-MM-ddTHH:mm:ssK")
      $sent += $mutable
    }

    $updated += $mutable
  }

  return [PSCustomObject]@{
    updated_notifications = @($updated)
    sent_notifications = @($sent)
    sent_count = @($sent).Count
  }
}

Export-ModuleMember -Function New-ExpirationNotifications, Invoke-DispatchDueNotifications
