import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

// Reuse the tested streaming reader, so the company database stays on disk.
const converter = readFileSync('scripts/Convert-MurataDatabase.ps1', 'utf8').replace(/\r\n/g, '\n')
const match = converter.match(/Add-Type -TypeDefinition @"\n([\s\S]*?)\n"@/)
if (!match) throw new Error('Streaming reader anchor changed')
const reader = match[1].replaceAll('PnrepNormalizationReader', 'PnrepClassificationReader')
const template = readFileSync('scripts/classification-inspector.ps1.template', 'utf8').replace(/\r\n/g, '\n')
if (template.split('__STREAMING_READER__').length !== 2) throw new Error('Inspector reader anchor changed')
const script = template.replace('__STREAMING_READER__', reader)
const folder = 'deliverables/Murata-Classification-Check-v1'
mkdirSync(folder, { recursive: true })
for (const path of ['scripts/Inspect-MurataClassification.ps1', `${folder}/Inspect-MurataClassification.ps1`]) {
  writeFileSync(path, '\uFEFF' + script.replace(/\n/g, '\r\n'))
}
console.log('Saved standalone company-local classification inspector.')
