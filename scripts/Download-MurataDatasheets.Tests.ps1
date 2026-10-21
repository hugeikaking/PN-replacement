$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
. (Join-Path $taskRoot 'deliverables/archive/Murata-Step6-v2_6_3-download/Download-MurataDatasheets.ps1')
$taskFixtureRoot = Join-Path $PSScriptRoot ('.datasheet-tests-' + [Guid]::NewGuid().ToString('N'))
[void](New-Item -ItemType Directory -Path $taskFixtureRoot)
$taskPassed = 0
$script:taskResponses = New-Object 'Collections.Generic.Queue[object]'
$script:taskRequests = New-Object 'Collections.Generic.List[string]'
function Assert-Task([bool]$Ok, [string]$Message) { if (-not $Ok) { throw ('Assertion: ' + $Message) }; $script:taskPassed++ }
function Fail-Task([scriptblock]$Action, [string]$Expected) {
    $taskFailed = $false
    try { & $Action | Out-Null } catch { $taskFailed = $true; Assert-Task ($_.Exception.Message.Contains($Expected)) ('Expected ' + $Expected + '; got ' + $_.Exception.Message) }
    Assert-Task $taskFailed 'Must reject'
}
function Add-TaskResponse([int]$Status = 200, [string]$Text = '%PDF-1.7 synthetic only', [string]$Location = '', [long]$Length = -2) {
    $taskBytes = [Text.Encoding]::ASCII.GetBytes($Text)
    if ($Length -eq -2) { $Length = $taskBytes.Length }
    $script:taskResponses.Enqueue([pscustomobject]@{ Status = $Status; Bytes = $taskBytes; Location = $Location; Length = $Length })
}
function Open-DatasheetResponse([Uri]$Uri) {
    $script:taskRequests.Add($Uri.AbsoluteUri)
    if (-not $script:taskResponses.Count) { throw 'Unexpected mock network request.' }
    $taskMock = $script:taskResponses.Dequeue()
    return [pscustomobject]@{ Status = $taskMock.Status; Stream = [IO.MemoryStream]::new([byte[]]$taskMock.Bytes); Location = $taskMock.Location; Length = $taskMock.Length; Response = $null }
}
$taskUrl = 'https://pim.murata.com/asset/synthetic'
try {
    foreach ($taskBad in @('http://pim.murata.com/a', 'file:///C:/x', 'https://evil.test/a', 'https://pim.murata.com.evil.test/a', 'https://u:p@pim.murata.com/a', 'https://pim.murata.com:8443/a')) { Fail-Task { Get-DatasheetUri $taskBad } 'Only supported' }
    Assert-Task ((Get-DatasheetUri $taskUrl).Host -eq 'pim.murata.com') 'Official HTTPS allowed'
    $taskTarget = Join-Path $taskFixtureRoot 'success.pdf'
    Add-TaskResponse
    $taskBytes = Save-DatasheetPdf $taskUrl $taskTarget
    Assert-Task ((Get-Item -LiteralPath $taskTarget).Length -eq $taskBytes) 'Saved exact mock PDF bytes'
    $taskBefore = [Convert]::ToBase64String([IO.File]::ReadAllBytes($taskTarget))
    Add-TaskResponse
    Fail-Task { Save-DatasheetPdf $taskUrl $taskTarget } 'already exists'
    Assert-Task ([Convert]::ToBase64String([IO.File]::ReadAllBytes($taskTarget)) -eq $taskBefore) 'Existing PDF preserved'

    foreach ($taskCase in @('html', 'truncated', 'oversize', 'http')) {
        $taskTarget = Join-Path $taskFixtureRoot ($taskCase + '.pdf')
        if ($taskCase -eq 'html') { Add-TaskResponse -Text '<html>login %PDF- fake</html>'; $taskExpected = 'not a PDF' }
        if ($taskCase -eq 'truncated') { Add-TaskResponse -Length 500; $taskExpected = 'Incomplete' }
        if ($taskCase -eq 'oversize') { Add-TaskResponse -Length 52428801; $taskExpected = '50MB' }
        if ($taskCase -eq 'http') { Add-TaskResponse -Status 403; $taskExpected = 'HTTP status' }
        Fail-Task { Save-DatasheetPdf $taskUrl $taskTarget } $taskExpected
        Assert-Task (-not (Test-Path -LiteralPath $taskTarget) -and -not (Test-Path -LiteralPath ($taskTarget + '.partial'))) 'Failure publishes no PDF and cleans owned partial'
    }
    Add-TaskResponse -Status 302 -Location 'https://search.murata.co.jp/synthetic.pdf'
    Add-TaskResponse
    $taskTarget = Join-Path $taskFixtureRoot 'redirect.pdf'
    Save-DatasheetPdf $taskUrl $taskTarget | Out-Null
    Assert-Task (Test-Path -LiteralPath $taskTarget) 'Official redirect works'
    $taskBefore = $script:taskRequests.Count
    Add-TaskResponse -Status 302 -Location 'https://evil.test/a'
    Fail-Task { Save-DatasheetPdf $taskUrl (Join-Path $taskFixtureRoot 'unsafe.pdf') } 'Only supported'
    Assert-Task ($script:taskRequests.Count -eq $taskBefore + 1) 'Disallowed redirect never requested'
    for ($taskI = 0; $taskI -lt 6; $taskI++) { Add-TaskResponse -Status 302 -Location '/again' }
    Fail-Task { Save-DatasheetPdf $taskUrl (Join-Path $taskFixtureRoot 'loop.pdf') } 'Too many redirects'
    $taskPartial = Join-Path $taskFixtureRoot 'occupied.pdf.partial'
    [IO.File]::WriteAllText($taskPartial, 'original partial')
    Add-TaskResponse
    Fail-Task { Save-DatasheetPdf $taskUrl (Join-Path $taskFixtureRoot 'occupied.pdf') } 'already exists'
    Assert-Task ([IO.File]::ReadAllText($taskPartial) -eq 'original partial') 'Unowned partial preserved'

    $taskPlan = [ordered]@{ format = 'pnrep-datasheet-download-v1'; scope = 'selected'; generatedAt = 'synthetic'; partNumbers = @('A#', 'B', 'C', 'MISSING'); entries = @(@{ url = $taskUrl + '/a'; partNumbers = @('A#') }, @{ url = $taskUrl + '/b'; partNumbers = @('B') }, @{ url = $taskUrl + '/c'; partNumbers = @('C') }); missingPartNumbers = @('MISSING'); rejectedLinks = @() }
    $taskManifest = Join-Path $taskFixtureRoot 'manifest.json'
    [IO.File]::WriteAllText($taskManifest, ($taskPlan | ConvertTo-Json -Depth 12), [Text.UTF8Encoding]::new($false))
    Add-TaskResponse
    Add-TaskResponse -Text '<html>error</html>'
    Add-TaskResponse
    $taskOutput = @(Invoke-DatasheetBatch $taskManifest (Join-Path $taskFixtureRoot 'output'))[-1]
    $taskReport = [IO.File]::ReadAllText((Join-Path $taskOutput 'download-results.json')) | ConvertFrom-Json
    Assert-Task ($taskReport.downloaded -eq 2 -and $taskReport.failed -eq 1) 'Batch continues after one failed PDF'
    Assert-Task ($taskReport.missingPartNumbers[0] -eq 'MISSING') 'Missing PN retained in report'
    Assert-Task ($taskReport.results[0].file -eq '0001_A_.pdf') 'Safe local filename'
    Assert-Task ($taskReport.results[1].file -eq $null -and $taskReport.results[1].reason.Contains('not a PDF')) 'Failed item has reason and no published file'
    Assert-Task (-not $taskReport.pdfContentVerified) 'Download is not spec certification'
    $taskPlan.entries[0].url = 'https://evil.test/a'
    [IO.File]::WriteAllText($taskManifest, ($taskPlan | ConvertTo-Json -Depth 12), [Text.UTF8Encoding]::new($false))
    $taskBefore = $script:taskRequests.Count
    Fail-Task { Invoke-DatasheetBatch $taskManifest (Join-Path $taskFixtureRoot 'invalid') } 'Only supported'
    Assert-Task ($script:taskRequests.Count -eq $taskBefore) 'Invalid manifest sends nothing'
    Write-Output ('PASS: ' + $taskPassed + ' offline downloader checks; PowerShell ' + $PSVersionTable.PSVersion + '. All HTTP responses are synthetic; no network or company data used.')
} finally {
    $taskResolved = [IO.Path]::GetFullPath($taskFixtureRoot)
    $taskAllowed = [IO.Path]::GetFullPath($PSScriptRoot).TrimEnd('\') + '\'
    if (-not $taskResolved.StartsWith($taskAllowed, [StringComparison]::OrdinalIgnoreCase) -or -not ([IO.Path]::GetFileName($taskResolved)).StartsWith('.datasheet-tests-')) { throw 'Unsafe fixture cleanup path.' }
    Remove-Item -LiteralPath $taskResolved -Recurse -Force
}
