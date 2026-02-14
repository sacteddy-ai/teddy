Set-StrictMode -Version Latest

$expirationModulePath = Join-Path (Split-Path -Parent $PSCommandPath) "..\expiration\ExpirationEngine.psm1"
$ingredientAliasDataPath = Join-Path (Split-Path -Parent $PSCommandPath) "..\data\ingredient_aliases.json"
$ingredientAliasOverrideDataPath = Join-Path (Split-Path -Parent $PSCommandPath) "..\data\ingredient_alias_overrides.json"
Import-Module $expirationModulePath -Force -DisableNameChecking

$script:IngredientLexiconCache = $null
$script:IngredientAliasCatalogCache = $null

function Normalize-Word {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  return $Value.Trim().ToLowerInvariant()
}

function Normalize-Whitespace {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  $normalized = [regex]::Replace($Value, "\s+", " ")
  return $normalized.Trim()
}

function Convert-UnicodeEscapeLiterals {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $Value
  }

  return [regex]::Replace(
    $Value,
    "\\u([0-9A-Fa-f]{4})",
    {
      param($match)
      [char]([Convert]::ToInt32($match.Groups[1].Value, 16))
    }
  )
}

function Get-HangulJongseongIndex {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Char
  )

  if ([string]::IsNullOrEmpty($Char)) {
    return $null
  }

  $code = [int][char]$Char
  if ($code -lt 0xAC00 -or $code -gt 0xD7A3) {
    return $null
  }

  return (($code - 0xAC00) % 28)
}

function Test-BatchimRule {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Base,
    [Parameter(Mandatory = $true)]
    [bool]$RequiresBatchim
  )

  if ([string]::IsNullOrEmpty($Base)) {
    return $false
  }

  $lastChar = $Base.Substring($Base.Length - 1, 1)
  $jong = Get-HangulJongseongIndex -Char $lastChar
  if ($null -eq $jong) {
    # Non-Hangul tokens like "tofu-neun" can still carry particles; allow stripping.
    return $true
  }

  if ($RequiresBatchim) {
    return ($jong -ne 0)
  }

  return ($jong -eq 0)
}

function Normalize-IngredientKey {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  $normalized = Normalize-Word -Value $Value
  $normalized = $normalized -replace "[\s\-]+", "_"
  $normalized = $normalized -replace "[^\p{L}\p{N}_]+", "_"
  $normalized = $normalized -replace "_+", "_"
  $normalized = $normalized.Trim("_")
  return $normalized
}

function Remove-KoreanParticleSuffix {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $Value
  }

  # Be conservative: single-syllable particles like "do", "go", "man" can be part of real nouns.
  # Keep them intact here to avoid truncating ingredient names.
  $rules = @(
    @{ suffix = "\uC774\uC5D0\uC694"; kind = "batchim"; requires_batchim = $true },  # ieyo
    @{ suffix = "\uC608\uC694"; kind = "batchim"; requires_batchim = $false },     # yeyo
    @{ suffix = "\uC774\uC57C"; kind = "batchim"; requires_batchim = $true },      # iya
    @{ suffix = "\uC57C"; kind = "batchim"; requires_batchim = $false },           # ya

    @{ suffix = "\uC740"; kind = "batchim"; requires_batchim = $true },            # eun
    @{ suffix = "\uB294"; kind = "batchim"; requires_batchim = $false },           # neun
    @{ suffix = "\uC774"; kind = "batchim"; requires_batchim = $true },            # i
    @{ suffix = "\uAC00"; kind = "batchim"; requires_batchim = $false },           # ga
    @{ suffix = "\uC744"; kind = "batchim"; requires_batchim = $true },            # eul
    @{ suffix = "\uB97C"; kind = "batchim"; requires_batchim = $false },           # reul
    @{ suffix = "\uACFC"; kind = "batchim"; requires_batchim = $true },            # gwa
    @{ suffix = "\uC640"; kind = "batchim"; requires_batchim = $false },           # wa

    @{ suffix = "\uC774\uACE0"; kind = "simple"; requires_batchim = $false },      # igo
    @{ suffix = "\uD558\uACE0"; kind = "simple"; requires_batchim = $false },      # hago
    @{ suffix = "\uAE4C\uC9C0"; kind = "simple"; requires_batchim = $false },      # kkaji
    @{ suffix = "\uC5D0\uC11C"; kind = "simple"; requires_batchim = $false },      # eseo
    @{ suffix = "\uBD80\uD130"; kind = "simple"; requires_batchim = $false }       # buteo
  )

  $trimmed = $Value

  # Strip stacked endings like "\uC774\uACE0" (igo) => "... \uC774" then again => base token.
  for ($iter = 0; $iter -lt 3; $iter++) {
    $changed = $false
    foreach ($rule in $rules) {
      $suffix = Convert-UnicodeEscapeLiterals -Value $rule.suffix
      # Allow stripping from short tokens, e.g. "yeop-eun" -> "yeop".
      if ($trimmed.EndsWith($suffix, [System.StringComparison]::Ordinal) -and $trimmed.Length -gt $suffix.Length) {
        $base = $trimmed.Substring(0, $trimmed.Length - $suffix.Length)
        if ($rule.kind -eq "batchim") {
          $requiresBatchim = [bool]$rule.requires_batchim
          if (-not (Test-BatchimRule -Base $base -RequiresBatchim $requiresBatchim)) {
            continue
          }
        }

        $trimmed = $base
        $changed = $true
        break
      }
    }

    if (-not $changed) {
      break
    }
  }

  return $trimmed
}

function Get-DefaultStopwordMap {
  $stopwords = @(
    "this", "that", "is", "are", "a", "an", "the", "and", "or", "to",
    "with", "plus",
    "\uC774\uAC70", "\uC800\uAC70", "\uADF8\uAC70", "\uC774\uAC74", "\uC800\uAC74", "\uADF8\uAC74",
    "\uC774\uAC70\uB294", "\uC800\uAC70\uB294", "\uADF8\uAC70\uB294", "\uADF8\uB9AC\uACE0", "\uB610",
    "\uC774\uAC70\uC57C", "\uC800\uAC70\uC57C", "\uADF8\uAC70\uC57C", "\uC785\uB2C8\uB2E4",
    "\uC774\uACE0", "\uD558\uACE0", "\uBC0F",
    # Spatial / sequencing filler words (Korean)
    "\uADF8", "\uC606", "\uADF8\uC606", "\uB2E4\uC74C", "\uADF8\uB2E4\uC74C",
    "\uC67C\uCABD", "\uC624\uB978\uCABD", "\uAC00\uC6B4\uB370", "\uC911\uAC04",
    "\uC704\uCABD", "\uC544\uB798\uCABD", "\uC55E\uCABD", "\uB4A4\uCABD",
    "\uC717\uCE78", "\uC544\uB7AB\uCE78", "\uCE78", "\uC120\uBC18", "\uC11C\uB78D",
    "\uB0C9\uC7A5\uC2E4", "\uB0C9\uB3D9\uC2E4",
    "\uB9E8", "\uCCA8", "\uB9E8\uCCA8", "\uCC98\uC74C", "\uB9E8\uCC98\uC74C"
  )

  $map = @{}
  foreach ($sw in @($stopwords)) {
    $decodedStopword = Convert-UnicodeEscapeLiterals -Value $sw
    if (-not [string]::IsNullOrWhiteSpace($decodedStopword)) {
      $map[$decodedStopword] = $true
    }
  }

  return $map
}

function Test-IsSpatialOrOrdinalToken {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Token
  )

  if ([string]::IsNullOrWhiteSpace($Token)) {
    return $false
  }

  $t = Normalize-Whitespace -Value (Normalize-Word -Value $Token)
  if ([string]::IsNullOrWhiteSpace($t)) {
    return $false
  }

  $ordinalMarker = Convert-UnicodeEscapeLiterals -Value "\uBC88\uC9F8" # beonjjae
  if (-not [string]::IsNullOrWhiteSpace($ordinalMarker) -and $t.Contains($ordinalMarker)) {
    return $true
  }

  $ordinalSuffix = Convert-UnicodeEscapeLiterals -Value "\uC9F8" # jjae
  if (-not [string]::IsNullOrWhiteSpace($ordinalSuffix) -and $t.EndsWith($ordinalSuffix, [System.StringComparison]::Ordinal)) {
    return $true
  }

  $locativeTail = Convert-UnicodeEscapeLiterals -Value "\uC5D0\uC11C" # eseo
  if (-not [string]::IsNullOrWhiteSpace($locativeTail) -and $t.EndsWith($locativeTail, [System.StringComparison]::Ordinal)) {
    return $true
  }

  $fromTail = Convert-UnicodeEscapeLiterals -Value "\uBD80\uD130" # buteo
  if (-not [string]::IsNullOrWhiteSpace($fromTail) -and $t.EndsWith($fromTail, [System.StringComparison]::Ordinal)) {
    return $true
  }

  $slotSuffix = Convert-UnicodeEscapeLiterals -Value "\uCE78" # kan
  if (-not [string]::IsNullOrWhiteSpace($slotSuffix) -and $t.EndsWith($slotSuffix, [System.StringComparison]::Ordinal) -and $t.Length -le 5) {
    return $true
  }

  return $false
}

function Normalize-ReviewPhraseValue {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Value,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [hashtable]$StopwordMap = $null
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return ""
  }

  $stopwordMap = if ($null -eq $StopwordMap) { Get-DefaultStopwordMap } else { $StopwordMap }
  $parts = @($Value -split "[^\p{L}\p{N}_]+" | ForEach-Object { $_.Trim() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if (@($parts).Count -eq 0) {
    return ""
  }

  $normalizedTokens = @()
  foreach ($part in @($parts)) {
    $tokenValue = Normalize-Whitespace -Value (Normalize-Word -Value $part)
    if ([string]::IsNullOrWhiteSpace($tokenValue)) {
      continue
    }

    $tokenValue = Remove-KoreanParticleSuffix -Value $tokenValue
    $tokenValue = Normalize-Whitespace -Value $tokenValue
    if ([string]::IsNullOrWhiteSpace($tokenValue)) {
      continue
    }

    if ($stopwordMap.ContainsKey($tokenValue)) {
      continue
    }
    if ($tokenValue -match "^\d+$") {
      continue
    }
    if (Test-IsSpatialOrOrdinalToken -Token $tokenValue) {
      continue
    }

    $normalizedTokens += $tokenValue
  }

  if (@($normalizedTokens).Count -eq 0) {
    return ""
  }

  return Normalize-Whitespace -Value ($normalizedTokens -join " ")
}

function Get-LevenshteinDistance {
  param(
    [Parameter(Mandatory = $true)]
    [string]$A,
    [Parameter(Mandatory = $true)]
    [string]$B
  )

  $n = $A.Length
  $m = $B.Length

  if ($n -eq 0) { return $m }
  if ($m -eq 0) { return $n }

  $prev = New-Object int[] ($m + 1)
  $curr = New-Object int[] ($m + 1)

  for ($j = 0; $j -le $m; $j++) {
    $prev[$j] = $j
  }

  for ($i = 1; $i -le $n; $i++) {
    $curr[0] = $i
    $aChar = $A[$i - 1]

    for ($j = 1; $j -le $m; $j++) {
      $cost = if ($aChar -eq $B[$j - 1]) { 0 } else { 1 }
      $deletion = $prev[$j] + 1
      $insertion = $curr[$j - 1] + 1
      $substitution = $prev[$j - 1] + $cost
      $curr[$j] = [Math]::Min([Math]::Min($deletion, $insertion), $substitution)
    }

    for ($j = 0; $j -le $m; $j++) {
      $prev[$j] = $curr[$j]
    }
  }

  return $prev[$m]
}

function Convert-NumberWordToDouble {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Text
  )

  $map = @{
    "one" = 1
    "two" = 2
    "three" = 3
    "four" = 4
    "five" = 5
  }

  if ($map.ContainsKey($Text)) {
    return [double]$map[$Text]
  }

  # Korean number words via unicode escapes.
  # \uD55C=han, \uD558\uB098=hana, \uB450=du, \uB458=dul, \uC138=se, \uC14B=set,
  # \uB124=ne, \uB137=net, \uB2E4\uC12F=daseot
  $koreanMap = @{
    "\uD55C" = 1
    "\uD558\uB098" = 1
    "\uB450" = 2
    "\uB458" = 2
    "\uC138" = 3
    "\uC14B" = 3
    "\uB124" = 4
    "\uB137" = 4
    "\uB2E4\uC12F" = 5
  }

  foreach ($entry in @($koreanMap.GetEnumerator())) {
    $decodedKey = Convert-UnicodeEscapeLiterals -Value $entry.Key
    if ($decodedKey -eq $Text) {
      return [double]$entry.Value
    }
  }

  return 0
}

function New-LexiconEntry {
  param(
    [Parameter(Mandatory = $true)]
    [string]$IngredientKey,
    [Parameter(Mandatory = $true)]
    [string]$DisplayName,
    [Parameter(Mandatory = $true)]
    [string]$Alias
  )

  return [PSCustomObject]@{
    ingredient_key = $IngredientKey
    display_name = $DisplayName
    alias = $Alias
  }
}

function Add-AliasesToLexicon {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable]$Dictionary,
    [Parameter(Mandatory = $true)]
    [string]$IngredientKey,
    [Parameter(Mandatory = $true)]
    [string]$DisplayName,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [AllowEmptyCollection()]
    [object[]]$Aliases = @()
  )

  foreach ($rawAlias in @($Aliases)) {
    if ($null -eq $rawAlias) {
      continue
    }

    $alias = Normalize-Word -Value $rawAlias.ToString()
    if ([string]::IsNullOrWhiteSpace($alias)) {
      continue
    }

    if (-not $Dictionary.ContainsKey($alias)) {
      $Dictionary[$alias] = New-LexiconEntry `
        -IngredientKey $IngredientKey `
        -DisplayName $DisplayName `
        -Alias $alias
    }
  }
}

function Get-IngredientAliasCatalog {
  if ($null -ne $script:IngredientAliasCatalogCache) {
    return @($script:IngredientAliasCatalogCache)
  }

  try {
    $catalogPathList = @($ingredientAliasDataPath, $ingredientAliasOverrideDataPath)
    $mergedByKey = @{}

    foreach ($catalogPath in @($catalogPathList)) {
      if ([string]::IsNullOrWhiteSpace($catalogPath)) {
        continue
      }
      if (-not (Test-Path -LiteralPath $catalogPath)) {
        continue
      }

      $raw = Get-Content -LiteralPath $catalogPath -Raw
      if ([string]::IsNullOrWhiteSpace($raw)) {
        continue
      }

      $parsed = $raw | ConvertFrom-Json
      $items = @()
      if ($parsed.PSObject.Properties["items"]) {
        $items = @($parsed.items)
      }

      foreach ($item in @($items)) {
        if ($null -eq $item) {
          continue
        }

        $rawKey = $null
        if ($item.PSObject.Properties["ingredient_key"]) {
          $rawKey = $item.ingredient_key
        }
        if ($null -eq $rawKey -or [string]::IsNullOrWhiteSpace($rawKey.ToString())) {
          continue
        }

        $key = Normalize-Word -Value $rawKey.ToString()
        if ([string]::IsNullOrWhiteSpace($key)) {
          continue
        }

        $displayName = if ($item.PSObject.Properties["display_name"] -and -not [string]::IsNullOrWhiteSpace($item.display_name)) {
          $item.display_name.ToString()
        }
        elseif ($mergedByKey.ContainsKey($key) -and -not [string]::IsNullOrWhiteSpace($mergedByKey[$key].display_name)) {
          $mergedByKey[$key].display_name
        }
        else {
          $key
        }

        $aliases = @()
        if ($item.PSObject.Properties["aliases"]) {
          $aliases += @($item.aliases)
        }
        $aliases += @($key, $displayName)

        if ($mergedByKey.ContainsKey($key)) {
          $existing = $mergedByKey[$key]
          $mergedAliasSet = @{}
          foreach ($rawAlias in @($existing.aliases) + @($aliases)) {
            if ($null -eq $rawAlias) {
              continue
            }
            $alias = $rawAlias.ToString().Trim()
            if ([string]::IsNullOrWhiteSpace($alias)) {
              continue
            }
            $normalizedAlias = Normalize-Word -Value $alias
            if (-not $mergedAliasSet.ContainsKey($normalizedAlias)) {
              $mergedAliasSet[$normalizedAlias] = $alias
            }
          }

          $mergedByKey[$key] = [PSCustomObject]@{
            ingredient_key = $key
            display_name = $displayName
            aliases = @($mergedAliasSet.Values)
          }
        }
        else {
          $mergedByKey[$key] = [PSCustomObject]@{
            ingredient_key = $key
            display_name = $displayName
            aliases = @($aliases)
          }
        }
      }
    }

    $script:IngredientAliasCatalogCache = @($mergedByKey.Values | Sort-Object -Property ingredient_key)
    return @($script:IngredientAliasCatalogCache)
  }
  catch {
    $script:IngredientAliasCatalogCache = @()
    return @()
  }
}

function Get-IngredientLexicon {
  if ($null -ne $script:IngredientLexiconCache) {
    return @($script:IngredientLexiconCache)
  }

  $rules = Get-ShelfLifeRules
  $dict = @{}
  $displayNameByKey = @{}

  foreach ($rule in @($rules)) {
    if ($rule.ingredient_key -eq "default_perishable") {
      continue
    }

    if (-not [string]::IsNullOrWhiteSpace($rule.display_name)) {
      $displayNameByKey[$rule.ingredient_key] = $rule.display_name
    }

    $aliases = @()
    if ($rule.PSObject.Properties["aliases"]) {
      $aliases += @($rule.aliases)
    }
    $aliases += @($rule.ingredient_key)
    if ($rule.PSObject.Properties["display_name"]) {
      $aliases += @($rule.display_name)
    }

    Add-AliasesToLexicon `
      -Dictionary $dict `
      -IngredientKey $rule.ingredient_key `
      -DisplayName $rule.display_name `
      -Aliases $aliases
  }

  $catalog = Get-IngredientAliasCatalog
  foreach ($entry in @($catalog)) {
    $ingredientKey = $entry.ingredient_key
    if ([string]::IsNullOrWhiteSpace($ingredientKey)) {
      continue
    }

    $displayName = if (-not [string]::IsNullOrWhiteSpace($entry.display_name)) {
      $entry.display_name
    }
    elseif ($displayNameByKey.ContainsKey($ingredientKey)) {
      $displayNameByKey[$ingredientKey]
    }
    else {
      $ingredientKey
    }

    Add-AliasesToLexicon `
      -Dictionary $dict `
      -IngredientKey $ingredientKey `
      -DisplayName $displayName `
      -Aliases @($entry.aliases)
  }

  $list = @($dict.Values | Sort-Object -Property @{ Expression = { -$_.alias.Length } }, alias)
  $script:IngredientLexiconCache = $list
  return @($list)
}

function Get-IngredientCatalogEntries {
  $mergedByKey = @{}
  $aliasSetByKey = @{}

  $rules = Get-ShelfLifeRules
  foreach ($rule in @($rules)) {
    if ($null -eq $rule) {
      continue
    }

    $ruleKey = if ($rule.PSObject.Properties["ingredient_key"]) { $rule.ingredient_key } else { $null }
    if ([string]::IsNullOrWhiteSpace($ruleKey)) {
      continue
    }

    $key = Normalize-IngredientKey -Value $ruleKey
    if ([string]::IsNullOrWhiteSpace($key) -or $key -eq "default_perishable") {
      continue
    }

    if (-not $mergedByKey.ContainsKey($key)) {
      $mergedByKey[$key] = [PSCustomObject]@{
        ingredient_key = $key
        display_name = $key
      }
      $aliasSetByKey[$key] = @{}
    }

    if ($rule.PSObject.Properties["display_name"] -and -not [string]::IsNullOrWhiteSpace($rule.display_name)) {
      $mergedByKey[$key].display_name = $rule.display_name.ToString().Trim()
    }

    $ruleAliases = @($key)
    if ($rule.PSObject.Properties["display_name"] -and -not [string]::IsNullOrWhiteSpace($rule.display_name)) {
      $ruleAliases += @($rule.display_name)
    }
    if ($rule.PSObject.Properties["aliases"]) {
      $ruleAliases += @($rule.aliases)
    }

    foreach ($rawAlias in @($ruleAliases)) {
      if ($null -eq $rawAlias) {
        continue
      }
      $alias = $rawAlias.ToString().Trim()
      if ([string]::IsNullOrWhiteSpace($alias)) {
        continue
      }
      $normalizedAlias = Normalize-Word -Value $alias
      if (-not $aliasSetByKey[$key].ContainsKey($normalizedAlias)) {
        $aliasSetByKey[$key][$normalizedAlias] = $alias
      }
    }
  }

  $catalog = Get-IngredientAliasCatalog
  foreach ($entry in @($catalog)) {
    if ($null -eq $entry -or -not $entry.PSObject.Properties["ingredient_key"]) {
      continue
    }

    $entryKey = Normalize-IngredientKey -Value $entry.ingredient_key
    if ([string]::IsNullOrWhiteSpace($entryKey)) {
      continue
    }

    if (-not $mergedByKey.ContainsKey($entryKey)) {
      $mergedByKey[$entryKey] = [PSCustomObject]@{
        ingredient_key = $entryKey
        display_name = $entryKey
      }
      $aliasSetByKey[$entryKey] = @{}
    }

    if ($entry.PSObject.Properties["display_name"] -and -not [string]::IsNullOrWhiteSpace($entry.display_name)) {
      $mergedByKey[$entryKey].display_name = $entry.display_name.ToString().Trim()
    }

    $entryAliases = @($entryKey)
    if ($entry.PSObject.Properties["display_name"] -and -not [string]::IsNullOrWhiteSpace($entry.display_name)) {
      $entryAliases += @($entry.display_name)
    }
    if ($entry.PSObject.Properties["aliases"]) {
      $entryAliases += @($entry.aliases)
    }

    foreach ($rawAlias in @($entryAliases)) {
      if ($null -eq $rawAlias) {
        continue
      }
      $alias = $rawAlias.ToString().Trim()
      if ([string]::IsNullOrWhiteSpace($alias)) {
        continue
      }
      $normalizedAlias = Normalize-Word -Value $alias
      if (-not $aliasSetByKey[$entryKey].ContainsKey($normalizedAlias)) {
        $aliasSetByKey[$entryKey][$normalizedAlias] = $alias
      }
    }
  }

  $items = @()
  foreach ($key in @($mergedByKey.Keys | Sort-Object)) {
    $entry = $mergedByKey[$key]
    $aliasMap = $aliasSetByKey[$key]
    $aliases = @($aliasMap.Values | Sort-Object)
    $items += [PSCustomObject]@{
      ingredient_key = $entry.ingredient_key
      display_name = $entry.display_name
      aliases = $aliases
    }
  }

  return @($items)
}

function Search-IngredientCatalog {
  param(
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [string]$Query = $null,
    [Parameter(Mandatory = $false)]
    [int]$TopN = 20
  )

  if ($TopN -le 0) {
    $TopN = 20
  }

  $entries = Get-IngredientCatalogEntries
  if ([string]::IsNullOrWhiteSpace($Query)) {
    return @($entries | Sort-Object -Property display_name | Select-Object -First $TopN)
  }

  $normalizedQuery = Normalize-Whitespace -Value (Normalize-Word -Value $Query)
  if ([string]::IsNullOrWhiteSpace($normalizedQuery)) {
    return @($entries | Sort-Object -Property display_name | Select-Object -First $TopN)
  }

  $results = @()
  foreach ($entry in @($entries)) {
    $candidateTokens = @($entry.ingredient_key, $entry.display_name) + @($entry.aliases)
    $bestScore = 0.0
    $bestAlias = $entry.display_name

    foreach ($rawToken in @($candidateTokens)) {
      if ($null -eq $rawToken) {
        continue
      }
      $token = Normalize-Whitespace -Value (Normalize-Word -Value $rawToken.ToString())
      if ([string]::IsNullOrWhiteSpace($token)) {
        continue
      }

      $score = 0.0
      if ($token -eq $normalizedQuery) {
        $score = 1.0
      }
      elseif ($token.StartsWith($normalizedQuery) -or $normalizedQuery.StartsWith($token)) {
        $score = 0.92
      }
      elseif ($token.Contains($normalizedQuery) -or $normalizedQuery.Contains($token)) {
        $score = 0.84
      }
      else {
        $maxLen = [Math]::Max($token.Length, $normalizedQuery.Length)
        if ($maxLen -gt 1) {
          $distance = Get-LevenshteinDistance -A $normalizedQuery -B $token
          $similarity = 1.0 - ([double]$distance / [double]$maxLen)
          if ($similarity -ge 0.70) {
            $score = [math]::Round($similarity, 4)
          }
        }
      }

      if ($score -gt $bestScore) {
        $bestScore = $score
        $bestAlias = $rawToken.ToString()
      }
    }

    if ($bestScore -gt 0) {
      $results += [PSCustomObject]@{
        ingredient_key = $entry.ingredient_key
        display_name = $entry.display_name
        matched_alias = $bestAlias
        score = [math]::Round($bestScore, 4)
      }
    }
  }

  return @($results | Sort-Object -Property @{ Expression = { -$_.score } }, display_name | Select-Object -First $TopN)
}

function Add-IngredientAliasOverride {
  param(
    [Parameter(Mandatory = $true)]
    [string]$IngredientKey,
    [Parameter(Mandatory = $true)]
    [string]$Alias,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [string]$DisplayName = $null
  )

  $normalizedKey = Normalize-IngredientKey -Value $IngredientKey
  if ([string]::IsNullOrWhiteSpace($normalizedKey)) {
    throw "ingredient_key is required."
  }

  $aliasValue = Normalize-Whitespace -Value $Alias
  if ([string]::IsNullOrWhiteSpace($aliasValue)) {
    throw "alias is required."
  }

  $normalizedAlias = Normalize-Word -Value $aliasValue
  $catalog = [PSCustomObject]@{
    version = (Get-Date).ToString("yyyy-MM-dd")
    source = "internal.overrides.v1"
    items = @()
  }

  if (Test-Path -LiteralPath $ingredientAliasOverrideDataPath) {
    $raw = Get-Content -LiteralPath $ingredientAliasOverrideDataPath -Raw
    if (-not [string]::IsNullOrWhiteSpace($raw)) {
      try {
        $parsed = $raw | ConvertFrom-Json
        if ($null -ne $parsed) {
          if ($parsed.PSObject.Properties["version"]) {
            $catalog.version = $parsed.version
          }
          if ($parsed.PSObject.Properties["source"] -and -not [string]::IsNullOrWhiteSpace($parsed.source)) {
            $catalog.source = $parsed.source
          }
          if ($parsed.PSObject.Properties["items"] -and $null -ne $parsed.items) {
            $catalog.items = @($parsed.items)
          }
        }
      }
      catch {
        # Reset to a valid empty catalog if the existing file cannot be parsed.
        $catalog = [PSCustomObject]@{
          version = (Get-Date).ToString("yyyy-MM-dd")
          source = "internal.overrides.v1"
          items = @()
        }
      }
    }
  }

  $items = @()
  $found = $false
  $added = $false
  $resolvedDisplayName = $null
  $resolvedAliases = @()

  foreach ($item in @($catalog.items)) {
    if ($null -eq $item -or -not $item.PSObject.Properties["ingredient_key"]) {
      continue
    }

    $itemKey = Normalize-IngredientKey -Value $item.ingredient_key
    if ($itemKey -ne $normalizedKey) {
      $items += $item
      continue
    }

    $found = $true
    $aliasMap = @{}
    foreach ($rawAlias in @($item.aliases)) {
      if ($null -eq $rawAlias) {
        continue
      }
      $candidate = $rawAlias.ToString().Trim()
      if ([string]::IsNullOrWhiteSpace($candidate)) {
        continue
      }
      $candidateNormalized = Normalize-Word -Value $candidate
      if (-not $aliasMap.ContainsKey($candidateNormalized)) {
        $aliasMap[$candidateNormalized] = $candidate
      }
    }

    if (-not $aliasMap.ContainsKey($normalizedAlias)) {
      $aliasMap[$normalizedAlias] = $aliasValue
      $added = $true
    }

    $resolvedDisplayName = if (-not [string]::IsNullOrWhiteSpace($DisplayName)) {
      $DisplayName.Trim()
    }
    elseif ($item.PSObject.Properties["display_name"] -and -not [string]::IsNullOrWhiteSpace($item.display_name)) {
      $item.display_name.ToString().Trim()
    }
    else {
      $normalizedKey
    }

    $resolvedAliases = @($aliasMap.Values | Sort-Object)
    $items += [PSCustomObject]@{
      ingredient_key = $normalizedKey
      display_name = $resolvedDisplayName
      aliases = $resolvedAliases
    }
  }

  if (-not $found) {
    $resolvedDisplayName = if (-not [string]::IsNullOrWhiteSpace($DisplayName)) { $DisplayName.Trim() } else { $normalizedKey }
    $resolvedAliases = @($aliasValue)
    $added = $true

    $items += [PSCustomObject]@{
      ingredient_key = $normalizedKey
      display_name = $resolvedDisplayName
      aliases = $resolvedAliases
    }
  }

  $sortedItems = @($items | Sort-Object -Property ingredient_key)
  $newCatalog = [PSCustomObject]@{
    version = (Get-Date).ToString("yyyy-MM-dd")
    source = $catalog.source
    items = $sortedItems
  }

  $directory = Split-Path -Parent $ingredientAliasOverrideDataPath
  if (-not (Test-Path -LiteralPath $directory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
  }

  $json = $newCatalog | ConvertTo-Json -Depth 16
  Set-Content -LiteralPath $ingredientAliasOverrideDataPath -Value $json -Encoding utf8

  Clear-IngredientLexiconCache

  return [PSCustomObject]@{
    ingredient_key = $normalizedKey
    display_name = $resolvedDisplayName
    alias = $aliasValue
    alias_added = $added
    alias_count = @($resolvedAliases).Count
    overrides_path = $ingredientAliasOverrideDataPath
    catalog_version = $newCatalog.version
  }
}

function Parse-QuantityFromClause {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Clause
  )

  # Korean units use unicode escapes:
  # \uAC1C=gae, \uD329=pack, \uD1B5=tong, \uBD09\uC9C0=bongji, \uD310=pan,
  # \uC904=jul, \uBCD1=byeong, \uCE94=can
  $unitPattern = "(?<unit>\uAC1C|\uD329|\uD1B5|\uBD09\uC9C0|\uD310|\uC904|\uBCD1|\uCE94|ea|pack|kg|g|ml|l)"
  $numberPattern = "(?<qty>\d+(?:\.\d+)?)\s*" + $unitPattern + "?"
  $numberMatch = [regex]::Match($Clause, $numberPattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($numberMatch.Success) {
    $unit = $numberMatch.Groups["unit"].Value
    if ([string]::IsNullOrWhiteSpace($unit)) {
      $unit = "ea"
    }
    return [PSCustomObject]@{
      quantity = [double]$numberMatch.Groups["qty"].Value
      unit = $unit.ToLowerInvariant()
      explicit = $true
    }
  }

  $wordPattern = "(?<qtyword>one|two|three|four|five|\uD55C|\uD558\uB098|\uB450|\uB458|\uC138|\uC14B|\uB124|\uB137|\uB2E4\uC12F)\s*" + $unitPattern
  $wordMatch = [regex]::Match($Clause, $wordPattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  if ($wordMatch.Success) {
    $qty = Convert-NumberWordToDouble -Text $wordMatch.Groups["qtyword"].Value.ToLowerInvariant()
    if ($qty -gt 0) {
      return [PSCustomObject]@{
        quantity = $qty
        unit = $wordMatch.Groups["unit"].Value
        explicit = $true
      }
    }
  }

  return [PSCustomObject]@{
    quantity = 1.0
    unit = "ea"
    explicit = $false
  }
}

function Find-IngredientMentions {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Text
  )

  $lexicon = Get-IngredientLexicon
  $mentions = @()

  foreach ($entry in $lexicon) {
    $alias = $entry.alias
    if ([string]::IsNullOrWhiteSpace($alias)) {
      continue
    }

    $escaped = [regex]::Escape($alias)
    # Allow common Korean postposition suffixes after an ingredient token.
    $koreanParticles = "(?:\uC740|\uB294|\uC774|\uAC00|\uC744|\uB97C|\uC640|\uACFC|\uB3C4|\uACE0|\uC57C)"
    $pattern = "(^|[^\p{L}\p{N}_])(?<alias>$escaped)(?=$|[^\p{L}\p{N}_]|$koreanParticles)"
    $matches = [regex]::Matches($Text, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    foreach ($match in $matches) {
      $start = $match.Groups["alias"].Index
      $end = $start + $match.Groups["alias"].Length

      $overlap = $false
      foreach ($m in $mentions) {
        if (($start -lt $m.end_index) -and ($end -gt $m.start_index)) {
          $overlap = $true
          break
        }
      }
      if ($overlap) {
        continue
      }

      $mentions += [PSCustomObject]@{
        ingredient_key = $entry.ingredient_key
        ingredient_name = $entry.display_name
        matched_alias = $match.Groups["alias"].Value
        start_index = $start
        end_index = $end
        confidence = "high"
        match_type = "exact"
      }
    }
  }

  return @($mentions | Sort-Object -Property start_index)
}

function Get-TopIngredientCandidatesForPhrase {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Phrase,
    [Parameter(Mandatory = $false)]
    [int]$TopN = 3,
    [Parameter(Mandatory = $false)]
    [double]$MinSimilarity = 0.55
  )

  $normalizedPhrase = Normalize-Whitespace -Value (Normalize-Word -Value $Phrase)
  if ([string]::IsNullOrWhiteSpace($normalizedPhrase)) {
    return @()
  }

  $lexicon = Get-IngredientLexicon
  $bestByIngredient = @{}

  foreach ($entry in @($lexicon)) {
    $alias = $entry.alias
    if ([string]::IsNullOrWhiteSpace($alias)) {
      continue
    }
    if ($alias.Length -lt 2) {
      continue
    }

    $maxLen = [Math]::Max($normalizedPhrase.Length, $alias.Length)
    if ($maxLen -lt 2) {
      continue
    }

    $distance = Get-LevenshteinDistance -A $normalizedPhrase -B $alias
    $similarity = 1.0 - ([double]$distance / [double]$maxLen)
    if ($similarity -lt $MinSimilarity) {
      continue
    }

    $score = [math]::Round($similarity, 4)
    $key = $entry.ingredient_key
    if (-not $bestByIngredient.ContainsKey($key) -or $score -gt $bestByIngredient[$key].score) {
      $bestByIngredient[$key] = [PSCustomObject]@{
        ingredient_key = $entry.ingredient_key
        ingredient_name = $entry.display_name
        matched_alias = $entry.alias
        score = $score
        distance = $distance
      }
    }
  }

  return @($bestByIngredient.Values | Sort-Object -Property @{ Expression = { -$_.score } }, distance, ingredient_name | Select-Object -First $TopN)
}

function Get-FuzzyCandidatePhrases {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Text
  )

  $normalized = Normalize-Whitespace -Value (Normalize-Word -Value $Text)
  if ([string]::IsNullOrWhiteSpace($normalized)) {
    return @()
  }

  $parts = @($normalized -split "[^\p{L}\p{N}_]+" | ForEach-Object { $_.Trim() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
  if (@($parts).Count -eq 0) {
    return @()
  }

  $stopwordMap = Get-DefaultStopwordMap

  $candidateMap = @{}
  $count = @($parts).Count
  for ($i = 0; $i -lt $count; $i++) {
    for ($n = 1; $n -le 3; $n++) {
      if (($i + $n) -gt $count) {
        break
      }

      $slice = @($parts[$i..($i + $n - 1)])
      if (@($slice).Count -eq 0) {
        continue
      }

      $normalizedSourceTokens = @()
      foreach ($token in @($slice)) {
        $tokenValue = Normalize-Whitespace -Value (Normalize-Word -Value $token)
        if ([string]::IsNullOrWhiteSpace($tokenValue)) {
          continue
        }

        $tokenValue = Remove-KoreanParticleSuffix -Value $tokenValue
        $tokenValue = Normalize-Whitespace -Value $tokenValue
        if ([string]::IsNullOrWhiteSpace($tokenValue)) {
          continue
        }

        $normalizedSourceTokens += $tokenValue
      }

      if (@($normalizedSourceTokens).Count -eq 0) {
        continue
      }

      $filteredTokens = @()
      $removedStopwordCount = 0
      foreach ($tokenValue in @($normalizedSourceTokens)) {
        if ($stopwordMap.ContainsKey($tokenValue)) {
          $removedStopwordCount++
          continue
        }
        if ($tokenValue -match "^\d+$") {
          continue
        }
        if (Test-IsSpatialOrOrdinalToken -Token $tokenValue) {
          $removedStopwordCount++
          continue
        }
        $filteredTokens += $tokenValue
      }

      if (@($filteredTokens).Count -eq 0) {
        continue
      }

      # If stopwords were removed in the middle, avoid merging separate noun chunks.
      if (@($filteredTokens).Count -gt 1 -and $removedStopwordCount -gt 0) {
        continue
      }

      $phrase = Normalize-Whitespace -Value ($filteredTokens -join " ")
      if ([string]::IsNullOrWhiteSpace($phrase)) {
        continue
      }
      if ($phrase.Length -lt 2) {
        continue
      }

      if (-not $candidateMap.ContainsKey($phrase)) {
        $candidateMap[$phrase] = $true
      }
    }
  }

  return @($candidateMap.Keys)
}

function Find-ApproximateIngredientMentions {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Text,
    [Parameter(Mandatory = $false)]
    [AllowEmptyCollection()]
    [object[]]$ExistingMentions = @()
  )

  $lexicon = Get-IngredientLexicon
  $existingAliasMap = @{}
  foreach ($mention in @($ExistingMentions)) {
    if ($null -eq $mention -or -not $mention.PSObject.Properties["matched_alias"]) {
      continue
    }
    $alias = Normalize-Word -Value $mention.matched_alias
    if (-not [string]::IsNullOrWhiteSpace($alias)) {
      $existingAliasMap[$alias] = $true
    }
  }

  $candidates = Get-RemainingCandidatePhrases -Text $Text -Mentions $ExistingMentions
  $mentions = @()
  $seenIngredientKey = @{}

  foreach ($candidate in @($candidates)) {
    $normalizedCandidate = Normalize-Word -Value $candidate
    if ($existingAliasMap.ContainsKey($normalizedCandidate)) {
      continue
    }

    $topCandidates = Get-TopIngredientCandidatesForPhrase -Phrase $normalizedCandidate -TopN 3 -MinSimilarity 0.70
    if (@($topCandidates).Count -eq 0) {
      continue
    }

    $best = $topCandidates[0]
    if ($seenIngredientKey.ContainsKey($best.ingredient_key)) {
      continue
    }
    $seenIngredientKey[$best.ingredient_key] = $true

    $index = (Normalize-Word -Value $Text).IndexOf($normalizedCandidate)
    if ($index -lt 0) {
      $index = 0
    }

    $mentions += [PSCustomObject]@{
      ingredient_key = $best.ingredient_key
      ingredient_name = $best.ingredient_name
      matched_alias = $candidate
      start_index = $index
      end_index = ($index + $normalizedCandidate.Length)
      confidence = if ($best.score -ge 0.86) { "medium" } else { "low" }
      match_type = "fuzzy"
      score = $best.score
      candidate_options = @($topCandidates)
    }
  }

  return @($mentions | Sort-Object -Property start_index)
}

function Contains-RemoveIntent {
  param(
    [Parameter(Mandatory = $true)]
    [string]$NormalizedClause
  )

  $patterns = @(
    "(?<![\p{L}\p{N}_])remove(?![\p{L}\p{N}_])",
    "(?<![\p{L}\p{N}_])delete(?![\p{L}\p{N}_])",
    "(?<![\p{L}\p{N}_])\uC81C\uAC70(?![\p{L}\p{N}_])",
    "(?<![\p{L}\p{N}_])\uC5C6\uC560(?![\p{L}\p{N}_])",
    "(?<![\p{L}\p{N}_])\uBC84\uB824(?![\p{L}\p{N}_])",
    "(?<![\p{L}\p{N}_])\uC18C\uC9C4(?![\p{L}\p{N}_])",
    "(?<![\p{L}\p{N}_])\uBA39\uC5C8(?![\p{L}\p{N}_])",
    "(?<![\p{L}\p{N}_])\uB2E4\s*\uBA39(?![\p{L}\p{N}_])",
    "(?<![\p{L}\p{N}_])\uBE7C(?=\s|$|[^\p{L}\p{N}_]|\uC918|\uC8FC|\uC790)"
  )

  foreach ($pattern in @($patterns)) {
    if ([regex]::IsMatch($NormalizedClause, $pattern, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)) {
      return $true
    }
  }

  return $false
}

function Get-RemainingCandidatePhrases {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Text,
    [Parameter(Mandatory = $false)]
    [AllowEmptyCollection()]
    [object[]]$Mentions = @()
  )

  $normalized = Normalize-Whitespace -Value (Normalize-Word -Value $Text)
  if ([string]::IsNullOrWhiteSpace($normalized)) {
    return @()
  }

  $mentionList = @($Mentions)
  $hasMention = $false
  foreach ($mentionEntry in @($mentionList)) {
    if ($null -ne $mentionEntry) {
      $hasMention = $true
      break
    }
  }

  if (-not $hasMention) {
    return @(Get-FuzzyCandidatePhrases -Text $normalized)
  }

  $masked = $normalized
  foreach ($mention in @($mentionList)) {
    if ($null -eq $mention) {
      continue
    }

    $alias = if ($mention.PSObject.Properties["matched_alias"]) { $mention.matched_alias } else { $null }
    if ([string]::IsNullOrWhiteSpace($alias)) {
      continue
    }

    $normalizedAlias = Normalize-Whitespace -Value (Normalize-Word -Value $alias)
    if ([string]::IsNullOrWhiteSpace($normalizedAlias)) {
      continue
    }

    $pattern = [regex]::Escape($normalizedAlias)
    $masked = [regex]::Replace($masked, $pattern, " ", [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
  }

  $remaining = Normalize-Whitespace -Value $masked
  if ([string]::IsNullOrWhiteSpace($remaining)) {
    return @()
  }

  return @(Get-FuzzyCandidatePhrases -Text $remaining)
}

function Add-ReviewCandidateToMap {
  param(
    [Parameter(Mandatory = $true)]
    [hashtable]$Map,
    [Parameter(Mandatory = $true)]
    [string]$Phrase,
    [Parameter(Mandatory = $true)]
    [string]$Reason,
    [Parameter(Mandatory = $false)]
    [AllowEmptyCollection()]
    [object[]]$Candidates = @()
  )

  $resolvedPhrase = Normalize-ReviewPhraseValue -Value $Phrase
  if ([string]::IsNullOrWhiteSpace($resolvedPhrase)) {
    return
  }

  $normalizedPhrase = Normalize-Whitespace -Value (Normalize-Word -Value $resolvedPhrase)
  if ([string]::IsNullOrWhiteSpace($normalizedPhrase)) {
    return
  }

  $bestCandidateByKey = @{}
  foreach ($candidate in @($Candidates)) {
    if ($null -eq $candidate -or -not $candidate.PSObject.Properties["ingredient_key"]) {
      continue
    }

    $candidateKey = Normalize-Word -Value $candidate.ingredient_key
    if ([string]::IsNullOrWhiteSpace($candidateKey)) {
      continue
    }

    $candidateName = if ($candidate.PSObject.Properties["ingredient_name"] -and -not [string]::IsNullOrWhiteSpace($candidate.ingredient_name)) {
      $candidate.ingredient_name
    }
    else {
      $candidateKey
    }

    $score = if ($candidate.PSObject.Properties["score"] -and $null -ne $candidate.score) {
      [double]$candidate.score
    }
    else {
      0.0
    }

    if (-not $bestCandidateByKey.ContainsKey($candidateKey) -or $score -gt [double]$bestCandidateByKey[$candidateKey].score) {
      $bestCandidateByKey[$candidateKey] = [PSCustomObject]@{
        ingredient_key = $candidateKey
        ingredient_name = $candidateName
        matched_alias = if ($candidate.PSObject.Properties["matched_alias"]) { $candidate.matched_alias } else { $null }
        score = [math]::Round($score, 4)
      }
    }
  }

  $resolvedCandidates = @($bestCandidateByKey.Values | Sort-Object -Property @{ Expression = { -$_.score } }, ingredient_name)
  $resolvedReason = if (@($resolvedCandidates).Count -gt 0) { "needs_confirmation" } else { $Reason }
  if ($resolvedReason -ne "needs_confirmation" -and $resolvedReason -ne "unknown") {
    $resolvedReason = "unknown"
  }

  if ($Map.ContainsKey($normalizedPhrase)) {
    $existing = $Map[$normalizedPhrase]

    $mergedCandidateByKey = @{}
    foreach ($candidate in @($existing.candidates) + @($resolvedCandidates)) {
      if ($null -eq $candidate -or -not $candidate.PSObject.Properties["ingredient_key"]) {
        continue
      }

      $candidateKey = Normalize-Word -Value $candidate.ingredient_key
      if ([string]::IsNullOrWhiteSpace($candidateKey)) {
        continue
      }

      $score = if ($candidate.PSObject.Properties["score"] -and $null -ne $candidate.score) { [double]$candidate.score } else { 0.0 }
      if (-not $mergedCandidateByKey.ContainsKey($candidateKey) -or $score -gt [double]$mergedCandidateByKey[$candidateKey].score) {
        $mergedCandidateByKey[$candidateKey] = [PSCustomObject]@{
          ingredient_key = $candidateKey
          ingredient_name = if ($candidate.PSObject.Properties["ingredient_name"]) { $candidate.ingredient_name } else { $candidateKey }
          matched_alias = if ($candidate.PSObject.Properties["matched_alias"]) { $candidate.matched_alias } else { $null }
          score = [math]::Round($score, 4)
        }
      }
    }

    $mergedCandidates = @($mergedCandidateByKey.Values | Sort-Object -Property @{ Expression = { -$_.score } }, ingredient_name)
    $mergedReason = if (@($mergedCandidates).Count -gt 0 -or $existing.reason -eq "needs_confirmation" -or $resolvedReason -eq "needs_confirmation") {
      "needs_confirmation"
    }
    else {
      "unknown"
    }

    $existing.reason = $mergedReason
    $existing.candidates = $mergedCandidates
    $Map[$normalizedPhrase] = $existing
    return
  }

  $Map[$normalizedPhrase] = [PSCustomObject]@{
    phrase = $resolvedPhrase
    reason = $resolvedReason
    candidates = $resolvedCandidates
  }
}

function Parse-CommandsFromClause {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Clause
  )

  $normalized = Normalize-Word -Value $Clause
  if ([string]::IsNullOrWhiteSpace($normalized)) {
    return @()
  }

  $exactMentions = Find-IngredientMentions -Text $normalized
  $approxMentions = Find-ApproximateIngredientMentions -Text $normalized -ExistingMentions $exactMentions
  $mentions = @(@($exactMentions) + @($approxMentions) | Sort-Object -Property start_index)

  $mentionMap = @{}
  foreach ($mention in @($mentions)) {
    if ($null -eq $mention -or -not $mention.PSObject.Properties["ingredient_key"]) {
      continue
    }

    $key = Normalize-Word -Value $mention.ingredient_key
    if ([string]::IsNullOrWhiteSpace($key)) {
      continue
    }

    $confidence = if ($mention.PSObject.Properties["confidence"]) { $mention.confidence } else { "medium" }
    $rank = switch ($confidence) {
      "high" { 3 }
      "medium" { 2 }
      "low" { 1 }
      default { 0 }
    }

    if (-not $mentionMap.ContainsKey($key)) {
      $mentionMap[$key] = [PSCustomObject]@{
        mention = $mention
        rank = $rank
      }
      continue
    }

    $existing = $mentionMap[$key]
    if ($rank -gt $existing.rank) {
      $mentionMap[$key] = [PSCustomObject]@{
        mention = $mention
        rank = $rank
      }
    }
  }

  $mentions = @($mentionMap.Values | ForEach-Object { $_.mention } | Sort-Object -Property start_index)

  $commands = @()
  $reviewCandidateMap = @{}

  foreach ($mention in @($mentions)) {
    if ($mention.match_type -eq "fuzzy" -and $mention.confidence -eq "low") {
      $options = if ($mention.PSObject.Properties["candidate_options"]) { @($mention.candidate_options) } else { @() }
      Add-ReviewCandidateToMap `
        -Map $reviewCandidateMap `
        -Phrase $mention.matched_alias `
        -Reason "needs_confirmation" `
        -Candidates @($options)
      continue
    }

    $commands += $mention
  }

  $remainingPhrases = @(Get-RemainingCandidatePhrases -Text $normalized -Mentions $mentions)
  foreach ($phrase in @($remainingPhrases)) {
    $candidateOptions = @(Get-TopIngredientCandidatesForPhrase -Phrase $phrase -TopN 3 -MinSimilarity 0.55)
    $reason = if (@($candidateOptions).Count -gt 0) { "needs_confirmation" } else { "unknown" }
    Add-ReviewCandidateToMap `
      -Map $reviewCandidateMap `
      -Phrase $phrase `
      -Reason $reason `
      -Candidates @($candidateOptions)
  }

  $reviewCandidates = @($reviewCandidateMap.Values | Sort-Object -Property phrase)

  if (@($mentions).Count -eq 0) {
    return [PSCustomObject]@{
      commands = @()
      review_candidates = @($reviewCandidates)
    }
  }

  $isRemove = Contains-RemoveIntent -NormalizedClause $normalized
  $qtyInfo = Parse-QuantityFromClause -Clause $normalized

  $resolvedCommands = @()
  foreach ($mention in @($commands)) {
    $resolvedCommands += [PSCustomObject]@{
      action = if ($isRemove) { "remove" } else { "add" }
      ingredient_key = $mention.ingredient_key
      ingredient_name = $mention.ingredient_name
      quantity = if ($isRemove -and -not $qtyInfo.explicit) { $null } else { $qtyInfo.quantity }
      unit = $qtyInfo.unit
      remove_all = ($isRemove -and -not $qtyInfo.explicit)
      source = "chat_text"
      confidence = if ($mention.PSObject.Properties["confidence"]) { $mention.confidence } else { "medium" }
      matched_alias = $mention.matched_alias
      match_type = if ($mention.PSObject.Properties["match_type"]) { $mention.match_type } else { "exact" }
    }
  }

  return [PSCustomObject]@{
    commands = @($resolvedCommands)
    review_candidates = @($reviewCandidates)
  }
}

function Parse-ConversationCommands {
  param(
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [string]$Text = $null,
    [Parameter(Mandatory = $false)]
    [AllowNull()]
    [AllowEmptyCollection()]
    [string[]]$VisionDetectedItems = @()
  )

  $commands = @()
  $reviewCandidates = @()
  $finalizeRequested = $false

  if (-not [string]::IsNullOrWhiteSpace($Text)) {
    $normalizedText = Normalize-Word -Value $Text
    $finalizePattern = "(finish|done|finalize|\uC644\uB8CC|\uB05D|\uB9C8\uBB34\uB9AC|\uD655\uC815)"
    if ($normalizedText -match $finalizePattern) {
      $finalizeRequested = $true
    }

    $clauses = @($Text -split "[\r\n\.\,\!\?\~]+" | ForEach-Object { $_.Trim() } | Where-Object { -not [string]::IsNullOrWhiteSpace($_) })
    foreach ($clause in $clauses) {
      $clauseResult = Parse-CommandsFromClause -Clause $clause
      $commands += @($clauseResult.commands)
      $reviewCandidates += @($clauseResult.review_candidates)
    }
  }

  foreach ($visionItem in @($VisionDetectedItems)) {
    if ([string]::IsNullOrWhiteSpace($visionItem)) {
      continue
    }
    $mentions = Find-IngredientMentions -Text $visionItem
    if (@($mentions).Count -gt 0) {
      $m = $mentions[0]
      $commands += [PSCustomObject]@{
        action = "add"
        ingredient_key = $m.ingredient_key
        ingredient_name = $m.ingredient_name
        quantity = 1.0
        unit = "ea"
        remove_all = $false
        source = "vision"
        confidence = "medium"
        matched_alias = $m.matched_alias
      }
    }
    else {
      $fallbackKey = (Normalize-Word -Value $visionItem).Replace(" ", "_")
      $commands += [PSCustomObject]@{
        action = "add"
        ingredient_key = $fallbackKey
        ingredient_name = $visionItem.Trim()
        quantity = 1.0
        unit = "ea"
        remove_all = $false
        source = "vision"
        confidence = "low"
        matched_alias = $visionItem
      }
    }
  }

  return [PSCustomObject]@{
    commands = @($commands)
    review_candidates = @($reviewCandidates)
    finalize_requested = $finalizeRequested
  }
}

function Apply-ConversationCommandsToDraft {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyCollection()]
    [object[]]$DraftItems,
    [Parameter(Mandatory = $true)]
    [AllowEmptyCollection()]
    [object[]]$Commands
  )

  $map = @{}

  foreach ($item in @($DraftItems)) {
    $key = Normalize-Word -Value $item.ingredient_key
    $map[$key] = [PSCustomObject]@{
      ingredient_key = $item.ingredient_key
      ingredient_name = $item.ingredient_name
      quantity = [double]$item.quantity
      unit = if ($item.PSObject.Properties["unit"] -and -not [string]::IsNullOrWhiteSpace($item.unit)) { $item.unit } else { "ea" }
      source = if ($item.PSObject.Properties["source"]) { $item.source } else { "chat_text" }
      confidence = if ($item.PSObject.Properties["confidence"]) { $item.confidence } else { "medium" }
      updated_at = if ($item.PSObject.Properties["updated_at"]) { $item.updated_at } else { (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK") }
    }
  }

  foreach ($command in @($Commands)) {
    $key = Normalize-Word -Value $command.ingredient_key
    $qty = if ($null -eq $command.quantity) { 1.0 } else { [double]$command.quantity }

    if ($command.action -eq "add") {
      if (-not $map.ContainsKey($key)) {
        $map[$key] = [PSCustomObject]@{
          ingredient_key = $command.ingredient_key
          ingredient_name = $command.ingredient_name
          quantity = 0.0
          unit = if ([string]::IsNullOrWhiteSpace($command.unit)) { "ea" } else { $command.unit }
          source = $command.source
          confidence = $command.confidence
          updated_at = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
        }
      }

      $entry = $map[$key]
      $entry.quantity = [math]::Round(([double]$entry.quantity + $qty), 2)
      $entry.updated_at = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
      continue
    }

    if ($command.action -eq "remove" -and $map.ContainsKey($key)) {
      if ($command.remove_all -eq $true) {
        $map.Remove($key)
        continue
      }

      $entry = $map[$key]
      $entry.quantity = [math]::Round(([double]$entry.quantity - $qty), 2)
      if ($entry.quantity -le 0) {
        $map.Remove($key)
      }
      else {
        $entry.updated_at = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ssK")
      }
    }
  }

  $result = @($map.Values | Sort-Object -Property ingredient_name)
  return @($result)
}

function Get-DraftSummary {
  param(
    [Parameter(Mandatory = $true)]
    [AllowEmptyCollection()]
    [object[]]$DraftItems
  )

  $sum = 0
  $measure = $DraftItems | Measure-Object -Property quantity -Sum
  if ($null -ne $measure -and $measure.PSObject.Properties["Sum"] -and $null -ne $measure.Sum) {
    $sum = [double]$measure.Sum
  }

  return [PSCustomObject]@{
    item_count = @($DraftItems).Count
    total_quantity = [math]::Round(([double]$sum), 2)
  }
}

function Clear-IngredientLexiconCache {
  $script:IngredientLexiconCache = $null
  $script:IngredientAliasCatalogCache = $null
}

Export-ModuleMember -Function `
  Parse-ConversationCommands, `
  Apply-ConversationCommandsToDraft, `
  Get-DraftSummary, `
  Get-IngredientCatalogEntries, `
  Search-IngredientCatalog, `
  Add-IngredientAliasOverride, `
  Clear-IngredientLexiconCache
