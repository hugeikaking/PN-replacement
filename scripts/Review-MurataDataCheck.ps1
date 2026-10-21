[CmdletBinding()]
param(
    [string]$RunDirectory = '',
    [ValidateRange(1,10000)][int]$ExpectedPreviewCount = 1000
)
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($RunDirectory)) {
    $base = Join-Path $env:USERPROFILE 'Desktop\Murata_Data_Check'
    $latest = Get-ChildItem -LiteralPath $base -Directory | Where-Object { $_.Name -like 'check-*' } | Sort-Object CreationTimeUtc,Name -Descending | Select-Object -First 1
    if ($null -eq $latest) { throw "No check-* result folder found in $base" }
    $RunDirectory = $latest.FullName
}
$run = Get-Item -LiteralPath $RunDirectory
if (-not $run.PSIsContainer) { throw 'RunDirectory must be a folder.' }
Write-Host "Checking local result folder: $($run.FullName)"
foreach ($name in @('run-summary.json','field-profile.csv','series-samples.csv','preview.csv','selected-products.jsonl')) {
    if (-not (Test-Path -LiteralPath (Join-Path $run.FullName $name) -PathType Leaf)) { throw "Missing $name. Extraction may still be running. Wait for Saved validation files." }
}
$summary = Get-Content -LiteralPath (Join-Path $run.FullName 'run-summary.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$profile = @(Import-Csv -LiteralPath (Join-Path $run.FullName 'field-profile.csv') -Encoding UTF8)
$samples = @(Import-Csv -LiteralPath (Join-Path $run.FullName 'series-samples.csv') -Encoding UTF8)
$preview = @(Import-Csv -LiteralPath (Join-Path $run.FullName 'preview.csv') -Encoding UTF8)
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
foreach ($sample in $samples) {
    $info = Get-CapacitanceInfo ([string]$sample.'Specs.CapacitanceText')
    $sample | Add-Member -NotePropertyName CapacitanceRange -NotePropertyValue $info.Range -Force
    $sample | Add-Member -NotePropertyName CapacitancePfFromText -NotePropertyValue $info.ValuePf -Force
}
$checks = New-Object System.Collections.Generic.List[object]
function Add-Check([string]$State, [string]$Name, [string]$Detail) {
    $checks.Add([pscustomobject]@{State=$State; Check=$Name; Detail=$Detail})
}
function Is-Present($Value) { return $null -ne $Value -and -not [string]::IsNullOrWhiteSpace([string]$Value) }
function Has($Row, [string]$Column) { return Is-Present $Row.$Column }
if ($summary.Completed -is [bool] -and $summary.Completed) { Add-Check 'PASS' '采样结束' '采样脚本正常结束；不等于全库和单位已验证。' }
else { Add-Check 'ERROR' '采样结束' 'Completed 不是布尔 true，请查看提取时的报错。' }
if ($preview.Count -eq $summary.PreviewRows -and $preview.Count -eq $ExpectedPreviewCount) { Add-Check 'PASS' '预览数量' "$($preview.Count) 条，与记录及本次目标一致。" }
elseif ($summary.StopReason -eq 'end-of-products' -and $preview.Count -eq $summary.PreviewRows -and $preview.Count -lt $ExpectedPreviewCount) { Add-Check 'TODO' '预览数量' '本次剩余产品不足目标数量，已到数组末尾；不是运行失败。' }
else { Add-Check 'ERROR' '预览数量' "CSV=$($preview.Count)，记录=$($summary.PreviewRows)，期望=$ExpectedPreviewCount。" }
if ($null -eq $summary.Scanned -or $summary.Scanned -lt $preview.Count) { Add-Check 'ERROR' '扫描数量' '扫描记录缺失或小于预览行数。' }
$seenFields = @{}
foreach ($field in $profile) {
    $count=0L; $scanned=0L
    if ($seenFields.ContainsKey($field.Field)) { Add-Check 'ERROR' '字段统计' "重复字段：$($field.Field)" }
    $seenFields[$field.Field]=$true
    if (-not [long]::TryParse([string]$field.NonEmptyCount,[ref]$count) -or -not [long]::TryParse([string]$field.Scanned,[ref]$scanned) -or $scanned -ne $summary.Scanned -or $count -lt 0 -or $count -gt $scanned) { Add-Check 'ERROR' '字段统计' "计数异常：$($field.Field)" }
}
if ($profile.Count -eq 0) { Add-Check 'ERROR' '字段统计' '字段报告为空。' }
foreach ($prefix in @('GRM','GCM','KRM','DK1')) {
    $subset = @($samples | Where-Object { $_.Partno -like "$prefix*" })
    $recorded = $summary.SeriesSamples.$prefix
    if ($null -eq $recorded -or $subset.Count -ne $recorded) { Add-Check 'ERROR' "$prefix 样本数量" "CSV=$($subset.Count)，记录=$recorded。" }
    elseif ($subset.Count -eq 0 -and $summary.ToolVersion -ge 3 -and $prefix -ne 'DK1' -and $prefix -notin $summary.TargetSeries) { Add-Check 'INFO' "$prefix 样本覆盖" '此系列不是本次查找目标；请结合前次报告。' }
    elseif ($subset.Count -eq 0) { Add-Check 'TODO' "$prefix 样本覆盖" '扫描范围未找到；不表示数据库无此系列。' }
    else { Add-Check 'PASS' "$prefix 样本覆盖" "找到 $($subset.Count) 条；规格准确性仍需对照官方产品页。" }
    if ($subset.Count -gt 0 -and $prefix -ne 'DK1') {
        $units = @{}
        foreach ($sample in $subset) { $units[$sample.CapacitanceRange] = $true }
        $missing = @(@('pf','nf','uf') | Where-Object { -not $units.ContainsKey($_) })
        if ($missing.Count -gt 0) { Add-Check 'TODO' "$prefix 容值范围" "缺少这些实际容值范围的样本：$($missing -join ', ')。可使用新版采样脚本的 -DiverseSamples；未采到不代表数据库没有。" }
        else { Add-Check 'INFO' "$prefix 容值范围" '已采集 pF/nF/uF 实际容值范围样本；仍需逐项对照原始数值，不能据此认定单位已校准。' }
    }
}
if ($summary.StopReason -eq 'max-scan') { Add-Check 'INFO' '停止原因' "达到扫描上限 $($summary.Scanned)，这是正常停止。" }
$columns = @('Partno','Series','Status','CapacitanceTextBucket','CapacitanceRange','CapacitancePfFromText','Specs.Capacitance','Specs.CapacitanceText','Specs.ToleranceCapacitance','Specs.RatedVoltageDC','Specs.RatedVoltageDCText','Specs.RatedVoltageAC','Specs.RatedVoltageACText','Specs.X1RatedVoltageAC','Specs.X1RatedVoltageDC','Specs.X2RatedVoltageAC','Specs.X2RatedVoltageDC','Specs.Y1RatedVoltageAC','Specs.Y1RatedVoltageDC','Specs.Y2RatedVoltageAC','Specs.Y2RatedVoltageDC','Specs.SizeCodeInInch','Specs.SizecodeMm','Specs.Length','Specs.LengthText','Specs.Width','Specs.WidthText','Specs.Thickness','Specs.ThicknessText','Specs.ThicknessMax','Specs.ThicknessMaxText','Specs.TemperatureCharacteristics','Specs.TemperatureCharacteristicsCompliedStandard','ComplianceInfo.AecQ200Support','MediaFileUrls.SpecificationsSheet','ProductDetailUrl')
foreach ($sample in $samples) {
    if (-not (Has $sample 'Partno')) { Add-Check 'ERROR' '样本料号' '存在无料号的样本。'; continue }
    foreach ($required in @('Specs.CapacitanceText','Specs.TemperatureCharacteristics','Status','MediaFileUrls.SpecificationsSheet')) {
        if (-not (Has $sample $required)) { Add-Check 'TODO' $sample.Partno "字段为空：$required；需本地对照原始产品确定原因。" }
    }
    if ($sample.Partno -like 'DK1*') {
        $hasVoltage=$false
        foreach ($f in @('Specs.RatedVoltageAC','Specs.RatedVoltageACText','Specs.X1RatedVoltageAC','Specs.X1RatedVoltageDC','Specs.X2RatedVoltageAC','Specs.X2RatedVoltageDC','Specs.Y1RatedVoltageAC','Specs.Y1RatedVoltageDC','Specs.Y2RatedVoltageAC','Specs.Y2RatedVoltageDC')) { if (Has $sample $f) { $hasVoltage=$true } }
        if (-not $hasVoltage) { Add-Check 'TODO' $sample.Partno '未观察到 AC/X/Y 电压；查看原始产品 Specs。' }
        else { Add-Check 'INFO' $sample.Partno '观察到 AC/X/Y 电压；必须与普通 DC 分别存储。' }
    } elseif ($sample.Partno -match '^(GRM|GCM|KRM)') {
        if (-not (Has $sample 'Specs.RatedVoltageDC') -and -not (Has $sample 'Specs.RatedVoltageDCText')) { Add-Check 'TODO' $sample.Partno '普通 MLCC 的 DC 电压字段均为空，待核查。' }
    }
    if (-not (Has $sample 'Specs.SizeCodeInInch') -and -not ((Has $sample 'Specs.Length') -and (Has $sample 'Specs.Width'))) { Add-Check 'TODO' $sample.Partno '缺英制尺寸及完整 L/W；查看原始字段。' }
    $aec = [string]$sample.'ComplianceInfo.AecQ200Support'
    if ($aec -notin @('True','False','true','false')) { Add-Check 'TODO' $sample.Partno 'AEC-Q200 非已识别布尔文本，需确认字段实际语义。' }
}
Add-Check 'TODO' '单位确认' '仅保留原值；必须本地对照容值、电压、长度的数值和 Text，才能决定统一单位。'
Add-Check 'TODO' '规格书与生命周期' '本工具不联网。规格书链接有效性、Status 枚举及车规要求需公司本地确认。'
function Escape($Value) { return [System.Net.WebUtility]::HtmlEncode([string]$Value) }
$html = New-Object System.Text.StringBuilder
[void]$html.Append('<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Murata 本地数据检查</title><style>body{font:15px/1.7 system-ui,sans-serif;margin:32px;color:#222}h1{font-size:24px}.scroll{overflow:auto}table{border-collapse:collapse;width:100%;margin:16px 0}td,th{border:1px solid #ddd;padding:8px;text-align:left;vertical-align:top;max-width:420px;overflow-wrap:anywhere}th{background:#f5f5f5}.ERROR{color:#b42318}.TODO{color:#986800}.PASS{color:#078244}.note{padding:16px;background:#f1f7f3}</style><h1>Murata 本地数据检查</h1>')
[void]$html.Append('<p>结果目录：' + (Escape $run.FullName) + '</p><p class="note">数据只在本机读取，报告无脚本、无外部资源、无自动上传。PASS 表示对应检查成立，不代表型号映射或单位已全部校准。</p><h2>检查结果</h2><table><tr><th>状态</th><th>检查项</th><th>说明</th></tr>')
foreach ($check in $checks) { [void]$html.Append('<tr><td class="' + $check.State + '">' + (Escape $check.State) + '</td><td>' + (Escape $check.Check) + '</td><td>' + (Escape $check.Detail) + '</td></tr>') }
[void]$html.Append('</table><h2>系列样本：原始数值和文字</h2><p>CapacitanceRange 和 CapacitancePfFromText 由容值文字换算，不表示原始数字字段单位已验证。左右滚动查看；空白表示没有观测到值，不自动补全。false 表示明确的否，空值表示未知。</p><div class="scroll"><table><tr>')
foreach ($col in $columns) { [void]$html.Append('<th>' + (Escape $col) + '</th>') }
[void]$html.Append('</tr>')
foreach ($sample in $samples) { [void]$html.Append('<tr>'); foreach ($col in $columns) { [void]$html.Append('<td>' + (Escape $sample.$col) + '</td>') }; [void]$html.Append('</tr>') }
[void]$html.Append('</table></div><h2>字段类型和覆盖统计</h2><table><tr><th>字段</th><th>非空/扫描</th><th>观察到的类型</th><th>示例（原值）</th></tr>')
foreach ($field in $profile) { [void]$html.Append('<tr><td>' + (Escape $field.Field) + '</td><td>' + (Escape ($field.NonEmptyCount + '/' + $field.Scanned)) + '</td><td>' + (Escape $field.ObservedTypes) + '</td><td>' + (Escape $field.Examples) + '</td></tr>') }
[void]$html.Append('</table><h2>下一步：本地人工验收</h2><ol><li>先处理 ERROR 项，确认文件来自同一次提取。</li><li>对照 GCM 产品页确认容值/电压/尺寸的单位、精度和 AEC-Q200。</li><li>对照 DK1 规格确认安规类别、AC/DC 各字段及尺寸公差。</li><li>GRM/KRM 未采集时保留待验证状态，后续补代表样本。</li><li>报告及原始数据保留在公司，无需传出。</li></ol></html>')
$output = Join-Path $run.FullName ('local-review-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [guid]::NewGuid().ToString('N').Substring(0,6) + '.html')
[IO.File]::WriteAllText($output, $html.ToString(), (New-Object Text.UTF8Encoding($true)))
$errors = @($checks | Where-Object { $_.State -eq 'ERROR' }).Count
$todo = @($checks | Where-Object { $_.State -eq 'TODO' }).Count
Write-Host "Checks: ERROR=$errors; TODO=$todo"
Write-Host "Local report saved: $output"
Write-Host 'Double-click the HTML report to open it in your company browser.'
[pscustomobject]@{ReportPath=$output; ErrorCount=$errors; TodoCount=$todo; UnitsVerified=$false; SchemaVerified=$false}
