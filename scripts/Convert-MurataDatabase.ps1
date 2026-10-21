[CmdletBinding()]
param(
    [string]$InputPath = '',
    [string]$CheckDirectory = (Join-Path $env:USERPROFILE 'Desktop\Murata_Data_Check'),
    [string]$OutputDirectory = (Join-Path $env:USERPROFILE 'Desktop\Murata_Normalized'),
    [ValidateSet('CheckedSamples','Preview','Full')][string]$Mode = 'CheckedSamples',
    [ValidateRange(1,10000000)][int]$PreviewCount = 1000,
    [switch]$LibraryOnly
)
$ErrorActionPreference='Stop'
$toolBuild='v3.1'
$converterScriptPath=$PSCommandPath
$inv=[Globalization.CultureInfo]::InvariantCulture
function Field($Object,[string]$Path) {
    $v=$Object
    foreach ($key in $Path.Split('.')) {
        if ($null -eq $v) { return $null }
        $property=$v.PSObject.Properties[$key]
        if ($null -eq $property) { return $null }
        $v=$property.Value
    }
    return ,$v
}
function Present($Value) { return $null -ne $Value -and -not ($Value -is [string] -and [string]::IsNullOrWhiteSpace($Value)) }
function Issue($Issues,[string]$Severity,[string]$Code,[string]$Path,$Raw,$Text) {
    $Issues.Add([pscustomobject]@{severity=$Severity; code=$Code; field=$Path; rawValue=$Raw; textValue=$Text})
}
function Parse-Text([string]$Text,[string]$Kind) {
    $result=[pscustomobject]@{valid=$false; value=$null; voltageType=$null; rms=$false; note=$null}
    $t=$Text.Replace([string][char]0x03bc,'u').Replace([string][char]0x00b5,'u')
    $numValue='(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]+)?|\.[0-9]+'
    $num='('+$numValue+')'
    if ($Kind -eq 'capacitance') { $pattern='(?i)^\s*'+$num+'\s*(pF|nF|uF|F)\s*$' }
    elseif ($Kind -eq 'dimension') {
        $asymmetric='\+\s*(?<plus>'+ $numValue +')\s*mm\s*/\s*-\s*(?<minus>'+ $numValue +')\s*mm'
        $pattern='(?i)^\s*'+$num+'\s*mm\s*((?:(?:'+[char]0x00b1+'|\+/-)\s*'+$num+'\s*mm)|'+$asymmetric+'|Max\.?|Typ\.?)?\s*$'
    }
    else { $pattern='(?i)^\s*'+$num+'\s*V\s*(dc|ac)?\s*(\(\s*r\.?\s*m\.?\s*s\.?\s*\))?\s*$' }
    if ($t -notmatch $pattern) { return $result }
    $number=[decimal]0
    if (-not [decimal]::TryParse($Matches[1].Replace(',',''),[Globalization.NumberStyles]::AllowDecimalPoint,$inv,[ref]$number) -or $number -le 0) { return $result }
    if ($Kind -eq 'capacitance') {
        $scale=@{pf=[decimal]1; nf=[decimal]1000; uf=[decimal]1000000; f=[decimal]1000000000000}
        try { $number=$number*$scale[$Matches[2].ToLowerInvariant()] } catch { return $result }
    } elseif ($Kind -eq 'voltage') {
        if (Present $Matches[2]) { $result.voltageType=$Matches[2].ToUpperInvariant() }
        $result.rms=Present $Matches[3]
    } else {
        if (Present $Matches['plus']) {
            # Check the nominal dimension, preserving asymmetric tolerances as a note.
            # Do not turn nominal + upper tolerance into the nominal thickness.
            $upper=[decimal]0; $lower=[decimal]0
            if (-not [decimal]::TryParse($Matches['plus'].Replace(',',''),[Globalization.NumberStyles]::AllowDecimalPoint,$inv,[ref]$upper) -or
                -not [decimal]::TryParse($Matches['minus'].Replace(',',''),[Globalization.NumberStyles]::AllowDecimalPoint,$inv,[ref]$lower) -or $lower -gt $number) { return $result }
        }
        $result.note=$Matches[2]
    }
    $result.valid=$true; $result.value=$number
    return $result
}
function Numeric($Raw) {
    # Strings and booleans are not JSON numbers. Do not repair schema by guessing.
    if ($Raw -isnot [ValueType] -or $Raw -is [bool]) { return $null }
    $number=[decimal]0
    if (-not [decimal]::TryParse([Convert]::ToString($Raw,$inv),[Globalization.NumberStyles]::Float,$inv,[ref]$number)) { return $null }
    return $number
}
function Verify-Pair($Product,$Issues,[string]$Name,[string]$Kind,[decimal]$Scale,[string]$VoltageType='') {
    $path='Specs.'+$Name
    $raw=Field $Product $path; $text=Field $Product ($path+'Text')
    $result=[pscustomobject]@{state='absent'; value=$null; fromText=$null; textNote=$null}
    if (-not (Present $raw) -and -not (Present $text)) { return $result }
    $result.state='review'
    $number=Numeric $raw
    $parsed=Parse-Text ([string]$text) $Kind
    if (-not (Present $raw)) { Issue $Issues 'error' 'missing-numeric' $path $raw $text; return $result }
    if ($null -eq $number -or $number -le 0) { Issue $Issues 'error' 'invalid-numeric' $path $raw $text; return $result }
    if (-not $parsed.valid) { Issue $Issues 'error' 'unrecognized-or-missing-text' $path $raw $text; return $result }
    $result.fromText=$parsed.value; $result.textNote=$parsed.note
    if ($Kind -eq 'voltage' -and ((Present $parsed.voltageType) -and $parsed.voltageType -ne $VoltageType -or ($parsed.rms -and $VoltageType -ne 'AC'))) {
        Issue $Issues 'error' 'voltage-type-conflict' $path $raw $text; return $result
    }
    try { $converted=$number*$Scale } catch { Issue $Issues 'error' 'numeric-overflow' $path $raw $text; return $result }
    $allowed=[Math]::Max(0.000000001,[Math]::Abs([double]$parsed.value)*0.000001)
    if ([Math]::Abs([double]($converted-$parsed.value)) -gt $allowed) { Issue $Issues 'error' 'numeric-text-conflict' $path $raw $text; return $result }
    $result.state='consistent'; $result.value=$converted
    return $result
}
function Parse-Tolerance($Raw,$Issues) {
    $result=[pscustomobject]@{kind=$null; value=$null; unit=$null}
    if (-not (Present $Raw)) { Issue $Issues 'warning' 'missing-tolerance' 'Specs.ToleranceCapacitance' $Raw $null; return $result }
    $t=([string]$Raw).Replace([string][char]0x03bc,'u').Replace([string][char]0x00b5,'u')
    if ($t -match ('(?i)^\s*(?:'+[char]0x00b1+'|\+/-)\s*([0-9]+(?:\.[0-9]+)?)\s*(%|pF|nF|uF)\s*$')) {
        $number=[decimal]0
        if ([decimal]::TryParse($Matches[1],[Globalization.NumberStyles]::AllowDecimalPoint,$inv,[ref]$number) -and $number -gt 0) {
            if ($Matches[2] -eq '%') { $result.kind='percent'; $result.value=$number; $result.unit='%' }
            else {
                $result.kind='absolute'; $result.unit='pF'
                try { $result.value=$number*(@{pf=1;nf=1000;uf=1000000}[$Matches[2].ToLowerInvariant()]) } catch { $result.kind=$null; $result.unit=$null }
            }
        }
    }
    if ($null -eq $result.kind) { Issue $Issues 'warning' 'unrecognized-tolerance' 'Specs.ToleranceCapacitance' $Raw $null }
    return $result
}
function Text-Field($Product,$Issues,[string]$Path,[bool]$Required=$false) {
    $raw=Field $Product $Path
    if (-not (Present $raw)) { if ($Required) { Issue $Issues 'warning' 'missing-field' $Path $raw $null }; return $null }
    if ($raw -isnot [string]) { Issue $Issues 'error' 'unexpected-field-type' $Path $raw $null; return $null }
    return $raw
}
function Normalize-Product($Product,[string]$SourcePath,[long]$SourceIndex) {
    $issues=New-Object System.Collections.Generic.List[object]
    $part=Text-Field $Product $issues 'Partno'
    if ([string]::IsNullOrWhiteSpace($part)) { Issue $issues 'error' 'missing-part-number' 'Partno' (Field $Product 'Partno') $null }
    $cap=Verify-Pair $Product $issues 'Capacitance' 'capacitance' 1000000000000
    if ($cap.state -eq 'absent') { Issue $issues 'error' 'missing-capacitance' 'Specs.Capacitance' $null $null }
    $voltages=New-Object System.Collections.Generic.List[object]
    $checks=[ordered]@{capacitance=$cap}
    foreach ($safety in @('','X1','X2','Y1','Y2')) {
        foreach ($type in @('DC','AC')) {
            $name=if ($safety -eq '') {'RatedVoltage'+$type} else {$safety+'RatedVoltage'+$type}
            $pair=Verify-Pair $Product $issues $name 'voltage' 1 $type
            $checks[$name]=$pair
            if ($pair.state -ne 'absent') { $voltages.Add([pscustomobject]@{type=$type; safetyClass=$(if ($safety -eq '') {$null} else {$safety}); valueV=$pair.value; state=$pair.state; sourceField=('Specs.'+$name)}) }
        }
    }
    if (@($voltages | Where-Object state -eq 'consistent').Count -eq 0) { Issue $issues 'error' 'missing-verified-voltage' 'Specs.RatedVoltage' $null $null }
    $dims=@{}
    foreach ($name in @('Length','Width','Thickness','ThicknessMax')) {
        $pair=Verify-Pair $Product $issues $name 'dimension' 1000
        $dims[$name]=$pair.value; $checks[$name]=$pair
    }
    if ($null -ne $dims.Thickness -and $null -ne $dims.ThicknessMax -and $dims.Thickness -gt $dims.ThicknessMax) {
        Issue $issues 'error' 'thickness-exceeds-maximum' 'Specs.ThicknessMax' (Field $Product 'Specs.ThicknessMax') (Field $Product 'Specs.ThicknessText')
        $dims.Thickness=$null; $dims.ThicknessMax=$null
    }
    $size=Text-Field $Product $issues 'Specs.SizeCodeInInch'
    if ($null -ne $size -and $size -notmatch '^\d{4,6}$') { Issue $issues 'error' 'unrecognized-size-code' 'Specs.SizeCodeInInch' $size $null; $size=$null }
    if ($null -eq $size -and ($null -eq $dims.Length -or $null -eq $dims.Width)) { Issue $issues 'error' 'missing-verified-size' 'Specs.SizeCodeInInch' $null $null }
    $temperature=Text-Field $Product $issues 'Specs.TemperatureCharacteristics' $true
    $status=Text-Field $Product $issues 'Status' $true
    $lifecycle='unknown'
    if ($status -eq ([string][char]0x76ee+[char]0x524d+[char]0x751f+[char]0x4ea7)) { $lifecycle='active' }
    elseif ($status -ceq 'NRND') {
        $lifecycle='nrnd'
        Issue $issues 'warning' 'lifecycle-nrnd' 'Status' $status $null
    }
    else { Issue $issues 'warning' 'lifecycle-unmapped' 'Status' $status $null }
    $aec=Field $Product 'ComplianceInfo.AecQ200Support'
    if ($aec -isnot [bool]) { Issue $issues 'warning' 'aec-unverified' 'ComplianceInfo.AecQ200Support' $aec $null; $aec=$null }
    $tolerance=Parse-Tolerance (Field $Product 'Specs.ToleranceCapacitance') $issues
    $sheetRaw=Field $Product 'MediaFileUrls.SpecificationsSheet'
    $sheets=New-Object System.Collections.Generic.List[string]
    if (-not (Present $sheetRaw)) { Issue $issues 'warning' 'missing-datasheet' 'MediaFileUrls.SpecificationsSheet' $sheetRaw $null }
    else {
        foreach ($item in @($sheetRaw)) {
            $uri=$null
            if ($item -is [string] -and [Uri]::TryCreate($item,[UriKind]::Absolute,[ref]$uri) -and $uri.Scheme -in @('https','http')) { $sheets.Add($item) }
            else { Issue $issues 'warning' 'unrecognized-datasheet-shape-or-url' 'MediaFileUrls.SpecificationsSheet' $item $null }
        }
    }
    $detail=Text-Field $Product $issues 'ProductDetailUrl'
    if (Present $detail) {
        $detailUri=$null
        if (-not [Uri]::TryCreate($detail,[UriKind]::Absolute,[ref]$detailUri) -or $detailUri.Scheme -notin @('https','http')) { Issue $issues 'warning' 'unrecognized-product-url' 'ProductDetailUrl' $detail $null; $detail=$null }
    }
    $rawFields=[ordered]@{}
    foreach ($path in @('Partno','PartnoWithoutPackageCode','ProductName','Series','Status','NewProduct','Application','ProductDetailUrl','ComplianceInfo.AecQ200Support','ComplianceInfo.Rohs','ComplianceInfo.Reach','MediaFileUrls.SpecificationsSheet')) { $rawFields[$path]=Field $Product $path }
    foreach ($name in @('Capacitance','ToleranceCapacitance','SizeCode','SizeCodeInInch','SizecodeMm','TemperatureCharacteristics','TemperatureCharacteristicsCompliedStandard','MaxOperatingTemperature','MaxOperatingTemperatureText','OperatingTemperatureRange','Length','Width','Thickness','ThicknessMax','RatedVoltageDC','RatedVoltageAC','X1RatedVoltageDC','X1RatedVoltageAC','X2RatedVoltageDC','X2RatedVoltageAC','Y1RatedVoltageDC','Y1RatedVoltageAC','Y2RatedVoltageDC','Y2RatedVoltageAC')) {
        $rawFields['Specs.'+$name]=Field $Product ('Specs.'+$name)
        if ($name -in @('Capacitance','Length','Width','Thickness','ThicknessMax') -or $name -like '*RatedVoltage*') { $rawFields['Specs.'+$name+'Text']=Field $Product ('Specs.'+$name+'Text') }
    }
    return [pscustomobject][ordered]@{
        schemaVersion=1; manufacturer='murata'; componentType='mlcc'; partNo=$part
        partNoWithoutPackageCode=(Text-Field $Product $issues 'PartnoWithoutPackageCode')
        productName=(Text-Field $Product $issues 'ProductName'); series=(Text-Field $Product $issues 'Series')
        spec=[pscustomobject]@{capacitancePf=$cap.value; voltages=@($voltages.ToArray()); sizeInch=$size; sizeMetric=(Text-Field $Product $issues 'Specs.SizecodeMm'); lengthMm=$dims.Length; widthMm=$dims.Width; thicknessMm=$dims.Thickness; thicknessMaxMm=$dims.ThicknessMax; temperature=$temperature; temperatureStandard=(Text-Field $Product $issues 'Specs.TemperatureCharacteristicsCompliedStandard'); tolerance=$tolerance}
        compliance=[pscustomobject]@{aecQ200=$aec; rohsRaw=(Field $Product 'ComplianceInfo.Rohs'); reachRaw=(Field $Product 'ComplianceInfo.Reach')}
        lifecycle=[pscustomobject]@{rawStatus=$status; category=$lifecycle; newProductRaw=(Field $Product 'NewProduct')}
        links=[pscustomobject]@{datasheets=@($sheets.ToArray()); productDetail=$detail; verified=$false}
        validation=[pscustomobject]@{status=$(if ($issues.Count -eq 0) {'consistent'} else {'review'}); checks=[pscustomobject]$checks; issues=@($issues.ToArray()); datasheetReviewed=$false; companyAccepted=$false}
        rawFields=[pscustomobject]$rawFields
        provenance=[pscustomobject]@{sourcePath=$SourcePath; sourceIndex=$SourceIndex}
    }
}
function Csv-Cell($Value) {
    if ($null -eq $Value) { return '' }
    $t=[Convert]::ToString($Value,$inv)
    if ($Value -is [string] -and $t -match '^\s*[=+@-]') { return "'"+$t }
    return $t
}
if ($LibraryOnly) { return }
Write-Host "Murata normalization $toolBuild (NRND + asymmetric mm tolerance)"
Write-Host "Script: $converterScriptPath"
# C# reads buffered characters; never loads the whole product database.
if (-not ('PnrepNormalizationReader' -as [type])) {
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Text;
public sealed class PnrepNormalizationReader : IDisposable {
    private readonly StreamReader r;
    private bool first = true;
    private bool finished = false;
    public PnrepNormalizationReader(string path) {
        r = new StreamReader(path, new UTF8Encoding(false, true), true, 65536);
        try {
            Expect('{');
            while (true) {
                if (Peek() == '}') throw new InvalidDataException("Products array not found.");
                string key = ReadValue(true);
                Expect(':');
                if (key == "\"Products\"") { Expect('['); break; }
                ReadValue(false);
                Expect(',');
            }
        } catch { r.Dispose(); throw; }
    }
    private int Peek() {
        while (r.Peek() >= 0 && Char.IsWhiteSpace((char)r.Peek())) r.Read();
        return r.Peek();
    }
    private void Expect(char c) {
        if (Peek() != c) throw new InvalidDataException("Expected " + c);
        r.Read();
    }
    // Balanced JSON value scanner, aware of quotes and escaped characters.
    private string ReadValue(bool capture) {
        int ch = Peek();
        if (ch < 0) throw new InvalidDataException("Unexpected EOF.");
        StringBuilder b = capture ? new StringBuilder() : null;
        bool quoted = false, escaped = false;
        int depth = 0;
        bool composite = ch == '{' || ch == '[';
        bool stringValue = ch == '"';
        while (true) {
            ch = r.Peek();
            if (ch < 0) throw new InvalidDataException("Truncated JSON value.");
            if (!composite && !stringValue && (ch == ',' || ch == '}' || Char.IsWhiteSpace((char)ch))) break;
            r.Read();
            char c = (char)ch;
            if (capture) {
                b.Append(c);
                if (b.Length > 16777216) throw new InvalidDataException("Single product exceeds 16MB.");
            }
            if (quoted) {
                if (escaped) escaped = false;
                else if (c == '\\') escaped = true;
                else if (c == '"') { quoted = false; if (stringValue) break; }
            } else {
                if (c == '"') quoted = true;
                else if (c == '{' || c == '[') depth++;
                else if (c == '}' || c == ']') { depth--; if (composite && depth == 0) break; }
            }
        }
        return capture ? b.ToString() : null;
    }
    public string Next() {
        if (finished) return null;
        if (Peek() == ']') {
            r.Read();
            // Consume remaining root properties without retaining them.
            while (Peek() == ',') { r.Read(); ReadValue(false); Expect(':'); ReadValue(false); }
            Expect('}');
            if (Peek() != -1) throw new InvalidDataException("Unexpected data after root.");
            finished = true; return null;
        }
        if (!first) { Expect(','); if (Peek() == ']') throw new InvalidDataException("Trailing comma."); }
        if (Peek() != '{') throw new InvalidDataException("Products must contain objects.");
        first = false;
        return ReadValue(true);
    }
    public void Dispose() { r.Dispose(); }
}
"@
}


if ([string]::IsNullOrWhiteSpace($InputPath)) {
    $latest=Get-ChildItem -LiteralPath $CheckDirectory -Directory | Where-Object Name -like 'check-*' | Sort-Object CreationTimeUtc,Name -Descending | Select-Object -First 1
    if ($null -eq $latest) { throw 'No prior check found. Specify -InputPath to the local official JSON.' }
    $latestSummary=Get-Content -LiteralPath (Join-Path $latest.FullName 'run-summary.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    $InputPath=$latestSummary.Source
}
$source=Get-Item -LiteralPath $InputPath
if ($source.PSIsContainer) { throw 'InputPath must be a file.' }
$sourceSize=$source.Length; $sourceDate=$source.LastWriteTimeUtc
$inputs=New-Object System.Collections.Generic.List[string]
if ($Mode -eq 'CheckedSamples') {
    foreach ($folder in @(Get-ChildItem -LiteralPath $CheckDirectory -Directory | Where-Object Name -like 'check-*' | Sort-Object CreationTimeUtc,Name)) {
        $summaryPath=Join-Path $folder.FullName 'run-summary.json'
        if (-not (Test-Path -LiteralPath $summaryPath -PathType Leaf)) { continue }
        $s=Get-Content -LiteralPath $summaryPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($s.Completed -is [bool] -and $s.Completed -and $s.Source -eq $source.FullName -and $s.SourceBytes -eq $sourceSize -and $s.SourceModifiedUtc -eq $sourceDate.ToString('o')) {
            $jsonl=Join-Path $folder.FullName 'selected-products.jsonl'
            if (Test-Path -LiteralPath $jsonl -PathType Leaf) { $inputs.Add($jsonl) }
        }
    }
    if ($inputs.Count -eq 0) { throw 'No completed sample reports match this source file size/date. Do not mix database versions.' }
} else { $inputs.Add($source.FullName) }
$runDir=Join-Path $OutputDirectory ('normalize-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,6))
New-Item -ItemType Directory -Path $runDir -Force | Out-Null
$jsonUtf8=New-Object Text.UTF8Encoding($false)
$allWriter=New-Object IO.StreamWriter((Join-Path $runDir 'normalized-products.jsonl'),$false,$jsonUtf8)
$auditWriter=New-Object IO.StreamWriter((Join-Path $runDir 'normalization-audit.jsonl'),$false,$jsonUtf8)
$reviewWriter=New-Object IO.StreamWriter((Join-Path $runDir 'review-products.jsonl'),$false,$jsonUtf8)
$issueWriter=New-Object IO.StreamWriter((Join-Path $runDir 'issues.jsonl'),$false,$jsonUtf8)
$csvWriter=New-Object IO.StreamWriter((Join-Path $runDir 'normalized-preview.csv'),$false,(New-Object Text.UTF8Encoding($true)))
$seen=@{}; $conflicts=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
$hash=[Security.Cryptography.SHA256]::Create()
$count=0; $reviewCount=0; $consistentCount=0; $duplicates=0; $csvCount=0; $completed=$false; $arrayEnd=$false; $failure=$null; $issueCounts=@{}; $seriesCounts=@{}
function Write-Product($Product,[string]$Path,[long]$Index) {
    $record=Normalize-Product $Product $Path $Index
    $canonical=ConvertTo-Json -InputObject $Product -Compress -Depth 100
    $fingerprint=[BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($canonical)))
    $key=$record.partNo
    if (Present $key) {
        if ($seen.ContainsKey($key)) {
            if ($seen[$key] -eq $fingerprint) { $script:duplicates++; return }
            [void]$conflicts.Add($key)
            $record.validation.status='review'
            $record.validation.issues+= [pscustomobject]@{severity='error';code='conflicting-duplicate-part-number';field='Partno';rawValue=$key;textValue=$null}
        } else { $seen[$key]=$fingerprint }
    }
    $script:count++
    $group=if (Present $record.series) {$record.series} else {'(unknown)'}
    if (-not $seriesCounts.ContainsKey($group)) { $seriesCounts[$group]=0 }
    $seriesCounts[$group]++
    $auditWriter.WriteLine((ConvertTo-Json -InputObject ([pscustomobject]@{partNo=$record.partNo;provenance=$record.provenance;rawFields=$record.rawFields;checks=$record.validation.checks}) -Compress -Depth 100))
    $record.PSObject.Properties.Remove('rawFields')
    $record.validation.PSObject.Properties.Remove('checks')
    $record | Add-Member -NotePropertyName auditReference -NotePropertyValue ([pscustomobject]@{file='normalization-audit.jsonl';line=$script:count})
    $line=ConvertTo-Json -InputObject $record -Compress -Depth 100
    $allWriter.WriteLine($line)
    if ($record.validation.status -eq 'review') { $script:reviewCount++; $reviewWriter.WriteLine($line) } else { $script:consistentCount++ }
    foreach ($issue in $record.validation.issues) {
        if (-not $issueCounts.ContainsKey($issue.code)) { $issueCounts[$issue.code]=0 }
        $issueCounts[$issue.code]++
        $issueWriter.WriteLine((ConvertTo-Json -InputObject ([pscustomobject]@{partNo=$record.partNo;provenance=$record.provenance;issue=$issue}) -Compress -Depth 100))
    }
    if ($script:csvCount -lt $PreviewCount) {
        $dc=@($record.spec.voltages | Where-Object { $_.type -eq 'DC' -and $null -eq $_.safetyClass })
        $ac=@($record.spec.voltages | Where-Object { $_.type -eq 'AC' -and $null -eq $_.safetyClass })
        $row=[pscustomobject][ordered]@{partNo=(Csv-Cell $record.partNo);series=(Csv-Cell $record.series);capacitancePf=$record.spec.capacitancePf;dcVoltageV=$(if ($dc.Count -gt 0) {$dc[0].valueV} else {$null});acVoltageV=$(if ($ac.Count -gt 0) {$ac[0].valueV} else {$null});sizeInch=(Csv-Cell $record.spec.sizeInch);sizeMetric=(Csv-Cell $record.spec.sizeMetric);lengthMm=$record.spec.lengthMm;widthMm=$record.spec.widthMm;thicknessMm=$record.spec.thicknessMm;thicknessMaxMm=$record.spec.thicknessMaxMm;temperature=(Csv-Cell $record.spec.temperature);toleranceKind=$record.spec.tolerance.kind;toleranceValue=$record.spec.tolerance.value;toleranceUnit=$record.spec.tolerance.unit;aecQ200=$record.compliance.aecQ200;statusRaw=(Csv-Cell $record.lifecycle.rawStatus);validation=$record.validation.status;issueCodes=($record.validation.issues.code -join ';');typedVoltages=(Csv-Cell (ConvertTo-Json -InputObject @($record.spec.voltages) -Compress -Depth 10))}
        $lines=@($row | ConvertTo-Csv -NoTypeInformation)
        if ($script:csvCount -eq 0) { $csvWriter.WriteLine($lines[0]) }
        $csvWriter.WriteLine($lines[1]); $script:csvCount++
    }
    if ($script:count % 1000 -eq 0) { Write-Host "Normalized $script:count products; review $script:reviewCount." }
}
try {
    foreach ($path in $inputs) {
        Write-Host "Reading locally: $path"
        $reader=$null
        try {
            if ($Mode -eq 'CheckedSamples') {
                $reader=New-Object IO.StreamReader($path,(New-Object Text.UTF8Encoding($false,$true)),$true)
                $index=0
                while ($null -ne ($line=$reader.ReadLine())) {
                    $index++
                    if ([string]::IsNullOrWhiteSpace($line)) { continue }
                    if ($line.Length -gt 16777216) { throw 'Sample record exceeds 16MB.' }
                    Write-Product (ConvertFrom-Json -InputObject $line) $path $index
                }
            } else {
                $reader=New-Object PnrepNormalizationReader($source.FullName)
                $index=0
                while ($Mode -eq 'Full' -or $index -lt $PreviewCount) {
                    $raw=$reader.Next()
                    if ($null -eq $raw) { $arrayEnd=$true; break }
                    $index++
                    Write-Product (ConvertFrom-Json -InputObject $raw) $path $index
                }
            }
        } finally { if ($null -ne $reader) { $reader.Dispose() } }
    }
    if ($count -eq 0) { throw 'No products were normalized.' }
    if ($conflicts.Count -gt 0) {
        # Quarantine every occurrence, including earlier records written before a conflict was discovered.
        $allWriter.Dispose(); $reviewWriter.Dispose(); $issueWriter.Dispose(); $csvWriter.Dispose(); $auditWriter.Dispose()
        $readBack=New-Object IO.StreamReader((Join-Path $runDir 'normalized-products.jsonl'),$jsonUtf8,$true)
        $fixedAll=New-Object IO.StreamWriter((Join-Path $runDir 'normalized-products.fixed.jsonl'),$false,$jsonUtf8)
        $fixedReview=New-Object IO.StreamWriter((Join-Path $runDir 'review-products.fixed.jsonl'),$false,$jsonUtf8)
        $fixedIssues=New-Object IO.StreamWriter((Join-Path $runDir 'issues.fixed.jsonl'),$false,$jsonUtf8)
        $reviewCount=0; $consistentCount=0; $issueCounts=@{}
        try {
            while ($null -ne ($line=$readBack.ReadLine())) {
                $record=ConvertFrom-Json -InputObject $line
                if (Present $record.partNo) {
                    if ($conflicts.Contains($record.partNo)) {
                        $record.validation.status='review'
                        if ($record.validation.issues.code -notcontains 'conflicting-duplicate-part-number') { $record.validation.issues+= [pscustomobject]@{severity='error';code='conflicting-duplicate-part-number';field='Partno';rawValue=$record.partNo;textValue=$null} }
                    }
                }
                $fixedLine=ConvertTo-Json -InputObject $record -Compress -Depth 100
                $fixedAll.WriteLine($fixedLine)
                if ($record.validation.status -eq 'review') { $reviewCount++; $fixedReview.WriteLine($fixedLine) } else { $consistentCount++ }
                foreach ($issue in $record.validation.issues) {
                    if (-not $issueCounts.ContainsKey($issue.code)) { $issueCounts[$issue.code]=0 }
                    $issueCounts[$issue.code]++
                    $fixedIssues.WriteLine((ConvertTo-Json -InputObject ([pscustomobject]@{partNo=$record.partNo;provenance=$record.provenance;issue=$issue}) -Compress -Depth 100))
                }
            }
        } finally { $readBack.Dispose();$fixedAll.Dispose();$fixedReview.Dispose();$fixedIssues.Dispose() }
        foreach ($name in @('normalized-products','review-products','issues')) { Move-Item -LiteralPath (Join-Path $runDir ($name+'.fixed.jsonl')) -Destination (Join-Path $runDir ($name+'.jsonl')) -Force }
        $csvPath=Join-Path $runDir 'normalized-preview.csv'
        $previewRows=@(Import-Csv -LiteralPath $csvPath -Encoding UTF8)
        foreach ($row in $previewRows) {
            $key=$row.partNo
            if ($key -match "^'\s*[=+@-]") { $key=$key.Substring(1) }
            if ($conflicts.Contains($key)) { $row.validation='review'; $row.issueCodes=(@(($row.issueCodes.Split(';') | Where-Object { $_ }) + @('conflicting-duplicate-part-number') | Select-Object -Unique) -join ';') }
        }
        $previewRows | Export-Csv -LiteralPath $csvPath -NoTypeInformation -Encoding UTF8
    }
    $after=Get-Item -LiteralPath $source.FullName
    if ($after.Length -ne $sourceSize -or $after.LastWriteTimeUtc -ne $sourceDate) { throw 'Official source changed during conversion. Results are incomplete.' }
    $completed=$true
} catch { $failure=$_.Exception.Message; throw } finally {
    $allWriter.Dispose(); $reviewWriter.Dispose(); $issueWriter.Dispose(); $csvWriter.Dispose(); $auditWriter.Dispose(); $hash.Dispose()
    $summary=[ordered]@{toolVersion=3;toolBuild=$toolBuild;scriptPath=$converterScriptPath;schemaVersion=1;mode=$Mode;source=$source.FullName;sourceBytes=$sourceSize;sourceModifiedUtc=$sourceDate.ToString('o');inputFiles=@($inputs.ToArray());completed=$completed;failure=$failure;products=$count;consistentProducts=$consistentCount;reviewProducts=$reviewCount;exactDuplicateRecordsSkipped=$duplicates;conflictingPartNumbers=@($conflicts | Sort-Object);seriesCounts=$seriesCounts;issueCounts=$issueCounts;fullDatabaseRead=($Mode -eq 'Full' -and $arrayEnd -and $completed);companyAccepted=$false;datasheetsVerified=$false;numericAssumptions=@{capacitance='F';dimension='m';voltage='V';acceptance='numeric/text correspondence required per field';relativeTolerance=0.000001;absoluteTolerance=0.000000001};generatedAt=(Get-Date).ToString('o')}
    $summary | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath (Join-Path $runDir 'normalization-summary.json') -Encoding UTF8
    $modeLabel=@{CheckedSamples='已有检查样本';Preview='数据库头部预览';Full='全库读取'}[$Mode]
    $stateLabel=if ($completed) {'正常结束'} else {'未完成，请处理报错'}
    $labels=@{'missing-numeric'='缺少原始数字';'invalid-numeric'='原始数字类型或数值无效';'unrecognized-or-missing-text'='规格文字缺失或暂不能识别';'numeric-text-conflict'='数字与文字不一致';'numeric-overflow'='换算超出数字范围';'voltage-type-conflict'='电压 AC/DC 语义冲突';'missing-capacitance'='缺少容值';'missing-verified-voltage'='没有可核对的电压';'missing-verified-size'='没有可核对的封装或尺寸';'missing-part-number'='缺少料号';'missing-field'='缺少字段';'unexpected-field-type'='字段类型不符合预期';'unrecognized-size-code'='封装代码暂不能识别';'thickness-exceeds-maximum'='标称厚度大于最大厚度';'aec-unverified'='AEC-Q200 类型待核对';'lifecycle-unmapped'='生命周期含义待核对';'lifecycle-nrnd'='不推荐用于新设计（NRND），需选型确认';'missing-tolerance'='缺少精度';'unrecognized-tolerance'='精度格式暂不能识别';'missing-datasheet'='缺少规格书链接';'unrecognized-datasheet-shape-or-url'='规格书结构或链接格式待核对';'unrecognized-product-url'='产品链接格式待核对';'conflicting-duplicate-part-number'='同一料号出现不同内容'}
    $html='<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Murata 规格整理结果</title><style>body{font:16px/1.7 system-ui;margin:32px;color:#191919}table{border-collapse:collapse;width:100%}td,th{padding:8px;border:1px solid #ddd;text-align:left}.note{background:#f2f7f3;padding:16px}</style><h1>Murata 规格整理结果</h1><p>工具版本：'+[Net.WebUtility]::HtmlEncode($toolBuild)+'（NRND 与非对称公差修正版）</p><p>运行脚本：'+[Net.WebUtility]::HtmlEncode($converterScriptPath)+'</p><p>运行：'+$stateLabel+'｜范围：'+$modeLabel+'</p><p>产品记录：'+$count+'｜已校验字段一致：'+$consistentCount+'｜待核查：'+$reviewCount+'｜冲突料号：'+$conflicts.Count+'</p><p class="note">字段一致只表示所校验的数字与文字对应，不代表规格书、生命周期或公司验收已完成。原值和核对明细保存在 normalization-audit.jsonl；待核查记录见 review-products.jsonl，逐项异常见 issues.jsonl。公司数据仅在本机读取，无网络上传。</p><table><tr><th>待核查原因</th><th>记录代码</th><th>次数</th></tr>'
    foreach ($code in ($issueCounts.Keys | Sort-Object)) { $html+='<tr><td>'+[Net.WebUtility]::HtmlEncode($labels[$code])+'</td><td>'+[Net.WebUtility]::HtmlEncode($code)+'</td><td>'+$issueCounts[$code]+'</td></tr>' }
    $html+='</table><p>'+[Net.WebUtility]::HtmlEncode($failure)+'</p></html>'
    [IO.File]::WriteAllText((Join-Path $runDir 'local-normalization-report.html'),$html,(New-Object Text.UTF8Encoding($true)))
}
Write-Host "Saved normalized data and local report: $runDir"
Write-Host "Products: $count; review: $reviewCount; conflicting part numbers: $($conflicts.Count)"
[pscustomobject]@{RunDirectory=$runDir;Products=$count;ReviewProducts=$reviewCount;Completed=$completed}
