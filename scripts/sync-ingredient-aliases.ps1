param(
  [Parameter(Mandatory = $false)]
  [string]$AliasPath = "",
  [Parameter(Mandatory = $false)]
  [string]$SyncMapPath = "",
  [Parameter(Mandatory = $false)]
  [string]$Provider = "openfoodfacts",
  [Parameter(Mandatory = $false)]
  [string]$OpenFoodFactsTaxonomyUrl = "https://static.openfoodfacts.org/data/taxonomies/ingredients.json",
  [Parameter(Mandatory = $false)]
  [AllowNull()]
  [string]$OpenFoodFactsCachePath = "",
  [Parameter(Mandatory = $false)]
  [switch]$SkipDownload = $false,
  [Parameter(Mandatory = $false)]
  [switch]$DryRun = $false
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptRootResolved = if (-not [string]::IsNullOrWhiteSpace($PSScriptRoot)) { $PSScriptRoot } else { Split-Path -Parent $PSCommandPath }
if ([string]::IsNullOrWhiteSpace($AliasPath)) {
  $AliasPath = Join-Path $scriptRootResolved "..\src\data\ingredient_aliases.json"
}
if ([string]::IsNullOrWhiteSpace($SyncMapPath)) {
  $SyncMapPath = Join-Path $scriptRootResolved "..\src\data\ingredient_alias_sync_map.json"
}
if ([string]::IsNullOrWhiteSpace($OpenFoodFactsCachePath)) {
  $OpenFoodFactsCachePath = Join-Path $scriptRootResolved "..\storage\openfoodfacts-ingredients-taxonomy.json"
}

function Normalize-Alias {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  $trimmed = [regex]::Replace($Value.Trim(), "\s+", " ")
  return $trimmed.ToLowerInvariant()
}

function Read-JsonFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "File not found: $Path"
  }

  $raw = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
  if ([string]::IsNullOrWhiteSpace($raw)) {
    throw "File is empty: $Path"
  }

  return ($raw | ConvertFrom-Json)
}

function Ensure-DirectoryForFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path
  )

  $dir = Split-Path -Parent $Path
  if (-not [string]::IsNullOrWhiteSpace($dir) -and -not (Test-Path -LiteralPath $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
  }
}

function Save-Utf8Json {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [object]$Data
  )

  $json = $Data | ConvertTo-Json -Depth 16
  [System.IO.File]::WriteAllText($Path, $json + [Environment]::NewLine, [System.Text.Encoding]::UTF8)
}

function Get-OpenFoodFactsTaxonomy {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Url,
    [Parameter(Mandatory = $true)]
    [string]$CachePath,
    [Parameter(Mandatory = $true)]
    [bool]$SkipDownloadFlag
  )

  Ensure-DirectoryForFile -Path $CachePath

  if (-not $SkipDownloadFlag) {
    Write-Host "Downloading Open Food Facts taxonomy from $Url"
    Invoke-WebRequest -Uri $Url -OutFile $CachePath -UseBasicParsing
  }
  elseif (-not (Test-Path -LiteralPath $CachePath)) {
    throw "SkipDownload was set, but cache file is missing: $CachePath"
  }

  $raw = [System.IO.File]::ReadAllText($CachePath, [System.Text.Encoding]::UTF8)
  if ([string]::IsNullOrWhiteSpace($raw)) {
    throw "Downloaded taxonomy is empty: $CachePath"
  }

  return ($raw | ConvertFrom-Json)
}

function Get-StringValuesFromPropertyBag {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Bag
  )

  $values = @()
  if ($null -eq $Bag) {
    return @()
  }

  foreach ($p in $Bag.PSObject.Properties) {
    if ($null -eq $p.Value) {
      continue
    }
    $s = $p.Value.ToString().Trim()
    if (-not [string]::IsNullOrWhiteSpace($s)) {
      $values += $s
    }
  }

  return @($values)
}

function Merge-AliasSets {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyCollection()]
    [object[]]$Left,
    [Parameter(Mandatory = $true)]
    [AllowEmptyCollection()]
    [object[]]$Right
  )

  $seen = @{}
  $merged = @()

  foreach ($raw in @($Left) + @($Right)) {
    if ($null -eq $raw) {
      continue
    }

    $alias = $raw.ToString().Trim()
    if ([string]::IsNullOrWhiteSpace($alias)) {
      continue
    }

    $normalized = Normalize-Alias -Value $alias
    if ($seen.ContainsKey($normalized)) {
      continue
    }

    $seen[$normalized] = $true
    $merged += $alias
  }

  return @($merged | Sort-Object)
}

function Build-ProviderMap {
  param(
    [Parameter(Mandatory = $true)]
    [object]$SyncMapDoc,
    [Parameter(Mandatory = $true)]
    [string]$SelectedProvider,
    [Parameter(Mandatory = $true)]
    [string]$SyncMapFilePath
  )

  $providerNode = @($SyncMapDoc.providers | Where-Object { $_.provider -eq $SelectedProvider } | Select-Object -First 1)
  if (@($providerNode).Count -eq 0) {
    throw "Provider '$SelectedProvider' not found in $SyncMapFilePath"
  }

  $itemMap = @{}
  foreach ($item in @($providerNode[0].items)) {
    if ($null -eq $item) {
      continue
    }

    $key = if ($item.PSObject.Properties["ingredient_key"]) { $item.ingredient_key } else { $null }
    if ($null -eq $key -or [string]::IsNullOrWhiteSpace($key.ToString())) {
      continue
    }

    $normalizedKey = Normalize-Alias -Value $key.ToString()
    $displayName = if ($item.PSObject.Properties["display_name"] -and -not [string]::IsNullOrWhiteSpace($item.display_name)) {
      $item.display_name.ToString()
    }
    else {
      $normalizedKey
    }

    $tags = @()
    if ($item.PSObject.Properties["openfoodfacts_tags"]) {
      $tags = @($item.openfoodfacts_tags)
    }

    $itemMap[$normalizedKey] = [PSCustomObject]@{
      ingredient_key = $normalizedKey
      display_name = $displayName
      openfoodfacts_tags = @($tags)
    }
  }

  return $itemMap
}

function Get-AliasesFromOpenFoodFactsTag {
  param(
    [Parameter(Mandatory = $true)]
    [object]$Taxonomy,
    [Parameter(Mandatory = $true)]
    [string]$Tag
  )

  $nodeProp = $Taxonomy.PSObject.Properties[$Tag]
  if ($null -eq $nodeProp) {
    return @()
  }

  $node = $nodeProp.Value
  $aliases = @()

  if ($node.PSObject.Properties["name"]) {
    $aliases += Get-StringValuesFromPropertyBag -Bag $node.name
  }

  # Add tag-based fallback aliases.
  if ($Tag -match "^[a-z]{2}:(.+)$") {
    $slug = $Matches[1]
    $aliases += @($slug.Replace("-", " "), $slug)
  }

  return @($aliases)
}

function Sync-IngredientAliasesFromOpenFoodFacts {
  param(
    [Parameter(Mandatory = $true)]
    [object]$AliasDoc,
    [Parameter(Mandatory = $true)]
    [hashtable]$ProviderMap,
    [Parameter(Mandatory = $true)]
    [object]$Taxonomy
  )

  $existingItems = @()
  if ($AliasDoc.PSObject.Properties["items"]) {
    $existingItems = @($AliasDoc.items)
  }

  $byKey = @{}
  foreach ($item in @($existingItems)) {
    if ($null -eq $item) {
      continue
    }
    $key = if ($item.PSObject.Properties["ingredient_key"]) { $item.ingredient_key } else { $null }
    if ($null -eq $key -or [string]::IsNullOrWhiteSpace($key.ToString())) {
      continue
    }
    $normalizedKey = Normalize-Alias -Value $key.ToString()
    $byKey[$normalizedKey] = [PSCustomObject]@{
      ingredient_key = $normalizedKey
      display_name = if ($item.PSObject.Properties["display_name"]) { $item.display_name } else { $normalizedKey }
      aliases = if ($item.PSObject.Properties["aliases"]) { @($item.aliases) } else { @() }
    }
  }

  $updatedCount = 0
  foreach ($kv in $ProviderMap.GetEnumerator()) {
    $key = $kv.Key
    $mapItem = $kv.Value

    $externalAliases = @()
    foreach ($tag in @($mapItem.openfoodfacts_tags)) {
      if ($null -eq $tag -or [string]::IsNullOrWhiteSpace($tag.ToString())) {
        continue
      }
      $externalAliases += Get-AliasesFromOpenFoodFactsTag -Taxonomy $Taxonomy -Tag $tag.ToString()
    }

    $baseDisplayName = $mapItem.display_name
    $baseAliases = @($key, $baseDisplayName)
    if ($byKey.ContainsKey($key)) {
      $existing = $byKey[$key]
      $aliases = Merge-AliasSets -Left @($existing.aliases) -Right @($baseAliases + $externalAliases)
      $displayName = if (-not [string]::IsNullOrWhiteSpace($existing.display_name)) { $existing.display_name } else { $baseDisplayName }
      $byKey[$key] = [PSCustomObject]@{
        ingredient_key = $key
        display_name = $displayName
        aliases = $aliases
      }
    }
    else {
      $aliases = Merge-AliasSets -Left @() -Right @($baseAliases + $externalAliases)
      $byKey[$key] = [PSCustomObject]@{
        ingredient_key = $key
        display_name = $baseDisplayName
        aliases = $aliases
      }
    }

    $updatedCount++
  }

  # Keep existing items that are not part of this sync map.
  $sortedItems = @($byKey.Values | Sort-Object -Property ingredient_key)
  $result = [PSCustomObject]@{
    version = (Get-Date).ToString("yyyy-MM-dd")
    source = "internal.seed.v1+openfoodfacts"
    items = $sortedItems
  }

  return [PSCustomObject]@{
    alias_doc = $result
    synced_item_count = $updatedCount
    total_item_count = @($sortedItems).Count
  }
}

$aliasDoc = Read-JsonFile -Path $AliasPath
$syncMapDoc = Read-JsonFile -Path $SyncMapPath

if ($Provider -ne "openfoodfacts") {
  throw "Unsupported provider: $Provider"
}

$providerMap = Build-ProviderMap -SyncMapDoc $syncMapDoc -SelectedProvider $Provider -SyncMapFilePath $SyncMapPath
$taxonomy = Get-OpenFoodFactsTaxonomy `
  -Url $OpenFoodFactsTaxonomyUrl `
  -CachePath $OpenFoodFactsCachePath `
  -SkipDownloadFlag ([bool]$SkipDownload)

$syncResult = Sync-IngredientAliasesFromOpenFoodFacts `
  -AliasDoc $aliasDoc `
  -ProviderMap $providerMap `
  -Taxonomy $taxonomy

if ($DryRun) {
  Write-Host ("Dry run complete. synced_item_count={0}, total_item_count={1}" -f $syncResult.synced_item_count, $syncResult.total_item_count)
  return
}

Save-Utf8Json -Path $AliasPath -Data $syncResult.alias_doc
Write-Host ("Alias sync complete. synced_item_count={0}, total_item_count={1}" -f $syncResult.synced_item_count, $syncResult.total_item_count)
