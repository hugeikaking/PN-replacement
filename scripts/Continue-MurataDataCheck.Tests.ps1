$ErrorActionPreference='Stop'
$root=Join-Path ([IO.Path]::GetTempPath()) ('pnrep-continue-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$fixture=Join-Path $root 'synthetic.json'
@{Products=@(
    @{Partno='GCM_OLD_1'; Specs=@{CapacitanceText='10pF'}}
    @{Partno='GCM_OLD_2'; Specs=@{CapacitanceText='0.1uF'}}
    @{Partno='GRM_LATER'; Specs=@{CapacitanceText='10,000pF'}}
    @{Partno='KRM_LATER'; Specs=@{CapacitanceText='4.7uF'}}
)} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $fixture -Encoding UTF8
$extract=Join-Path $PSScriptRoot 'Test-MurataDatabase.ps1'
$continue=Join-Path $PSScriptRoot 'Continue-MurataDataCheck.ps1'
$initial=& $extract -InputPath $fixture -OutputDirectory $root -PreviewCount 1 -MaxScan 2
# The company v2 summary has no offset fields. Confirm the Scanned fallback.
$initialSummaryPath=Join-Path $initial.RunDirectory 'run-summary.json'
$legacy=Get-Content $initialSummaryPath -Raw | ConvertFrom-Json
$legacy.ToolVersion=2
$legacy.PSObject.Properties.Remove('LastProductIndex')
$legacy.PSObject.Properties.Remove('StartIndex')
$legacy.PSObject.Properties.Remove('Skipped')
$legacy | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $initialSummaryPath -Encoding UTF8
$result=& $continue -OutputDirectory $root -ScanBatchSize 1000
$newDir=Split-Path $result.ReportPath
$summary=Get-Content (Join-Path $newDir 'run-summary.json') -Raw | ConvertFrom-Json
if ($summary.Skipped -ne 2 -or $summary.Scanned -ne 2 -or $summary.LastProductIndex -ne 4 -or $result.ErrorCount -ne 0) { throw 'Continuation report/counters failed.' }
if (-not (Test-Path -LiteralPath (Join-Path $initial.RunDirectory 'preview.csv'))) { throw 'Old run was lost.' }
$endFailed=$false
try { & $continue -OutputDirectory $root -ScanBatchSize 1000 } catch { $endFailed=$true }
if (-not $endFailed) { throw 'Latest EOF run was not selected; same-second folder names broke resume.' }
# Use one summary for guard tests, avoiding timestamp ties in newest-directory selection.
$guards=Join-Path $root 'guards'
$guardDir=Join-Path $guards 'check-20000101-000000-guard'
New-Item -ItemType Directory -Path $guardDir -Force | Out-Null
$guardPath=Join-Path $guardDir 'run-summary.json'
foreach ($state in @('failed','changed','eof')) {
    $guard=Get-Content (Join-Path $initial.RunDirectory 'run-summary.json') -Raw | ConvertFrom-Json
    if ($state -eq 'failed') { $guard.Completed=$false }
    if ($state -eq 'changed') { $guard.SourceBytes++ }
    if ($state -eq 'eof') { $guard.StopReason='end-of-products' }
    $guard | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath $guardPath -Encoding UTF8
    $failed=$false
    try { & $continue -OutputDirectory $guards -ScanBatchSize 1000 } catch { $failed=$true }
    if (-not $failed) { throw "Continuation accepted invalid state: $state" }
}
Write-Host 'PASS: continuation, legacy offset, local report, original files and failed/changed/EOF guards.'
