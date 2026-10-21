import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
let source = readFileSync('scripts/Convert-MurataDatabase.ps1', 'utf8').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n')
function replaceOnce(before, after) {
  if (source.split(before).length !== 2) throw new Error(`Converter anchor changed: ${before}`)
  source = source.replace(before, after)
}
replaceOnce("$toolBuild='v3.1'", "$toolBuild='v3.4-classification'")
replaceOnce("'Capacitance','ToleranceCapacitance','SizeCode'", "'Characteristics','Capacitance','ToleranceCapacitance','SizeCode'")
replaceOnce("'NewProduct','Application','ProductDetailUrl'", "'NewProduct','Application','Standard','MediaFileUrls.SafetyCertificates','ProductDetailUrl'")
replaceOnce("        compliance=[pscustomobject]", "        classification=[pscustomobject]@{applicationRaw=(Field $Product 'Application');characteristicsRaw=(Field $Product 'Specs.Characteristics');standardRaw=(Field $Product 'Standard');safetyCertificatesRaw=(Field $Product 'MediaFileUrls.SafetyCertificates')}\n        compliance=[pscustomobject]")
replaceOnce('（NRND 与非对称公差修正版）', '（应用 / 特征 / 安全标准原值保留版）')
const output = 'deliverables/Murata-Step4-v2_4-offline'
mkdirSync(output, { recursive: true })
for (const path of ['scripts/Convert-MurataDatabase-v3_4.ps1', `${output}/Convert-MurataDatabase-v3_4.ps1`]) writeFileSync(path, '\uFEFF' + source.replace(/\n/g, '\r\n'))
console.log('Saved standalone v3.4 converter; existing v3.1/v3.3 converters unchanged.')
