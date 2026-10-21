import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import type { NormalizedMurataProduct } from '../../src/engine/official/types'
import { createOfficialCatalog } from '../../src/engine/official/catalog'
import { productClassification } from '../../src/engine/official/classification'
import { translateOfficialInput } from '../../src/engine/official/translate'

function product(pn: string, series: string, aec = false): NormalizedMurataProduct {
  return {
    schemaVersion: 1, manufacturer: 'murata', componentType: 'mlcc', partNo: pn, partNoWithoutPackageCode: null, productName: null, series,
    spec: { capacitancePf: 100000, voltages: [{ valueV: 16, type: 'DC', safetyClass: null, state: 'consistent', sourceField: 'Specs.RatedVoltageDC' }], sizeInch: '0402', sizeMetric: '1005M', lengthMm: 1, widthMm: .5, thicknessMm: .5, thicknessMaxMm: .55, temperature: 'X7R', temperatureStandard: 'EIA', tolerance: { kind: 'percent', value: 10, unit: '%' } },
    compliance: { aecQ200: aec, rohsRaw: null, reachRaw: null }, lifecycle: { rawStatus: '目前生产', category: 'active', newProductRaw: null },
    links: { datasheets: [], productDetail: null, verified: false }, validation: { status: 'consistent', issues: [], datasheetReviewed: false, companyAccepted: false }, auditReference: { file: 'normalization-audit.jsonl', line: 1 }, provenance: { sourcePath: 'synthetic.jsonl', sourceIndex: 1 },
  }
}
function catalog(rows: NormalizedMurataProduct[]) {
  rows.forEach((row, i) => { row.auditReference.line = i + 1; row.provenance.sourceIndex = i + 1 })
  return createOfficialCatalog({ schemaVersion: 1, completed: true, products: rows.length, consistentProducts: rows.length, reviewProducts: 0, mode: 'CheckedSamples', fullDatabaseRead: false, source: 'synthetic.json', sourceBytes: 123, sourceModifiedUtc: '2026-10-05T00:00:00Z', inputFiles: ['synthetic.jsonl'], conflictingPartNumbers: [], issueCounts: {}, generatedAt: '2026-10-05T00:00:00Z' }, rows)
}
const query = '0402 X7R 100nF ±10% 16V'
// Field spellings/transcript from company photos; synthetic PNs, not product evidence.
const medicalExternal = '医疗eI×植入式以外的医疗器械设备[GHTF A/B/C]'
const medicalImplant = '医疗I×植入式医疗器械设备或医疗器械设备[GHTF D]'
const automotive = `汽车I×汽车信息娱乐/舒适设备,汽车P×汽车动力总成/安全设备,${medicalExternal}`
const general = `民用×民用设备,工业×工业设备,汽车I×汽车信息娱乐/舒适设备,${medicalExternal}`
const allApplications = `民用×民用设备,工业×工业设备,${automotive}`
describe('applications, standards and characteristics', () => {
  it('decodes all four observed Chinese application combinations and excludes known medical-only records', () => {
    const rows = [automotive, medicalImplant, general, allApplications].map((raw, i) => {
      const row = product(`SYNTHETIC_PHOTO_${i}`, 'UNKNOWN')
      row.classification = { applicationRaw: raw, characteristicsRaw: ['125℃', '回流焊接'] }
      expect(productClassification(row).applicationUnknown).toBe(false)
      return row
    })
    const c = catalog(rows)
    expect(translateOfficialInput(query, 'A', c, [], 20, ['general']).official!.matches.map(x => x.product.partNo)).toEqual(['SYNTHETIC_PHOTO_2', 'SYNTHETIC_PHOTO_3'])
    expect(translateOfficialInput(query, 'A', c, [], 20, ['powertrain']).official!.matches.map(x => x.product.partNo)).toEqual(['SYNTHETIC_PHOTO_0', 'SYNTHETIC_PHOTO_3'])
    expect(translateOfficialInput(query, 'A', c, [], 20, ['infotainment']).official!.totalMatches).toBe(3)
    expect(translateOfficialInput(query, 'A', c, [], 20, ['general', 'powertrain']).official!.totalMatches).toBe(3)
    expect(translateOfficialInput('CL05B104KO5NNNC', 'B', c, [], 20, ['general']).official!.totalMatches).toBe(2)
    expect(translateOfficialInput(query, 'A', c, [], 20, ['general']).official!.reviewMatches).toEqual([])
    rows[0].classification!.applicationRaw = `汽车Z×未知用途，${medicalExternal}`
    expect(productClassification(rows[0]).applicationUnknown).toBe(true)
  })
  it('prioritizes root Standard and original feature arrays, preserves empty/negative features, and validates certificate schemes', () => {
    const row = product('SYNTHETIC_STANDARD', 'DK1', true)
    row.classification = { applicationRaw: general, characteristicsRaw: ['125℃', '安全规格认证品', '回流焊接', '满足RoHS', '满足REACH'], standardRaw: '符合日本国内电气用品安全法', safetyCertificatesRaw: 'https://example.invalid/synthetic-certificate.pdf' }
    const classification = productClassification(row)
    expect(classification.standards).toBe('符合日本国内电气用品安全法')
    expect(classification.standardBasis).toBe('原记录 Standard；证书未核验')
    expect(classification.standards).not.toContain('AEC-Q200')
    expect(classification.features).toBe('125℃；安全规格认证品；回流焊接；满足RoHS；满足REACH')
    expect(classification.featureBasis).toBe('原记录 Specs.Characteristics')
    expect(classification.referenceUrl).toBeUndefined()
    expect(classification.safetyCertificateUrls).toEqual(['https://example.invalid/synthetic-certificate.pdf'])
    row.classification.safetyCertificatesRaw = ['', 'javascript:alert(1)', 'file:///local.pdf', 'https://example.invalid/synthetic-certificate.pdf', 'https://example.invalid/synthetic-certificate.pdf']
    expect(productClassification(row).safetyCertificateUrls).toEqual(['https://example.invalid/synthetic-certificate.pdf'])
    row.series = 'GJM'; row.classification.characteristicsRaw = []
    expect(productClassification(row).features).toBe('未记录')
    row.classification.characteristicsRaw = ['not High Q', 'High Q']
    expect(productClassification(row).features).toBe('not High Q；High Q')
    row.classification.standardRaw = ''
    expect(productClassification(row).standards).toBe('未记录')
  })
  it('uses official series guidance for legacy files; multi-selection is OR and A/B queries agree', () => {
    const c = catalog([product('SYNTHETIC_GRM', 'GRM'), product('SYNTHETIC_GRT', 'GRT', true), product('SYNTHETIC_GCM', 'GCM', true), product('SYNTHETIC_GCH', 'GCH')])
    const a = translateOfficialInput(query, 'A', c, [], 20, ['general']).official!
    expect(a.matches.map(x => x.product.partNo)).toEqual(['SYNTHETIC_GRM', 'SYNTHETIC_GRT'])
    expect(a.reviewMatches).toEqual([])
    const b = translateOfficialInput('CL05B104KO5NNNC', 'B', c, [], 20, ['general']).official!
    expect(b.matches.map(x => x.product.partNo)).toEqual(a.matches.map(x => x.product.partNo))
    expect(translateOfficialInput(query, 'A', c, [], 20, ['powertrain']).official!.matches.map(x => x.product.partNo)).toEqual(['SYNTHETIC_GCM'])
    expect(translateOfficialInput(query, 'A', c, [], 20, ['general', 'powertrain']).official!.totalMatches).toBe(3)
  })
  it('does not equate AEC-Q200 or a similar PN prefix with automotive powertrain use', () => {
    expect(productClassification(product('GCM_SYNTHETIC', 'UNKNOWN', true)).applicationUnknown).toBe(true)
    expect(productClassification(product('SYNTHETIC_GRT', 'GRT', true)).applications).not.toContain('powertrain')
    expect(productClassification(product('SYNTHETIC_KRM', 'KRM')).applications).not.toContain('infotainment')
    expect(productClassification(product('SYNTHETIC_GCM', 'GCM')).applications).not.toContain('general')
  })
  it('prioritizes explicit raw Application and keeps unsupported raw values in review rather than defaulting to general', () => {
    const explicit = product('SYNTHETIC_EXPLICIT', 'GRM')
    explicit.classification = { applicationRaw: ['Automotive powertrain/safety equipment'], characteristicsRaw: null }
    const unknown = product('SYNTHETIC_UNKNOWN', 'GRM', true)
    unknown.classification = { applicationRaw: 123, characteristicsRaw: { uncalibratedCode: true } }
    const c = catalog([explicit, unknown])
    const r = translateOfficialInput(query, 'A', c, [], 20, ['general']).official!
    expect(r.matches).toEqual([])
    expect(r.reviewMatches.map(x => x.product.partNo)).toEqual(['SYNTHETIC_UNKNOWN'])
    expect(r.reviewMatches[0].applicationState).toBe('unknown')
    expect(r.reviewMatches[0].kind).toBe('partial')
    expect(translateOfficialInput(query, 'A', c, [], 20, ['powertrain']).official!.matches[0].product.partNo).toBe('SYNTHETIC_EXPLICIT')
  })
  it('preserves raw feature wording and distinguishes temperature standards from safety certification', () => {
    const highQ = productClassification(product('SYNTHETIC_GJM', 'GJM'))
    expect(highQ.features).toBe('High Q')
    expect(highQ.featureBasis).toBe('村田官方系列资料')
    const dk1 = product('SYNTHETIC_DK1', 'DK1')
    dk1.spec.voltages.push({ type: 'AC', safetyClass: 'X1', valueV: 440, state: 'consistent', sourceField: 'Specs.X1RatedVoltageAC' })
    expect(productClassification(dk1).standards).toContain('安全规格系列（系列资料）')
    expect(productClassification(dk1).standards).toContain('认证待核对')
    expect(productClassification(dk1).standards).not.toContain('EIA')
    const raw = product('SYNTHETIC_RAW', 'GJM')
    raw.classification = { applicationRaw: 'Consumer equipment', characteristicsRaw: 'not High Q' }
    expect(productClassification(raw).features).toBe('not High Q')
    raw.classification.characteristicsRaw = { HighQ: false }
    expect(productClassification(raw).features).toContain('原值待解释')
    expect(productClassification(raw).features).not.toBe('High Q')
  })
  it('handles prototype-like raw strings and reports the application condition in diagnostics', () => {
    const p = product('SYNTHETIC_GCM', 'GCM', true)
    const r = translateOfficialInput(query, 'A', catalog([p]), [], 20, ['general']).official!
    expect(r.totalMatches).toBe(0)
    expect(r.diagnostics!.conditions.at(-1)).toMatchObject({ field: 'applications', matchingRecords: 0, remainingRecords: 0, otherConditionsRecords: 1 })
    p.classification = { applicationRaw: 'constructor', characteristicsRaw: null }
    expect(productClassification(p).applicationUnknown).toBe(true)
    p.series = 'constructor'; p.classification.applicationRaw = null
    expect(productClassification(p).applicationUnknown).toBe(true)
  })
  it.skipIf(process.platform !== 'win32')('reads actual v3.4 output with photo-calibrated fields and untouched audit evidence', () => {
    const root = mkdtempSync(join(tmpdir(), 'pnrep-classification-v34-'))
    const source = join(root, 'synthetic.json'), out = join(root, 'out')
    const raw = { Partno: 'SYNTHETIC_V34', Series: 'UNKNOWN', Status: '目前生产', Application: general, Standard: '安全规格认证品', Specs: { Capacitance: .0000001, CapacitanceText: '100nF', RatedVoltageDC: 16, RatedVoltageDCText: '16Vdc', SizeCodeInInch: '0402', SizecodeMm: '1005M', ToleranceCapacitance: '±10%', TemperatureCharacteristics: 'X7R', TemperatureCharacteristicsCompliedStandard: 'EIA', Characteristics: ['125℃', '安全规格认证品', '回流焊接', '满足RoHS', '满足REACH'] }, ComplianceInfo: { AecQ200Support: false }, MediaFileUrls: { SpecificationsSheet: 'https://example.invalid/synthetic.pdf', SafetyCertificates: 'https://example.invalid/synthetic-certificate.pdf' } }
    const original = JSON.stringify({ Products: [raw] })
    writeFileSync(source, original)
    execFileSync('powershell.exe', ['-NoProfile', '-File', resolve('scripts/Convert-MurataDatabase-v3_4.ps1'), '-InputPath', source, '-OutputDirectory', out, '-Mode', 'Full'], { timeout: 30000 })
    expect(readFileSync(source, 'utf8')).toBe(original)
    const dir = join(out, readdirSync(out)[0])
    const summary = JSON.parse(readFileSync(join(dir, 'normalization-summary.json'), 'utf8').replace(/^\uFEFF/, ''))
    const record = JSON.parse(readFileSync(join(dir, 'normalized-products.jsonl'), 'utf8').trim())
    const audit = JSON.parse(readFileSync(join(dir, 'normalization-audit.jsonl'), 'utf8').trim())
    expect(summary.toolBuild).toBe('v3.4-classification')
    expect(record.classification).toEqual({ applicationRaw: raw.Application, characteristicsRaw: raw.Specs.Characteristics, standardRaw: raw.Standard, safetyCertificatesRaw: raw.MediaFileUrls.SafetyCertificates })
    expect(audit.rawFields.Standard).toBe(raw.Standard)
    expect(audit.rawFields['MediaFileUrls.SafetyCertificates']).toBe(raw.MediaFileUrls.SafetyCertificates)
    expect(audit.rawFields['Specs.Characteristics']).toEqual(raw.Specs.Characteristics)
    const c = createOfficialCatalog(summary, [record])
    expect(translateOfficialInput(query, 'A', c, [], 20, ['general']).official!.totalMatches).toBe(1)
    expect(translateOfficialInput(query, 'A', c, [], 20, ['powertrain']).official!.totalMatches).toBe(0)
    expect(productClassification(record).standards).toBe('安全规格认证品')
    expect(productClassification(record).features).not.toContain('High Q')
  }, 35000)
  it.skipIf(process.platform !== 'win32')('reads actual v3.3 PowerShell output including untouched coded metadata', () => {
    const root = mkdtempSync(join(tmpdir(), 'pnrep-classification-'))
    const source = join(root, 'synthetic.json'), out = join(root, 'out')
    const raw = { Partno: 'SYNTHETIC_SOURCE', Series: 'GJM', Status: '目前生产', Application: ['Consumer equipment', 'Industrial equipment'], Specs: { Capacitance: .0000001, CapacitanceText: '100nF', RatedVoltageDC: 16, RatedVoltageDCText: '16Vdc', SizeCodeInInch: '0402', SizecodeMm: '1005M', ToleranceCapacitance: '±10%', TemperatureCharacteristics: 'X7R', Characteristics: { HighQ: false, Code: 12 } }, ComplianceInfo: { AecQ200Support: false }, MediaFileUrls: { SpecificationsSheet: 'https://example.invalid/synthetic.pdf' } }
    writeFileSync(source, JSON.stringify({ Products: [raw] }))
    execFileSync('powershell.exe', ['-NoProfile', '-File', resolve('scripts/Convert-MurataDatabase-v3_3.ps1'), '-InputPath', source, '-OutputDirectory', out, '-Mode', 'Full'], { timeout: 30000 })
    const dir = join(out, readdirSync(out)[0])
    const summary = JSON.parse(readFileSync(join(dir, 'normalization-summary.json'), 'utf8').replace(/^\uFEFF/, ''))
    const record = JSON.parse(readFileSync(join(dir, 'normalized-products.jsonl'), 'utf8').trim())
    expect(summary.toolBuild).toBe('v3.3-classification')
    expect(record.classification).toEqual({ applicationRaw: raw.Application, characteristicsRaw: raw.Specs.Characteristics })
    const audit = JSON.parse(readFileSync(join(dir, 'normalization-audit.jsonl'), 'utf8').trim())
    expect(audit.rawFields['Specs.Characteristics']).toEqual(raw.Specs.Characteristics)
    const c = createOfficialCatalog(summary, [record])
    expect(translateOfficialInput(query, 'A', c, [], 20, ['general']).official!.totalMatches).toBe(1)
    expect(productClassification(record).features).toContain('原值待解释')
  }, 35000)
})
