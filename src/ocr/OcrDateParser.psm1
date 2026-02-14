Set-StrictMode -Version Latest

function Convert-MatchToDate {
  param(
    [Parameter(Mandatory = $true)]
    [System.Text.RegularExpressions.Match]$Match
  )

  $yearText = $Match.Groups["year"].Value
  $monthText = $Match.Groups["month"].Value
  $dayText = $Match.Groups["day"].Value

  $year = [int]$yearText
  if ($yearText.Length -eq 2) {
    # OCR 2-digit year is treated as 20xx for current consumer products.
    $year = 2000 + $year
  }

  $month = [int]$monthText
  $day = [int]$dayText

  try {
    return [datetime]::new($year, $month, $day)
  }
  catch {
    return $null
  }
}

function Parse-OcrExpirationDate {
  param(
    [Parameter(Mandatory = $true)]
    [string]$RawText
  )

  if ([string]::IsNullOrWhiteSpace($RawText)) {
    throw "raw_text is required."
  }

  $normalized = $RawText.ToUpperInvariant()

  $keywordPatterns = @(
    "(EXP|EXPIRY|EXPIRES|BEST\s*BEFORE|USE\s*BY)\D*(?<year>\d{2,4})[.\-\/](?<month>\d{1,2})[.\-\/](?<day>\d{1,2})",
    "(EXP|EXPIRY|EXPIRES|BEST\s*BEFORE|USE\s*BY)\D*(?<year>\d{2,4})(?<month>\d{2})(?<day>\d{2})"
  )

  foreach ($pattern in $keywordPatterns) {
    $keywordMatch = [regex]::Match($normalized, $pattern)
    if ($keywordMatch.Success) {
      $parsedKeywordDate = Convert-MatchToDate -Match $keywordMatch
      if ($null -ne $parsedKeywordDate) {
        return [PSCustomObject]@{
          parsed_expiration_date = $parsedKeywordDate.ToString("yyyy-MM-dd")
          parser_confidence = "high"
          matched_pattern = "keyword_date"
          raw_match = $keywordMatch.Value
        }
      }
    }
  }

  $genericPatterns = @(
    "(?<year>\d{4})[.\-\/](?<month>\d{1,2})[.\-\/](?<day>\d{1,2})",
    "(?<year>\d{2})[.\-\/](?<month>\d{1,2})[.\-\/](?<day>\d{1,2})",
    "(?<year>\d{4})(?<month>\d{2})(?<day>\d{2})"
  )

  $dates = @()
  foreach ($pattern in $genericPatterns) {
    $matches = [regex]::Matches($normalized, $pattern)
    foreach ($match in $matches) {
      $parsedDate = Convert-MatchToDate -Match $match
      if ($null -ne $parsedDate) {
        $dates += [PSCustomObject]@{
          date = $parsedDate
          raw = $match.Value
        }
      }
    }
    if ($dates.Count -gt 0) {
      break
    }
  }

  if ($dates.Count -eq 0) {
    return [PSCustomObject]@{
      parsed_expiration_date = $null
      parser_confidence = "none"
      matched_pattern = $null
      raw_match = $null
    }
  }

  $today = (Get-Date).Date
  $futureDates = @($dates | Where-Object { $_.date -ge $today } | Sort-Object -Property date)
  $selected = $null
  if ($futureDates.Count -gt 0) {
    $selected = $futureDates[0]
  }
  else {
    # If all dates are in the past, return the latest detected date for manual user verification.
    $selected = ($dates | Sort-Object -Property date -Descending | Select-Object -First 1)
  }

  return [PSCustomObject]@{
    parsed_expiration_date = $selected.date.ToString("yyyy-MM-dd")
    parser_confidence = "medium"
    matched_pattern = "generic_date"
    raw_match = $selected.raw
  }
}

Export-ModuleMember -Function Parse-OcrExpirationDate
