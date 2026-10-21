import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

// Generate a standalone company script from the tested converter, keeping its
// normalization, provenance and conflicting-record quarantine unchanged.
let source = readFileSync('scripts/Convert-MurataDatabase.ps1', 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
function replaceOnce(before, after) {
  if (source.split(before).length !== 2) throw new Error(`Converter anchor changed: ${before.slice(0, 100)}`)
  source = source.replace(before, after)
}
replaceOnce("$toolBuild='v3.1'", "$toolBuild='v3.2-coverage'\nif ($Mode -ne 'CheckedSamples') { throw 'This extension only supports CheckedSamples mode.' }")
replaceOnce("$runDir=Join-Path $OutputDirectory", String.raw`$inputs.Add($source.FullName)
$scannedRaw=0; $selectedRaw=0
$referencePrefixes=@('GRT155R71C104KE01','GGM155R71C104KA55','GCH155R71C104KE01','GCM155R71C104KA55','GRM155R71C104KA88','GCM155R71C104KA40')
$referenceCounts=@{}; $referenceExamples=@{}
foreach ($prefix in $referencePrefixes) { $referenceCounts[$prefix]=0; $referenceExamples[$prefix]=New-Object System.Collections.Generic.List[string] }
function Select-CoverageProduct($Product) {
    $reference=$false
    $pn=Field $Product 'Partno'; $basePn=Field $Product 'PartnoWithoutPackageCode'
    foreach ($prefix in $referencePrefixes) {
        $hit=($pn -is [string] -and $pn.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) -or ($basePn -is [string] -and $basePn.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase))
        if ($hit) {
            $reference=$true; $referenceCounts[$prefix]++
            if ($referenceExamples[$prefix].Count -lt 8 -and $pn -is [string]) { $referenceExamples[$prefix].Add($pn) }
        }
    }
    # Broader than the final query: retain every TC/voltage/tolerance for this
    # capacitance and package; normalization still requires numeric/Text agreement.
    $specMatch=$false
    if ((Field $Product 'Specs.SizeCodeInInch') -ceq '0402') {
        $parsed=Parse-Text ([string](Field $Product 'Specs.CapacitanceText')) 'capacitance'
        $specMatch=$parsed.valid -and $parsed.value -eq 100000
    }
    return $reference -or $specMatch
}
$runDir=Join-Path $OutputDirectory`)
replaceOnce("    $script:count++", "    if ($script:count -ge 100000) { throw 'Selected data exceeds the browser 100000-record limit. Results are incomplete.' }\n    $script:count++")
replaceOnce("            if ($Mode -eq 'CheckedSamples') {", "            if ($path -ne $source.FullName) {")
replaceOnce("                while ($Mode -eq 'Full' -or $index -lt $PreviewCount) {", "                while ($true) {")
replaceOnce("                    Write-Product (ConvertFrom-Json -InputObject $raw) $path $index", String.raw`                    $scannedRaw=$index
                    $product=ConvertFrom-Json -InputObject $raw
                    if (Select-CoverageProduct $product) { $selectedRaw++; Write-Product $product $path $index }
                    if ($index % 3000 -eq 0) { Write-Host "Scanned $index raw products; selected $selectedRaw additional source rows." }`)
replaceOnce("    $completed=$true", String.raw`    if ($conflicts.Count -eq 0) { $allWriter.Flush() }
    if ((Get-Item -LiteralPath (Join-Path $runDir 'normalized-products.jsonl')).Length -gt 134217728) { throw 'Selected file exceeds the browser 128MB limit. Results are incomplete.' }
    $completed=$true`)
replaceOnce("fullDatabaseRead=($Mode -eq 'Full' -and $arrayEnd -and $completed)", "fullDatabaseRead=$false;selection=@{kind='checked-samples-plus-query-subset';capacitancePf=100000;sizeInch='0402';rawRecordsScanned=$scannedRaw;rawScanCompleted=($arrayEnd -and $completed);selectedSourceRows=$selectedRaw;referenceCounts=$referenceCounts;referenceExamples=$referenceExamples}")
replaceOnce("CheckedSamples='已有检查样本'", "CheckedSamples='原检查样本 + 全原库筛选的 100nF / 0402 子集（不是全产品目录）'")
replaceOnce('（NRND 与非对称公差修正版）', '（样本覆盖补充版）')
replaceOnce("Write-Host \"Saved normalized data and local report: $runDir\"", String.raw`# This report diagnoses source coverage only. Reference prefixes come from the
# supplied SimSurfing screenshot; only actual source records enter the catalog.
$coverage='<!doctype html><html lang="zh-CN"><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Murata 查询覆盖核对</title><style>body{font:16px/1.7 system-ui;margin:24px;color:#191919}table{border-collapse:collapse;width:100%}td,th{padding:10px;border:1px solid #ddd;text-align:left}code{overflow-wrap:anywhere}</style><h1>Murata 查询覆盖核对</h1><p>工具 v3.2-coverage；原库扫描 '+$scannedRaw+' 条；选中原库记录 '+$selectedRaw+' 条；去重后含原样本 '+$count+' 条。</p><p>只补入原库已有记录，不补造包装后缀。仍是查询子集，不代表全库已导入，也不代表产品已完成公司选型验收。原库扫描至结尾：'+$arrayEnd+'。</p><p>原库：<code>'+[Net.WebUtility]::HtmlEncode($source.FullName)+'</code>；修改时间：'+[Net.WebUtility]::HtmlEncode($sourceDate.ToString('o'))+'</p><table><tr><th>截图中的型号（不含包装后缀）</th><th>原库记录数</th><th>原库实际料号示例（最多8条）</th></tr>'
foreach ($prefix in $referencePrefixes) { $coverage+='<tr><td>'+[Net.WebUtility]::HtmlEncode($prefix)+'</td><td>'+$referenceCounts[$prefix]+'</td><td><code>'+[Net.WebUtility]::HtmlEncode(($referenceExamples[$prefix] -join ' / '))+'</code></td></tr>' }
$coverage+='</table><p>记录数为0表示本次原始文件中没有读到该型号前缀，不表示官网没有产品。若原库有记录但网页仍不匹配，请查看 normalization-audit.jsonl 中该料号的原始字段与校验状态。未知、冲突和 NRND 保留待核查状态。</p><p>请在网页重新导入本文件夹中的 normalization-summary.json 与 normalized-products.jsonl，然后用 三星 MLCC 0402 X7R 100nF ±10% 16V 查询；这两个文件必须来自同一次运行。</p></html>'
[IO.File]::WriteAllText((Join-Path $runDir 'local-coverage-report.html'),$coverage,(New-Object Text.UTF8Encoding($true)))
Write-Host "Saved normalized data and local report: $runDir"`)
const output = 'deliverables/Murata-Coverage-v1'
mkdirSync(output, { recursive: true })
for (const path of ['scripts/Expand-MurataQueryData.ps1', `${output}/Expand-MurataQueryData.ps1`]) {
  writeFileSync(path, '\uFEFF' + source.replace(/\n/g, '\r\n'))
}
console.log('Saved standalone coverage extension (original converter unchanged).')
