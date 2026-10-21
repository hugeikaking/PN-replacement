[CmdletBinding()]
param(
    [string]$RunDirectory='',
    [ValidateRange(1,10)][int]$ExamplesPerGroup=3
)
$ErrorActionPreference='Stop'
if ([string]::IsNullOrWhiteSpace($RunDirectory)) {
    $base=Join-Path $env:USERPROFILE 'Desktop\Murata_Normalized'
    $latest=Get-ChildItem -LiteralPath $base -Directory | Where-Object Name -like 'normalize-*' | Sort-Object CreationTimeUtc,Name -Descending | Select-Object -First 1
    if ($null -eq $latest) { throw 'No normalization result folder found.' }
    $RunDirectory=$latest.FullName
}
$run=Get-Item -LiteralPath $RunDirectory
if (-not $run.PSIsContainer) { throw 'RunDirectory must be a folder.' }
$summaryPath=Join-Path $run.FullName 'normalization-summary.json'
$issuesPath=Join-Path $run.FullName 'issues.jsonl'
$auditPath=Join-Path $run.FullName 'normalization-audit.jsonl'
foreach ($path in @($summaryPath,$issuesPath,$auditPath)) { if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing file: $path. Wait for conversion to finish." } }
$snapshots=@(foreach ($path in @($summaryPath,$issuesPath,$auditPath)) { $f=Get-Item -LiteralPath $path; [pscustomobject]@{Path=$f.FullName;Size=$f.Length;Date=$f.LastWriteTimeUtc} })
$summary=Get-Content -LiteralPath $summaryPath -Raw -Encoding UTF8 | ConvertFrom-Json
$counts=@{}; $groups=@{}
$statuses=New-Object 'System.Collections.Generic.Dictionary[string,object]' ([StringComparer]::Ordinal)
$voltageExamples=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
$reader=$null
$utf8=New-Object Text.UTF8Encoding($false,$true)
try {
    $reader=New-Object IO.StreamReader($issuesPath,$utf8,$true)
    $lineIndex=0
    while ($null -ne ($line=$reader.ReadLine())) {
        $lineIndex++
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line.Length -gt 16777216) { throw 'Issue line exceeds 16MB.' }
        $entry=ConvertFrom-Json -InputObject $line
        $issue=$entry.issue
        if ($null -eq $issue -or [string]::IsNullOrWhiteSpace([string]$issue.code)) { throw "Issue without code on line $lineIndex." }
        $code=[string]$issue.code
        if (-not $counts.ContainsKey($code)) { $counts[$code]=0 }
        $counts[$code]++
        $key=ConvertTo-Json -InputObject @($code,[string]$issue.field) -Compress
        if (-not $groups.ContainsKey($key)) { $groups[$key]=@{Code=$code;Field=[string]$issue.field;Count=0;Examples=(New-Object System.Collections.Generic.List[object]);Seen=(New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal))} }
        $g=$groups[$key]; $g.Count++
        $fingerprint=ConvertTo-Json -InputObject @($issue.rawValue,$issue.textValue) -Compress -Depth 100
        if ($g.Examples.Count -lt $ExamplesPerGroup -and $g.Seen.Add($fingerprint)) { $g.Examples.Add($entry) }
        if ($code -eq 'lifecycle-unmapped') {
            $statusKey=ConvertTo-Json -InputObject $issue.rawValue -Compress -Depth 100
            if (-not $statuses.ContainsKey($statusKey)) { $statuses[$statusKey]=@{Raw=$issue.rawValue;Count=0;PartNo=$entry.partNo} }
            $statuses[$statusKey].Count++
        }
        if ($code -eq 'missing-verified-voltage' -and $voltageExamples.Count -lt $ExamplesPerGroup -and -not [string]::IsNullOrWhiteSpace([string]$entry.partNo)) { [void]$voltageExamples.Add([string]$entry.partNo) }
    }
} finally { if ($null -ne $reader) { $reader.Dispose() } }
function Display($Value) {
    if ($null -eq $Value) { return '（缺失或 null）' }
    if ($Value -is [string]) {
        if ($Value.Length -eq 0) { return '（空字符串）' }
        $t=$Value
    } elseif ($Value -is [ValueType]) { $t=[Convert]::ToString($Value,[Globalization.CultureInfo]::InvariantCulture) }
    else { $t=ConvertTo-Json -InputObject $Value -Compress -Depth 100 }
    if ($t.Length -gt 600) { return $t.Substring(0,600)+'…（显示已截短，原文见本机 JSONL）' }
    return $t
}
function Esc($Value) { return [Net.WebUtility]::HtmlEncode([string]$Value) }
$errors=New-Object System.Collections.Generic.List[string]
if ($summary.completed -isnot [bool] -or -not $summary.completed) { $errors.Add('上次整理未正常完成；本报告只用于诊断，不代表结果可用。') }
if ($summary.products -ne ($summary.consistentProducts+$summary.reviewProducts)) { $errors.Add('产品总数与一致/待核查数量不一致。') }
$expected=@{}
if ($null -ne $summary.issueCounts) { foreach ($property in $summary.issueCounts.PSObject.Properties) { $expected[$property.Name]=$property.Value } }
foreach ($code in @(@($expected.Keys)+@($counts.Keys) | Select-Object -Unique)) {
    $actual=if ($counts.ContainsKey($code)) {$counts[$code]} else {0}
    $recorded=if ($expected.ContainsKey($code)) {$expected[$code]} else {0}
    if ($actual -ne $recorded) { $errors.Add("问题计数不一致：$code，明细=$actual，汇总=$recorded。") }
}
$html=New-Object Text.StringBuilder
[void]$html.Append('<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Murata 待核查详情</title><style>body{font:16px/1.7 system-ui;margin:28px;color:#191919}table{border-collapse:collapse;width:100%;margin:16px 0}td,th{border:1px solid #ddd;padding:8px;text-align:left;vertical-align:top;overflow-wrap:anywhere}th{background:#f5f5f5}.note{background:#f2f7f3;padding:16px}.error{color:#b42318}.scroll{overflow:auto}</style><h1>Murata 待核查详情</h1><p>结果目录：'+(Esc $run.FullName)+'</p><p>产品记录：'+(Esc $summary.products)+'｜字段一致：'+(Esc $summary.consistentProducts)+'｜待核查：'+(Esc $summary.reviewProducts)+'</p><p class="note">本工具只读取已有结果，另存诊断报告，不重新整理数据库、不修改任何统一值或验收标志。一个产品可能有多个问题，问题次数不能相加当作产品数。下面的状态和规格文字都是原文，没有自动映射或猜测。</p>')
foreach ($errorText in $errors) { [void]$html.Append('<p class="error">'+(Esc $errorText)+'</p>') }
[void]$html.Append('<h2>生命周期状态原文</h2><p>未映射只表示程序尚未确认该状态的含义，不等于产品数据错误。需核对后才能归类正常生产、NRND 或 EOL。</p><table><tr><th>原状态</th><th>原值类型</th><th>次数</th><th>示例料号</th></tr>')
foreach ($key in @($statuses.Keys | Sort-Object)) {
    $s=$statuses[$key]; $type=if ($null -eq $s.Raw) {'null'} else {$s.Raw.GetType().FullName}
    [void]$html.Append('<tr><td>'+(Esc (Display $s.Raw))+'</td><td>'+(Esc $type)+'</td><td>'+(Esc $s.Count)+'</td><td>'+(Esc $s.PartNo)+'</td></tr>')
}
[void]$html.Append('</table><h2>按字段分组的异常样例</h2><p>每组最多 '+$ExamplesPerGroup+' 个不同的数字/文字组合，优先查看 unrecognized-or-missing-text 的原字段和规格文字；列表是样例，不代表全部产品。</p><div class="scroll"><table><tr><th>问题代码</th><th>字段</th><th>次数</th><th>示例料号</th><th>原始数字或值</th><th>原始规格文字</th></tr>')
foreach ($g in @($groups.Values | Sort-Object Code,Field)) {
    foreach ($entry in $g.Examples) {
        [void]$html.Append('<tr><td>'+(Esc $g.Code)+'</td><td>'+(Esc $g.Field)+'</td><td>'+(Esc $g.Count)+'</td><td>'+(Esc $entry.partNo)+'</td><td>'+(Esc (Display $entry.issue.rawValue))+'</td><td>'+(Esc (Display $entry.issue.textValue))+'</td></tr>')
    }
}
[void]$html.Append('</table></div><h2>没有可核对电压：原字段样例</h2><p>只显示最多 '+$ExamplesPerGroup+' 个料号；缺失值和 false 都保留原意。DC/AC 与 X1/X2/Y1/Y2 各字段单独展示，不互相替代。</p><div class="scroll"><table><tr><th>料号</th><th>原字段</th><th>原始数字</th><th>原始文字</th><th>校验状态</th></tr>')
$found=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
try {
    $reader=New-Object IO.StreamReader($auditPath,$utf8,$true)
    while ($voltageExamples.Count -gt 0 -and $null -ne ($line=$reader.ReadLine())) {
        if ([string]::IsNullOrWhiteSpace($line)) { continue }
        if ($line.Length -gt 16777216) { throw 'Audit line exceeds 16MB.' }
        $audit=ConvertFrom-Json -InputObject $line
        if ([string]::IsNullOrWhiteSpace([string]$audit.partNo) -or -not $voltageExamples.Contains([string]$audit.partNo) -or -not $found.Add([string]$audit.partNo)) { continue }
        foreach ($safety in @('','X1','X2','Y1','Y2')) { foreach ($type in @('DC','AC')) {
            $name=$safety+'RatedVoltage'+$type
            $path='Specs.'+$name
            [void]$html.Append('<tr><td>'+(Esc $audit.partNo)+'</td><td>'+(Esc $path)+'</td><td>'+(Esc (Display $audit.rawFields.$path))+'</td><td>'+(Esc (Display $audit.rawFields.($path+'Text')))+'</td><td>'+(Esc $audit.checks.$name.state)+'</td></tr>')
        } }
        if ($found.Count -eq $voltageExamples.Count) { break }
    }
} finally { if ($null -ne $reader) { $reader.Dispose() } }
if ($found.Count -lt $voltageExamples.Count) { $errors.Add('部分电压问题的料号在核对明细中未找到，请核对文件是否来自同一次运行。') }
foreach ($snapshot in $snapshots) {
    $after=Get-Item -LiteralPath $snapshot.Path
    if ($after.Length -ne $snapshot.Size -or $after.LastWriteTimeUtc -ne $snapshot.Date) { throw 'Input report changed during diagnosis. Wait for conversion to finish and retry.' }
}
[void]$html.Append('</table></div><p>本报告不联网。请在公司本地核对原文字；不需要传出原始数据库或结果文件。</p>')
if ($found.Count -lt $voltageExamples.Count) { [void]$html.Append('<p class="error">部分电压问题未在核对明细中找到，请核对输入文件。</p>') }
[void]$html.Append('</html>')
$output=Join-Path $run.FullName ('local-normalization-details-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,6)+'.html')
[IO.File]::WriteAllText($output,$html.ToString(),(New-Object Text.UTF8Encoding($true)))
Write-Host "Details saved locally: $output"
Write-Host "Report consistency problems: $($errors.Count)"
[pscustomobject]@{ReportPath=$output;ErrorCount=$errors.Count;StatusKinds=$statuses.Count;FieldGroups=$groups.Count;CompanyAccepted=$false}
