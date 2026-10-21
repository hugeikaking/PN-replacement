$ErrorActionPreference='Stop'
$root=Join-Path ([IO.Path]::GetTempPath()) ('pnrep-norm-details-'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root | Out-Null
$review=Join-Path $PSScriptRoot 'Review-MurataNormalization.ps1'
$summaryPath=Join-Path $root 'normalization-summary.json'
$issuesPath=Join-Path $root 'issues.jsonl'
$auditPath=Join-Path $root 'normalization-audit.jsonl'
$entries=@(
    @{partNo='SYNTHETIC_1';issue=@{code='lifecycle-unmapped';field='Status';rawValue='UnconfirmedStatus';textValue=$null}}
    @{partNo='SYNTHETIC_2';issue=@{code='lifecycle-unmapped';field='Status';rawValue='UnconfirmedStatus';textValue=$null}}
    @{partNo='SYNTHETIC_3';issue=@{code='lifecycle-unmapped';field='Status';rawValue='unconfirmedstatus';textValue=$null}}
    @{partNo='SYNTHETIC_4';issue=@{code='unrecognized-or-missing-text';field='Specs.Length';rawValue=0.001;textValue='<script>alert(1)</script>'}}
    @{partNo='SYNTHETIC_5';issue=@{code='unrecognized-or-missing-text';field='Specs.Length';rawValue=0.001;textValue='<script>alert(1)</script>'}}
    @{partNo='SYNTHETIC_6';issue=@{code='unrecognized-or-missing-text';field='Specs.RatedVoltageDC';rawValue=16;textValue='16V unconfirmed suffix'}}
    @{partNo='SYNTHETIC_6';issue=@{code='missing-verified-voltage';field='Specs.RatedVoltage';rawValue=$null;textValue=$null}}
)
@{completed=$true;products=6;consistentProducts=0;reviewProducts=6;issueCounts=@{'lifecycle-unmapped'=3;'unrecognized-or-missing-text'=3;'missing-verified-voltage'=1}} | ConvertTo-Json -Depth 10 | Set-Content $summaryPath -Encoding UTF8
$entries | ForEach-Object { ConvertTo-Json -InputObject $_ -Compress -Depth 10 } | Set-Content $issuesPath -Encoding UTF8
@{partNo='SYNTHETIC_6';rawFields=@{'Specs.RatedVoltageDC'=16;'Specs.RatedVoltageDCText'='16V unconfirmed suffix';'Specs.RatedVoltageAC'=$null;'ComplianceInfo.AecQ200Support'=$false};checks=@{RatedVoltageDC=@{state='review'}}} | ConvertTo-Json -Compress -Depth 10 | Set-Content $auditPath -Encoding UTF8
$hashes=@(foreach ($path in @($summaryPath,$issuesPath,$auditPath)) { (Get-FileHash $path).Hash })
$result=& $review -RunDirectory $root -ExamplesPerGroup 1
if ($result.ErrorCount -ne 0 -or $result.StatusKinds -ne 2 -or $result.FieldGroups -ne 4 -or $result.CompanyAccepted) { throw 'Diagnostic grouping/status/consistency failed.' }
$html=Get-Content $result.ReportPath -Raw -Encoding UTF8
if ($html.Contains('<script>') -or -not $html.Contains('&lt;script&gt;') -or -not $html.Contains('16V unconfirmed suffix') -or -not $html.Contains('Specs.X1RatedVoltageDC')) { throw 'Escaping or independent voltage examples failed.' }
$after=@(foreach ($path in @($summaryPath,$issuesPath,$auditPath)) { (Get-FileHash $path).Hash })
if (($hashes -join ',') -ne ($after -join ',')) { throw 'Diagnostic modified original result files.' }
$s=Get-Content $summaryPath -Raw | ConvertFrom-Json
$s.completed=$false; $s.issueCounts.'lifecycle-unmapped'=99
$s | ConvertTo-Json -Depth 10 | Set-Content $summaryPath -Encoding UTF8
$result=& $review -RunDirectory $root
if ($result.ErrorCount -lt 2) { throw 'Failed run/count mismatch not reported.' }
Write-Host 'PASS: diagnostic status counts, distinct field samples, safety voltage columns, HTML escaping, unchanged source files and inconsistent/incomplete run detection. Synthetic data only.'
