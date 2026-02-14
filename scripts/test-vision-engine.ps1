Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$modulePath = Join-Path $PSScriptRoot "..\src\vision\VisionEngine.psm1"
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
  $sampleBase64 = [System.Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes("fake-image"))

  $resolved = Resolve-VisionImagePayload -ImageBase64 ("data:image/png;base64,{0}" -f $sampleBase64)
  Assert-Equal -Actual $resolved.mime_type -Expected "image/png" -Message "Data URL mime type should be parsed"
  Assert-Equal -Actual $resolved.image_base64 -Expected $sampleBase64 -Message "Data URL base64 payload should be extracted"

  $openAiMockSingle = {
    param(
      [string]$Uri,
      [hashtable]$Headers,
      [string]$Body,
      [int]$TimeoutSec
    )

    return [PSCustomObject]@{
      choices = @(
        [PSCustomObject]@{
          message = [PSCustomObject]@{
            content = '{"segments":[{"segment_id":"seg-1","ingredient_name":"kimchi","confidence":0.93}],"summary_ingredients":["kimchi","tofu","kimchi"]}'
          }
        }
      )
    }
  }

  $noneModeResult = Invoke-VisionIngredientDetection `
    -ImageBase64 $sampleBase64 `
    -MimeType "image/jpeg" `
    -SegmentationMode "none" `
    -OpenAiApiKey "test-key" `
    -OpenAiHttpCommand $openAiMockSingle

  Assert-Equal -Actual $noneModeResult.detected_count -Expected 2 -Message "Summary ingredients should be deduplicated"
  Assert-Equal -Actual @($noneModeResult.segment_labels).Count -Expected 1 -Message "One segment label expected"
  Assert-Equal -Actual $noneModeResult.segmentation.provider -Expected "none" -Message "none mode should skip SAM3"
  Assert-Equal -Actual @($noneModeResult.segmentation.warnings).Count -Expected 0 -Message "none mode should not emit warnings"

  $sam3Mock = {
    param(
      [string]$Uri,
      [hashtable]$Headers,
      [string]$Body,
      [int]$TimeoutSec
    )

    return [PSCustomObject]@{
      data = [PSCustomObject]@{
        segments = @(
          [PSCustomObject]@{
            id = "seg-a"
            crop_image_base64 = $sampleBase64
            mime_type = "image/jpeg"
            bbox = @(0, 0, 100, 100)
            confidence = 0.9
          },
          [PSCustomObject]@{
            id = "seg-b"
            crop_image_base64 = $sampleBase64
            mime_type = "image/jpeg"
            bbox = @(120, 80, 220, 180)
            confidence = 0.86
          }
        )
      }
    }
  }

  $openAiMockSegmented = {
    param(
      [string]$Uri,
      [hashtable]$Headers,
      [string]$Body,
      [int]$TimeoutSec
    )

    return [PSCustomObject]@{
      choices = @(
        [PSCustomObject]@{
          message = [PSCustomObject]@{
            content = '{"segments":[{"segment_id":"seg-a","ingredient_name":"bacon","confidence":0.88},{"segment_id":"seg-b","ingredient_name":"truffle mushroom","confidence":0.91}],"summary_ingredients":["bacon","truffle mushroom"]}'
          }
        }
      )
    }
  }

  $samModeResult = Invoke-VisionIngredientDetection `
    -ImageBase64 $sampleBase64 `
    -MimeType "image/jpeg" `
    -SegmentationMode "sam3_http" `
    -Sam3SegmentApiUrl "https://sam3.example.local/segment" `
    -OpenAiApiKey "test-key" `
    -Sam3HttpCommand $sam3Mock `
    -OpenAiHttpCommand $openAiMockSegmented

  Assert-Equal -Actual $samModeResult.segmentation.provider -Expected "sam3_http" -Message "sam3_http mode should use SAM3 provider"
  Assert-Equal -Actual $samModeResult.segmentation.segment_count -Expected 2 -Message "SAM3 mock should return two segments"
  Assert-Equal -Actual $samModeResult.detected_count -Expected 2 -Message "Two ingredients expected from segmented labeling"
  Assert-Equal -Actual @($samModeResult.detected_items | Where-Object { $_ -eq "truffle mushroom" }).Count -Expected 1 -Message "Detected items should include truffle mushroom"

  Assert-Throws -Action {
    Invoke-VisionIngredientDetection `
      -ImageBase64 $sampleBase64 `
      -SegmentationMode "sam3_http" `
      -OpenAiApiKey "test-key" `
      -OpenAiHttpCommand $openAiMockSingle
  } -ExpectedMessage "sam3_segment_api_url is required when segmentation_mode is sam3_http."

  Write-Host "Vision engine tests passed."
}

Run-Tests
