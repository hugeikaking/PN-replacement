[CmdletBinding()]
param(
    [string]$OutputDirectory = (Join-Path $env:USERPROFILE 'Desktop\Murata_Data_Check'),
    [ValidateRange(1000,1000000)][int]$ScanBatchSize = 100000,
    [ValidateSet('GRM','GCM','KRM')][string[]]$TargetSeries = @('GRM','KRM')
)
$ErrorActionPreference = 'Stop'
$extract = Join-Path $PSScriptRoot 'Test-MurataDatabase.ps1'
$review = Join-Path $PSScriptRoot 'Review-MurataDataCheck.ps1'
foreach ($script in @($extract,$review)) {
    if (-not (Test-Path -LiteralPath $script -PathType Leaf)) { throw "Keep all three scripts in one folder. Missing: $script" }
}
if (-not (Select-String -LiteralPath $extract -SimpleMatch 'ToolVersion=3' -Quiet)) { throw 'Extraction script is outdated. Replace it with the v3 package.' }
$latest = Get-ChildItem -LiteralPath $OutputDirectory -Directory | Where-Object Name -like 'check-*' | Sort-Object CreationTimeUtc,Name -Descending | Select-Object -First 1
if ($null -eq $latest) { throw 'No previous scan found. Run Test-MurataDatabase.ps1 first.' }
$summaryPath = Join-Path $latest.FullName 'run-summary.json'
if (-not (Test-Path -LiteralPath $summaryPath -PathType Leaf)) { throw 'Latest scan is incomplete or still running. Do not continue yet.' }
$previous = Get-Content -LiteralPath $summaryPath -Raw -Encoding UTF8 | ConvertFrom-Json
if ($previous.Completed -isnot [bool] -or -not $previous.Completed) { throw 'Latest scan failed. Resolve that run before continuing.' }
if ($previous.StopReason -eq 'end-of-products') { throw 'Previous scan already reached the end. Review existing reports; continuation will not find additional products.' }
$source = Get-Item -LiteralPath $previous.Source
if ($source.PSIsContainer -or $source.Length -ne $previous.SourceBytes -or $source.LastWriteTimeUtc.ToString('o') -ne $previous.SourceModifiedUtc) { throw 'Source file size/date differs from the previous scan. Start a new scan from index zero.' }
$start = 0L
if ($null -ne $previous.LastProductIndex) { $start = [long]$previous.LastProductIndex }
else { $start = [long]$previous.Scanned }
if ($start -lt 0 -or $start -gt 10000000) { throw 'Invalid continuation index.' }
Write-Host "Continuation v3; previous results: $($latest.FullName)"
Write-Host "Skip first $start products; scan up to $ScanBatchSize additional products; targets: $($TargetSeries -join ', ')."
Write-Host 'Source stays local. Resume uses file size/date, not a full content hash. Keep the source unchanged.'
$next = & $extract -InputPath $source.FullName -OutputDirectory $OutputDirectory -StartIndex $start -MaxScan $ScanBatchSize -PreviewCount 1000 -DiverseSamples -TargetSeries $TargetSeries -FindMissingSeries
if ($null -eq $next -or [string]::IsNullOrWhiteSpace($next.RunDirectory) -or $next.RunDirectory -eq $latest.FullName) { throw 'No new result folder was created.' }
& $review -RunDirectory $next.RunDirectory
