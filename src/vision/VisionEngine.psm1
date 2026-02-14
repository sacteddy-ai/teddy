Set-StrictMode -Version Latest

function Get-PropertyValue {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Object,
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  if ($null -eq $Object) {
    return $null
  }

  $prop = $Object.PSObject.Properties[$Name]
  if ($null -eq $prop) {
    return $null
  }

  return $prop.Value
}

function Resolve-VisionImagePayload {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ImageBase64,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [string]$MimeType = $null
  )

  if ([string]::IsNullOrWhiteSpace($ImageBase64)) {
    throw "image_base64 is required."
  }

  $raw = $ImageBase64.Trim()
  $resolvedMimeType = $MimeType
  $resolvedBase64 = $raw

  if ($raw -match '^data:(?<mime>[\w\-\.\+\/]+);base64,(?<data>.+)$') {
    $resolvedMimeType = $Matches["mime"]
    $resolvedBase64 = $Matches["data"]
  }

  if ([string]::IsNullOrWhiteSpace($resolvedBase64)) {
    throw "image_base64 is empty."
  }

  try {
    [void][System.Convert]::FromBase64String($resolvedBase64)
  }
  catch {
    throw "image_base64 must be valid base64 (raw string or data URL)."
  }

  if ([string]::IsNullOrWhiteSpace($resolvedMimeType)) {
    $resolvedMimeType = "image/jpeg"
  }

  return [PSCustomObject]@{
    image_base64 = $resolvedBase64
    mime_type = $resolvedMimeType
  }
}

function Resolve-EnvironmentValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$VariableName,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [string]$ProcessValue = $null
  )

  if (-not [string]::IsNullOrWhiteSpace($ProcessValue)) {
    return $ProcessValue
  }

  $userValue = [Environment]::GetEnvironmentVariable($VariableName, "User")
  if (-not [string]::IsNullOrWhiteSpace($userValue)) {
    return $userValue
  }

  $machineValue = [Environment]::GetEnvironmentVariable($VariableName, "Machine")
  if (-not [string]::IsNullOrWhiteSpace($machineValue)) {
    return $machineValue
  }

  return $null
}

function Convert-WebExceptionToMessage {
  param(
    [Parameter(Mandatory = $true)]
    [System.Net.WebException]$Exception
  )

  $response = $Exception.Response
  $statusCode = $null
  if ($null -ne $response -and $response.PSObject.Properties["StatusCode"]) {
    try {
      $statusCode = [int]$response.StatusCode
    }
    catch {
      $statusCode = $null
    }
  }

  $body = $null
  if ($null -ne $response) {
    try {
      $stream = $response.GetResponseStream()
      if ($null -ne $stream) {
        $reader = [System.IO.StreamReader]::new($stream)
        try {
          $body = $reader.ReadToEnd()
        }
        finally {
          $reader.Dispose()
        }
      }
    }
    catch {
      $body = $null
    }
  }

  if ([string]::IsNullOrWhiteSpace($body)) {
    if ($statusCode -eq 429) {
      return "HTTP 429: insufficient_quota or rate limit. Check OpenAI project billing/quota."
    }
    if ($null -ne $statusCode) {
      return "HTTP ${statusCode}: $($Exception.Message)"
    }
    return $Exception.Message
  }

  $parsed = $null
  try {
    $parsed = $body | ConvertFrom-Json
  }
  catch {
    $parsed = $null
  }

  if ($null -ne $parsed -and $parsed.PSObject.Properties["error"]) {
    $errorField = $parsed.error
    if ($errorField -is [string]) {
      if ($null -ne $statusCode) {
        return "HTTP ${statusCode}: $errorField"
      }
      return $errorField
    }

    $errorMessage = Get-PropertyValue -Object $errorField -Name "message"
    $errorType = Get-PropertyValue -Object $errorField -Name "type"
    $errorCode = Get-PropertyValue -Object $errorField -Name "code"

    $prefixParts = @()
    if ($null -ne $statusCode) {
      $prefixParts += "HTTP $statusCode"
    }
    if (-not [string]::IsNullOrWhiteSpace($errorType)) {
      $prefixParts += "type=$errorType"
    }
    if (-not [string]::IsNullOrWhiteSpace($errorCode)) {
      $prefixParts += "code=$errorCode"
    }

    $prefix = if (@($prefixParts).Count -gt 0) { ("{0}: " -f ($prefixParts -join ", ")) } else { "" }
    if ([string]::IsNullOrWhiteSpace($errorMessage)) {
      return ($prefix + "Request failed.")
    }
    return ($prefix + $errorMessage)
  }

  $trimmed = $body.Trim()
  if ($trimmed.Length -gt 400) {
    $trimmed = $trimmed.Substring(0, 400) + "..."
  }

  if ($null -ne $statusCode) {
    return "HTTP ${statusCode}: $trimmed"
  }
  return $trimmed
}

function Invoke-JsonHttpPost {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Uri,
    [Parameter(Mandatory = $true)]
    [hashtable]$Headers,
    [Parameter(Mandatory = $true)]
    [object]$Body,
    [Parameter(Mandatory = $false)]
    [int]$TimeoutSec = 60,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [scriptblock]$HttpCommand = $null
  )

  $jsonBody = $Body | ConvertTo-Json -Depth 32
  if ($null -ne $HttpCommand) {
    return & $HttpCommand -Uri $Uri -Headers $Headers -Body $jsonBody -TimeoutSec $TimeoutSec
  }

  try {
    return Invoke-RestMethod `
      -Method Post `
      -Uri $Uri `
      -ContentType "application/json" `
      -Headers $Headers `
      -Body $jsonBody `
      -TimeoutSec $TimeoutSec
  }
  catch [System.Net.WebException] {
    throw (Convert-WebExceptionToMessage -Exception $_.Exception)
  }
}

function Invoke-Sam3SegmentationHttp {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ImageBase64,
    [Parameter(Mandatory = $true)]
    [string]$MimeType,
    [Parameter(Mandatory = $true)]
    [string]$SegmentApiUrl,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [string]$SegmentApiKey = $null,
    [Parameter(Mandatory = $false)]
    [int]$TimeoutSec = 60,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [scriptblock]$HttpCommand = $null
  )

  $headers = @{
    Accept = "application/json"
  }
  if (-not [string]::IsNullOrWhiteSpace($SegmentApiKey)) {
    $headers["Authorization"] = "Bearer $SegmentApiKey"
  }

  $payload = @{
    image_base64 = $ImageBase64
    mime_type = $MimeType
  }

  $response = Invoke-JsonHttpPost `
    -Uri $SegmentApiUrl `
    -Headers $headers `
    -Body $payload `
    -TimeoutSec $TimeoutSec `
    -HttpCommand $HttpCommand

  $segmentsInput = @()
  if ($response.PSObject.Properties["data"] -and $null -ne $response.data -and $response.data.PSObject.Properties["segments"]) {
    $segmentsInput = @($response.data.segments)
  }
  elseif ($response.PSObject.Properties["segments"]) {
    $segmentsInput = @($response.segments)
  }

  $segments = @()
  $index = 0
  foreach ($entry in @($segmentsInput)) {
    $index++
    if ($null -eq $entry) {
      continue
    }

    $segmentId = Get-PropertyValue -Object $entry -Name "id"
    if ([string]::IsNullOrWhiteSpace($segmentId)) {
      $segmentId = "seg-$index"
    }

    $segmentImageBase64 = Get-PropertyValue -Object $entry -Name "crop_image_base64"
    if ([string]::IsNullOrWhiteSpace($segmentImageBase64)) {
      $segmentImageBase64 = Get-PropertyValue -Object $entry -Name "image_base64"
    }
    if ([string]::IsNullOrWhiteSpace($segmentImageBase64)) {
      continue
    }

    $segmentMimeType = Get-PropertyValue -Object $entry -Name "mime_type"
    if ([string]::IsNullOrWhiteSpace($segmentMimeType)) {
      $segmentMimeType = $MimeType
    }

    $bbox = Get-PropertyValue -Object $entry -Name "bbox"
    $confidenceValue = Get-PropertyValue -Object $entry -Name "confidence"
    $confidence = $null
    if ($null -ne $confidenceValue) {
      $confidence = [double]$confidenceValue
    }

    $segments += [PSCustomObject]@{
      segment_id = $segmentId
      image_base64 = $segmentImageBase64
      mime_type = $segmentMimeType
      bbox = $bbox
      confidence = $confidence
    }
  }

  if (@($segments).Count -eq 0) {
    throw "SAM3 segmentation API returned no segments."
  }

  return [PSCustomObject]@{
    provider = "sam3_http"
    segments = @($segments)
  }
}

function Get-VisionSegments {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ImageBase64,
    [Parameter(Mandatory = $true)]
    [string]$MimeType,
    [Parameter(Mandatory = $false)]
    [string]$SegmentationMode = "auto",
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [string]$Sam3SegmentApiUrl = $null,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [string]$Sam3SegmentApiKey = $null,
    [Parameter(Mandatory = $false)]
    [int]$TimeoutSec = 60,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [scriptblock]$Sam3HttpCommand = $null
  )

  $mode = $SegmentationMode.Trim().ToLowerInvariant()
  if ($mode -notin @("auto", "none", "sam3_http")) {
    throw "segmentation_mode must be one of: auto, none, sam3_http."
  }

  $fallbackSegment = [PSCustomObject]@{
    segment_id = "seg-1"
    image_base64 = $ImageBase64
    mime_type = $MimeType
    bbox = $null
    confidence = $null
  }

  if ($mode -eq "none") {
    return [PSCustomObject]@{
      provider = "none"
      segments = @($fallbackSegment)
      warnings = @()
    }
  }

  if ($mode -eq "sam3_http" -and [string]::IsNullOrWhiteSpace($Sam3SegmentApiUrl)) {
    throw "sam3_segment_api_url is required when segmentation_mode is sam3_http."
  }

  $warnings = @()
  if ([string]::IsNullOrWhiteSpace($Sam3SegmentApiUrl)) {
    $warnings += "SAM3 segmentation endpoint is not configured. Used full image fallback."
    return [PSCustomObject]@{
      provider = "none"
      segments = @($fallbackSegment)
      warnings = @($warnings)
    }
  }

  try {
    $segmented = Invoke-Sam3SegmentationHttp `
      -ImageBase64 $ImageBase64 `
      -MimeType $MimeType `
      -SegmentApiUrl $Sam3SegmentApiUrl `
      -SegmentApiKey $Sam3SegmentApiKey `
      -TimeoutSec $TimeoutSec `
      -HttpCommand $Sam3HttpCommand

    return [PSCustomObject]@{
      provider = $segmented.provider
      segments = @($segmented.segments)
      warnings = @($warnings)
    }
  }
  catch {
    if ($mode -eq "sam3_http") {
      throw
    }

    $warnings += "SAM3 segmentation failed. Used full image fallback. Detail: $($_.Exception.Message)"
    return [PSCustomObject]@{
      provider = "none"
      segments = @($fallbackSegment)
      warnings = @($warnings)
    }
  }
}

function Parse-OpenAiJsonContent {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Response
  )

  $rawText = $null
  if ($Response.PSObject.Properties["choices"] -and @($Response.choices).Count -gt 0) {
    $choice = $Response.choices[0]
    if ($choice.PSObject.Properties["message"] -and $choice.message.PSObject.Properties["content"]) {
      $content = $choice.message.content
      if ($content -is [string]) {
        $rawText = $content
      }
      elseif ($content -is [System.Collections.IEnumerable]) {
        $parts = @()
        foreach ($part in $content) {
          if ($null -eq $part) {
            continue
          }
          $textPart = Get-PropertyValue -Object $part -Name "text"
          if (-not [string]::IsNullOrWhiteSpace($textPart)) {
            $parts += $textPart
          }
        }
        if (@($parts).Count -gt 0) {
          $rawText = ($parts -join "`n")
        }
      }
    }
  }

  if ([string]::IsNullOrWhiteSpace($rawText)) {
    $fallback = Get-PropertyValue -Object $Response -Name "output_text"
    if (-not [string]::IsNullOrWhiteSpace($fallback)) {
      $rawText = $fallback
    }
  }

  if ([string]::IsNullOrWhiteSpace($rawText)) {
    throw "OpenAI vision response did not include message content."
  }

  $jsonText = $rawText.Trim()
  if ($jsonText -match '^```(?:json)?\s*(?<body>[\s\S]+?)\s*```$') {
    $jsonText = $Matches["body"].Trim()
  }

  try {
    $parsed = $jsonText | ConvertFrom-Json
  }
  catch {
    throw "OpenAI vision response was not valid JSON."
  }

  return [PSCustomObject]@{
    parsed = $parsed
    raw_text = $jsonText
  }
}

function Normalize-IngredientName {
  param(
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [object]$Name
  )

  if ($null -eq $Name) {
    return $null
  }

  $value = $Name.ToString().Trim()
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $null
  }

  $value = [regex]::Replace($value, "^[\s,.;:]+|[\s,.;:]+$", "")
  $value = [regex]::Replace($value, "\s+", " ")
  if ([string]::IsNullOrWhiteSpace($value)) {
    return $null
  }

  $normalized = $value.ToLowerInvariant()
  if ($normalized -in @("none", "unknown", "n/a", "na", "not sure", "uncertain")) {
    return $null
  }

  return $value
}

function Invoke-OpenAiSegmentLabeling {
  param(
    [Parameter(Mandatory = $true)]
    [object[]]$Segments,
    [Parameter(Mandatory = $true)]
    [string]$OpenAiApiKey,
    [Parameter(Mandatory = $false)]
    [string]$OpenAiBaseUrl = "https://api.openai.com/v1",
    [Parameter(Mandatory = $false)]
    [string]$OpenAiModel = "gpt-4.1-mini",
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [string]$TextHint = $null,
    [Parameter(Mandatory = $false)]
    [string]$LanguageHint = "ko",
    [Parameter(Mandatory = $false)]
    [int]$TimeoutSec = 90,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [scriptblock]$HttpCommand = $null
  )

  $segmentItems = @($Segments)
  if ($segmentItems.Count -eq 0) {
    return [PSCustomObject]@{
      detected_items = @()
      segment_labels = @()
      model = $OpenAiModel
      provider = "openai"
    }
  }

  $content = @(
    @{
      type = "text"
      text = "Identify fridge ingredients in each segment image. Return one ingredient_name per segment. Use concise ingredient nouns."
    },
    @{
      type = "text"
      text = "Language hint: $LanguageHint. Prefer local ingredient names used in grocery shopping."
    }
  )

  if (-not [string]::IsNullOrWhiteSpace($TextHint)) {
    $content += @{
      type = "text"
      text = "User hint/context: $TextHint"
    }
  }

  foreach ($segment in $segmentItems) {
    $segmentId = if ($segment.PSObject.Properties["segment_id"]) { $segment.segment_id } else { "seg" }
    $segmentMimeType = if ($segment.PSObject.Properties["mime_type"] -and -not [string]::IsNullOrWhiteSpace($segment.mime_type)) { $segment.mime_type } else { "image/jpeg" }
    $segmentImageBase64 = if ($segment.PSObject.Properties["image_base64"]) { $segment.image_base64 } else { $null }
    if ([string]::IsNullOrWhiteSpace($segmentImageBase64)) {
      continue
    }

    $content += @{
      type = "text"
      text = "segment_id: $segmentId"
    }
    $content += @{
      type = "image_url"
      image_url = @{
        url = "data:$segmentMimeType;base64,$segmentImageBase64"
        detail = "low"
      }
    }
  }

  $schema = @{
    type = "object"
    additionalProperties = $false
    required = @("segments", "summary_ingredients")
    properties = @{
      segments = @{
        type = "array"
        items = @{
          type = "object"
          additionalProperties = $false
          required = @("segment_id", "ingredient_name", "confidence")
          properties = @{
            segment_id = @{ type = "string" }
            ingredient_name = @{ type = "string" }
            confidence = @{
              type = "number"
              minimum = 0
              maximum = 1
            }
          }
        }
      }
      summary_ingredients = @{
        type = "array"
        items = @{ type = "string" }
      }
    }
  }

  $body = @{
    model = $OpenAiModel
    temperature = 0
    messages = @(
      @{
        role = "system"
        content = "You are a refrigerator ingredient recognition assistant."
      },
      @{
        role = "user"
        content = $content
      }
    )
    response_format = @{
      type = "json_schema"
      json_schema = @{
        name = "fridge_segment_labels"
        strict = $true
        schema = $schema
      }
    }
  }

  $headers = @{
    Authorization = "Bearer $OpenAiApiKey"
    Accept = "application/json"
  }
  $uri = "{0}/chat/completions" -f $OpenAiBaseUrl.TrimEnd("/")
  $response = Invoke-JsonHttpPost -Uri $uri -Headers $headers -Body $body -TimeoutSec $TimeoutSec -HttpCommand $HttpCommand
  $parsedResult = Parse-OpenAiJsonContent -Response $response
  $parsed = $parsedResult.parsed

  $segmentLabels = @()
  foreach ($entry in @($parsed.segments)) {
    if ($null -eq $entry) {
      continue
    }

    $segmentId = Get-PropertyValue -Object $entry -Name "segment_id"
    if ([string]::IsNullOrWhiteSpace($segmentId)) {
      continue
    }

    $ingredientName = Normalize-IngredientName -Name (Get-PropertyValue -Object $entry -Name "ingredient_name")
    if ([string]::IsNullOrWhiteSpace($ingredientName)) {
      continue
    }

    $confidenceValue = Get-PropertyValue -Object $entry -Name "confidence"
    $confidence = 0.0
    if ($null -ne $confidenceValue) {
      $confidence = [double]$confidenceValue
    }

    $segmentLabels += [PSCustomObject]@{
      segment_id = $segmentId
      ingredient_name = $ingredientName
      confidence = [math]::Round($confidence, 4)
    }
  }

  $ingredientMap = @{}
  foreach ($nameInput in @($parsed.summary_ingredients)) {
    $name = Normalize-IngredientName -Name $nameInput
    if ([string]::IsNullOrWhiteSpace($name)) {
      continue
    }

    $key = $name.ToLowerInvariant()
    if (-not $ingredientMap.ContainsKey($key)) {
      $ingredientMap[$key] = $name
    }
  }

  foreach ($label in @($segmentLabels)) {
    $name = Normalize-IngredientName -Name $label.ingredient_name
    if ([string]::IsNullOrWhiteSpace($name)) {
      continue
    }
    $key = $name.ToLowerInvariant()
    if (-not $ingredientMap.ContainsKey($key)) {
      $ingredientMap[$key] = $name
    }
  }

  return [PSCustomObject]@{
    detected_items = @($ingredientMap.Values | Sort-Object)
    segment_labels = @($segmentLabels | Sort-Object -Property segment_id)
    model = $OpenAiModel
    provider = "openai"
  }
}

function Invoke-VisionIngredientDetection {
  param(
    [Parameter(Mandatory = $true)]
    [string]$ImageBase64,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [string]$MimeType = $null,
    [Parameter(Mandatory = $false)]
    [string]$SegmentationMode = "auto",
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [string]$TextHint = $null,
    [Parameter(Mandatory = $false)]
    [string]$LanguageHint = "ko",
    [Parameter(Mandatory = $false)]
    [int]$MaxSegments = 12,
    [Parameter(Mandatory = $false)]
    [string]$OpenAiApiKey = $env:OPENAI_API_KEY,
    [Parameter(Mandatory = $false)]
    [string]$OpenAiBaseUrl = $(if ([string]::IsNullOrWhiteSpace($env:OPENAI_BASE_URL)) { "https://api.openai.com/v1" } else { $env:OPENAI_BASE_URL }),
    [Parameter(Mandatory = $false)]
    [string]$OpenAiModel = $(if ([string]::IsNullOrWhiteSpace($env:OPENAI_VISION_MODEL)) { "gpt-4.1-mini" } else { $env:OPENAI_VISION_MODEL }),
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [string]$Sam3SegmentApiUrl = $env:SAM3_SEGMENT_API_URL,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [string]$Sam3SegmentApiKey = $env:SAM3_SEGMENT_API_KEY,
    [Parameter(Mandatory = $false)]
    [int]$Sam3TimeoutSec = 60,
    [Parameter(Mandatory = $false)]
    [int]$OpenAiTimeoutSec = 90,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [scriptblock]$OpenAiHttpCommand = $null,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [scriptblock]$Sam3HttpCommand = $null
  )

  $resolvedOpenAiApiKey = Resolve-EnvironmentValue -VariableName "OPENAI_API_KEY" -ProcessValue $OpenAiApiKey
  if ([string]::IsNullOrWhiteSpace($resolvedOpenAiApiKey)) {
    throw "OPENAI_API_KEY is required for vision detection."
  }

  $resolvedOpenAiBaseUrl = Resolve-EnvironmentValue -VariableName "OPENAI_BASE_URL" -ProcessValue $OpenAiBaseUrl
  if ([string]::IsNullOrWhiteSpace($resolvedOpenAiBaseUrl)) {
    $resolvedOpenAiBaseUrl = "https://api.openai.com/v1"
  }

  $resolvedOpenAiModel = Resolve-EnvironmentValue -VariableName "OPENAI_VISION_MODEL" -ProcessValue $OpenAiModel
  if ([string]::IsNullOrWhiteSpace($resolvedOpenAiModel)) {
    $resolvedOpenAiModel = "gpt-4.1-mini"
  }

  $resolvedSam3SegmentApiUrl = Resolve-EnvironmentValue -VariableName "SAM3_SEGMENT_API_URL" -ProcessValue $Sam3SegmentApiUrl
  $resolvedSam3SegmentApiKey = Resolve-EnvironmentValue -VariableName "SAM3_SEGMENT_API_KEY" -ProcessValue $Sam3SegmentApiKey

  $resolvedImage = Resolve-VisionImagePayload -ImageBase64 $ImageBase64 -MimeType $MimeType

  $segmentsResult = Get-VisionSegments `
    -ImageBase64 $resolvedImage.image_base64 `
    -MimeType $resolvedImage.mime_type `
    -SegmentationMode $SegmentationMode `
    -Sam3SegmentApiUrl $resolvedSam3SegmentApiUrl `
    -Sam3SegmentApiKey $resolvedSam3SegmentApiKey `
    -TimeoutSec $Sam3TimeoutSec `
    -Sam3HttpCommand $Sam3HttpCommand

  $allSegments = @($segmentsResult.segments)
  $segments = @($allSegments)
  $truncated = $false
  if ($MaxSegments -gt 0 -and @($segments).Count -gt $MaxSegments) {
    $segments = @($segments | Select-Object -First $MaxSegments)
    $truncated = $true
  }

  $labeling = Invoke-OpenAiSegmentLabeling `
    -Segments $segments `
    -OpenAiApiKey $resolvedOpenAiApiKey `
    -OpenAiBaseUrl $resolvedOpenAiBaseUrl `
    -OpenAiModel $resolvedOpenAiModel `
    -TextHint $TextHint `
    -LanguageHint $LanguageHint `
    -TimeoutSec $OpenAiTimeoutSec `
    -HttpCommand $OpenAiHttpCommand

  return [PSCustomObject]@{
    detected_items = @($labeling.detected_items)
    detected_count = @($labeling.detected_items).Count
    segment_labels = @($labeling.segment_labels)
    segmentation = [PSCustomObject]@{
      mode = $SegmentationMode
      provider = $segmentsResult.provider
      segment_count = @($segments).Count
      original_segment_count = @($allSegments).Count
      truncated = $truncated
      warnings = @($segmentsResult.warnings)
    }
    model = [PSCustomObject]@{
      provider = $labeling.provider
      name = $labeling.model
      endpoint = "{0}/chat/completions" -f $resolvedOpenAiBaseUrl.TrimEnd("/")
    }
  }
}

Export-ModuleMember -Function `
  Resolve-VisionImagePayload, `
  Invoke-VisionIngredientDetection
