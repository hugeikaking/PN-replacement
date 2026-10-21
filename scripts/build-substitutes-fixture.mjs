// Local browser-only fixture. No company data, no real product numbers, never shipped in the release.
import { build } from 'esbuild'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { makeOfflinePage } from './offline-page.mjs'
const directory = resolve('deliverables/.substitutes-check')
await mkdir(directory, { recursive: true })
const products = Array.from({ length: 42 }, (_, index) => ({
  schemaVersion: 1, manufacturer: 'murata', componentType: 'mlcc', partNo: `SYNTHETIC_${String(index + 1).padStart(2, '0')}`,
  partNoWithoutPackageCode: null, productName: null, series: 'GRM',
  classification: { applicationRaw: '民用设备,工业设备,汽车[信息娱乐/舒适设备]', characteristicsRaw: index % 2 ? ['AEC-Q200'] : ['High Q'], standardRaw: '', safetyCertificatesRaw: '' },
  spec: { capacitancePf: 100000, voltages: [{ valueV: 16, type: 'DC', safetyClass: null, state: 'consistent', sourceField: 'Specs.RatedVoltageDC' }], sizeInch: '0402', sizeMetric: '1005M', lengthMm: 1, widthMm: .5, thicknessMm: .5, thicknessMaxMm: .55, temperature: 'X7R', temperatureStandard: 'EIA', tolerance: { kind: 'percent', value: 10, unit: '%' } },
  compliance: { aecQ200: Boolean(index % 2), rohsRaw: null, reachRaw: null },
  lifecycle: { category: index >= 40 ? 'nrnd' : 'active', rawStatus: index >= 40 ? 'NRND' : '目前生产', newProductRaw: null },
  links: { datasheets: [`https://pim.murata.com/asset/pim4/synthetic-spec-${index + 1}`], productDetail: null, verified: false },
  validation: { status: index >= 40 ? 'review' : 'consistent', issues: index >= 40 ? [{ code: 'lifecycle-nrnd', severity: 'warning', field: 'Status', rawValue: 'NRND', textValue: null }] : [], datasheetReviewed: false, companyAccepted: false },
  auditReference: { file: 'normalization-audit.jsonl', line: index + 1 }, provenance: { sourcePath: 'synthetic.jsonl', sourceIndex: index + 1 },
}))
for (const p of products) {
  p.spec.capacitancePf = 4.7e6; p.spec.voltages[0].valueV = 16;
  p.spec.sizeInch = '0201'; p.spec.sizeMetric = '0603M'; p.spec.lengthMm = .6; p.spec.widthMm = .3;
  p.spec.temperature = 'X7R'; p.spec.tolerance.value = 20;
}
function set(i, cap, volts, size, temp) {
  const s = products[i].spec;
  s.capacitancePf = cap; s.voltages[0].valueV = volts; s.sizeInch = size;
  s.sizeMetric = size === '0402' ? '1005M' : '0603M'; s.lengthMm = size === '0402' ? 1 : .6; s.widthMm = size === '0402' ? .5 : .3; s.temperature = temp;
}
set(0, 2.2e6, 10, '0402', 'X5R'); products[0].spec.tolerance.value = 10;
set(1, 4.7e6, 10, '0402', 'X5R');
set(2, 2.2e6, 16, '0402', 'X5R');
set(3, 2.2e6, 10, '0201', 'X5R');
set(4, 2.2e6, 10, '0402', 'X7R');
const summary = { schemaVersion: 1, completed: true, products: 42, consistentProducts: 40, reviewProducts: 2, mode: 'CheckedSamples', fullDatabaseRead: false, source: 'original-synthetic.json', sourceBytes: 1234, sourceModifiedUtc: '2026-10-13T00:00:00Z', inputFiles: ['synthetic.jsonl'], conflictingPartNumbers: [], issueCounts: { 'lifecycle-nrnd': 2 }, generatedAt: '2026-10-13T00:00:00Z' }
await writeFile(resolve(directory, 'normalization-summary.json'), JSON.stringify(summary))
await writeFile(resolve(directory, 'normalized-products.jsonl'), products.map(x => JSON.stringify(x)).join('\n') + '\n')
const code = `import {mountOfficialTranslator} from './src/official-preview/translator';
import {createOfficialCatalog} from './src/engine/official/catalog';
mountOfficialTranslator(document.querySelector('#app'), {catalog:createOfficialCatalog(${JSON.stringify(summary)},${JSON.stringify(products)})});`
const result = await build({ stdin: { contents: code, resolveDir: process.cwd(), loader: 'ts' }, bundle: true, write: false, format: 'iife', platform: 'browser', target: 'es2020', minify: true })
await writeFile(resolve(directory, 'index.html'), makeOfflinePage(await readFile('src/official-preview/style.css', 'utf8'), result.outputFiles[0].text, 'v2.6.5 · SYNTHETIC TEST'))
console.log('Created local synthetic workbench fixture (42 records).')
