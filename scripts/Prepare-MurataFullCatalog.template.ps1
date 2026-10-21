#requires -Version 5.1
[CmdletBinding()]
param(
    [string]$InputPath = '',
    [string]$ConverterPath = '',
    [string]$OutputRoot = (Join-Path ([Environment]::GetFolderPath('Desktop')) 'Murata_Full_Catalog')
)
$ErrorActionPreference = 'Stop'
$taskConverterHash = '__CONVERTER_HASH__'
$taskUtf8 = New-Object Text.UTF8Encoding($false, $true)

function Get-TaskFileHash([string]$Path) {
    $taskHashStream = [IO.File]::OpenRead($Path)
    $taskHasher = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($taskHasher.ComputeHash($taskHashStream)).Replace('-', '') }
    finally { $taskHasher.Dispose(); $taskHashStream.Dispose() }
}

function Select-TaskSource {
    Add-Type -AssemblyName System.Windows.Forms
    $taskDialog = New-Object Windows.Forms.OpenFileDialog
    try {
        $taskDialog.Title = 'Select original Murata_MLCC.json (not the normalized sample files)'
        $taskDialog.Filter = 'JSON files (*.json)|*.json'
        $taskDialog.Multiselect = $false
        if ($taskDialog.ShowDialog() -ne [Windows.Forms.DialogResult]::OK) {
            throw 'Cancelled. No source file was selected.'
        }
        return $taskDialog.FileName
    } finally { $taskDialog.Dispose() }
}
function Encode-TaskHtml([object]$Value) {
    return [Net.WebUtility]::HtmlEncode([string]$Value)
}

if ([string]::IsNullOrWhiteSpace($ConverterPath)) { $ConverterPath = Join-Path $PSScriptRoot 'Convert-MurataDatabase-v3_4.ps1' }
if (-not (Test-Path -LiteralPath $ConverterPath -PathType Leaf)) {
    throw 'Place Convert-MurataDatabase-v3_4.ps1 beside this tool, or specify -ConverterPath. No conversion started.'
}
$taskConverter = (Resolve-Path -LiteralPath $ConverterPath).ProviderPath
if ((Get-TaskFileHash $taskConverter) -ne $taskConverterHash) {
    throw 'Converter integrity check failed. Obtain the original v3.4 converter. No conversion started.'
}
if ([string]::IsNullOrWhiteSpace($InputPath)) { $InputPath = Select-TaskSource }
$taskSource = (Resolve-Path -LiteralPath $InputPath).ProviderPath
$taskSourceInfo = Get-Item -LiteralPath $taskSource
if ($taskSourceInfo.PSIsContainer -or $taskSourceInfo.Length -eq 0 -or
    [IO.Path]::GetFileName($taskSource) -in @('normalization-summary.json','normalized-products.jsonl')) {
    throw 'Choose the original Murata MLCC product JSON, not the two normalized sample files.'
}
$taskSourceBytes = $taskSourceInfo.Length
$taskSourceDate = $taskSourceInfo.LastWriteTimeUtc
Write-Host 'Full-source preparation: every Products record will be processed. The source file is read-only.'
Write-Host 'Hashing the local source. No network or API key is used.'
$taskBeforeHash = (Get-TaskFileHash $taskSource)
$taskConversion = & $taskConverter -InputPath $taskSource -OutputDirectory $OutputRoot -Mode Full
if ($null -eq $taskConversion -or $taskConversion.Completed -ne $true) {
    throw 'Full conversion did not finish. Do not import incomplete output.'
}
$taskRun = $taskConversion.RunDirectory
$taskSummaryPath = Join-Path $taskRun 'normalization-summary.json'
$taskProductsPath = Join-Path $taskRun 'normalized-products.jsonl'
$taskSummary = [IO.File]::ReadAllText($taskSummaryPath, $taskUtf8) | ConvertFrom-Json
if ($taskSummary.completed -ne $true -or $taskSummary.mode -cne 'Full' -or
    $taskSummary.fullDatabaseRead -ne $true -or $taskSummary.source -cne $taskSource -or
    $taskSummary.products -le 0 -or
    $taskSummary.products -ne ($taskSummary.consistentProducts + $taskSummary.reviewProducts)) {
    throw 'The full-source summary did not pass validation. Do not import this run.'
}
$taskAfterInfo = Get-Item -LiteralPath $taskSource
if ($taskAfterInfo.Length -ne $taskSourceBytes -or $taskAfterInfo.LastWriteTimeUtc -ne $taskSourceDate -or
    (Get-TaskFileHash $taskSource) -ne $taskBeforeHash) {
    throw 'Source content changed during preparation. Do not import this run.'
}
$taskPreparedBytes = (Get-Item -LiteralPath $taskProductsPath).Length
$taskSummaryBytes = (Get-Item -LiteralPath $taskSummaryPath).Length
$taskFits = $taskPreparedBytes -le 536870912 -and $taskSummary.products -le 250000 -and $taskSummaryBytes -le 1048576
$taskPreparedHash = (Get-TaskFileHash $taskProductsPath)
$taskReport = [ordered]@{
    toolVersion = 'full-source-preparation-v1'
    preparedAtUtc = [DateTime]::UtcNow.ToString('o')
    source = $taskSource; sourceBytes = $taskSourceBytes
    sourceModifiedUtc = $taskSourceDate.ToString('o'); sourceSha256 = $taskBeforeHash
    fullSourceRead = $true
    sourceRecordsProcessed = ([long]$taskSummary.products + [long]$taskSummary.exactDuplicateRecordsSkipped)
    exactDuplicateRecordsSkipped = $taskSummary.exactDuplicateRecordsSkipped
    normalizedProducts = $taskSummary.products
    consistentProducts = $taskSummary.consistentProducts; reviewProducts = $taskSummary.reviewProducts
    conflictingPartNumbers = @($taskSummary.conflictingPartNumbers).Count
    seriesCounts = $taskSummary.seriesCounts
    normalizedBytes = $taskPreparedBytes; normalizedSha256 = $taskPreparedHash
    summarySha256 = (Get-TaskFileHash $taskSummaryPath)
    fitsWebV26Limits = $taskFits
    webLimits = @{maxProductBytes=536870912; maxProducts=250000; maxSummaryBytes=1048576}
    websiteCoverageVerified = $false; companyAccepted = $false; datasheetsVerified = $false
}
$taskReportPath = Join-Path $taskRun 'full-catalog-preparation.json'
[IO.File]::WriteAllText($taskReportPath, ($taskReport | ConvertTo-Json -Depth 20), $taskUtf8)
$taskSizeMb = [Math]::Round($taskPreparedBytes / 1MB, 2)
$taskFitText = if ($taskFits) { '符合 v2.6 文件大小和记录数限制；仍需在网页导入校验。' } else { '超过 v2.6 导入限制，请保留全量结果并联系维护者；不要截取样本冒充全量。' }
$taskHtml = '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Murata 完整来源整理</title><style>body{font:16px/1.7 system-ui;margin:32px;color:#191919;max-width:1100px}table{border-collapse:collapse;width:100%}th,td{padding:8px;border:1px solid #ddd;text-align:left;overflow-wrap:anywhere}.note{padding:16px;background:#f2f7f3}</style><h1>Murata 完整来源整理结果</h1><p>已读完所选文件中的 Products 数组；不等于已核实官网最新全部产品。</p><p>原始文件：'+(Encode-TaskHtml $taskSource)+'</p><p>来源文件时间（UTC）：'+(Encode-TaskHtml $taskSourceDate.ToString('o'))+'</p><p>处理原始记录：'+$taskReport.sourceRecordsProcessed+'；跳过完全相同的重复记录：'+$taskSummary.exactDuplicateRecordsSkipped+'</p><p>整理产品：'+$taskSummary.products+'；字段一致：'+$taskSummary.consistentProducts+'；待核查：'+$taskSummary.reviewProducts+'；冲突料号：'+$taskReport.conflictingPartNumbers+'</p><p>网页产品文件：'+$taskSizeMb+' MB</p><p class="note">'+$taskFitText+' 打开 v2.6 网页，选择本文件夹的 normalization-summary.json 和 normalized-products.jsonl。原来的样本文件不必删除；不能混用不同文件夹的两个文件。</p><h2>系列记录数</h2><table><tr><th>系列</th><th>记录数</th></tr>'
foreach ($taskSeries in ($taskSummary.seriesCounts.PSObject.Properties | Sort-Object Name)) {
    $taskHtml += '<tr><td>'+(Encode-TaskHtml $taskSeries.Name)+'</td><td>'+(Encode-TaskHtml $taskSeries.Value)+'</td></tr>'
}
$taskHtml += '</table><p>原始文件 SHA256：'+$taskBeforeHash+'</p><p>产品文件 SHA256：'+$taskPreparedHash+'</p><p>校验值和数量用于本次本地结果核对，不能代替官方产品覆盖、规格书或公司选型验收。</p></html>'
$taskHtmlPath = Join-Path $taskRun 'full-catalog-preparation.html'
[IO.File]::WriteAllText($taskHtmlPath, $taskHtml, (New-Object Text.UTF8Encoding($true)))
Write-Host "Prepared folder: $taskRun"
Write-Host "Products=$($taskSummary.products); consistent=$($taskSummary.consistentProducts); review=$($taskSummary.reviewProducts)"
Write-Host "Normalized file: $taskSizeMb MB; fits v2.6 limits: $taskFits"
Write-Host "Open the local report: $taskHtmlPath"
[pscustomobject]@{RunDirectory=$taskRun; Products=$taskSummary.products; FitsWebV26Limits=$taskFits; ReportPath=$taskHtmlPath}
