Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$modulePath = Join-Path $PSScriptRoot "..\src\chat\ChatIngestionEngine.psm1"
$overridePath = Join-Path $PSScriptRoot "..\src\data\ingredient_alias_overrides.json"

Import-Module $modulePath -Force -DisableNameChecking

function Assert-True {
  param(
    [Parameter(Mandatory = $true)][bool]$Condition,
    [Parameter(Mandatory = $true)][string]$Message
  )

  if (-not $Condition) {
    throw "Assertion failed: $Message"
  }
}

$backup = ""
if (Test-Path -LiteralPath $overridePath) {
  $backup = Get-Content -LiteralPath $overridePath -Raw
}

try {
  $alias = "zzregionaltestalias20260213"
  $key = "regional_test_key"

  $learn = Add-IngredientAliasOverride -IngredientKey $key -Alias $alias -DisplayName "Regional Test Key"
  Assert-True -Condition ($learn.ingredient_key -eq $key) -Message "Learned key should match"

  $parsed = Parse-ConversationCommands -Text $alias -VisionDetectedItems @()
  Assert-True -Condition (@($parsed.commands | Where-Object { $_.ingredient_key -eq $key }).Count -eq 1) -Message "Learned alias should be parsed"

  $catalogSearch = Search-IngredientCatalog -Query $alias -TopN 5
  Assert-True -Condition (@($catalogSearch | Where-Object { $_.ingredient_key -eq $key }).Count -ge 1) -Message "Search should include learned key"

  Write-Host "Ingredient learning tests passed."
}
finally {
  if ([string]::IsNullOrWhiteSpace($backup)) {
    if (Test-Path -LiteralPath $overridePath) {
      Remove-Item -LiteralPath $overridePath -Force
    }
  }
  else {
    Set-Content -LiteralPath $overridePath -Value $backup -Encoding utf8
  }

  Clear-IngredientLexiconCache
}
