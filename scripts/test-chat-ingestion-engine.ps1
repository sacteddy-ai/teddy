Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$modulePath = Join-Path $PSScriptRoot "..\src\chat\ChatIngestionEngine.psm1"
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

function Run-Tests {
  $phrase = "this is tofu. this is kimchi. this is bacon. this is egg."
  $parsed = Parse-ConversationCommands -Text $phrase
  Assert-True -Condition (@($parsed.commands).Count -ge 4) -Message "Should detect ingredients from chat phrase"

  $draft = Apply-ConversationCommandsToDraft -DraftItems @() -Commands @($parsed.commands)
  $draftKeys = @($draft | ForEach-Object { $_.ingredient_key })
  Assert-True -Condition ($draftKeys -contains "tofu") -Message "Draft should include tofu"
  Assert-True -Condition ($draftKeys -contains "kimchi") -Message "Draft should include kimchi"
  Assert-True -Condition ($draftKeys -contains "bacon") -Message "Draft should include bacon"
  Assert-True -Condition ($draftKeys -contains "egg") -Message "Draft should include egg"

  $remove = Parse-ConversationCommands -Text "remove kimchi"
  $draft2 = Apply-ConversationCommandsToDraft -DraftItems $draft -Commands @($remove.commands)
  $draftKeys2 = @($draft2 | ForEach-Object { $_.ingredient_key })
  Assert-True -Condition (-not ($draftKeys2 -contains "kimchi")) -Message "Remove command should remove kimchi"

  $final = Parse-ConversationCommands -Text "finish"
  Assert-True -Condition ($final.finalize_requested -eq $true) -Message "Finish text should request finalize"

  $visionParsed = Parse-ConversationCommands -VisionDetectedItems @("egg", "milk", "unknown sauce")
  $visionDraft = Apply-ConversationCommandsToDraft -DraftItems @() -Commands @($visionParsed.commands)
  Assert-True -Condition (@($visionDraft).Count -ge 3) -Message "Vision items should be added to draft"

  $emptyVision = Parse-ConversationCommands -Text "tofu" -VisionDetectedItems @()
  Assert-True -Condition (@($emptyVision.commands).Count -ge 1) -Message "Empty vision array should not fail binding"

  $potatoParsed = Parse-ConversationCommands -Text "potato"
  Assert-True -Condition (@($potatoParsed.commands | Where-Object { $_.ingredient_key -eq "potato" }).Count -eq 1) -Message "Potato should be recognized"

  $koreanText = ([char]0xC774).ToString()+([char]0xAC70)+([char]0xB294)+' '+([char]0xAE40)+([char]0xCE58)+([char]0xACE0)+' '+([char]0xC800)+([char]0xAC70)+([char]0xB294)+' '+([char]0xB450)+([char]0xBD80)+([char]0xACE0)+' '+([char]0xC774)+([char]0xAC70)+([char]0xB294)+' '+([char]0xAC10)+([char]0xC790)+([char]0xC57C)
  $koreanParsed = Parse-ConversationCommands -Text $koreanText -VisionDetectedItems @()
  Assert-True -Condition (@($koreanParsed.commands | Where-Object { $_.ingredient_key -eq "kimchi" }).Count -eq 1) -Message "Korean kimchi phrase should be recognized"
  Assert-True -Condition (@($koreanParsed.commands | Where-Object { $_.ingredient_key -eq "tofu" }).Count -eq 1) -Message "Korean tofu phrase should be recognized"
  Assert-True -Condition (@($koreanParsed.commands | Where-Object { $_.ingredient_key -eq "potato" }).Count -eq 1) -Message "Korean potato phrase should be recognized"

  $sweetPotatoText = ([char]0xC774).ToString()+([char]0xAC70)+([char]0xB294)+' '+([char]0xACE0)+([char]0xAD6C)+([char]0xB9C8)+([char]0xC57C)
  $sweetPotatoParsed = Parse-ConversationCommands -Text $sweetPotatoText -VisionDetectedItems @()
  Assert-True -Condition (@($sweetPotatoParsed.commands | Where-Object { $_.ingredient_key -eq "sweet_potato" }).Count -eq 1) -Message "Korean sweet potato phrase should be recognized"
  Assert-True -Condition (@($sweetPotatoParsed.commands | Where-Object { $_.ingredient_key -eq "sweet_potato" -and $_.action -eq "add" }).Count -eq 1) -Message "Korean sweet potato phrase should stay add action"

  $godeulText = ([char]0xC774).ToString()+([char]0xAC70)+([char]0xB294)+' '+([char]0xACE0)+([char]0xB4E4)+([char]0xBE7C)+([char]0xAE30)+([char]0xC57C)
  $godeulParsed = Parse-ConversationCommands -Text $godeulText -VisionDetectedItems @()
  Assert-True -Condition (@($godeulParsed.commands | Where-Object { $_.ingredient_key -eq "godeulppaegi" }).Count -eq 1) -Message "Korean godeulppaegi phrase should be recognized"
  Assert-True -Condition (@($godeulParsed.commands | Where-Object { $_.ingredient_key -eq "godeulppaegi" -and $_.action -eq "add" }).Count -eq 1) -Message "Korean godeulppaegi phrase should stay add action"

  $globalParsed = Parse-ConversationCommands -Text "this is camote. this is godeulppaegi."
  Assert-True -Condition (@($globalParsed.commands | Where-Object { $_.ingredient_key -eq "sweet_potato" }).Count -eq 1) -Message "Global alias camote should map to sweet_potato"
  Assert-True -Condition (@($globalParsed.commands | Where-Object { $_.ingredient_key -eq "godeulppaegi" }).Count -eq 1) -Message "Romanized alias godeulppaegi should be recognized"

  $fuzzyParsed = Parse-ConversationCommands -Text "this is swet potato"
  $fuzzyCommandHits = @($fuzzyParsed.commands | Where-Object { $_.ingredient_key -eq "sweet_potato" }).Count
  $fuzzyReviewHits = @($fuzzyParsed.review_candidates | Where-Object {
      @($_.candidates | Where-Object { $_.ingredient_key -eq "sweet_potato" }).Count -ge 1
    }).Count
  $fuzzyUnknownSwetHits = @($fuzzyParsed.review_candidates | Where-Object { $_.phrase -match "swet" }).Count
  Assert-True -Condition (($fuzzyCommandHits -ge 1) -or ($fuzzyReviewHits -ge 1) -or ($fuzzyUnknownSwetHits -ge 1)) -Message "Fuzzy typo swet potato should be mapped or surfaced for review"

  $koreanRemoveText = ([char]0xAE40).ToString()+([char]0xCE58)+' '+([char]0xBE7C)+([char]0xC918)
  $koreanRemoveParsed = Parse-ConversationCommands -Text $koreanRemoveText -VisionDetectedItems @()
  Assert-True -Condition (@($koreanRemoveParsed.commands | Where-Object { $_.ingredient_key -eq "kimchi" -and $_.action -eq "remove" }).Count -eq 1) -Message "Korean remove phrase should map to remove action"

  $seafoodText = ([char]0xAC04).ToString()+([char]0xC7A5)+([char]0xAC8C)+([char]0xC7A5)+', '+([char]0xBAA8)+([char]0xC2DC)+([char]0xC870)+([char]0xAC1C)+' '+([char]0xAE40)+([char]0xCE58)
  $seafoodParsed = Parse-ConversationCommands -Text $seafoodText -VisionDetectedItems @()
  Assert-True -Condition (@($seafoodParsed.commands | Where-Object { $_.ingredient_key -eq "ganjang_gejang" }).Count -eq 1) -Message "Korean ganjang gejang should be recognized"
  Assert-True -Condition (@($seafoodParsed.commands | Where-Object { $_.ingredient_key -eq "mosi_clam" }).Count -eq 1) -Message "Korean mosi clam should be recognized"
  Assert-True -Condition (@($seafoodParsed.commands | Where-Object { $_.ingredient_key -eq "kimchi" }).Count -eq 1) -Message "Kimchi in mixed seafood phrase should be recognized"

  $unknownParsed = Parse-ConversationCommands -Text "zzregionalfoodcandidate"
  Assert-True -Condition (@($unknownParsed.commands).Count -eq 0) -Message "Unknown ingredient text should not auto-create command"
  Assert-True -Condition (@($unknownParsed.review_candidates).Count -ge 1) -Message "Unknown ingredient text should create review candidates"

  $mixedKnownUnknownParsed = Parse-ConversationCommands -Text "bacon zzregionalfoodcandidate"
  Assert-True -Condition (@($mixedKnownUnknownParsed.commands | Where-Object { $_.ingredient_key -eq "bacon" }).Count -eq 1) -Message "Known ingredient should be detected in mixed phrase"
  Assert-True -Condition (@($mixedKnownUnknownParsed.review_candidates | Where-Object { $_.phrase -match "zzregionalfoodcandidate" }).Count -ge 1) -Message "Unknown ingredient should still create review candidate in mixed phrase"

  $koreanMixedUnknownText = ([char]0xC774).ToString()+([char]0xAC70)+([char]0xB294)+' '+([char]0xB9C8)+([char]0xB298)+([char]0xC9F1)+([char]0xC544)+([char]0xCE58)+([char]0xC774)+([char]0xACE0)+' '+([char]0xC774)+([char]0xAC70)+([char]0xB294)+' '+([char]0xC8FC)+([char]0xD0A4)+([char]0xB2C8)+([char]0xD638)+([char]0xBC15)+([char]0xC774)+([char]0xC57C)+' '+([char]0xC774)+([char]0xAC70)+([char]0xB294)+' '+([char]0xC30D)+([char]0xBB34)
  $koreanMixedUnknownParsed = Parse-ConversationCommands -Text $koreanMixedUnknownText
  $koreanReviewPhrases = @($koreanMixedUnknownParsed.review_candidates | ForEach-Object { $_.phrase })
  Assert-True -Condition (@($koreanReviewPhrases | Where-Object { $_ -eq (([char]0xB9C8).ToString()+([char]0xB298)+([char]0xC9F1)+([char]0xC544)+([char]0xCE58)) }).Count -eq 1) -Message "Korean unknown phrase should be normalized without trailing particles (ma-neul-jjang-a-chi)"
  Assert-True -Condition (@($koreanReviewPhrases | Where-Object { $_ -eq (([char]0xC8FC).ToString()+([char]0xD0A4)+([char]0xB2C8)+([char]0xD638)+([char]0xBC15)) }).Count -eq 1) -Message "Korean unknown phrase should be normalized without trailing particles (zukini hobak)"
  Assert-True -Condition (@($koreanReviewPhrases | Where-Object { $_ -eq (([char]0xC30D).ToString()+([char]0xBB34)) }).Count -eq 1) -Message "Korean unknown phrase should keep core noun (ssangmu)"
  Assert-True -Condition (@($koreanReviewPhrases | Where-Object { $_ -match (([char]0xC774).ToString()+([char]0xACE0)) -or $_ -match (([char]0xC774).ToString()+([char]0xAC70)+([char]0xB294)) -or $_ -match (([char]0xC774).ToString()+([char]0xC57C)) }).Count -eq 0) -Message "Korean review phrases should not include connector/pronoun particles"
  Assert-True -Condition (@($koreanReviewPhrases | Where-Object { $_ -match " " }).Count -eq 0) -Message "Korean review phrases should not merge separate ingredient nouns"

  $summary = Get-DraftSummary -DraftItems $visionDraft
  Assert-True -Condition ($summary.item_count -ge 3) -Message "Draft summary should have item count"

  Write-Host "Chat ingestion engine tests passed."
}

Run-Tests
