$ErrorActionPreference='Stop'
$converter=Join-Path $PSScriptRoot 'Convert-MurataDatabase.ps1'
. $converter -LibraryOnly
$production=[string][char]0x76ee+[char]0x524d+[char]0x751f+[char]0x4ea7
$pm=[string][char]0x00b1
function Base-Product([string]$Part='KRM_SYNTHETIC') {
    return [pscustomobject]@{Partno=$Part;Series='KRM';Status=$production;Specs=[pscustomobject]@{Capacitance=0.00001;CapacitanceText='10uF';ToleranceCapacitance=($pm+'10%');RatedVoltageDC=16;RatedVoltageDCText='16Vdc';SizeCodeInInch='0805';SizecodeMm='2012M';Length=0.0022;LengthText=('2.2mm '+$pm+'0.3mm');Width=0.00125;WidthText=('1.25mm '+$pm+'0.3mm');Thickness=0.0018;ThicknessText=('1.8mm '+$pm+'0.1mm');ThicknessMax=0.0019;ThicknessMaxText='1.9mm';TemperatureCharacteristics='X5R';TemperatureCharacteristicsCompliedStandard='EIA'};ComplianceInfo=[pscustomobject]@{AecQ200Support=$false};MediaFileUrls=[pscustomobject]@{SpecificationsSheet='https://example.invalid/synthetic.pdf'}}
}
function Assert($Condition,[string]$Message) { if (-not $Condition) { throw $Message } }
$base=Base-Product
$r=Normalize-Product $base 'synthetic' 1
Assert ($r.spec.capacitancePf -eq 10000000 -and $r.spec.lengthMm -eq 2.2 -and $r.spec.widthMm -eq 1.25 -and $r.spec.thicknessMm -eq 1.8 -and $r.spec.thicknessMaxMm -eq 1.9) 'F/m normalization or actual KRM geometry failed.'
Assert ($r.validation.status -eq 'consistent' -and $r.compliance.aecQ200 -is [bool] -and $r.compliance.aecQ200 -eq $false -and $r.spec.sizeInch -eq '0805') 'Consistent fields/false/string size failed.'
Assert ($r.rawFields.'Specs.Capacitance' -eq 0.00001 -and $r.rawFields.'Specs.LengthText' -eq $base.Specs.LengthText -and $r.validation.companyAccepted -eq $false -and $r.links.verified -eq $false) 'Raw preservation or acceptance flags failed.'
foreach ($case in @(@{Text='1,000pF';Raw=1e-9;Expected=1000},@{Text='10,000pF';Raw=1e-8;Expected=10000},@{Text=('0.1'+[char]0x00b5+'F');Raw=1e-7;Expected=100000},@{Text=('1'+[char]0x03bc+'F');Raw=1e-6;Expected=1000000},@{Text='0.5pF';Raw=5e-13;Expected=0.5})) {
    $p=Base-Product; $p.Specs.Capacitance=$case.Raw; $p.Specs.CapacitanceText=$case.Text
    $record=Normalize-Product $p 'synthetic' 1
    Assert ($record.spec.capacitancePf -eq $case.Expected) ('Capacitance parse failed: '+$case.Text)
}
$bad=Base-Product; $bad.Specs.Capacitance=0.001
$r=Normalize-Product $bad 'synthetic' 1
Assert ($null -eq $r.spec.capacitancePf -and $r.validation.issues.code -contains 'numeric-text-conflict') 'Wrong capacitance accepted.'
$bad=Base-Product; $bad.Specs.Capacitance=$null
$r=Normalize-Product $bad 'synthetic' 1
Assert ($null -eq $r.spec.capacitancePf -and $r.validation.issues.code -contains 'missing-numeric') 'Missing raw value guessed from text.'
foreach ($text in @('1,00pF','1,5uF','0uF','10','10uF unexpected')) {
    $bad=Base-Product; $bad.Specs.CapacitanceText=$text
    $r=Normalize-Product $bad 'synthetic' 1
    Assert ($null -eq $r.spec.capacitancePf -and $r.validation.status -eq 'review') ('Invalid text accepted: '+$text)
}
$bad=Base-Product; $bad.Specs.RatedVoltageDCText='16Vac'
$r=Normalize-Product $bad 'synthetic' 1
Assert ($r.validation.issues.code -contains 'voltage-type-conflict' -and $null -eq $r.spec.voltages[0].valueV) 'AC/DC text mismatch accepted.'
$safety=Base-Product 'DK1_SYNTHETIC'; $safety.Series='DK1'
$safety.Specs.RatedVoltageDC=$null; $safety.Specs.RatedVoltageDCText=$null; $safety.Specs.SizeCodeInInch=$null
foreach ($item in @(@{N='RatedVoltageAC';V=250;T='250Vac(r.m.s.)'},@{N='X1RatedVoltageAC';V=440;T='440Vac'},@{N='X1RatedVoltageDC';V=1500;T='1500Vdc'},@{N='Y1RatedVoltageAC';V=250;T='250Vac'},@{N='Y1RatedVoltageDC';V=1500;T='1500Vdc'})) {
    $safety.Specs | Add-Member -NotePropertyName $item.N -NotePropertyValue $item.V -Force
    $safety.Specs | Add-Member -NotePropertyName ($item.N+'Text') -NotePropertyValue $item.T -Force
}
$r=Normalize-Product $safety 'synthetic' 1
Assert ($r.spec.voltages.Count -eq 5 -and $r.validation.status -eq 'consistent' -and @($r.spec.voltages | Where-Object { $_.type -eq 'DC' -and $null -eq $_.safetyClass }).Count -eq 0) 'Safety voltages collapsed or ordinary DC guessed.'
Assert (@($r.spec.voltages | Where-Object { $_.type -eq 'DC' -and $_.safetyClass -eq 'X1' -and $_.valueV -eq 1500 }).Count -eq 1) 'Safety class identity lost.'
$bad=Base-Product; $bad.Specs.ThicknessMax=0.001; $bad.Specs.ThicknessMaxText='1mm'
$r=Normalize-Product $bad 'synthetic' 1
Assert ($null -eq $r.spec.thicknessMm -and $null -eq $r.spec.thicknessMaxMm -and $r.validation.issues.code -contains 'thickness-exceeds-maximum') 'Invalid maximum thickness accepted.'
$bad=Base-Product; $bad.Specs.SizeCodeInInch=805
$r=Normalize-Product $bad 'synthetic' 1
Assert ($null -eq $r.spec.sizeInch -and $r.validation.issues.code -contains 'unexpected-field-type') 'Numeric size code silently padded.'
foreach ($case in @(@{Text='1.5mm +0mm/-0.3mm';Raw=0.0015;Expected=1.5},@{Text='2mm +0mm/-0.3mm';Raw=0.002;Expected=2},@{Text='1mm +0mm/-0.3mm';Raw=0.001;Expected=1},@{Text='1.5mm +0.1mm / -0.3mm';Raw=0.0015;Expected=1.5},@{Text='1.5mm +0mm/-0mm';Raw=0.0015;Expected=1.5})) {
    $p=Base-Product; $p.Specs.Thickness=$case.Raw; $p.Specs.ThicknessText=$case.Text
    $p.Specs.ThicknessMax=0.003; $p.Specs.ThicknessMaxText='3mm'
    $r=Normalize-Product $p 'synthetic' 1
    Assert ($r.spec.thicknessMm -eq $case.Expected -and $r.validation.status -eq 'consistent' -and $r.rawFields.'Specs.ThicknessText' -ceq $case.Text -and $r.validation.checks.Thickness.textNote -like '*/*') ('Asymmetric thickness or original tolerance preservation failed: '+$case.Text)
}
foreach ($text in @('1.5mm +0mm/-0.3cm','1.5mm +0/-0.3mm','1.5mm +0mm/+0.3mm','1.5mm +0mm/-2mm','1.5mm +0mm/-0.3mm unexpected','1.5mm +1,00mm/-0.3mm')) {
    $p=Base-Product; $p.Specs.Thickness=0.0015; $p.Specs.ThicknessText=$text
    $r=Normalize-Product $p 'synthetic' 1
    Assert ($null -eq $r.spec.thicknessMm -and $r.validation.issues.code -contains 'unrecognized-or-missing-text') ('Malformed asymmetric tolerance accepted: '+$text)
}
$p=Base-Product; $p.Specs.Thickness=0.0014; $p.Specs.ThicknessText='1.5mm +0mm/-0.3mm'
$r=Normalize-Product $p 'synthetic' 1
Assert ($null -eq $r.spec.thicknessMm -and $r.validation.issues.code -contains 'numeric-text-conflict') 'Asymmetric tolerance incorrectly used to accept a nominal mismatch.'
$p=Base-Product 'GCB_SYNTHETIC'; $p.Status='NRND'; $p.Specs.RatedVoltageDC=$null; $p.Specs.RatedVoltageDCText=$null
$r=Normalize-Product $p 'synthetic' 1
Assert ($r.spec.voltages.Count -eq 0 -and $r.validation.issues.code -contains 'missing-verified-voltage' -and $r.validation.status -eq 'review') 'Missing voltage guessed from part number or NRND status.'
$bad=Base-Product; $bad.ComplianceInfo.AecQ200Support='False'; $bad.Status='UnconfirmedStatus'; $bad.Specs.ToleranceCapacitance=($pm+'0.5pF')
$r=Normalize-Product $bad 'synthetic' 1
Assert ($null -eq $r.compliance.aecQ200 -and $r.lifecycle.category -eq 'unknown' -and $r.spec.tolerance.kind -eq 'absolute' -and $r.spec.tolerance.value -eq 0.5) 'Unknown boolean/lifecycle or absolute tolerance failed.'
$nrnd=Base-Product 'NRND_SYNTHETIC'; $nrnd.Status='NRND'
$r=Normalize-Product $nrnd 'synthetic' 1
Assert ($r.lifecycle.category -eq 'nrnd' -and $r.lifecycle.rawStatus -ceq 'NRND' -and $r.rawFields.Status -ceq 'NRND') 'NRND classification or raw status preservation failed.'
Assert ($r.validation.status -eq 'review' -and $r.validation.issues.code -contains 'lifecycle-nrnd' -and $r.validation.issues.code -notcontains 'lifecycle-unmapped' -and $r.spec.capacitancePf -eq 10000000) 'NRND selection warning lost or incorrectly reported as unrecognized.'
foreach ($statusCase in @('nrnd','EOL','UnconfirmedStatus')) {
    $p=Base-Product; $p.Status=$statusCase
    $r=Normalize-Product $p 'synthetic' 1
    Assert ($r.lifecycle.category -eq 'unknown' -and $r.validation.issues.code -contains 'lifecycle-unmapped') ('Unconfirmed status guessed: '+$statusCase)
}
$bad=Base-Product; $bad.MediaFileUrls.SpecificationsSheet='javascript:alert(1)'; $bad | Add-Member -NotePropertyName ProductDetailUrl -NotePropertyValue 'javascript:alert(2)'
$r=Normalize-Product $bad 'synthetic' 1
Assert ($r.links.datasheets.Count -eq 0 -and $null -eq $r.links.productDetail -and $r.validation.issues.code -contains 'unrecognized-product-url') 'Invalid link protocol entered normalized URLs.'
$root=Join-Path ([IO.Path]::GetTempPath()) ('pnrep-normalize-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$fixture=Join-Path $root 'official-synthetic.json'
$ok=Base-Product 'GRM_SYNTHETIC'; $ok.Series='GRM'
$conflict=Base-Product 'GRM_SYNTHETIC'; $conflict.Series='GRM'; $conflict.Specs.Capacitance=0.001
@{Metadata=@{Products='decoy'};Products=@($ok,$ok,$conflict,$safety);Footer='done'} | ConvertTo-Json -Depth 30 -Compress | Set-Content -LiteralPath $fixture -Encoding UTF8
$originalHash=(Get-FileHash -LiteralPath $fixture).Hash
$run=& $converter -InputPath $fixture -OutputDirectory (Join-Path $root 'full') -Mode Full
$summary=Get-Content (Join-Path $run.RunDirectory 'normalization-summary.json') -Raw -Encoding UTF8 | ConvertFrom-Json
Assert ($summary.toolVersion -eq 3 -and $summary.toolBuild -eq 'v3.1' -and $summary.scriptPath -eq $converter) 'Run version or executed script path missing from summary.'
$report=Get-Content (Join-Path $run.RunDirectory 'local-normalization-report.html') -Raw -Encoding UTF8
Assert ($report.Contains('v3.1') -and $report.Contains([Net.WebUtility]::HtmlEncode($converter))) 'Visible version/script path missing from HTML report.'
$rows=@(Get-Content (Join-Path $run.RunDirectory 'normalized-products.jsonl') -Encoding UTF8 | ForEach-Object { $_ | ConvertFrom-Json })
Assert ($run.Products -eq 3 -and $summary.exactDuplicateRecordsSkipped -eq 1 -and $summary.fullDatabaseRead -eq $true -and $summary.conflictingPartNumbers -contains 'GRM_SYNTHETIC') 'Full stream/dedup/conflict summary failed.'
Assert ($summary.reviewProducts -eq 2 -and $rows[0].validation.status -eq 'review' -and $rows[1].validation.status -eq 'review') 'Earlier conflicting occurrence was not quarantined.'
Assert ($null -eq $rows[0].rawFields -and $rows[0].auditReference.line -eq 1) 'Lean record/audit reference failed.'
$auditRows=@(Get-Content (Join-Path $run.RunDirectory 'normalization-audit.jsonl') -Encoding UTF8 | ForEach-Object { $_ | ConvertFrom-Json })
Assert ($auditRows[0].rawFields.'Specs.Capacitance' -eq $ok.Specs.Capacitance -and $auditRows[0].checks.capacitance.state -eq 'consistent') 'Audit lost raw values or field checks.'
$conflictCsv=@(Import-Csv (Join-Path $run.RunDirectory 'normalized-preview.csv') -Encoding UTF8)
Assert ($conflictCsv[0].validation -eq 'review') 'CSV failed to quarantine earlier conflict.'
Assert ($rows[2].spec.voltages.Count -eq 5 -and (Get-FileHash -LiteralPath $fixture).Hash -eq $originalHash) 'Streaming/raw source preservation failed.'
$partial=& $converter -InputPath $fixture -OutputDirectory (Join-Path $root 'preview') -Mode Preview -PreviewCount 1
$partialSummary=Get-Content (Join-Path $partial.RunDirectory 'normalization-summary.json') -Raw | ConvertFrom-Json
Assert ($partial.Products -eq 1 -and $partialSummary.fullDatabaseRead -eq $false) 'Preview claimed full database verification.'
$checks=Join-Path $root 'checks'; $checkDir=Join-Path $checks 'check-20000101-000000-synthetic'
New-Item -ItemType Directory -Path $checkDir -Force | Out-Null
$sourceFile=Get-Item $fixture
@{Completed=$true;Source=$sourceFile.FullName;SourceBytes=$sourceFile.Length;SourceModifiedUtc=$sourceFile.LastWriteTimeUtc.ToString('o')} | ConvertTo-Json | Set-Content (Join-Path $checkDir 'run-summary.json') -Encoding UTF8
@($ok,$safety) | ForEach-Object { ConvertTo-Json -InputObject $_ -Compress -Depth 30 } | Set-Content (Join-Path $checkDir 'selected-products.jsonl') -Encoding UTF8
$samples=& $converter -CheckDirectory $checks -OutputDirectory (Join-Path $root 'samples')
Assert ($samples.Products -eq 2) 'Checked sample discovery failed.'
$sampleSummary=Get-Content (Join-Path $checkDir 'run-summary.json') -Raw | ConvertFrom-Json
$sampleSummary.SourceBytes++
$sampleSummary | ConvertTo-Json | Set-Content (Join-Path $checkDir 'run-summary.json') -Encoding UTF8
$failed=$false
try { & $converter -CheckDirectory $checks -OutputDirectory (Join-Path $root 'mismatched') } catch { $failed=$true }
Assert $failed 'Mismatched source snapshot accepted.'
# Interrupted/truncated official input must leave explicit completed=false, not a usable index.
$broken=Join-Path $root 'truncated.json'
$prefixJson=ConvertTo-Json -InputObject $ok -Compress -Depth 30
Set-Content -LiteralPath $broken -Value ('{"Products":['+$prefixJson+',') -Encoding UTF8
$failed=$false
try { & $converter -InputPath $broken -OutputDirectory (Join-Path $root 'broken') -Mode Full } catch { $failed=$true }
Assert $failed 'Truncated official JSON succeeded.'
$brokenRun=Get-ChildItem (Join-Path $root 'broken') -Directory | Select-Object -First 1
$brokenSummary=Get-Content (Join-Path $brokenRun.FullName 'normalization-summary.json') -Raw | ConvertFrom-Json
Assert ($brokenSummary.completed -eq $false -and $brokenSummary.fullDatabaseRead -eq $false) 'Failed conversion marked complete.'
Write-Host 'PASS: normalization, units, false/missing, safety voltage types, tolerance, size/thickness, streaming, duplicates, preview and checked sample guards. Synthetic inputs only.'
