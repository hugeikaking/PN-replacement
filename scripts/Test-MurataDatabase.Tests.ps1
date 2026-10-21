$ErrorActionPreference = 'Stop'
$scriptPath = Join-Path $PSScriptRoot 'Test-MurataDatabase.ps1'
$root = Join-Path ([IO.Path]::GetTempPath()) ('pnrep-validation-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
# Synthetic fixtures only: no claim that these are actual official products.
$items = @(
    @{Partno='DK1_TEST'; Specs=@{CapacitanceText='10pF'; RatedVoltageAC=250; TemperatureCharacteristics='SL'}; ComplianceInfo=@{AecQ200Support=$false}; ProductName='quote " brace } slash \'; MediaFileUrls=@{SpecificationsSheet=@('https://example.invalid/a')}}
    @{Partno='GRM_TEST'; Specs=@{Capacitance=100000; CapacitanceText='100nF'; RatedVoltageDCText='16V'; SizeCodeInInch='0402'; TemperatureCharacteristics='X7R'}; ComplianceInfo=@{AecQ200Support=$false}}
    @{Partno='GCM_TEST'; Specs=@{CapacitanceText='1uF'; RatedVoltageDCText='25V'}; ComplianceInfo=@{AecQ200Support=$true}}
    @{Partno='KRM_TEST'; Specs=@{CapacitanceText='4.7uF'; RatedVoltageDCText='50V'}}
)
$fixture = Join-Path $root 'synthetic.json'
@{Metadata=@{Products='decoy'; Nested=@(1,2)}; Products=$items; Footer='done'} | ConvertTo-Json -Depth 20 -Compress | Set-Content -LiteralPath $fixture -Encoding UTF8
& $scriptPath -InputPath $fixture -OutputDirectory (Join-Path $root 'complete') -PreviewCount 2 -MaxScan 10 -SamplesPerSeries 1
$run = Get-ChildItem (Join-Path $root 'complete') -Directory | Select-Object -First 1
$summary = Get-Content (Join-Path $run.FullName 'run-summary.json') -Raw | ConvertFrom-Json
$rows = @(Import-Csv (Join-Path $run.FullName 'preview.csv'))
$samples = @(Import-Csv (Join-Path $run.FullName 'series-samples.csv'))
if ($summary.Scanned -ne 4 -or $rows.Count -ne 2 -or $samples.Count -ne 4) { throw 'Counts failed.' }
if ($rows[0].'ComplianceInfo.AecQ200Support' -ne 'False') { throw 'False AEC flag was lost.' }
if ($rows[0].'Specs.RatedVoltageDC' -ne '' -or $rows[0].'Specs.RatedVoltageAC' -ne '250') { throw 'AC/DC distinction failed.' }
$raw = @(Get-Content (Join-Path $run.FullName 'selected-products.jsonl') | ForEach-Object { $_ | ConvertFrom-Json })
if ($raw[0].ProductName -ne $items[0].ProductName) { throw 'Escapes failed.' }
# Scan cap: missing series must remain missing, no invented samples.
& $scriptPath -InputPath $fixture -OutputDirectory (Join-Path $root 'limited') -PreviewCount 1 -MaxScan 1 -SamplesPerSeries 1
# EOF and root-footer validation.
& $scriptPath -InputPath $fixture -OutputDirectory (Join-Path $root 'eof') -PreviewCount 5 -MaxScan 10 -SamplesPerSeries 2
$eofRun = Get-ChildItem (Join-Path $root 'eof') -Directory | Select-Object -First 1
$eofSummary = Get-Content (Join-Path $eofRun.FullName 'run-summary.json') -Raw | ConvertFrom-Json
if ($eofSummary.StopReason -ne 'end-of-products' -or $eofSummary.PreviewRows -ne 4) { throw 'EOF failed.' }
foreach ($bad in @('{"Products":[{"Partno":"BROKEN"}', '{"Products":[{"Partno":"VALID"},]}', '{"Other":[]}')) {
    $badFile = Join-Path $root ([guid]::NewGuid().ToString('N') + '.json')
    Set-Content -LiteralPath $badFile -Value $bad -Encoding UTF8
    $failed=$false
    try { & $scriptPath -InputPath $badFile -OutputDirectory (Join-Path $root 'bad') -PreviewCount 5 -MaxScan 10 -SamplesPerSeries 2 } catch { $failed=$true }
    if (-not $failed) { throw 'Malformed input incorrectly succeeded.' }
}
# Repeated packaging variants must not fill the diversity quota before nF/uF.
$diverseItems = @(
    @{Partno='GCM_PF_A'; Specs=@{CapacitanceText='10pF'}}
    @{Partno='GCM_PF_B'; Specs=@{CapacitanceText='10pF'}}
    @{Partno='GCM_UNKNOWN_A'; Specs=@{Capacitance=0.000001}}
    @{Partno='GCM_UNKNOWN_B'; Specs=@{CapacitanceText='not a unit'}}
    @{Partno='GCM_NF'; Specs=@{CapacitanceText='100nF'}}
    @{Partno='GCM_UF'; Specs=@{CapacitanceText=('1' + [char]0x00b5 + 'F')}}
    @{Partno='GCM_UF_B'; Specs=@{CapacitanceText=('2' + [char]0x03bc + 'F')}}
)
$diverseFixture = Join-Path $root 'diverse.json'
@{Products=$diverseItems} | ConvertTo-Json -Depth 20 -Compress | Set-Content -LiteralPath $diverseFixture -Encoding UTF8
& $scriptPath -InputPath $diverseFixture -OutputDirectory (Join-Path $root 'diverse') -PreviewCount 1 -MaxScan 20 -DiverseSamples
$diverseRun = Get-ChildItem (Join-Path $root 'diverse') -Directory | Select-Object -First 1
$diverseRows = @(Import-Csv (Join-Path $diverseRun.FullName 'series-samples.csv'))
$diverseSummary = Get-Content (Join-Path $diverseRun.FullName 'run-summary.json') -Raw | ConvertFrom-Json
$diverseRaw = @(Get-Content (Join-Path $diverseRun.FullName 'selected-products.jsonl') | ForEach-Object { $_ | ConvertFrom-Json })
if ($diverseRows.Count -ne 4 -or $diverseRaw.Count -ne 4 -or $diverseSummary.Scanned -ne 7) { throw 'Diverse counts failed.' }
if (($diverseRows.CapacitanceTextBucket -join ',') -ne 'pf,unknown,nf,uf') { throw 'Text units or duplicate exclusion failed.' }
if ($diverseSummary.SeriesSamples.GRM -ne 0 -or $diverseSummary.UnitsVerified -ne $false -or $diverseSummary.CapacitanceBuckets.GCM.uf -ne $true) { throw 'Diverse summary failed.' }
if ($diverseRows[1].CapacitanceTextBucket -ne 'unknown') { throw 'Raw capacitance incorrectly assigned a unit.' }
# Official text may include thousands separators; preserve it and reject malformed grouping.
$groupedItems = @(
    @{Partno='GCM_GROUPED_1'; Specs=@{CapacitanceText='1,000pF'}}
    @{Partno='GCM_GROUPED_2'; Specs=@{CapacitanceText='10,000pF'}}
    @{Partno='GCM_GROUPED_DECIMAL'; Specs=@{CapacitanceText='1,000.5pF'}}
    @{Partno='GCM_BAD_GROUP'; Specs=@{CapacitanceText='1,00pF'}}
    @{Partno='GCM_DECIMAL_COMMA'; Specs=@{CapacitanceText='1,5uF'}}
)
@{Products=$groupedItems} | ConvertTo-Json -Depth 20 -Compress | Set-Content -LiteralPath $diverseFixture -Encoding UTF8
& $scriptPath -InputPath $diverseFixture -OutputDirectory (Join-Path $root 'grouped') -PreviewCount 5 -MaxScan 20 -DiverseSamples
$groupedRun = Get-ChildItem (Join-Path $root 'grouped') -Directory | Select-Object -First 1
$groupedPreview = @(Import-Csv (Join-Path $groupedRun.FullName 'preview.csv'))
if (($groupedPreview.CapacitanceTextBucket -join ',') -ne 'pf,pf,pf,unknown,unknown') { throw 'Thousands separator validation failed.' }
if ($groupedPreview[1].'Specs.CapacitanceText' -ne '10,000pF') { throw 'Original grouped text was changed.' }
if (($groupedPreview.CapacitanceRange -join ',') -ne 'nf,nf,nf,unknown,unknown') { throw 'Actual grouped capacitance ranges failed.' }
if ($groupedPreview[1].CapacitancePfFromText -ne '10000') { throw 'Text to pF conversion failed.' }
# Equivalent units must occupy the same magnitude bucket; zero is not a valid capacitor.
$equivalentItems = @(
    @{Partno='GCM_EQ_1'; Specs=@{CapacitanceText='10,000pF'}}
    @{Partno='GCM_EQ_2'; Specs=@{CapacitanceText='0.1uF'}}
    @{Partno='GCM_EQ_3'; Specs=@{CapacitanceText='1uF'}}
    @{Partno='GCM_EQ_4'; Specs=@{CapacitanceText='0pF'}}
)
@{Products=$equivalentItems} | ConvertTo-Json -Depth 20 -Compress | Set-Content -LiteralPath $diverseFixture -Encoding UTF8
$eqResult = & $scriptPath -InputPath $diverseFixture -OutputDirectory (Join-Path $root 'equivalent') -PreviewCount 4 -MaxScan 10 -DiverseSamples
$eqPreview = @(Import-Csv (Join-Path $eqResult.RunDirectory 'preview.csv'))
$eqSamples = @(Import-Csv (Join-Path $eqResult.RunDirectory 'series-samples.csv'))
if (($eqPreview.CapacitanceRange -join ',') -ne 'nf,nf,uf,unknown' -or $eqSamples.Count -ne 3 -or $eqPreview[1].CapacitancePfFromText -ne '100000.0') { throw 'Equivalent units/range quota failed.' }
# Resume past old products, retain absolute indices and seek only requested series.
$resumeItems = @(
    @{Partno='GCM_SKIP_1'}
    @{Partno='GCM_SKIP_2'}
    @{Partno='GRM_LATE'; Specs=@{CapacitanceText='10,000pF'}}
    @{Partno='KRM_LATE'; Specs=@{CapacitanceText='4.7uF'}}
    @{Partno='GCM_TAIL'}
)
@{Products=$resumeItems} | ConvertTo-Json -Depth 20 -Compress | Set-Content -LiteralPath $diverseFixture -Encoding UTF8
$resumed = & $scriptPath -InputPath $diverseFixture -OutputDirectory (Join-Path $root 'resumed') -StartIndex 2 -PreviewCount 1 -MaxScan 10 -DiverseSamples -TargetSeries @('GRM','KRM') -FindMissingSeries
$resumedSummary = Get-Content (Join-Path $resumed.RunDirectory 'run-summary.json') -Raw | ConvertFrom-Json
$resumedSamples = @(Import-Csv (Join-Path $resumed.RunDirectory 'series-samples.csv'))
if ($resumedSummary.Scanned -ne 2 -or $resumedSummary.Skipped -ne 2 -or $resumedSummary.LastProductIndex -ne 4 -or $resumedSummary.StopReason -ne 'preview-and-target-series-found') { throw 'Resume counters/target stop failed.' }
if (($resumedSamples.ScanIndex -join ',') -ne '3,4' -or $resumedSummary.SeriesSamples.GCM -ne 0) { throw 'Absolute sample index/target selection failed.' }
$pastEnd = & $scriptPath -InputPath $diverseFixture -OutputDirectory (Join-Path $root 'past-end') -StartIndex 99 -PreviewCount 1 -MaxScan 10
$pastSummary = Get-Content (Join-Path $pastEnd.RunDirectory 'run-summary.json') -Raw | ConvertFrom-Json
if ($pastSummary.Scanned -ne 0 -or $pastSummary.Skipped -ne 5 -or $pastSummary.StopReason -ne 'end-of-products') { throw 'Offset past EOF failed.' }
# Stop only after all three ordinary series cover explicit pF, nF and uF.
$completeItems = @(foreach ($prefix in @('GRM','GCM','KRM')) {
    foreach ($unit in @('pF','nF','uF')) { @{Partno=($prefix + '_' + $unit); Specs=@{CapacitanceText=('1' + $unit)}} }
}) + @(@{Partno='UNSCANNED_TAIL'})
@{Products=$completeItems} | ConvertTo-Json -Depth 20 -Compress | Set-Content -LiteralPath $diverseFixture -Encoding UTF8
& $scriptPath -InputPath $diverseFixture -OutputDirectory (Join-Path $root 'diverse-complete') -PreviewCount 1 -MaxScan 20 -DiverseSamples
$completeRun = Get-ChildItem (Join-Path $root 'diverse-complete') -Directory | Select-Object -First 1
$completeSummary = Get-Content (Join-Path $completeRun.FullName 'run-summary.json') -Raw | ConvertFrom-Json
if ($completeSummary.Scanned -ne 9 -or $completeSummary.StopReason -ne 'preview-and-target-series-collected' -or $completeSummary.FullDatabaseVerified -ne $false) { throw 'Diverse early stop failed.' }
Write-Host "PASS: streaming, quotes/braces, false/null, series collection, scan cap, EOF, malformed JSON and diverse text-unit sampling. Synthetic artifacts: $root"
