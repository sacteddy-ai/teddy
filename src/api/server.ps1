param(
  [Parameter(Mandatory = $false)]
  [string]$Prefix = "http://localhost:8080/"
)

Set-StrictMode -Version Latest

$expirationModulePath = Join-Path $PSScriptRoot "..\expiration\ExpirationEngine.psm1"
$ocrModulePath = Join-Path $PSScriptRoot "..\ocr\OcrDateParser.psm1"
$storeModulePath = Join-Path $PSScriptRoot "..\data\Store.psm1"
$notificationModulePath = Join-Path $PSScriptRoot "..\notifications\NotificationEngine.psm1"
$recommendationModulePath = Join-Path $PSScriptRoot "..\recommendation\RecommendationEngine.psm1"
$inventoryModulePath = Join-Path $PSScriptRoot "..\inventory\InventoryEngine.psm1"
$chatModulePath = Join-Path $PSScriptRoot "..\chat\ChatIngestionEngine.psm1"
$visionModulePath = Join-Path $PSScriptRoot "..\vision\VisionEngine.psm1"

$expirationModule = Import-Module $expirationModulePath -Force -DisableNameChecking -PassThru
$chatModule = Import-Module $chatModulePath -Force -DisableNameChecking -PassThru
Import-Module $ocrModulePath -Force -DisableNameChecking
Import-Module $storeModulePath -Force -DisableNameChecking
Import-Module $notificationModulePath -Force -DisableNameChecking
Import-Module $recommendationModulePath -Force -DisableNameChecking
Import-Module $inventoryModulePath -Force -DisableNameChecking
Import-Module $visionModulePath -Force -DisableNameChecking

$script:ExpirationSuggestionCommand = $expirationModule.ExportedCommands["Get-ExpirationSuggestion"]
$script:ExpirationItemStatusCommand = $expirationModule.ExportedCommands["Get-ItemStatus"]
$script:ExpirationClearRuleCacheCommand = $expirationModule.ExportedCommands["Clear-ShelfLifeRuleCache"]
$script:ChatClearLexiconCacheCommand = $chatModule.ExportedCommands["Clear-IngredientLexiconCache"]
$script:ChatSearchIngredientCatalogCommand = $chatModule.ExportedCommands["Search-IngredientCatalog"]
$script:ChatAddAliasOverrideCommand = $chatModule.ExportedCommands["Add-IngredientAliasOverride"]
if ($null -eq $script:ExpirationSuggestionCommand -or $null -eq $script:ExpirationItemStatusCommand) {
  throw "Failed to load expiration commands from ExpirationEngine module."
}
if ($null -eq $script:ChatSearchIngredientCatalogCommand -or $null -eq $script:ChatAddAliasOverrideCommand) {
  throw "Failed to load ingredient catalog commands from ChatIngestionEngine module."
}

Ensure-Storage

$webRootPath = Join-Path $PSScriptRoot "..\..\web"

function Resolve-EnvironmentValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  foreach ($scope in @("Process", "User", "Machine")) {
    $value = [System.Environment]::GetEnvironmentVariable($Name, $scope)
    if (-not [string]::IsNullOrWhiteSpace($value)) {
      return $value
    }
  }
  return ""
}

function Set-CorsHeaders {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerContext]$Context
  )

  $enableCors = Resolve-EnvironmentValue -Name "ENABLE_CORS"
  if ([string]::IsNullOrWhiteSpace($enableCors)) {
    return
  }

  $allowOrigin = Resolve-EnvironmentValue -Name "CORS_ALLOW_ORIGIN"
  if ([string]::IsNullOrWhiteSpace($allowOrigin)) {
    $allowOrigin = "*"
  }

  $Context.Response.Headers["Access-Control-Allow-Origin"] = $allowOrigin
  $Context.Response.Headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
  $Context.Response.Headers["Access-Control-Allow-Headers"] = "Content-Type,Authorization"
  $Context.Response.Headers["Access-Control-Max-Age"] = "86400"

  if ($allowOrigin -ne "*") {
    # Ensure caches don't mix different Origin callers when we reflect a specific origin.
    $Context.Response.Headers["Vary"] = "Origin"
  }
}

function Write-JsonResponse {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerResponse]$Response,
    [Parameter(Mandatory = $true)]
    [int]$StatusCode,
    [Parameter(Mandatory = $true)]
    [object]$Body
  )

  $json = $Body | ConvertTo-Json -Depth 16
  $buffer = [System.Text.Encoding]::UTF8.GetBytes($json)
  $Response.StatusCode = $StatusCode
  $Response.ContentType = "application/json; charset=utf-8"
  $Response.ContentEncoding = [System.Text.Encoding]::UTF8
  $Response.Headers["Cache-Control"] = "no-store"
  $Response.ContentLength64 = $buffer.Length
  $Response.OutputStream.Write($buffer, 0, $buffer.Length)
  $Response.OutputStream.Close()
}

function Get-ContentTypeByFilePath {
  param(
    [Parameter(Mandatory = $true)]
    [string]$FilePath
  )

  $ext = [System.IO.Path]::GetExtension($FilePath).ToLowerInvariant()
  switch ($ext) {
    ".html" { return "text/html; charset=utf-8" }
    ".css" { return "text/css; charset=utf-8" }
    ".js" { return "application/javascript; charset=utf-8" }
    ".json" { return "application/json; charset=utf-8" }
    default { return "application/octet-stream" }
  }
}

function Write-StaticFileResponse {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerResponse]$Response,
    [Parameter(Mandatory = $true)]
    [string]$FilePath
  )

  if (-not (Test-Path -LiteralPath $FilePath)) {
    Write-JsonResponse -Response $Response -StatusCode 404 -Body @{ error = "Not found." }
    return
  }

  $bytes = [System.IO.File]::ReadAllBytes($FilePath)
  $Response.StatusCode = 200
  $Response.ContentType = Get-ContentTypeByFilePath -FilePath $FilePath
  $Response.Headers["Cache-Control"] = "no-store"
  $Response.ContentLength64 = $bytes.Length
  $Response.OutputStream.Write($bytes, 0, $bytes.Length)
  $Response.OutputStream.Close()
}

function Handle-StaticWeb {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerContext]$Context,
    [Parameter(Mandatory = $true)]
    [string]$RelativePath
  )

  $safeRelativePath = $RelativePath.TrimStart([char[]]@('\', '/')).Replace("/", "\")
  $filePath = Join-Path $webRootPath $safeRelativePath
  Write-StaticFileResponse -Response $Context.Response -FilePath $filePath
}

function Read-RequestBody {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerRequest]$Request
  )

  $encoding = $Request.ContentEncoding
  if ($null -eq $encoding -or [string]::IsNullOrWhiteSpace($encoding.WebName) -or $encoding.WebName -eq "iso-8859-1") {
    # Browsers often omit charset for JSON. Default to UTF-8 so Korean text is preserved.
    $encoding = [System.Text.Encoding]::UTF8
  }

  $reader = [System.IO.StreamReader]::new($Request.InputStream, $encoding, $true)
  try {
    return $reader.ReadToEnd()
  }
  finally {
    $reader.Dispose()
  }
}

function Read-JsonRequest {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerContext]$Context
  )

  $rawBody = Read-RequestBody -Request $Context.Request
  if ([string]::IsNullOrWhiteSpace($rawBody)) {
    throw "Request body is required."
  }

  try {
    return ($rawBody | ConvertFrom-Json)
  }
  catch {
    throw "Invalid JSON body."
  }
}

function Read-JsonRequestOptional {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerContext]$Context
  )

  $rawBody = Read-RequestBody -Request $Context.Request
  if ([string]::IsNullOrWhiteSpace($rawBody)) {
    return [PSCustomObject]@{}
  }

  try {
    return ($rawBody | ConvertFrom-Json)
  }
  catch {
    throw "Invalid JSON body."
  }
}

function Convert-DateValue {
  param(
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [object]$Value
  )

  if ($null -eq $Value) {
    return $null
  }

  if ([string]::IsNullOrWhiteSpace($Value.ToString())) {
    return $null
  }

  return $Value.ToString()
}

function Get-ObjectPropertyValue {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Object,
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  $prop = $Object.PSObject.Properties[$Name]
  if ($null -eq $prop) {
    return $null
  }

  return $prop.Value
}

function Get-QueryValue {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerRequest]$Request,
    [Parameter(Mandatory = $true)]
    [string]$Key
  )

  $value = $Request.QueryString[$Key]
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $null
  }
  return $value
}

function Get-QueryIntValue {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerRequest]$Request,
    [Parameter(Mandatory = $true)]
    [string]$Key,
    [Parameter(Mandatory = $true)]
    [int]$DefaultValue
  )

  $value = Get-QueryValue -Request $Request -Key $Key
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $DefaultValue
  }

  try {
    return [int]$value
  }
  catch {
    throw "$Key must be an integer."
  }
}

function Convert-ToStringArray {
  param(
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [object]$Value
  )

  if ($null -eq $Value) {
    return @()
  }

  if ($Value -is [string]) {
    if ([string]::IsNullOrWhiteSpace($Value)) {
      return @()
    }
    return @($Value.Trim())
  }

  $result = @()
  foreach ($entry in @($Value)) {
    if ($null -eq $entry) {
      continue
    }
    $s = $entry.ToString().Trim()
    if (-not [string]::IsNullOrWhiteSpace($s)) {
      $result += $s
    }
  }

  return @($result)
}

function Convert-ToBoolean {
  param(
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [object]$Value,
    [Parameter(Mandatory = $false)]
    [bool]$DefaultValue = $false
  )

  if ($null -eq $Value) {
    return $DefaultValue
  }

  if ($Value -is [bool]) {
    return [bool]$Value
  }

  if ($Value -is [string]) {
    $normalized = $Value.Trim().ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($normalized)) {
      return $DefaultValue
    }

    if ($normalized -in @("true", "1", "yes", "y")) {
      return $true
    }
    if ($normalized -in @("false", "0", "no", "n")) {
      return $false
    }
  }

  throw "Invalid boolean value."
}

function Normalize-ReviewPhrase {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  $normalized = $Value.ToLowerInvariant().Trim()
  $normalized = [regex]::Replace($normalized, "\s+", " ")
  return $normalized
}

function Convert-PhraseToIngredientKey {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Phrase
  )

  if ([string]::IsNullOrWhiteSpace($Phrase)) {
    return $null
  }

  $normalized = $Phrase.Trim().ToLowerInvariant()
  $normalized = [regex]::Replace($normalized, "\s+", "_")
  $normalized = [regex]::Replace($normalized, "[^\p{L}\p{N}_]+", "_")
  $normalized = [regex]::Replace($normalized, "_+", "_")
  $normalized = $normalized.Trim("_")

  if ([string]::IsNullOrWhiteSpace($normalized)) {
    return $null
  }

  return $normalized
}

function Convert-ReviewCandidateOptions {
  param(
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [object]$Value
  )

  $options = @()
  foreach ($candidate in @($Value)) {
    if ($null -eq $candidate) {
      continue
    }

    $ingredientKey = Get-ObjectPropertyValue -Object $candidate -Name "ingredient_key"
    if ([string]::IsNullOrWhiteSpace($ingredientKey)) {
      continue
    }

    $ingredientName = Get-ObjectPropertyValue -Object $candidate -Name "ingredient_name"
    if ([string]::IsNullOrWhiteSpace($ingredientName)) {
      $ingredientName = $ingredientKey
    }

    $matchedAlias = Get-ObjectPropertyValue -Object $candidate -Name "matched_alias"
    $scoreValue = Get-ObjectPropertyValue -Object $candidate -Name "score"
    $score = if ($null -eq $scoreValue) { 0.0 } else { [double]$scoreValue }

    $options += [PSCustomObject]@{
      ingredient_key = $ingredientKey
      ingredient_name = $ingredientName
      matched_alias = $matchedAlias
      score = [math]::Round($score, 4)
    }
  }

  return @($options | Sort-Object -Property @{ Expression = { -$_.score } }, ingredient_name)
}

function Upsert-IngredientReviewCandidates {
  param(
    [Parameter(Mandatory = $true)]
    [string]$UserId,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [string]$SessionId = $null,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [string]$TurnId = $null,
    [Parameter(Mandatory = $false)]
    [AllowEmptyCollection()]
    [object[]]$ReviewCandidates = @()
  )

  if (@($ReviewCandidates).Count -eq 0) {
    return [PSCustomObject]@{
      items = @()
      created_count = 0
      updated_count = 0
    }
  }

  $queue = [System.Collections.Generic.List[object]]::new()
  foreach ($entry in @(Get-IngredientReviewQueue)) {
    $queue.Add($entry)
  }

  $pendingIndex = @{}
  for ($i = 0; $i -lt $queue.Count; $i++) {
    $entry = $queue[$i]
    if ($null -eq $entry) {
      continue
    }

    $status = if ($entry.PSObject.Properties["status"]) { $entry.status } else { $null }
    $entryUserId = if ($entry.PSObject.Properties["user_id"]) { $entry.user_id } else { $null }
    $normalizedPhrase = if ($entry.PSObject.Properties["normalized_phrase"]) {
      $entry.normalized_phrase
    }
    elseif ($entry.PSObject.Properties["phrase"] -and -not [string]::IsNullOrWhiteSpace($entry.phrase)) {
      Normalize-ReviewPhrase -Value $entry.phrase
    }
    else {
      $null
    }

    if ($status -eq "pending" -and -not [string]::IsNullOrWhiteSpace($entryUserId) -and -not [string]::IsNullOrWhiteSpace($normalizedPhrase)) {
      $pendingIndex["$entryUserId|$normalizedPhrase"] = $i
    }
  }

  $touchedById = @{}
  $createdCount = 0
  $updatedCount = 0

  foreach ($candidate in @($ReviewCandidates)) {
    if ($null -eq $candidate) {
      continue
    }

    $phrase = Get-ObjectPropertyValue -Object $candidate -Name "phrase"
    if ([string]::IsNullOrWhiteSpace($phrase)) {
      continue
    }
    $phrase = $phrase.ToString().Trim()
    $normalizedPhrase = Normalize-ReviewPhrase -Value $phrase
    if ([string]::IsNullOrWhiteSpace($normalizedPhrase)) {
      continue
    }

    $reasonInput = Get-ObjectPropertyValue -Object $candidate -Name "reason"
    $reason = if ([string]::IsNullOrWhiteSpace($reasonInput)) { "unknown" } else { $reasonInput.ToString().Trim() }
    $candidateOptionsInput = Get-ObjectPropertyValue -Object $candidate -Name "candidates"
    $candidateOptions = Convert-ReviewCandidateOptions -Value $candidateOptionsInput
    $now = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")

    $indexKey = "$UserId|$normalizedPhrase"
    if ($pendingIndex.ContainsKey($indexKey)) {
      $existingIndex = [int]$pendingIndex[$indexKey]
      $existing = $queue[$existingIndex]

      $existing.phrase = $phrase
      $existing.reason = $reason
      $existing.updated_at = $now
      $existing.last_seen_at = $now
      $existing.seen_count = if ($existing.PSObject.Properties["seen_count"] -and $null -ne $existing.seen_count) {
        [int]$existing.seen_count + 1
      }
      else {
        2
      }

      if (-not [string]::IsNullOrWhiteSpace($SessionId)) {
        $existing.session_id = $SessionId
      }
      if (-not [string]::IsNullOrWhiteSpace($TurnId)) {
        $existing.turn_id = $TurnId
      }
      if (@($candidateOptions).Count -gt 0) {
        $existing.candidate_options = @($candidateOptions)
      }

      $queue[$existingIndex] = $existing
      $touchedById[$existing.id] = $existing
      $updatedCount++
      continue
    }

    $newEntry = [PSCustomObject]@{
      id = ([guid]::NewGuid()).ToString()
      user_id = $UserId
      session_id = $SessionId
      turn_id = $TurnId
      phrase = $phrase
      normalized_phrase = $normalizedPhrase
      reason = $reason
      candidate_options = @($candidateOptions)
      seen_count = 1
      status = "pending"
      created_at = $now
      updated_at = $now
      last_seen_at = $now
      resolved_at = $null
      resolved_action = $null
      resolved_by_user_id = $null
      resolved_ingredient_key = $null
      resolved_display_name = $null
    }

    $queue.Add($newEntry)
    $pendingIndex[$indexKey] = $queue.Count - 1
    $touchedById[$newEntry.id] = $newEntry
    $createdCount++
  }

  Save-IngredientReviewQueue -Items @($queue.ToArray())

  return [PSCustomObject]@{
    items = @($touchedById.Values | Sort-Object -Property created_at)
    created_count = $createdCount
    updated_count = $updatedCount
  }
}

function Resolve-IngredientReviewQueueItem {
  param(
    [Parameter(Mandatory = $true)]
    [string]$QueueItemId,
    [Parameter(Mandatory = $true)]
    [ValidateSet("map", "ignore")]
    [string]$Action,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [string]$IngredientKey = $null,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [string]$DisplayName = $null,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [string]$ResolvedByUserId = $null,
    [Parameter(Mandatory = $false)]
    [bool]$ApplyToSession = $true
  )

  $allItems = [System.Collections.Generic.List[object]]::new()
  foreach ($entry in @(Get-IngredientReviewQueue)) {
    $allItems.Add($entry)
  }

  $targetIndex = -1
  for ($i = 0; $i -lt $allItems.Count; $i++) {
    if ($allItems[$i].id -eq $QueueItemId) {
      $targetIndex = $i
      break
    }
  }

  if ($targetIndex -lt 0) {
    throw "review queue item not found."
  }

  $target = $allItems[$targetIndex]
  if ($target.status -ne "pending") {
    return [PSCustomObject]@{
      item = $target
      alias_result = $null
      session_apply = $null
    }
  }

  $now = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
  $aliasResult = $null
  $sessionApply = $null

  if ($Action -eq "map") {
    $resolvedIngredientKey = $IngredientKey
    if ([string]::IsNullOrWhiteSpace($resolvedIngredientKey)) {
      $candidateOptions = @()
      if ($target.PSObject.Properties["candidate_options"]) {
        $candidateOptions = @($target.candidate_options)
      }
      if (@($candidateOptions).Count -gt 0) {
        $resolvedIngredientKey = $candidateOptions[0].ingredient_key
      }
    }

    if ([string]::IsNullOrWhiteSpace($resolvedIngredientKey)) {
      throw "ingredient_key is required when action is map."
    }

    $resolvedDisplayName = $DisplayName
    if ([string]::IsNullOrWhiteSpace($resolvedDisplayName) -and $target.PSObject.Properties["candidate_options"]) {
      foreach ($option in @($target.candidate_options)) {
        if ($option.ingredient_key -eq $resolvedIngredientKey) {
          $resolvedDisplayName = $option.ingredient_name
          break
        }
      }
    }

    $aliasResult = & $script:ChatAddAliasOverrideCommand `
      -IngredientKey $resolvedIngredientKey `
      -Alias $target.phrase `
      -DisplayName $resolvedDisplayName

    if ($ApplyToSession -and $target.PSObject.Properties["session_id"] -and -not [string]::IsNullOrWhiteSpace($target.session_id)) {
      $session = Get-CaptureSessionById -SessionId $target.session_id
      if ($null -ne $session -and $session.status -eq "open") {
        $draftItemsValue = if ($session.PSObject.Properties["draft_items"]) { $session.draft_items } else { $null }
        $draftItems = [object[]]@()
        if ($null -ne $draftItemsValue) {
          $draftItems = @($draftItemsValue)
        }

        $addCommand = [PSCustomObject]@{
          action = "add"
          ingredient_key = $aliasResult.ingredient_key
          ingredient_name = $aliasResult.display_name
          quantity = 1.0
          unit = "ea"
          remove_all = $false
          source = "chat_text"
          confidence = "medium"
          matched_alias = $target.phrase
          match_type = "manual_confirmation"
        }

        $nextDraft = Apply-ConversationCommandsToDraft -DraftItems $draftItems -Commands @($addCommand)
        $session.draft_items = @($nextDraft)
        $session.updated_at = $now
        Upsert-CaptureSession -Session $session | Out-Null

        $sessionApply = [PSCustomObject]@{
          applied = $true
          session_id = $session.id
          draft_item_count = @($nextDraft).Count
        }
      }
      else {
        $sessionApply = [PSCustomObject]@{
          applied = $false
          reason = "session_not_open"
          session_id = $target.session_id
        }
      }
    }

    $target.status = "mapped"
    $target.resolved_action = "map"
    $target.resolved_ingredient_key = $aliasResult.ingredient_key
    $target.resolved_display_name = $aliasResult.display_name
  }
  else {
    $target.status = "ignored"
    $target.resolved_action = "ignore"
  }

  $target.updated_at = $now
  $target.resolved_at = $now
  if (-not [string]::IsNullOrWhiteSpace($ResolvedByUserId)) {
    $target.resolved_by_user_id = $ResolvedByUserId
  }
  elseif ($target.PSObject.Properties["user_id"]) {
    $target.resolved_by_user_id = $target.user_id
  }

  $allItems[$targetIndex] = $target
  Save-IngredientReviewQueue -Items @($allItems.ToArray())

  return [PSCustomObject]@{
    item = $target
    alias_result = $aliasResult
    session_apply = $sessionApply
  }
}

function Auto-MapPendingUnknownReviewItemsToSessionDraft {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Session,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [string]$ResolvedByUserId = $null
  )

  $sessionId = if ($Session.PSObject.Properties["id"]) { $Session.id } else { $null }
  $sessionUserId = if ($Session.PSObject.Properties["user_id"]) { $Session.user_id } else { $null }

  if ([string]::IsNullOrWhiteSpace($sessionId) -or [string]::IsNullOrWhiteSpace($sessionUserId)) {
    return [PSCustomObject]@{
      mapped_count = 0
      skipped_count = 0
      mapped_item_ids = @()
    }
  }

  $pendingItems = @(Get-IngredientReviewQueue -UserId $sessionUserId -Status "pending" | Where-Object { $_.session_id -eq $sessionId })
  if (@($pendingItems).Count -eq 0) {
    return [PSCustomObject]@{
      mapped_count = 0
      skipped_count = 0
      mapped_item_ids = @()
    }
  }

  $mappedCount = 0
  $skippedCount = 0
  $mappedItemIds = @()

  foreach ($item in @($pendingItems)) {
    if ($null -eq $item) {
      continue
    }

    $reason = if ($item.PSObject.Properties["reason"] -and -not [string]::IsNullOrWhiteSpace($item.reason)) {
      $item.reason.ToString().Trim().ToLowerInvariant()
    }
    else {
      "unknown"
    }

    $candidateCount = if ($item.PSObject.Properties["candidate_options"] -and $null -ne $item.candidate_options) {
      @($item.candidate_options).Count
    }
    else {
      0
    }

    # Auto-map only clearly unknown phrases without candidate suggestions.
    if ($reason -ne "unknown" -or $candidateCount -gt 0) {
      $skippedCount++
      continue
    }

    $phrase = if ($item.PSObject.Properties["phrase"]) { $item.phrase } else { $null }
    if ([string]::IsNullOrWhiteSpace($phrase)) {
      $skippedCount++
      continue
    }

    $autoKey = Convert-PhraseToIngredientKey -Phrase $phrase
    if ([string]::IsNullOrWhiteSpace($autoKey)) {
      $skippedCount++
      continue
    }

    try {
      $resolved = Resolve-IngredientReviewQueueItem `
        -QueueItemId $item.id `
        -Action "map" `
        -IngredientKey $autoKey `
        -DisplayName $phrase `
        -ResolvedByUserId $ResolvedByUserId `
        -ApplyToSession $true

      if ($null -ne $resolved -and $null -ne $resolved.item -and $resolved.item.status -eq "mapped") {
        $mappedCount++
        $mappedItemIds += $resolved.item.id
      }
      else {
        $skippedCount++
      }
    }
    catch {
      $skippedCount++
    }
  }

  return [PSCustomObject]@{
    mapped_count = $mappedCount
    skipped_count = $skippedCount
    mapped_item_ids = @($mappedItemIds)
  }
}

function Upsert-CaptureSession {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Session
  )

  $all = Get-CaptureSessions
  $merged = @()
  $found = $false

  foreach ($item in @($all)) {
    if ($item.id -eq $Session.id) {
      $merged += $Session
      $found = $true
    }
    else {
      $merged += $item
    }
  }

  if (-not $found) {
    $merged += $Session
  }

  Save-CaptureSessions -Sessions $merged
  return $Session
}

function Build-CaptureSessionView {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Session
  )

  $draftItemsValue = if ($Session.PSObject.Properties["draft_items"]) { $Session.draft_items } else { $null }
  $draftItems = [object[]]@()
  if ($null -ne $draftItemsValue) {
    $draftItems = @($draftItemsValue)
  }

  $reviewQueueItems = @()
  if ($Session.PSObject.Properties["id"] -and -not [string]::IsNullOrWhiteSpace($Session.id)) {
    $pendingQueue = @(Get-IngredientReviewQueue -UserId $Session.user_id -Status "pending")
    $reviewQueueItems = @($pendingQueue | Where-Object { $_.session_id -eq $Session.id } | Sort-Object -Property @{ Expression = { $_.updated_at } } -Descending)
  }

  return [PSCustomObject]@{
    session = $Session
    summary = Get-DraftSummary -DraftItems $draftItems
    review_queue_items = $reviewQueueItems
    review_queue_count = @($reviewQueueItems).Count
  }
}

function Apply-CaptureSessionParsedInput {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Session,
    [Parameter(Mandatory = $false)]
    [string]$SourceType = "text",
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [string]$TextInput = $null,
    [Parameter(Mandatory = $false)]
    [AllowEmptyCollection()]
    [string[]]$VisionDetectedItems = @(),
    [Parameter(Mandatory = $true)]
    [object]$ParseResult
  )

  $commands = @($ParseResult.commands)
  $reviewCandidates = @()
  if ($ParseResult.PSObject.Properties["review_candidates"]) {
    $reviewCandidates = @($ParseResult.review_candidates)
  }

  $currentDraftValue = if ($Session.PSObject.Properties["draft_items"]) { $Session.draft_items } else { $null }
  $currentDraft = [object[]]@()
  if ($null -ne $currentDraftValue) {
    $currentDraft = @($currentDraftValue)
  }
  $nextDraft = Apply-ConversationCommandsToDraft -DraftItems $currentDraft -Commands $commands

  $turnId = ([guid]::NewGuid()).ToString()
  $now = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
  $queuedReviewResult = Upsert-IngredientReviewCandidates `
    -UserId $Session.user_id `
    -SessionId $Session.id `
    -TurnId $turnId `
    -ReviewCandidates $reviewCandidates
  $queuedReviewItems = @($queuedReviewResult.items)

  $turn = [PSCustomObject]@{
    id = $turnId
    source_type = $SourceType
    text = $TextInput
    vision_detected_items = @($VisionDetectedItems)
    parsed_commands = $commands
    parsed_command_count = @($commands).Count
    parsed_review_candidates = $reviewCandidates
    parsed_review_candidate_count = @($reviewCandidates).Count
    review_queue_items = $queuedReviewItems
    review_queue_item_count = @($queuedReviewItems).Count
    finalize_requested = $ParseResult.finalize_requested
    created_at = $now
  }

  $existingTurnsValue = if ($Session.PSObject.Properties["turns"]) { $Session.turns } else { $null }
  $existingTurns = [object[]]@()
  if ($null -ne $existingTurnsValue) {
    $existingTurns = @($existingTurnsValue)
  }

  $existingPendingReviewIds = @()
  if ($Session.PSObject.Properties["pending_review_item_ids"] -and $null -ne $Session.pending_review_item_ids) {
    $existingPendingReviewIds = @($Session.pending_review_item_ids)
  }
  $pendingReviewMap = @{}
  foreach ($id in @($existingPendingReviewIds)) {
    if (-not [string]::IsNullOrWhiteSpace($id)) {
      $pendingReviewMap[$id.ToString()] = $true
    }
  }
  foreach ($reviewItem in @($queuedReviewItems)) {
    if ($null -ne $reviewItem -and $reviewItem.PSObject.Properties["id"] -and -not [string]::IsNullOrWhiteSpace($reviewItem.id)) {
      $pendingReviewMap[$reviewItem.id] = $true
    }
  }

  $Session.draft_items = @($nextDraft)
  $Session.turns = @($existingTurns) + @($turn)
  $Session.pending_review_item_ids = @($pendingReviewMap.Keys | Sort-Object)
  $Session.updated_at = $now
  Upsert-CaptureSession -Session $Session | Out-Null

  return [PSCustomObject]@{
    capture = Build-CaptureSessionView -Session $Session
    turn = $turn
    review_queue_items = $queuedReviewItems
    review_queue_count = @($queuedReviewItems).Count
  }
}

function Create-InventoryItemRecord {
  param(
    [Parameter(Mandatory = $true)]
    [string]$UserId,
    [Parameter(Mandatory = $true)]
    [string]$IngredientName,
    [Parameter(Mandatory = $true)]
    [string]$PurchasedAt,
    [Parameter(Mandatory = $false)]
    [string]$StorageType = "refrigerated",
    [Parameter(Mandatory = $false)]
    [Nullable[double]]$Quantity = $null,
    [Parameter(Mandatory = $false)]
    [string]$Unit = "ea",
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [string]$OpenedAt = $null,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [string]$OcrExpirationDate = $null,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [Nullable[int]]$ProductShelfLifeDays = $null,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [string]$IngredientKeyHint = $null
  )

  $resolvedQuantity = if ($null -eq $Quantity) { 1.0 } else { [double]$Quantity }
  if ($resolvedQuantity -le 0) {
    $resolvedQuantity = 1.0
  }

  $resolvedUnit = if ([string]::IsNullOrWhiteSpace($Unit)) { "ea" } else { $Unit }

  $suggestion = & $script:ExpirationSuggestionCommand `
    -IngredientName $IngredientName `
    -PurchasedAt $PurchasedAt `
    -StorageType $StorageType `
    -OpenedAt $OpenedAt `
    -OcrExpirationDate $OcrExpirationDate `
    -ProductShelfLifeDays $ProductShelfLifeDays

  $resolvedIngredientKey = $suggestion.ingredient_key
  if (-not [string]::IsNullOrWhiteSpace($IngredientKeyHint) -and (
      [string]::IsNullOrWhiteSpace($resolvedIngredientKey) -or $resolvedIngredientKey -eq "default_perishable"
    )) {
    $resolvedIngredientKey = $IngredientKeyHint
  }

  $itemId = ([guid]::NewGuid()).ToString()
  $now = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
  $newItem = [PSCustomObject]@{
    id = $itemId
    user_id = $UserId
    ingredient_name = $IngredientName
    ingredient_key = $resolvedIngredientKey
    quantity = $resolvedQuantity
    unit = $resolvedUnit
    storage_type = $StorageType
    purchased_at = $suggestion.purchased_at
    opened_at = $suggestion.opened_at
    ocr_expiration_date = $OcrExpirationDate
    product_shelf_life_days = $ProductShelfLifeDays
    suggested_expiration_date = $suggestion.suggested_expiration_date
    range_min_date = $suggestion.range_min_date
    range_max_date = $suggestion.range_max_date
    expiration_source = $suggestion.expiration_source
    confidence = $suggestion.confidence
    status = $suggestion.status
    days_remaining = $suggestion.days_remaining
    created_at = $now
    updated_at = $now
  }

  Add-InventoryItem -Item $newItem | Out-Null

  $notifications = New-ExpirationNotifications `
    -UserId $UserId `
    -InventoryItemId $itemId `
    -ExpirationDate ([datetime]$suggestion.suggested_expiration_date)
  Add-Notifications -Notifications $notifications | Out-Null

  return [PSCustomObject]@{
    item = $newItem
    notifications = $notifications
  }
}

function Normalize-InventoryStatus {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Item
  )

  $statusInfo = & $script:ExpirationItemStatusCommand -SuggestedExpirationDate ([datetime]$Item.suggested_expiration_date)
  return [PSCustomObject]@{
    id = $Item.id
    user_id = $Item.user_id
    ingredient_name = $Item.ingredient_name
    ingredient_key = $Item.ingredient_key
    quantity = $Item.quantity
    unit = $Item.unit
    storage_type = $Item.storage_type
    purchased_at = $Item.purchased_at
    opened_at = $Item.opened_at
    ocr_expiration_date = $Item.ocr_expiration_date
    product_shelf_life_days = $Item.product_shelf_life_days
    suggested_expiration_date = $Item.suggested_expiration_date
    range_min_date = $Item.range_min_date
    range_max_date = $Item.range_max_date
    expiration_source = $Item.expiration_source
    confidence = $Item.confidence
    status = $statusInfo.status
    days_remaining = $statusInfo.days_remaining
    created_at = $Item.created_at
    updated_at = $Item.updated_at
  }
}

function Handle-ExpirationSuggest {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerContext]$Context
  )

  try {
    $payload = Read-JsonRequest -Context $Context

    $ingredientName = Get-ObjectPropertyValue -Object $payload -Name "ingredient_name"
    $purchasedAt = Get-ObjectPropertyValue -Object $payload -Name "purchased_at"
    $storageTypeInput = Get-ObjectPropertyValue -Object $payload -Name "storage_type"
    $openedAtInput = Get-ObjectPropertyValue -Object $payload -Name "opened_at"
    $ocrExpirationDateInput = Get-ObjectPropertyValue -Object $payload -Name "ocr_expiration_date"
    $productShelfLifeDays = Get-ObjectPropertyValue -Object $payload -Name "product_shelf_life_days"

    if ([string]::IsNullOrWhiteSpace($ingredientName)) {
      throw "ingredient_name is required."
    }
    if ([string]::IsNullOrWhiteSpace($purchasedAt)) {
      throw "purchased_at is required."
    }

    $storageType = if ([string]::IsNullOrWhiteSpace($storageTypeInput)) {
      "refrigerated"
    }
    else {
      $storageTypeInput
    }

    $result = & $script:ExpirationSuggestionCommand `
      -IngredientName $ingredientName `
      -PurchasedAt (Convert-DateValue -Value $purchasedAt) `
      -StorageType $storageType `
      -OpenedAt (Convert-DateValue -Value $openedAtInput) `
      -OcrExpirationDate (Convert-DateValue -Value $ocrExpirationDateInput) `
      -ProductShelfLifeDays $productShelfLifeDays

    Write-JsonResponse -Response $Context.Response -StatusCode 200 -Body @{
      data = $result
      meta = @{
        calculated_at = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
      }
    }
  }
  catch {
    Write-JsonResponse -Response $Context.Response -StatusCode 400 -Body @{
      error = $_.Exception.Message
    }
  }
}

function Handle-ReloadIngredientCatalog {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerContext]$Context
  )

  try {
    $reloaded = @()

    if ($null -ne $script:ExpirationClearRuleCacheCommand) {
      & $script:ExpirationClearRuleCacheCommand | Out-Null
      $reloaded += "shelf_life_rules"
    }

    if ($null -ne $script:ChatClearLexiconCacheCommand) {
      & $script:ChatClearLexiconCacheCommand | Out-Null
      $reloaded += "ingredient_lexicon"
    }

    Write-JsonResponse -Response $Context.Response -StatusCode 200 -Body @{
      data = @{
        reloaded = @($reloaded)
        reloaded_count = @($reloaded).Count
        reloaded_at = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
      }
    }
  }
  catch {
    Write-JsonResponse -Response $Context.Response -StatusCode 400 -Body @{
      error = $_.Exception.Message
    }
  }
}

function Handle-OcrParseDate {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerContext]$Context
  )

  try {
    $payload = Read-JsonRequest -Context $Context
    $rawText = Get-ObjectPropertyValue -Object $payload -Name "raw_text"
    if ([string]::IsNullOrWhiteSpace($rawText)) {
      throw "raw_text is required."
    }

    $parseResult = Parse-OcrExpirationDate -RawText $rawText
    $event = [PSCustomObject]@{
      id = ([guid]::NewGuid()).ToString()
      raw_text = $rawText
      parsed_expiration_date = $parseResult.parsed_expiration_date
      parser_confidence = $parseResult.parser_confidence
      matched_pattern = $parseResult.matched_pattern
      created_at = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
    }
    Add-OcrEvent -Event $event | Out-Null

    Write-JsonResponse -Response $Context.Response -StatusCode 200 -Body @{
      data = $event
    }
  }
  catch {
    Write-JsonResponse -Response $Context.Response -StatusCode 400 -Body @{
      error = $_.Exception.Message
    }
  }
}

function Handle-InventoryCreate {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerContext]$Context
  )

  try {
    $payload = Read-JsonRequest -Context $Context

    $ingredientName = Get-ObjectPropertyValue -Object $payload -Name "ingredient_name"
    $purchasedAt = Get-ObjectPropertyValue -Object $payload -Name "purchased_at"
    $storageTypeInput = Get-ObjectPropertyValue -Object $payload -Name "storage_type"
    $openedAtInput = Get-ObjectPropertyValue -Object $payload -Name "opened_at"
    $userIdInput = Get-ObjectPropertyValue -Object $payload -Name "user_id"
    $quantityInput = Get-ObjectPropertyValue -Object $payload -Name "quantity"
    $unitInput = Get-ObjectPropertyValue -Object $payload -Name "unit"
    $ocrExpirationDateInput = Get-ObjectPropertyValue -Object $payload -Name "ocr_expiration_date"
    $ocrRawText = Get-ObjectPropertyValue -Object $payload -Name "ocr_raw_text"
    $productShelfLifeDays = Get-ObjectPropertyValue -Object $payload -Name "product_shelf_life_days"

    if ([string]::IsNullOrWhiteSpace($ingredientName)) {
      throw "ingredient_name is required."
    }
    if ([string]::IsNullOrWhiteSpace($purchasedAt)) {
      throw "purchased_at is required."
    }

    $userId = if ([string]::IsNullOrWhiteSpace($userIdInput)) { "demo-user" } else { $userIdInput }
    $storageType = if ([string]::IsNullOrWhiteSpace($storageTypeInput)) { "refrigerated" } else { $storageTypeInput }
    $quantity = if ($null -eq $quantityInput) { 1 } else { [double]$quantityInput }
    $unit = if ([string]::IsNullOrWhiteSpace($unitInput)) { "ea" } else { $unitInput }

    $resolvedOcrDate = Convert-DateValue -Value $ocrExpirationDateInput
    $ocrMeta = $null

    if ($null -eq $resolvedOcrDate -and -not [string]::IsNullOrWhiteSpace($ocrRawText)) {
      $ocrMeta = Parse-OcrExpirationDate -RawText $ocrRawText
      $resolvedOcrDate = $ocrMeta.parsed_expiration_date
    }

    $createResult = Create-InventoryItemRecord `
      -UserId $userId `
      -IngredientName $ingredientName `
      -PurchasedAt (Convert-DateValue -Value $purchasedAt) `
      -StorageType $storageType `
      -Quantity $quantity `
      -Unit $unit `
      -OpenedAt (Convert-DateValue -Value $openedAtInput) `
      -OcrExpirationDate $resolvedOcrDate `
      -ProductShelfLifeDays $productShelfLifeDays

    $newItem = $createResult.item
    $itemId = $newItem.id

    if ($null -ne $ocrMeta) {
      $event = [PSCustomObject]@{
        id = ([guid]::NewGuid()).ToString()
        inventory_item_id = $itemId
        raw_text = $ocrRawText
        parsed_expiration_date = $ocrMeta.parsed_expiration_date
        parser_confidence = $ocrMeta.parser_confidence
        matched_pattern = $ocrMeta.matched_pattern
        created_at = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
      }
      Add-OcrEvent -Event $event | Out-Null
    }

    Write-JsonResponse -Response $Context.Response -StatusCode 201 -Body @{
      data = @{
        item = $newItem
        notifications = $createResult.notifications
      }
    }
  }
  catch {
    Write-JsonResponse -Response $Context.Response -StatusCode 400 -Body @{
      error = $_.Exception.Message
    }
  }
}

function Handle-InventoryList {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerContext]$Context
  )

  try {
    $userId = Get-QueryValue -Request $Context.Request -Key "user_id"
    $status = Get-QueryValue -Request $Context.Request -Key "status"
    $items = Get-InventoryItems -UserId $userId -Status $status
    $normalized = @($items | ForEach-Object { Normalize-InventoryStatus -Item $_ })

    Write-JsonResponse -Response $Context.Response -StatusCode 200 -Body @{
      data = @{
        items = $normalized
        count = @($normalized).Count
      }
    }
  }
  catch {
    Write-JsonResponse -Response $Context.Response -StatusCode 400 -Body @{
      error = $_.Exception.Message
    }
  }
}

function Handle-InventoryConsume {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerContext]$Context,
    [Parameter(Mandatory = $true)]
    [string]$ItemId
  )

  try {
    $payload = Read-JsonRequestOptional -Context $Context
    $consumedQuantityInput = Get-ObjectPropertyValue -Object $payload -Name "consumed_quantity"
    $openedAtInput = Get-ObjectPropertyValue -Object $payload -Name "opened_at"
    $markOpenedInput = Get-ObjectPropertyValue -Object $payload -Name "mark_opened"

    $consumedQuantity = if ($null -eq $consumedQuantityInput) { 1.0 } else { [double]$consumedQuantityInput }
    if ($consumedQuantity -le 0) {
      throw "consumed_quantity must be greater than 0."
    }

    $allItems = Get-InventoryItems
    $consumptionResult = Invoke-InventoryConsumption `
      -InventoryItems $allItems `
      -ItemId $ItemId `
      -ConsumedQuantity $consumedQuantity `
      -OpenedAt $openedAtInput `
      -MarkOpened ($markOpenedInput -eq $true)

    Save-InventoryItems -Items $consumptionResult.updated_items

    $normalized = Normalize-InventoryStatus -Item $consumptionResult.updated_item
    Write-JsonResponse -Response $Context.Response -StatusCode 200 -Body @{
      data = @{
        item = $normalized
        consumed_quantity = $consumedQuantity
        should_reorder = ($normalized.quantity -le 0)
      }
    }
  }
  catch {
    if ($_.Exception.Message -eq "inventory item not found.") {
      Write-JsonResponse -Response $Context.Response -StatusCode 404 -Body @{
        error = $_.Exception.Message
      }
      return
    }

    Write-JsonResponse -Response $Context.Response -StatusCode 400 -Body @{
      error = $_.Exception.Message
    }
  }
}

function Handle-InventorySummary {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerContext]$Context
  )

  try {
    $userId = Get-QueryValue -Request $Context.Request -Key "user_id"
    $items = Get-InventoryItems -UserId $userId
    $normalized = @($items | ForEach-Object { Normalize-InventoryStatus -Item $_ })

    $fresh = @($normalized | Where-Object { $_.status -eq "fresh" }).Count
    $expiringSoon = @($normalized | Where-Object { $_.status -eq "expiring_soon" }).Count
    $expired = @($normalized | Where-Object { $_.status -eq "expired" }).Count

    Write-JsonResponse -Response $Context.Response -StatusCode 200 -Body @{
      data = @{
        total_items = @($normalized).Count
        fresh = $fresh
        expiring_soon = $expiringSoon
        expired = $expired
      }
    }
  }
  catch {
    Write-JsonResponse -Response $Context.Response -StatusCode 400 -Body @{
      error = $_.Exception.Message
    }
  }
}

function Handle-NotificationsList {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerContext]$Context
  )

  try {
    $userId = Get-QueryValue -Request $Context.Request -Key "user_id"
    $status = Get-QueryValue -Request $Context.Request -Key "status"
    $dueUntilValue = Get-QueryValue -Request $Context.Request -Key "due_until"
    $dueUntil = $null
    if (-not [string]::IsNullOrWhiteSpace($dueUntilValue)) {
      $dueUntil = [datetime]::Parse($dueUntilValue)
    }

    $notifications = Get-Notifications -UserId $userId -Status $status -DueUntil $dueUntil
    Write-JsonResponse -Response $Context.Response -StatusCode 200 -Body @{
      data = @{
        items = $notifications
        count = @($notifications).Count
      }
    }
  }
  catch {
    Write-JsonResponse -Response $Context.Response -StatusCode 400 -Body @{
      error = $_.Exception.Message
    }
  }
}

function Handle-RecipeRecommendations {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerContext]$Context
  )

  try {
    $userId = Get-QueryValue -Request $Context.Request -Key "user_id"
    $topN = Get-QueryIntValue -Request $Context.Request -Key "top_n" -DefaultValue 10

    $items = Get-InventoryItems -UserId $userId
    $normalized = @($items | ForEach-Object { Normalize-InventoryStatus -Item $_ })
    $recommendations = Get-RecipeRecommendations -InventoryItems $normalized -TopN $topN

    Write-JsonResponse -Response $Context.Response -StatusCode 200 -Body @{
      data = @{
        items = $recommendations
        count = @($recommendations).Count
      }
    }
  }
  catch {
    Write-JsonResponse -Response $Context.Response -StatusCode 400 -Body @{
      error = $_.Exception.Message
    }
  }
}

function Handle-ShoppingSuggestions {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerContext]$Context
  )

  try {
    $userId = Get-QueryValue -Request $Context.Request -Key "user_id"
    $topN = Get-QueryIntValue -Request $Context.Request -Key "top_n" -DefaultValue 10
    $topRecipeCount = Get-QueryIntValue -Request $Context.Request -Key "top_recipe_count" -DefaultValue 3
    $lowStockThresholdValue = Get-QueryValue -Request $Context.Request -Key "low_stock_threshold"
    $lowStockThreshold = $null
    if (-not [string]::IsNullOrWhiteSpace($lowStockThresholdValue)) {
      $lowStockThreshold = [int]$lowStockThresholdValue
    }

    $items = Get-InventoryItems -UserId $userId
    $normalized = @($items | ForEach-Object { Normalize-InventoryStatus -Item $_ })
    $recommendations = Get-RecipeRecommendations -InventoryItems $normalized -TopN $topN
    $shopping = Get-ShoppingSuggestions `
      -InventoryItems $normalized `
      -RecipeRecommendations $recommendations `
      -TopRecipeCount $topRecipeCount `
      -LowStockThreshold $lowStockThreshold

    Write-JsonResponse -Response $Context.Response -StatusCode 200 -Body @{
      data = @{
        items = $shopping.items
        count = $shopping.count
        low_stock_threshold = $shopping.low_stock_threshold
      }
    }
  }
  catch {
    Write-JsonResponse -Response $Context.Response -StatusCode 400 -Body @{
      error = $_.Exception.Message
    }
  }
}

function Handle-CaptureSessionStart {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerContext]$Context
  )

  try {
    $payload = Read-JsonRequestOptional -Context $Context
    $userIdInput = Get-ObjectPropertyValue -Object $payload -Name "user_id"
    $userId = if ([string]::IsNullOrWhiteSpace($userIdInput)) { "demo-user" } else { $userIdInput }
    $now = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")

    $session = [PSCustomObject]@{
      id = ([guid]::NewGuid()).ToString()
      user_id = $userId
      status = "open"
      draft_items = [object[]]@()
      turns = [object[]]@()
      pending_review_item_ids = [object[]]@()
      created_inventory_item_ids = [object[]]@()
      created_at = $now
      updated_at = $now
      finalized_at = $null
    }

    Add-CaptureSession -Session $session | Out-Null

    Write-JsonResponse -Response $Context.Response -StatusCode 201 -Body @{
      data = Build-CaptureSessionView -Session $session
    }
  }
  catch {
    Write-JsonResponse -Response $Context.Response -StatusCode 400 -Body @{
      error = $_.Exception.Message
    }
  }
}

function Handle-CaptureSessionGet {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerContext]$Context,
    [Parameter(Mandatory = $true)]
    [string]$SessionId
  )

  try {
    $session = Get-CaptureSessionById -SessionId $SessionId
    if ($null -eq $session) {
      Write-JsonResponse -Response $Context.Response -StatusCode 404 -Body @{
        error = "capture session not found."
      }
      return
    }

    Write-JsonResponse -Response $Context.Response -StatusCode 200 -Body @{
      data = Build-CaptureSessionView -Session $session
    }
  }
  catch {
    Write-JsonResponse -Response $Context.Response -StatusCode 400 -Body @{
      error = $_.Exception.Message
    }
  }
}

function Handle-CaptureSessionMessage {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerContext]$Context,
    [Parameter(Mandatory = $true)]
    [string]$SessionId
  )

  try {
    $session = Get-CaptureSessionById -SessionId $SessionId
    if ($null -eq $session) {
      Write-JsonResponse -Response $Context.Response -StatusCode 404 -Body @{
        error = "capture session not found."
      }
      return
    }

    if ($session.status -ne "open") {
      throw "capture session is not open."
    }

    $payload = Read-JsonRequest -Context $Context
    $textInput = Get-ObjectPropertyValue -Object $payload -Name "text"
    $sourceTypeInput = Get-ObjectPropertyValue -Object $payload -Name "source_type"
    $visionDetectedItemsInput = Get-ObjectPropertyValue -Object $payload -Name "vision_detected_items"
    $sourceType = if ([string]::IsNullOrWhiteSpace($sourceTypeInput)) { "text" } else { $sourceTypeInput }
    $visionDetectedItems = Convert-ToStringArray -Value $visionDetectedItemsInput

    if ([string]::IsNullOrWhiteSpace($textInput) -and @($visionDetectedItems).Count -eq 0) {
      throw "Either text or vision_detected_items is required."
    }

    $parseResult = Parse-ConversationCommands -Text $textInput -VisionDetectedItems $visionDetectedItems
    $applyResult = Apply-CaptureSessionParsedInput `
      -Session $session `
      -SourceType $sourceType `
      -TextInput $textInput `
      -VisionDetectedItems $visionDetectedItems `
      -ParseResult $parseResult

    Write-JsonResponse -Response $Context.Response -StatusCode 200 -Body @{
      data = $applyResult
    }
  }
  catch {
    if ($_.Exception.Message -eq "capture session not found.") {
      Write-JsonResponse -Response $Context.Response -StatusCode 404 -Body @{
        error = $_.Exception.Message
      }
      return
    }

    Write-JsonResponse -Response $Context.Response -StatusCode 400 -Body @{
      error = $_.Exception.Message
    }
  }
}

function Handle-CaptureSessionFinalize {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerContext]$Context,
    [Parameter(Mandatory = $true)]
    [string]$SessionId
  )

  try {
    $session = Get-CaptureSessionById -SessionId $SessionId
    if ($null -eq $session) {
      Write-JsonResponse -Response $Context.Response -StatusCode 404 -Body @{
        error = "capture session not found."
      }
      return
    }

    if ($session.status -ne "open") {
      throw "capture session is not open."
    }

    $payload = Read-JsonRequestOptional -Context $Context
    $purchasedAtInput = Get-ObjectPropertyValue -Object $payload -Name "purchased_at"
    $storageTypeInput = Get-ObjectPropertyValue -Object $payload -Name "storage_type"
    $openedAtInput = Get-ObjectPropertyValue -Object $payload -Name "opened_at"
    $userIdInput = Get-ObjectPropertyValue -Object $payload -Name "user_id"

    $purchasedAt = if ([string]::IsNullOrWhiteSpace($purchasedAtInput)) { (Get-Date).ToString("yyyy-MM-dd") } else { $purchasedAtInput }
    $storageType = if ([string]::IsNullOrWhiteSpace($storageTypeInput)) { "refrigerated" } else { $storageTypeInput }
    $userId = if ([string]::IsNullOrWhiteSpace($userIdInput)) { $session.user_id } else { $userIdInput }
    $autoMappedReviewCount = 0

    $draftItemsValue = if ($session.PSObject.Properties["draft_items"]) { $session.draft_items } else { $null }
    $draftItems = [object[]]@()
    if ($null -ne $draftItemsValue) {
      $draftItems = @($draftItemsValue)
    }

    if (@($draftItems).Count -eq 0) {
      $autoMapResult = Auto-MapPendingUnknownReviewItemsToSessionDraft `
        -Session $session `
        -ResolvedByUserId $userId
      $autoMappedReviewCount = $autoMapResult.mapped_count

      if ($autoMappedReviewCount -gt 0) {
        $session = Get-CaptureSessionById -SessionId $SessionId
        $draftItemsValue = if ($session.PSObject.Properties["draft_items"]) { $session.draft_items } else { $null }
        $draftItems = [object[]]@()
        if ($null -ne $draftItemsValue) {
          $draftItems = @($draftItemsValue)
        }
      }
    }

    if (@($draftItems).Count -eq 0) {
      throw "capture session has no draft items. Resolve pending confirmations first."
    }

    $createdItems = @()
    $createdNotifications = @()
    foreach ($draftItem in $draftItems) {
      $createResult = Create-InventoryItemRecord `
        -UserId $userId `
        -IngredientName $draftItem.ingredient_name `
        -PurchasedAt $purchasedAt `
        -StorageType $storageType `
        -Quantity ([double]$draftItem.quantity) `
        -Unit $draftItem.unit `
        -OpenedAt (Convert-DateValue -Value $openedAtInput) `
        -IngredientKeyHint $draftItem.ingredient_key

      $createdItems += $createResult.item
      $createdNotifications += @($createResult.notifications)
    }

    $session.status = "finalized"
    $session.finalized_at = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
    $session.updated_at = $session.finalized_at
    $session.created_inventory_item_ids = @($createdItems | ForEach-Object { $_.id })
    Upsert-CaptureSession -Session $session | Out-Null

    Write-JsonResponse -Response $Context.Response -StatusCode 200 -Body @{
      data = @{
        capture = Build-CaptureSessionView -Session $session
        created_items = $createdItems
        created_notifications_count = @($createdNotifications).Count
        auto_mapped_review_count = $autoMappedReviewCount
      }
    }
  }
  catch {
    if ($_.Exception.Message -eq "capture session not found.") {
      Write-JsonResponse -Response $Context.Response -StatusCode 404 -Body @{
        error = $_.Exception.Message
      }
      return
    }

    Write-JsonResponse -Response $Context.Response -StatusCode 400 -Body @{
      error = $_.Exception.Message
    }
  }
}

function Handle-VisionAnalyze {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerContext]$Context
  )

  try {
    $payload = Read-JsonRequest -Context $Context
    $userIdInput = Get-ObjectPropertyValue -Object $payload -Name "user_id"
    $sessionIdInput = Get-ObjectPropertyValue -Object $payload -Name "session_id"
    $imageBase64Input = Get-ObjectPropertyValue -Object $payload -Name "image_base64"
    $mimeTypeInput = Get-ObjectPropertyValue -Object $payload -Name "mime_type"
    $textHintInput = Get-ObjectPropertyValue -Object $payload -Name "text_hint"
    $sourceTypeInput = Get-ObjectPropertyValue -Object $payload -Name "source_type"
    $segmentationModeInput = Get-ObjectPropertyValue -Object $payload -Name "segmentation_mode"
    $autoApplyToSessionInput = Get-ObjectPropertyValue -Object $payload -Name "auto_apply_to_session"

    if ([string]::IsNullOrWhiteSpace($imageBase64Input)) {
      throw "image_base64 is required."
    }

    $sourceType = if ([string]::IsNullOrWhiteSpace($sourceTypeInput)) { "vision" } else { $sourceTypeInput.ToString().Trim() }
    $segmentationMode = if ([string]::IsNullOrWhiteSpace($segmentationModeInput)) { "auto" } else { $segmentationModeInput.ToString().Trim().ToLowerInvariant() }
    if ($segmentationMode -notin @("auto", "none", "sam3_http")) {
      throw "segmentation_mode must be one of: auto, none, sam3_http."
    }

    $autoApplyToSession = Convert-ToBoolean -Value $autoApplyToSessionInput -DefaultValue $true
    $resolvedMimeType = if ([string]::IsNullOrWhiteSpace($mimeTypeInput)) { $null } else { $mimeTypeInput.ToString().Trim() }
    $textHint = if ([string]::IsNullOrWhiteSpace($textHintInput)) { $null } else { $textHintInput.ToString() }

    $visionResult = Invoke-VisionIngredientDetection `
      -ImageBase64 $imageBase64Input `
      -MimeType $resolvedMimeType `
      -SegmentationMode $segmentationMode `
      -TextHint $textHint

    $detectedItems = Convert-ToStringArray -Value (Get-ObjectPropertyValue -Object $visionResult -Name "detected_items")
    $captureApplyResult = $null
    $appliedToSession = $false

    if ($autoApplyToSession -and -not [string]::IsNullOrWhiteSpace($sessionIdInput) -and @($detectedItems).Count -gt 0) {
      $session = Get-CaptureSessionById -SessionId $sessionIdInput
      if ($null -eq $session) {
        throw "capture session not found."
      }
      if ($session.status -ne "open") {
        throw "capture session is not open."
      }
      if (-not [string]::IsNullOrWhiteSpace($userIdInput) -and $session.user_id -ne $userIdInput) {
        throw "session user_id does not match payload user_id."
      }

      $parseResult = Parse-ConversationCommands -Text $textHint -VisionDetectedItems $detectedItems
      $captureApplyResult = Apply-CaptureSessionParsedInput `
        -Session $session `
        -SourceType $sourceType `
        -TextInput $textHint `
        -VisionDetectedItems $detectedItems `
        -ParseResult $parseResult
      $appliedToSession = $true
    }

    $message = $null
    if (@($detectedItems).Count -eq 0) {
      $message = "No ingredients were detected from this image."
    }
    elseif (-not $appliedToSession -and -not [string]::IsNullOrWhiteSpace($sessionIdInput) -and -not $autoApplyToSession) {
      $message = "Detected items were returned but not applied to session because auto_apply_to_session=false."
    }
    elseif (-not $appliedToSession -and [string]::IsNullOrWhiteSpace($sessionIdInput)) {
      $message = "Detected items were returned. Set session_id to append directly to capture draft."
    }

    Write-JsonResponse -Response $Context.Response -StatusCode 200 -Body @{
      data = @{
        detected_items = @($detectedItems)
        detected_count = @($detectedItems).Count
        vision = $visionResult
        applied_to_session = $appliedToSession
        session_id = $sessionIdInput
        capture = if ($null -ne $captureApplyResult) { $captureApplyResult.capture } else { $null }
        turn = if ($null -ne $captureApplyResult) { $captureApplyResult.turn } else { $null }
        review_queue_items = if ($null -ne $captureApplyResult) { $captureApplyResult.review_queue_items } else { @() }
        review_queue_count = if ($null -ne $captureApplyResult) { $captureApplyResult.review_queue_count } else { 0 }
        message = $message
      }
    }
  }
  catch {
    if ($_.Exception.Message -eq "capture session not found.") {
      Write-JsonResponse -Response $Context.Response -StatusCode 404 -Body @{
        error = $_.Exception.Message
      }
      return
    }

    Write-JsonResponse -Response $Context.Response -StatusCode 400 -Body @{
      error = $_.Exception.Message
    }
  }
}

function Handle-ChatIntake {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerContext]$Context
  )

  try {
    $payload = Read-JsonRequest -Context $Context
    $textInput = Get-ObjectPropertyValue -Object $payload -Name "text"
    $visionDetectedItemsInput = Get-ObjectPropertyValue -Object $payload -Name "vision_detected_items"
    $userIdInput = Get-ObjectPropertyValue -Object $payload -Name "user_id"
    $purchasedAtInput = Get-ObjectPropertyValue -Object $payload -Name "purchased_at"
    $storageTypeInput = Get-ObjectPropertyValue -Object $payload -Name "storage_type"
    $openedAtInput = Get-ObjectPropertyValue -Object $payload -Name "opened_at"

    $visionDetectedItems = Convert-ToStringArray -Value $visionDetectedItemsInput
    if ([string]::IsNullOrWhiteSpace($textInput) -and @($visionDetectedItems).Count -eq 0) {
      throw "Either text or vision_detected_items is required."
    }

    $userId = if ([string]::IsNullOrWhiteSpace($userIdInput)) { "demo-user" } else { $userIdInput }
    $purchasedAt = if ([string]::IsNullOrWhiteSpace($purchasedAtInput)) { (Get-Date).ToString("yyyy-MM-dd") } else { $purchasedAtInput }
    $storageType = if ([string]::IsNullOrWhiteSpace($storageTypeInput)) { "refrigerated" } else { $storageTypeInput }

    $parseResult = Parse-ConversationCommands -Text $textInput -VisionDetectedItems $visionDetectedItems
    $reviewCandidates = @()
    if ($parseResult.PSObject.Properties["review_candidates"]) {
      $reviewCandidates = @($parseResult.review_candidates)
    }
    $queuedReviewResult = Upsert-IngredientReviewCandidates `
      -UserId $userId `
      -ReviewCandidates $reviewCandidates
    $queuedReviewItems = @($queuedReviewResult.items)

    $draftItems = Apply-ConversationCommandsToDraft -DraftItems @() -Commands @($parseResult.commands)

    if (@($draftItems).Count -eq 0) {
      Write-JsonResponse -Response $Context.Response -StatusCode 200 -Body @{
        data = @{
          draft_items = @()
          created_items = @()
          created_notifications_count = 0
          review_queue_items = $queuedReviewItems
          review_queue_count = @($queuedReviewItems).Count
          message = if (@($queuedReviewItems).Count -gt 0) {
            "No confirmed ingredient was detected. Review candidates were queued for confirmation."
          }
          else {
            "No ingredients detected from chat input."
          }
        }
      }
      return
    }

    $createdItems = @()
    $createdNotifications = @()
    foreach ($draftItem in $draftItems) {
      $createResult = Create-InventoryItemRecord `
        -UserId $userId `
        -IngredientName $draftItem.ingredient_name `
        -PurchasedAt $purchasedAt `
        -StorageType $storageType `
        -Quantity ([double]$draftItem.quantity) `
        -Unit $draftItem.unit `
        -OpenedAt (Convert-DateValue -Value $openedAtInput) `
        -IngredientKeyHint $draftItem.ingredient_key

      $createdItems += $createResult.item
      $createdNotifications += @($createResult.notifications)
    }

    Write-JsonResponse -Response $Context.Response -StatusCode 200 -Body @{
      data = @{
        draft_items = $draftItems
        created_items = $createdItems
        created_notifications_count = @($createdNotifications).Count
        review_queue_items = $queuedReviewItems
        review_queue_count = @($queuedReviewItems).Count
      }
    }
  }
  catch {
    Write-JsonResponse -Response $Context.Response -StatusCode 400 -Body @{
      error = $_.Exception.Message
    }
  }
}

function Handle-IngredientCatalogSearch {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerContext]$Context
  )

  try {
    $query = Get-QueryValue -Request $Context.Request -Key "query"
    $topN = Get-QueryIntValue -Request $Context.Request -Key "top_n" -DefaultValue 20
    $items = & $script:ChatSearchIngredientCatalogCommand -Query $query -TopN $topN

    Write-JsonResponse -Response $Context.Response -StatusCode 200 -Body @{
      data = @{
        query = $query
        items = @($items)
        count = @($items).Count
      }
    }
  }
  catch {
    Write-JsonResponse -Response $Context.Response -StatusCode 400 -Body @{
      error = $_.Exception.Message
    }
  }
}

function Handle-IngredientAliasLearn {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerContext]$Context
  )

  try {
    $payload = Read-JsonRequest -Context $Context
    $ingredientKey = Get-ObjectPropertyValue -Object $payload -Name "ingredient_key"
    $alias = Get-ObjectPropertyValue -Object $payload -Name "alias"
    $displayName = Get-ObjectPropertyValue -Object $payload -Name "display_name"

    if ([string]::IsNullOrWhiteSpace($ingredientKey)) {
      throw "ingredient_key is required."
    }
    if ([string]::IsNullOrWhiteSpace($alias)) {
      throw "alias is required."
    }

    $result = & $script:ChatAddAliasOverrideCommand `
      -IngredientKey $ingredientKey `
      -Alias $alias `
      -DisplayName $displayName

    Write-JsonResponse -Response $Context.Response -StatusCode 200 -Body @{
      data = $result
    }
  }
  catch {
    Write-JsonResponse -Response $Context.Response -StatusCode 400 -Body @{
      error = $_.Exception.Message
    }
  }
}

function Handle-IngredientReviewQueueList {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerContext]$Context
  )

  try {
    $userId = Get-QueryValue -Request $Context.Request -Key "user_id"
    $statusInput = Get-QueryValue -Request $Context.Request -Key "status"
    $limit = Get-QueryIntValue -Request $Context.Request -Key "limit" -DefaultValue 100
    if ($limit -le 0) {
      $limit = 100
    }

    $status = if ([string]::IsNullOrWhiteSpace($statusInput)) { "pending" } else { $statusInput.Trim().ToLowerInvariant() }
    if ($status -notin @("pending", "mapped", "ignored", "all")) {
      throw "status must be one of: pending, mapped, ignored, all."
    }

    $items = if ($status -eq "all") {
      Get-IngredientReviewQueue -UserId $userId
    }
    else {
      Get-IngredientReviewQueue -UserId $userId -Status $status
    }

    $ordered = @($items | Sort-Object -Property @{ Expression = { $_.updated_at } } -Descending)
    $limited = @($ordered | Select-Object -First $limit)

    Write-JsonResponse -Response $Context.Response -StatusCode 200 -Body @{
      data = @{
        items = $limited
        count = @($limited).Count
        total_count = @($ordered).Count
        status = $status
      }
    }
  }
  catch {
    Write-JsonResponse -Response $Context.Response -StatusCode 400 -Body @{
      error = $_.Exception.Message
    }
  }
}

function Handle-IngredientReviewResolve {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerContext]$Context,
    [Parameter(Mandatory = $true)]
    [string]$QueueItemId
  )

  try {
    $payload = Read-JsonRequestOptional -Context $Context
    $actionInput = Get-ObjectPropertyValue -Object $payload -Name "action"
    $ingredientKey = Get-ObjectPropertyValue -Object $payload -Name "ingredient_key"
    $displayName = Get-ObjectPropertyValue -Object $payload -Name "display_name"
    $resolvedByUserId = Get-ObjectPropertyValue -Object $payload -Name "user_id"
    $applyToSessionInput = Get-ObjectPropertyValue -Object $payload -Name "apply_to_session"

    $action = if ([string]::IsNullOrWhiteSpace($actionInput)) { "map" } else { $actionInput.ToString().Trim().ToLowerInvariant() }
    if ($action -notin @("map", "ignore")) {
      throw "action must be map or ignore."
    }

    $applyToSession = Convert-ToBoolean -Value $applyToSessionInput -DefaultValue $true

    $result = Resolve-IngredientReviewQueueItem `
      -QueueItemId $QueueItemId `
      -Action $action `
      -IngredientKey $ingredientKey `
      -DisplayName $displayName `
      -ResolvedByUserId $resolvedByUserId `
      -ApplyToSession $applyToSession

    $resolvedItem = $result.item
    $capture = $null
    if ($null -ne $resolvedItem -and $resolvedItem.PSObject.Properties["session_id"] -and -not [string]::IsNullOrWhiteSpace($resolvedItem.session_id)) {
      $session = Get-CaptureSessionById -SessionId $resolvedItem.session_id
      if ($null -ne $session) {
        $pendingIds = @()
        if ($session.PSObject.Properties["pending_review_item_ids"] -and $null -ne $session.pending_review_item_ids) {
          $pendingIds = @($session.pending_review_item_ids)
        }

        $session.pending_review_item_ids = @($pendingIds | Where-Object { $_ -ne $QueueItemId } | Sort-Object -Unique)
        $session.updated_at = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
        Upsert-CaptureSession -Session $session | Out-Null
        $capture = Build-CaptureSessionView -Session $session
      }
    }

    Write-JsonResponse -Response $Context.Response -StatusCode 200 -Body @{
      data = @{
        item = $resolvedItem
        alias_result = $result.alias_result
        session_apply = $result.session_apply
        capture = $capture
      }
    }
  }
  catch {
    if ($_.Exception.Message -eq "review queue item not found.") {
      Write-JsonResponse -Response $Context.Response -StatusCode 404 -Body @{
        error = $_.Exception.Message
      }
      return
    }

    Write-JsonResponse -Response $Context.Response -StatusCode 400 -Body @{
      error = $_.Exception.Message
    }
  }
}

function Handle-NotificationsRunDue {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.HttpListenerContext]$Context
  )

  try {
    $payload = Read-JsonRequest -Context $Context
    $userIdInput = Get-ObjectPropertyValue -Object $payload -Name "user_id"
    $asOfDateTimeInput = Get-ObjectPropertyValue -Object $payload -Name "as_of_datetime"
    $userId = if ([string]::IsNullOrWhiteSpace($userIdInput)) { $null } else { $userIdInput }
    $asOfDateTime = if ([string]::IsNullOrWhiteSpace($asOfDateTimeInput)) { (Get-Date) } else { [datetime]::Parse($asOfDateTimeInput) }

    $allNotifications = Get-Notifications

    $targets = @($allNotifications | Where-Object {
      $_.status -eq "pending" -and ([datetime]$_.scheduled_at) -le $asOfDateTime -and (
        [string]::IsNullOrWhiteSpace($userId) -or $_.user_id -eq $userId
      )
    })

    $dispatchResult = Invoke-DispatchDueNotifications -Notifications $targets -AsOfDateTime $asOfDateTime

    $updatedMap = @{}
    foreach ($updated in $dispatchResult.updated_notifications) {
      $updatedMap[$updated.id] = $updated
    }

    $merged = @()
    foreach ($existing in $allNotifications) {
      if ($updatedMap.ContainsKey($existing.id)) {
        $merged += $updatedMap[$existing.id]
      }
      else {
        $merged += $existing
      }
    }

    Save-Notifications -Notifications $merged

    Write-JsonResponse -Response $Context.Response -StatusCode 200 -Body @{
      data = @{
        as_of_datetime = $asOfDateTime.ToString("yyyy-MM-ddTHH:mm:ssK")
        sent_count = $dispatchResult.sent_count
        sent_notifications = $dispatchResult.sent_notifications
      }
    }
  }
  catch {
    Write-JsonResponse -Response $Context.Response -StatusCode 400 -Body @{
      error = $_.Exception.Message
    }
  }
}

$listener = [System.Net.HttpListener]::new()
$listener.Prefixes.Add($Prefix)
try {
  $listener.Start()
}
catch {
  Write-Host "Failed to start server at $Prefix"
  throw
}

Write-Host "Server started at $Prefix"
Write-Host "Press Ctrl+C to stop."

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $request = $context.Request

    Set-CorsHeaders -Context $context

    $path = $request.Url.AbsolutePath.TrimEnd("/")
    if ([string]::IsNullOrWhiteSpace($path)) {
      $path = "/"
    }
    $method = $request.HttpMethod.ToUpperInvariant()

    if ($method -eq "OPTIONS") {
      $context.Response.StatusCode = 204
      $context.Response.Headers["Cache-Control"] = "no-store"
      $context.Response.OutputStream.Close()
      continue
    }

    if ($method -eq "GET" -and $path -eq "/health") {
      Write-JsonResponse -Response $context.Response -StatusCode 200 -Body @{
        status = "ok"
        timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
      }
      continue
    }

    if ($method -eq "GET" -and ($path -eq "/" -or $path -eq "/index.html")) {
      Handle-StaticWeb -Context $context -RelativePath "index.html"
      continue
    }

    if ($method -eq "GET" -and ($path -eq "/styles.css" -or $path -eq "/app.js")) {
      Handle-StaticWeb -Context $context -RelativePath $path
      continue
    }

    if ($method -eq "POST" -and $path -eq "/api/v1/expiration/suggest") {
      Handle-ExpirationSuggest -Context $context
      continue
    }

    if ($method -eq "POST" -and $path -eq "/api/v1/admin/reload-ingredient-catalog") {
      Handle-ReloadIngredientCatalog -Context $context
      continue
    }

    if ($method -eq "POST" -and $path -eq "/api/v1/chat/intake") {
      Handle-ChatIntake -Context $context
      continue
    }

    if ($method -eq "POST" -and $path -eq "/api/v1/vision/analyze") {
      Handle-VisionAnalyze -Context $context
      continue
    }

    if ($method -eq "GET" -and $path -eq "/api/v1/ingredients/catalog") {
      Handle-IngredientCatalogSearch -Context $context
      continue
    }

    if ($method -eq "POST" -and $path -eq "/api/v1/ingredients/aliases/learn") {
      Handle-IngredientAliasLearn -Context $context
      continue
    }

    if ($method -eq "GET" -and $path -eq "/api/v1/ingredients/review-queue") {
      Handle-IngredientReviewQueueList -Context $context
      continue
    }

    if ($method -eq "POST" -and $path -match "^/api/v1/ingredients/review-queue/([^/]+)/resolve$") {
      $queueItemId = $Matches[1]
      Handle-IngredientReviewResolve -Context $context -QueueItemId $queueItemId
      continue
    }

    if ($method -eq "POST" -and $path -eq "/api/v1/capture/sessions/start") {
      Handle-CaptureSessionStart -Context $context
      continue
    }

    if ($method -eq "GET" -and $path -match "^/api/v1/capture/sessions/([^/]+)$") {
      $sessionId = $Matches[1]
      Handle-CaptureSessionGet -Context $context -SessionId $sessionId
      continue
    }

    if ($method -eq "POST" -and $path -match "^/api/v1/capture/sessions/([^/]+)/message$") {
      $sessionId = $Matches[1]
      Handle-CaptureSessionMessage -Context $context -SessionId $sessionId
      continue
    }

    if ($method -eq "POST" -and $path -match "^/api/v1/capture/sessions/([^/]+)/finalize$") {
      $sessionId = $Matches[1]
      Handle-CaptureSessionFinalize -Context $context -SessionId $sessionId
      continue
    }

    if ($method -eq "POST" -and $path -eq "/api/v1/ocr/parse-date") {
      Handle-OcrParseDate -Context $context
      continue
    }

    if ($method -eq "POST" -and $path -eq "/api/v1/inventory/items") {
      Handle-InventoryCreate -Context $context
      continue
    }

    if ($method -eq "GET" -and $path -eq "/api/v1/inventory/items") {
      Handle-InventoryList -Context $context
      continue
    }

    if ($method -eq "POST" -and $path -match "^/api/v1/inventory/items/([^/]+)/consume$") {
      $itemId = $Matches[1]
      Handle-InventoryConsume -Context $context -ItemId $itemId
      continue
    }

    if ($method -eq "GET" -and $path -eq "/api/v1/inventory/summary") {
      Handle-InventorySummary -Context $context
      continue
    }

    if ($method -eq "GET" -and $path -eq "/api/v1/notifications") {
      Handle-NotificationsList -Context $context
      continue
    }

    if ($method -eq "POST" -and $path -eq "/api/v1/notifications/run-due") {
      Handle-NotificationsRunDue -Context $context
      continue
    }

    if ($method -eq "GET" -and $path -eq "/api/v1/recommendations/recipes") {
      Handle-RecipeRecommendations -Context $context
      continue
    }

    if ($method -eq "GET" -and $path -eq "/api/v1/shopping/suggestions") {
      Handle-ShoppingSuggestions -Context $context
      continue
    }

    Write-JsonResponse -Response $context.Response -StatusCode 404 -Body @{
      error = "Not found."
      method = $method
      path = $path
    }
  }
}
finally {
  if ($listener.IsListening) {
    $listener.Stop()
  }
  $listener.Close()
}
