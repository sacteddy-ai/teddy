Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Assert-True {
  param(
    [Parameter(Mandatory = $true)]
    [bool]$Condition,
    [Parameter(Mandatory = $true)]
    [string]$Message
  )

  if (-not $Condition) {
    throw "Assertion failed: $Message"
  }
}

$repoRoot = Join-Path $PSScriptRoot ".."
$syncScriptPath = Join-Path $repoRoot "scripts\sync-ingredient-aliases.ps1"

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("alias-sync-test-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

try {
  $aliasPath = Join-Path $tempRoot "ingredient_aliases.json"
  $mapPath = Join-Path $tempRoot "ingredient_alias_sync_map.json"
  $taxonomyPath = Join-Path $tempRoot "off-taxonomy.json"

  @'
{
  "version": "seed",
  "source": "test",
  "items": [
    {
      "ingredient_key": "sweet_potato",
      "display_name": "Sweet Potato",
      "aliases": ["sweet potato"]
    }
  ]
}
'@ | Set-Content -Path $aliasPath -Encoding UTF8

  @'
{
  "version": "seed",
  "providers": [
    {
      "provider": "openfoodfacts",
      "items": [
        {
          "ingredient_key": "sweet_potato",
          "display_name": "Sweet Potato",
          "openfoodfacts_tags": ["en:sweet-potato"]
        }
      ]
    }
  ]
}
'@ | Set-Content -Path $mapPath -Encoding UTF8

  @'
{
  "en:sweet-potato": {
    "name": {
      "en": "Sweet potato",
      "ko": "\uACE0\uAD6C\uB9C8",
      "es": "Batata"
    }
  }
}
'@ | Set-Content -Path $taxonomyPath -Encoding UTF8

  powershell -ExecutionPolicy Bypass -File $syncScriptPath `
    -AliasPath $aliasPath `
    -SyncMapPath $mapPath `
    -SkipDownload `
    -OpenFoodFactsCachePath $taxonomyPath | Out-Null

  $result = Get-Content -Path $aliasPath -Raw | ConvertFrom-Json
  $item = @($result.items | Where-Object { $_.ingredient_key -eq "sweet_potato" } | Select-Object -First 1)
  Assert-True -Condition (@($item).Count -eq 1) -Message "Synced document should keep sweet_potato item"

  $aliases = @($item[0].aliases)
  $koreanSweetPotato = ([char]0xACE0).ToString() + ([char]0xAD6C).ToString() + ([char]0xB9C8).ToString()
  Assert-True -Condition ($aliases -contains $koreanSweetPotato) -Message "Sync should import Korean alias from taxonomy"
  Assert-True -Condition ($aliases -contains "Batata") -Message "Sync should import Spanish alias from taxonomy"
  Assert-True -Condition ($aliases -contains "sweet potato") -Message "Existing alias should be preserved"

  Write-Host "Alias sync test passed."
}
finally {
  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force
  }
}
