param([string]$ManifestPath, [string]$OutputRoot)

$ErrorActionPreference = 'Stop'

function Get-DatasheetUri([string]$Text) {
    if ([string]::IsNullOrWhiteSpace($Text) -or $Text.Length -gt 4096 -or $Text -match '[\x00-\x20\x7f]') { throw 'Invalid URL.' }
    $taskUri = $null
    if (-not [Uri]::TryCreate($Text, [UriKind]::Absolute, [ref]$taskUri) -or
        $taskUri.Scheme -ne 'https' -or $taskUri.UserInfo -or $taskUri.Port -ne 443 -or
        $taskUri.DnsSafeHost -notin @('pim.murata.com', 'search.murata.co.jp', 'www.murata.com')) {
        throw 'Only supported Murata HTTPS hosts on port 443 are allowed.'
    }
    return $taskUri
}
function Open-DatasheetResponse([Uri]$Uri) {
    $taskRequest = [Net.HttpWebRequest]::Create($Uri)
    $taskRequest.Method = 'GET'
    $taskRequest.AllowAutoRedirect = $false
    $taskRequest.Timeout = 30000
    $taskRequest.ReadWriteTimeout = 30000
    $taskRequest.UserAgent = 'Passive-PN-Translator/2.6.3'
    $taskRequest.UseDefaultCredentials = $false
    try { $taskResponse = $taskRequest.GetResponse() }
    catch [Net.WebException] {
        if ($_.Exception.Response) {
            $taskHttpStatus = [int]$_.Exception.Response.StatusCode
            $_.Exception.Response.Close()
            throw ('Unexpected HTTP status: ' + $taskHttpStatus)
        }
        throw
    }
    try {
        return [pscustomobject]@{ Status = [int]$taskResponse.StatusCode; Location = $taskResponse.Headers['Location']; Length = $taskResponse.ContentLength; Stream = $taskResponse.GetResponseStream(); Response = $taskResponse }
    } catch { $taskResponse.Close(); throw }
}
function Save-DatasheetPdf([string]$Url, [string]$Target) {
    $taskUri = Get-DatasheetUri $Url
    $taskResponse = $null
    $taskStream = $null
    $taskTemp = $Target + '.partial'
    $taskCreated = $false
    try {
        for ($taskHop = 0; $taskHop -le 5; $taskHop++) {
          try {
            $taskResponse = Open-DatasheetResponse $taskUri
            if ($taskResponse.Status -in @(301, 302, 303, 307, 308)) {
                if ($taskHop -eq 5 -or -not $taskResponse.Location) { throw 'Too many redirects or missing redirect URL.' }
                $taskNext = [Uri]::new($taskUri, [string]$taskResponse.Location)
                $taskUri = Get-DatasheetUri $taskNext.AbsoluteUri
                continue
            }
            if ($taskResponse.Status -ne 200) { throw ('Unexpected HTTP status: ' + $taskResponse.Status) }
            if ($taskResponse.Length -gt 52428800) { throw 'PDF exceeds the 50MB limit.' }
            if (Test-Path -LiteralPath $Target) { throw 'Output file already exists.' }
            $taskStream = [IO.File]::Open($taskTemp, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write)
            $taskCreated = $true
            $taskBuffer = New-Object byte[] 65536
            $taskTotal = 0L
            $taskPrefix = New-Object IO.MemoryStream
            try {
                while (($taskRead = $taskResponse.Stream.Read($taskBuffer, 0, $taskBuffer.Length)) -gt 0) {
                    $taskTotal += $taskRead
                    if ($taskTotal -gt 52428800) { throw 'PDF exceeds the 50MB limit.' }
                    if ($taskPrefix.Length -lt 1024) { $taskPrefix.Write($taskBuffer, 0, [Math]::Min($taskRead, 1024 - [int]$taskPrefix.Length)) }
                    $taskStream.Write($taskBuffer, 0, $taskRead)
                }
                if ($taskResponse.Length -ge 0 -and $taskTotal -ne $taskResponse.Length) { throw 'Incomplete response.' }
                $taskHeader = [Text.Encoding]::ASCII.GetString($taskPrefix.ToArray())
                if ($taskTotal -eq 0 -or -not $taskHeader.StartsWith('%PDF-')) { throw 'Response is not a PDF; a login or error page may have been returned.' }
            } finally { $taskPrefix.Dispose() }
            $taskStream.Dispose(); $taskStream = $null
            [IO.File]::Move($taskTemp, $Target)
            $taskCreated = $false
            return $taskTotal
        } finally {
            if ($taskResponse) {
                $taskResponse.Stream.Dispose()
                if ($taskResponse.Response) { $taskResponse.Response.Close() }
                $taskResponse = $null
            }
        }
        }
    } finally {
        if ($taskStream) { $taskStream.Dispose() }
        if ($taskCreated -and (Test-Path -LiteralPath $taskTemp)) { Remove-Item -LiteralPath $taskTemp -Force }
    }
}
function Invoke-DatasheetBatch([string]$PlanPath, [string]$DestinationRoot) {
    if (-not (Test-Path -LiteralPath $PlanPath -PathType Leaf) -or (Get-Item -LiteralPath $PlanPath).Length -gt 10485760) { throw 'Choose the downloaded datasheet manifest JSON (maximum 10MB).' }
    $taskEncoding = New-Object Text.UTF8Encoding($false, $true)
    $taskText = $taskEncoding.GetString([IO.File]::ReadAllBytes((Resolve-Path -LiteralPath $PlanPath).ProviderPath)).TrimStart([char]0xFEFF)
    $taskPlan = $taskText | ConvertFrom-Json
    if ($taskPlan.format -ne 'pnrep-datasheet-download-v1' -or $taskPlan.scope -notin @('displayed-normal', 'selected') -or
        $taskPlan.entries -isnot [Array] -or $taskPlan.partNumbers -isnot [Array] -or
        $taskPlan.entries.Count -gt 1000 -or $taskPlan.partNumbers.Count -gt 1000 -or $taskPlan.partNumbers.Count -eq 0) { throw 'Invalid manifest format, scope or count.' }
    $taskKnownParts = @{}
    foreach ($taskPart in $taskPlan.partNumbers) {
        if ($taskPart -isnot [string] -or $taskPart.Length -gt 200 -or -not $taskPart -or $taskKnownParts.ContainsKey($taskPart)) { throw 'Invalid or duplicate part number.' }
        $taskKnownParts[$taskPart] = $true
    }
    $taskSeen = @{}
    foreach ($taskEntry in $taskPlan.entries) {
        if ($taskEntry.url -isnot [string]) { throw 'Invalid URL type.' }
        $taskUri = Get-DatasheetUri $taskEntry.url
        if ($taskSeen.ContainsKey($taskUri.AbsoluteUri)) { throw 'Duplicate URL in manifest.' }
        $taskSeen[$taskUri.AbsoluteUri] = $true
        if ($taskEntry.partNumbers -isnot [Array] -or $taskEntry.partNumbers.Count -eq 0) { throw 'Missing associated part numbers.' }
        foreach ($taskPart in $taskEntry.partNumbers) { if ($taskPart -isnot [string] -or -not $taskKnownParts.ContainsKey($taskPart)) { throw 'Unknown part number in entry.' } }
    }
    if ($taskPlan.entries.Count -eq 0) { throw 'No downloadable links. No network request was made.' }
    if (-not $DestinationRoot) { $DestinationRoot = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Murata_Datasheets' }
    [void](New-Item -ItemType Directory -Path $DestinationRoot -Force)
    $taskRun = Join-Path ([IO.Path]::GetFullPath($DestinationRoot)) ('download-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N').Substring(0, 8))
    [void](New-Item -ItemType Directory -Path $taskRun)
    $taskRows = New-Object 'Collections.Generic.List[object]'
    $taskUtf8 = New-Object Text.UTF8Encoding($true)
    $taskIndex = 0
    foreach ($taskEntry in $taskPlan.entries) {
        $taskIndex++
        $taskSafeName = ([string]$taskEntry.partNumbers[0] -replace '[^A-Za-z0-9_-]', '_')
        if ($taskSafeName.Length -gt 80) { $taskSafeName = $taskSafeName.Substring(0, 80) }
        $taskFileName = ('{0:D4}_{1}.pdf' -f $taskIndex, $taskSafeName)
        $taskTarget = Join-Path $taskRun $taskFileName
        $taskStatus = 'failed'; $taskReason = ''; $taskSize = 0L
        try {
            Write-Output ('Downloading ' + $taskIndex + '/' + $taskPlan.entries.Count + ': ' + $taskEntry.partNumbers[0])
            $taskSize = Save-DatasheetPdf $taskEntry.url $taskTarget
            $taskStatus = 'downloaded'
        } catch {
            # Do not log redirect URLs, credentials or response bodies.
            $taskReason = 'Download failed. Check company network access, PDF availability and permissions; retry later.'
            if ($_.Exception.Response) { $taskReason = 'HTTP ' + [int]$_.Exception.Response.StatusCode }
            elseif ($_.Exception.Message -match '^(Unexpected HTTP status:|PDF exceeds|Incomplete response|Response is not a PDF|Only supported|Too many redirects)') { $taskReason = $_.Exception.Message }
            Write-Warning ('Failed: ' + $taskFileName)
        }
        $taskRows.Add([pscustomobject]@{ partNumbers = @($taskEntry.partNumbers); url = $taskEntry.url; file = $(if ($taskStatus -eq 'downloaded') { $taskFileName } else { $null }); status = $taskStatus; bytes = $taskSize; reason = $taskReason })
        $taskReport = [pscustomobject]@{ format = 'pnrep-datasheet-download-result-v1'; generatedAt = [DateTime]::UtcNow.ToString('o'); scope = $taskPlan.scope; requestedParts = @($taskPlan.partNumbers); missingPartNumbers = @($taskPlan.missingPartNumbers); rejectedLinks = @($taskPlan.rejectedLinks); results = @($taskRows.ToArray()); downloaded = @($taskRows | Where-Object { $_.status -eq 'downloaded' }).Count; failed = @($taskRows | Where-Object { $_.status -eq 'failed' }).Count; pdfContentVerified = $false }
        [IO.File]::WriteAllText((Join-Path $taskRun 'download-results.json'), ($taskReport | ConvertTo-Json -Depth 12), $taskUtf8)
    }
    if ($taskPlan.entries.Count -eq 0) { throw 'No downloadable links. No network request was made.' }
    Write-Output ('Saved folder: ' + $taskRun)
    Write-Output ('Downloaded: ' + $taskReport.downloaded + '; failed: ' + $taskReport.failed + '; missing links: ' + @($taskPlan.missingPartNumbers).Count)
    Write-Output 'PDF files are from source links. Download success does not certify specifications or suitability.'
    return $taskRun
}
# Dot-sourcing defines functions for local verification without starting a download.
if ($MyInvocation.InvocationName -ne '.') {
    if (-not $ManifestPath) {
        Add-Type -AssemblyName System.Windows.Forms
        $taskDialog = New-Object Windows.Forms.OpenFileDialog
        $taskDialog.Title = 'Select the datasheet manifest JSON downloaded by the webpage'
        $taskDialog.Filter = 'JSON (*.json)|*.json'
        try { if ($taskDialog.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) { return }; $ManifestPath = $taskDialog.FileName } finally { $taskDialog.Dispose() }
    }
    Invoke-DatasheetBatch $ManifestPath $OutputRoot
}
