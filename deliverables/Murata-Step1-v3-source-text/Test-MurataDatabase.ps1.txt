[CmdletBinding()]
param(
    [string]$InputPath = (Join-Path $env:USERPROFILE 'Desktop\Murata_MLCC.json'),
    [string]$OutputDirectory = (Join-Path $env:USERPROFILE 'Desktop\Murata_Data_Check'),
    [ValidateRange(1,10000)][int]$PreviewCount = 1000,
    [ValidateRange(1,10000000)][int]$MaxScan = 20000,
    [ValidateRange(1,100)][int]$SamplesPerSeries = 5,
    [switch]$DiverseSamples,
    [ValidateRange(0,10000000)][int]$StartIndex = 0,
    [ValidateSet('GRM','GCM','KRM')][string[]]$TargetSeries = @('GRM','GCM','KRM'),
    [switch]$FindMissingSeries
)
$ErrorActionPreference = 'Stop'
if ($MaxScan -lt $PreviewCount) { throw 'MaxScan must be >= PreviewCount.' }
if ($DiverseSamples -and $SamplesPerSeries -lt 5) { throw 'DiverseSamples requires SamplesPerSeries >= 5 (pF, nF, uF, F ranges and unknown).' }
if ($TargetSeries.Count -eq 0) { throw 'TargetSeries must not be empty.' }
$TargetSeries = @($TargetSeries | ForEach-Object { $_.ToUpperInvariant() } | Select-Object -Unique)
$source = Get-Item -LiteralPath $InputPath
if ($source.PSIsContainer) { throw 'Input must be a JSON file.' }
# C# reads buffered characters; never loads the whole product database.
if (-not ('PnrepProductReader' -as [type])) {
Add-Type -TypeDefinition @"
using System;
using System.IO;
using System.Text;
public sealed class PnrepProductReader : IDisposable {
    private readonly StreamReader r;
    private bool first = true;
    private bool finished = false;
    public PnrepProductReader(string path) {
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
$runName = 'check-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,6)
$runDir = Join-Path $OutputDirectory $runName
New-Item -ItemType Directory -Path $runDir -Force | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($true)
$previewWriter = New-Object System.IO.StreamWriter((Join-Path $runDir 'preview.csv'), $false, $utf8)
$sampleWriter = New-Object System.IO.StreamWriter((Join-Path $runDir 'series-samples.csv'), $false, $utf8)
$rawWriter = New-Object System.IO.StreamWriter((Join-Path $runDir 'selected-products.jsonl'), $false, $utf8)
$seriesCounts = @{ GRM=0; GCM=0; KRM=0; DK1=0 }
$sampleBuckets = @{ GRM=@{}; GCM=@{}; KRM=@{}; DK1=@{} }
$specFields = @('Capacitance','CapacitanceText','ToleranceCapacitance','RatedVoltageDC','RatedVoltageDCText','RatedVoltageAC','RatedVoltageACText','X1RatedVoltageAC','X1RatedVoltageACText','X1RatedVoltageDC','X1RatedVoltageDCText','X2RatedVoltageAC','X2RatedVoltageACText','X2RatedVoltageDC','X2RatedVoltageDCText','Y1RatedVoltageAC','Y1RatedVoltageACText','Y1RatedVoltageDC','Y1RatedVoltageDCText','Y2RatedVoltageAC','Y2RatedVoltageACText','Y2RatedVoltageDC','Y2RatedVoltageDCText','SizeCode','SizeCodeInInch','SizecodeMm','Length','LengthText','Width','WidthText','Thickness','ThicknessText','ThicknessMax','ThicknessMaxText','TemperatureCharacteristics','TemperatureCharacteristicsCompliedStandard','MaxOperatingTemperature','MaxOperatingTemperatureText','OperatingTemperatureRange')
$rootFields = @('Partno','PartnoWithoutPackageCode','ProductName','Series','Status','NewProduct','Application','ProductDetailUrl')
$paths = @($rootFields) + @($specFields | ForEach-Object { 'Specs.' + $_ }) + @('ComplianceInfo.AecQ200Support','ComplianceInfo.Rohs','ComplianceInfo.Reach','MediaFileUrls.SpecificationsSheet')
$stats = @{}
function Read-Field($Object, [string]$Path) {
    $v = $Object
    foreach ($key in $Path.Split('.')) {
        if ($null -eq $v) { return $null }
        $prop = $v.PSObject.Properties[$key]
        if ($null -eq $prop) { return $null }
        $v = $prop.Value
    }
    return ,$v
}
function Cell($Value) {
    if ($null -eq $Value) { return '' }
    if ($Value -is [string]) { return $Value }
    if ($Value -is [ValueType]) { return [Convert]::ToString($Value, [Globalization.CultureInfo]::InvariantCulture) }
    return ConvertTo-Json -InputObject $Value -Compress -Depth 100
}
function Write-CsvRow($Writer, $Row, [bool]$Header) {
    $lines = @($Row | ConvertTo-Csv -NoTypeInformation)
    if ($Header) { $Writer.WriteLine($lines[0]) }
    $Writer.WriteLine($lines[1])
}
function Get-CapacitanceInfo([string]$Text) {
    # Independent text conversion only. Never assume the numeric source field's unit.
    $result = [pscustomobject]@{TextUnit='unknown'; Range='unknown'; ValuePf=$null}
    $text = $Text.Replace([string][char]0x03bc,'u').Replace([string][char]0x00b5,'u')
    if ($text -notmatch '(?i)^\s*((?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\.[0-9]+)?)\s*(pF|nF|uF|F)\s*$') { return $result }
    $numberText = $Matches[1].Replace(',','')
    $result.TextUnit = $Matches[2].ToLowerInvariant()
    $number = [decimal]0
    if (-not [decimal]::TryParse($numberText,[Globalization.NumberStyles]::AllowDecimalPoint,[Globalization.CultureInfo]::InvariantCulture,[ref]$number) -or $number -le 0) { return $result }
    $scale = @{pf=[decimal]1; nf=[decimal]1000; uf=[decimal]1000000; f=[decimal]1000000000000}
    try { $value = $number * $scale[$result.TextUnit] } catch { return $result }
    $result.ValuePf = $value
    $result.Range = if ($value -lt [decimal]1000) {'pf'} elseif ($value -lt [decimal]1000000) {'nf'} elseif ($value -lt [decimal]1000000000000) {'uf'} else {'f'}
    return $result
}
$reader = $null
$scanned=0; $skipped=0; $preview=0; $sampleTotal=0; $completed=$false; $stopReason='max-scan'
try {
    $reader = New-Object PnrepProductReader($source.FullName)
    while ($skipped -lt $StartIndex) {
        if ($null -eq $reader.Next()) { $stopReason='end-of-products'; break }
        $skipped++
        if ($skipped % 10000 -eq 0) { Write-Host "Skipping previously scanned products: $skipped / $StartIndex" }
    }
    while ($stopReason -ne 'end-of-products' -and $scanned -lt $MaxScan) {
        $raw = $reader.Next()
        if ($null -eq $raw) { $stopReason='end-of-products'; break }
        $p = ConvertFrom-Json -InputObject $raw
        $scanned++
        $pn = [string](Read-Field $p 'Partno')
        if ([string]::IsNullOrWhiteSpace($pn)) { throw "Product $scanned has no Partno; inspect source schema." }
        foreach ($path in $paths) {
            if (-not $stats.ContainsKey($path)) { $stats[$path] = @{Present=0; Examples=(New-Object System.Collections.Generic.List[string]); Types=@{}} }
            $v = Read-Field $p $path
            if ($null -ne $v -and -not ($v -is [string] -and $v.Length -eq 0)) {
                $s = $stats[$path]; $s.Present++
                $s.Types[$v.GetType().FullName] = $true
                if ($s.Examples.Count -lt 3) {
                    $example = Cell $v
                    if (-not $s.Examples.Contains($example)) { $s.Examples.Add($example) }
                }
            }
        }
        $capInfo = Get-CapacitanceInfo ([string](Read-Field $p 'Specs.CapacitanceText'))
        $bucket = $capInfo.Range
        $samplePrefix = $null
        foreach ($prefix in @($TargetSeries) + @('DK1')) {
            if ($pn.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -and $seriesCounts[$prefix] -lt $SamplesPerSeries -and
                (-not $DiverseSamples -or -not $sampleBuckets[$prefix].ContainsKey($bucket))) {
                $samplePrefix = $prefix
                break
            }
        }
        if ($preview -lt $PreviewCount -or $null -ne $samplePrefix) {
            $row = [ordered]@{SampleOrigin='official-file'; ScanIndex=($skipped+$scanned); CapacitanceTextBucket=$capInfo.TextUnit; CapacitanceRange=$bucket; CapacitancePfFromText=(Cell $capInfo.ValuePf)}
            foreach ($path in $paths) { $row[$path] = Cell (Read-Field $p $path) }
            $row = [pscustomobject]$row
            if ($preview -lt $PreviewCount) {
                Write-CsvRow $previewWriter $row ($preview -eq 0)
                $preview++
            }
            if ($null -ne $samplePrefix) {
                Write-CsvRow $sampleWriter $row ($sampleTotal -eq 0)
                $seriesCounts[$samplePrefix]++; $sampleTotal++
                $sampleBuckets[$samplePrefix][$bucket] = $true
            }
            $rawWriter.WriteLine($raw)
        }
        if ($scanned % 1000 -eq 0) { Write-Host "Scanned $scanned products; preview $preview; GRM $($seriesCounts.GRM), GCM $($seriesCounts.GCM), KRM $($seriesCounts.KRM), DK1 $($seriesCounts.DK1)." }
        $targetsCollected = $true
        foreach ($prefix in $TargetSeries) {
            if ($FindMissingSeries) {
                if ($seriesCounts[$prefix] -eq 0) { $targetsCollected=$false }
            } elseif ($DiverseSamples) {
                foreach ($unit in @('pf','nf','uf')) {
                    if (-not $sampleBuckets[$prefix].ContainsKey($unit)) { $targetsCollected = $false }
                }
            } elseif ($seriesCounts[$prefix] -lt $SamplesPerSeries) { $targetsCollected = $false }
        }
        if ($preview -ge $PreviewCount -and $targetsCollected) { $stopReason=$(if ($FindMissingSeries) {'preview-and-target-series-found'} else {'preview-and-target-series-collected'}); break }
    }
    $sourceAfter = Get-Item -LiteralPath $source.FullName
    if ($sourceAfter.Length -ne $source.Length -or $sourceAfter.LastWriteTimeUtc -ne $source.LastWriteTimeUtc) { throw 'Source file changed while scanning; discard this run and restart.' }
    $completed=$true
} finally {
    if ($null -ne $reader) { $reader.Dispose() }
    $previewWriter.Dispose(); $sampleWriter.Dispose(); $rawWriter.Dispose()
    [ordered]@{ ToolVersion=3; SamplingMode=$(if ($DiverseSamples) {'capacitance-value-range-diversity'} else {'first-products'}); TargetSeries=$TargetSeries; FindMissingSeries=[bool]$FindMissingSeries; StartIndex=$StartIndex; Skipped=$skipped; LastProductIndex=($skipped+$scanned); CapacitanceBuckets=$sampleBuckets; Source=$source.FullName; SourceBytes=$source.Length; SourceModifiedUtc=$source.LastWriteTimeUtc.ToString('o'); Completed=$completed; Scanned=$scanned; PreviewRows=$preview; SeriesSamples=$seriesCounts; StopReason=$(if ($completed) {$stopReason} else {'error'}); FullDatabaseVerified=$false; UnitsVerified=$false; GeneratedAt=(Get-Date).ToString('o') } | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $runDir 'run-summary.json') -Encoding UTF8
    $fieldRows = foreach ($path in $paths) {
        $s = $stats[$path]
        [pscustomobject]@{Field=$path; NonEmptyCount=$(if ($s) {$s.Present} else {0}); Scanned=$scanned; ObservedTypes=$(if ($s) {($s.Types.Keys | Sort-Object) -join ';'} else {''}); Examples=$(if ($s) {$s.Examples -join ' | '} else {''}); UnitVerified='No'}
    }
    $fieldRows | Export-Csv -LiteralPath (Join-Path $runDir 'field-profile.csv') -NoTypeInformation -Encoding UTF8
}
Write-Host "Saved validation files: $runDir"
Write-Host "Preview rows: $preview / $PreviewCount; scanned: $scanned; reason: $stopReason"
foreach ($prefix in @('GRM','GCM','KRM','DK1')) { Write-Host "$prefix samples: $($seriesCounts[$prefix])" }
if ($DiverseSamples) {
    foreach ($prefix in @('GRM','GCM','KRM','DK1')) { Write-Host "$prefix value-range buckets: $(($sampleBuckets[$prefix].Keys | Sort-Object) -join ', ')" }
    Write-Host 'Diverse mode uses actual values derived from explicit text units: 10,000pF and 0.1uF are nF-range. Raw fields remain unchanged.'
}
if ($preview -lt $PreviewCount) { Write-Warning 'Fewer preview products than requested.' }
if (@($TargetSeries | Where-Object { $seriesCounts[$_] -eq 0 }).Count -gt 0) { Write-Warning 'Some target series were not found in this scan. This does not prove they are absent from the database.' }
[pscustomobject]@{RunDirectory=$runDir; LastProductIndex=($skipped+$scanned); Scanned=$scanned; Completed=$completed}
