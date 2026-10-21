import { describe, expect, it } from 'vitest'
import { createOfficialCatalog } from '../../src/engine/official/catalog'
import { parseOfficialDescription } from '../../src/engine/official/query'
import { matchOfficialProducts } from '../../src/engine/official/matcher'
import { translateOfficialInput } from '../../src/engine/official/translate'
import type { NormalizedMurataProduct } from '../../src/engine/official/types'
import { batchExportTables, type BatchExportEntry } from '../../src/utils/batch-files'
import { buildDatasheetPlan, datasheetMatches } from '../../src/utils/datasheet-download'

// Synthetic records only; no invented PNs become product data.
function product(pn: string, cap = 2.2e6, volts = 10, size = '0402', temperature = 'X5R'): NormalizedMurataProduct {
  const geometry: Record<string, [number, number, string]> = { '01005': [.4, .2, '0402M'], '0201': [.6, .3, '0603M'], '0402': [1, .5, '1005M'], '0603': [1.6, .8, '1608M'], '0805': [2, 1.25, '2012M'] }
  const [lengthMm, widthMm, sizeMetric] = geometry[size]
  return {
    schemaVersion: 1, manufacturer: 'murata', componentType: 'mlcc', partNo: pn, partNoWithoutPackageCode: null, productName: null, series: 'GRM',
    classification: { applicationRaw: '民用×民用设备,工业×工业设备', characteristicsRaw: ['AEC-Q200'] },
    spec: { capacitancePf: cap, voltages: [{ valueV: volts, type: 'DC', safetyClass: null, state: 'consistent', sourceField: 'Specs.RatedVoltageDC' }], sizeInch: size, sizeMetric, lengthMm, widthMm, thicknessMm: .5, thicknessMaxMm: .6, temperature, temperatureStandard: 'EIA', tolerance: { kind: 'percent', unit: '%', value: 20 } },
    compliance: { aecQ200: true, rohsRaw: null, reachRaw: null }, lifecycle: { category: 'active', rawStatus: '目前生产', newProductRaw: null },
    links: { datasheets: [`https://pim.murata.com/asset/${pn}`], productDetail: null, verified: false },
    validation: { status: 'consistent', issues: [], companyAccepted: false, datasheetReviewed: false },
    auditReference: { file: 'normalization-audit.jsonl', line: 1 }, provenance: { sourcePath: 'synthetic.jsonl', sourceIndex: 1 },
  }
}
function review(p: NormalizedMurataProduct) {
  p.lifecycle.category = 'nrnd'; p.lifecycle.rawStatus = 'NRND'; p.validation.status = 'review'
  p.validation.issues = [{ code: 'lifecycle-nrnd', severity: 'warning', field: 'Status', rawValue: 'NRND', textValue: null }]
  return p
}
function catalog(rows: NormalizedMurataProduct[]) {
  const copy = rows.map(p => structuredClone(p))
  copy.forEach((p, i) => { p.auditReference.line = i + 1 })
  const issueCounts: Record<string, number> = {}
  copy.forEach(p => p.validation.issues.forEach(i => { issueCounts[i.code] = (issueCounts[i.code] || 0) + 1 }))
  return createOfficialCatalog({ schemaVersion: 1, completed: true, products: copy.length, consistentProducts: copy.filter(p => p.validation.status === 'consistent').length, reviewProducts: copy.filter(p => p.validation.status === 'review').length, mode: 'CheckedSamples', fullDatabaseRead: false, source: 'synthetic', sourceBytes: 1, sourceModifiedUtc: '', generatedAt: '', inputFiles: ['synthetic.jsonl'], conflictingPartNumbers: [], issueCounts }, copy)
}
const input = '0402 2.2uF 10V X5R ±20%'
const find = (rows: NormalizedMurataProduct[], text = input, limit = 20) => matchOfficialProducts(catalog(rows), parseOfficialDescription(text), limit)
const names = (r: ReturnType<typeof find>) => r.alternatives.map(m => m.product.partNo)

describe('separate catalog-based substitutes for high capacitance descriptions', () => {
  it('only falls back without normal matches, including RO partial matches', () => {
    const rows = [product('SYNTHETIC_EXACT'), product('SYNTHETIC_UP', 4.7e6)]
    expect(find(rows).totalMatches).toBe(1)
    expect(names(find(rows))).toEqual([])
    expect(names(find(rows, input + ' RO'))).toEqual([])
  })
  it('requires >=1uF and known core conditions, and never relaxes parser errors', () => {
    const rows = [product('SYNTHETIC_UP')]
    for (const text of ['0402 100nF 10V X5R', '0402 1uF X5R', '1uF 10V X5R', '0402 1uF 10V', input + ' UNKNOWN']) expect(names(find(rows, text))).toEqual([])
    expect(names(find(rows, '0402 1uF 10V X5R ±20%'))).toEqual(['SYNTHETIC_UP'])
  })
  it('uses the next imported capacitance only, never lower or two tiers higher', () => {
    const rows = [product('SYNTHETIC_LOW', 1e6), product('SYNTHETIC_NEXT', 3.3e6), product('SYNTHETIC_TOO_HIGH', 4.7e6)]
    expect(names(find(rows))).toEqual(['SYNTHETIC_NEXT'])
    expect(find(rows).alternatives[0].differences).toEqual([{ field: 'capacitancePf', label: '容值升一档', requested: '2.2uF', actual: '3.3uF' }])
  })
  it('does not skip a review-only intermediate tier to find a usable product', () => {
    expect(names(find([review(product('SYNTHETIC_NRND', 3.3e6)), product('SYNTHETIC_TWO_UP', 4.7e6)]))).toEqual([])
  })
  it('only increases voltage by the neighboring rating within the same voltage category', () => {
    const ac = product('SYNTHETIC_AC', 2.2e6, 12)
    ac.spec.voltages = [{ valueV: 12, type: 'AC', safetyClass: null, state: 'consistent', sourceField: 'Specs.RatedVoltageAC' }]
    expect(names(find([product('SYNTHETIC_LOWER', 2.2e6, 6.3), ac, product('SYNTHETIC_UP', 2.2e6, 16), product('SYNTHETIC_TWO_UP', 2.2e6, 25)]))).toEqual(['SYNTHETIC_UP'])
  })
  it('keeps safety voltage categories separate and never converts AC to DC', () => {
    const p = product('SYNTHETIC_SAFETY', 2.2e6, 250)
    p.spec.voltages = [{ valueV: 250, type: 'AC', safetyClass: 'X1', state: 'consistent', sourceField: 'Specs.X1RatedVoltageAC' }]
    expect(names(find([p], '0402 2.2uF X2 200Vac X5R ±20%'))).toEqual([])
    expect(names(find([p], '0402 2.2uF X1 200Vac X5R ±20%'))).toEqual(['SYNTHETIC_SAFETY'])
  })
  it('expands temperature range without widening drift, rather than ranking code strings', () => {
    const rows = [product('SYNTHETIC_WIDER_DRIFT', 2.2e6, 10, '0402', 'X6S'), product('SYNTHETIC_VALID', 2.2e6, 10, '0402', 'X7R'), product('SYNTHETIC_TWO_UP', 2.2e6, 10, '0402', 'X8R')]
    expect(names(find(rows))).toEqual(['SYNTHETIC_VALID'])
    expect(find(rows).alternatives[0].differences![0].actual).toContain('125℃')
  })
  it('takes the nearest compatible temperature tier even if that tier has no matching product', () => {
    const intermediate = product('SYNTHETIC_INTERMEDIATE', 2.2e6, 10, '0402', 'X7S'); intermediate.spec.tolerance.value = 10
    expect(names(find([intermediate, product('SYNTHETIC_TWO_UP', 2.2e6, 10, '0402', 'X8R')], '0402 2.2uF 10V X6S ±20%'))).toEqual([])
  })
  it('never upgrades unfamiliar temperature codes or non-EIA source definitions', () => {
    const p = product('SYNTHETIC_NON_EIA', 2.2e6, 10, '0402', 'X7R'); p.spec.temperatureStandard = 'MURATA'
    expect(names(find([p]))).toEqual([])
    expect(names(find([product('SYNTHETIC_CLASS1', 2.2e6, 10, '0402', 'C0G')]))).toEqual([])
  })
  it('orders adjacent smaller before adjacent larger packages and respects inch/metric identities', () => {
    const rows = [product('SYNTHETIC_SMALL', 2.2e6, 10, '0201'), product('SYNTHETIC_TOO_SMALL', 2.2e6, 10, '01005'), product('SYNTHETIC_LARGE', 2.2e6, 10, '0603')]
    expect(names(find(rows))).toEqual(['SYNTHETIC_SMALL', 'SYNTHETIC_LARGE'])
    const r = find(rows, '1005M 2.2uF 10V X5R ±20%')
    expect(names(r)).toEqual(['SYNTHETIC_SMALL', 'SYNTHETIC_LARGE'])
    expect(r.alternatives[0].differences![0]).toMatchObject({ requested: '公制 1005', actual: '公制 0603' })
  })
  it('allows four simultaneous one-tier changes and reports every difference', () => {
    const r = find([product('SYNTHETIC_MULTI', 4.7e6, 16, '0201', 'X7R')])
    expect(names(r)).toEqual(['SYNTHETIC_MULTI'])
    expect(r.alternatives[0]).toMatchObject({ kind: 'alternative', applicationState: 'matched' })
    expect(r.alternatives[0].differences!.map(d => d.field)).toEqual(['capacitancePf', 'voltage', 'temperature', 'size'])
    expect(r.totalMatches).toBe(0)
  })
  it('applies all four one-tier changes under the AEC characteristic filter without relaxing qualification or application', () => {
    const qualified = product('SYNTHETIC_AEC_UP', 4.7e6, 16, '0201', 'X7R')
    qualified.classification!.applicationRaw = '汽车I×汽车信息娱乐/舒适设备'
    const untagged = structuredClone(qualified); untagged.partNo = 'SYNTHETIC_UNTAGGED'; untagged.classification!.characteristicsRaw = []
    const contradictory = structuredClone(qualified); contradictory.partNo = 'SYNTHETIC_CONFLICT'; contradictory.compliance.aecQ200 = false
    const wrongApplication = product('SYNTHETIC_OTHER_APPLICATION', 4.7e6, 16, '0201', 'X7R')
    const r = translateOfficialInput(input, 'A', catalog([qualified, untagged, contradictory, wrongApplication]), [], 20, ['infotainment'], true).official!
    expect(names(r)).toEqual(['SYNTHETIC_AEC_UP'])
    expect(r.alternatives[0].differences!.map(d => d.field)).toEqual(['capacitancePf', 'voltage', 'temperature', 'size'])
    expect(r.alternatives[0].kind).toBe('alternative')
  })
  it('does not let a non-AEC exact product suppress AEC substitutes when AEC is requested', () => {
    const ordinary = product('SYNTHETIC_ORDINARY_EXACT'); ordinary.classification!.characteristicsRaw = []; ordinary.compliance.aecQ200 = false
    const qualified = product('SYNTHETIC_AEC_UP', 4.7e6)
    const r = translateOfficialInput(input, 'A', catalog([ordinary, qualified]), [], 20, ['general'], true).official!
    expect(r.totalMatches).toBe(0)
    expect(names(r)).toEqual(['SYNTHETIC_AEC_UP'])
  })
  it('suppresses AEC substitutes when a qualified exact product already satisfies the selected application', () => {
    const r = translateOfficialInput(input, 'A', catalog([product('SYNTHETIC_AEC_EXACT'), product('SYNTHETIC_AEC_UP', 4.7e6)]), [], 20, ['general'], true).official!
    expect(r.matches.map(m => m.product.partNo)).toEqual(['SYNTHETIC_AEC_EXACT'])
    expect(r.alternatives).toEqual([])
  })
  it.each(['height', 'missing-height', 'precision', 'dimensions', 'application', 'aec', 'series'] as const)('keeps %s as a hard constraint', field => {
    const p = product('SYNTHETIC_UP', 4.7e6)
    let text = input + ' H0.7mm'
    if (field === 'height') p.spec.thicknessMaxMm = .8
    if (field === 'missing-height') p.spec.thicknessMaxMm = null
    if (field === 'precision') p.spec.tolerance.value = 10
    if (field === 'dimensions') text += ' 2x1mm'
    if (field === 'application') p.classification!.applicationRaw = '医疗I×植入式医疗器械设备或医疗器械设备[GHTF D]'
    if (field === 'aec') { p.classification!.characteristicsRaw = []; text += ' AEC-Q200'; p.compliance.aecQ200 = false }
    if (field === 'series') text += ' GCM'
    const parsed = parseOfficialDescription(text); parsed.query.applications = ['general']
    expect(matchOfficialProducts(catalog([p]), parsed).alternatives).toEqual([])
  })
  it('excludes review and duplicate PNs while allowing fallback next to exact NRND records', () => {
    const exactNrnd = review(product('SYNTHETIC_EXACT_NRND'))
    const r = find([exactNrnd, product('SYNTHETIC_ACTIVE_UP', 4.7e6), review(product('SYNTHETIC_REVIEW_UP', 4.7e6))])
    expect(r.totalReviewMatches).toBe(1)
    expect(names(r)).toEqual(['SYNTHETIC_ACTIVE_UP'])
    const duplicate = product('SYNTHETIC_DUP', 4.7e6)
    expect(names(find([duplicate, duplicate]))).toEqual([])
  })
  it('retains unknown RO and never marks substitutes exact', () => {
    const r = find([product('SYNTHETIC_UP', 4.7e6)], input + ' RO')
    expect(r.alternatives[0].kind).toBe('alternative')
    expect(r.alternatives[0].warnings.join()).toContain('RO')
  })
  it('prefers the requested package, then fewer changes, with truthful totals after truncation', () => {
    const r = find([product('SYNTHETIC_SMALL', 2.2e6, 10, '0201'), product('SYNTHETIC_SAME_SIZE', 4.7e6), product('SYNTHETIC_MULTI', 4.7e6, 16)], input, 1)
    expect(names(r)).toEqual(['SYNTHETIC_SAME_SIZE'])
    expect(r.totalAlternatives).toBe(3)
  })
  it('only applies the fallback to description mode, preserving direct PN decoding', () => {
    const c = catalog([product('SYNTHETIC_UP', 10e6, 2.5, '0201')])
    expect(translateOfficialInput('0201 4.7uF 2.5V X5R ±20%', 'A', c).official!.totalAlternatives).toBe(1)
    expect(translateOfficialInput('MSASP063EB5475MFNA01', 'B', c).official!.totalAlternatives).toBe(0)
  })
  it('exports selected substitutes with differences, never through ordinary export or normal datasheet scope', () => {
    const c = catalog([product('SYNTHETIC_MULTI', 4.7e6, 16, '0201', 'X7R')])
    const entry: BatchExportEntry = { row: { input, fileName: '', sheetName: '', rowNumber: 1 }, translation: translateOfficialInput(input, 'A', c), applications: ['general'], selectedPartNumbers: new Set(['SYNTHETIC_MULTI']) }
    expect(batchExportTables([entry]).candidates).toHaveLength(1)
    const selected = batchExportTables([entry], true)
    expect(selected.candidates).toHaveLength(2)
    expect(selected.candidates[1][2]).toContain('替代候选')
    expect(selected.candidates[1].at(-1)).toContain('2.2uF → 4.7uF')
    expect(selected.summaries[1][selected.summaries[0].indexOf('替代候选总数')]).toBe('1')
    expect(buildDatasheetPlan([entry], 'displayed-normal').partNumbers).toEqual([])
    expect(buildDatasheetPlan([entry], 'selected').partNumbers).toEqual(['SYNTHETIC_MULTI'])
  })
  it('keeps substitute differences for a repeated PN and ignores an unselected exact-query context', () => {
    const c = catalog([product('SYNTHETIC_UP', 4.7e6)])
    const first: BatchExportEntry = { row: { input, fileName: '', sheetName: '', rowNumber: 1 }, translation: translateOfficialInput(input, 'A', c), applications: ['general'], selectedPartNumbers: new Set(['SYNTHETIC_UP']) }
    const second: BatchExportEntry = { ...first, row: { ...first.row, rowNumber: 2 }, translation: translateOfficialInput('0402 4.7uF 10V X5R ±20%', 'A', c), selectedPartNumbers: new Set() }
    expect(datasheetMatches([first, second], 'selected').map(m => m.kind)).toEqual(['alternative'])
    second.selectedPartNumbers.add('SYNTHETIC_UP')
    expect(datasheetMatches([first, second], 'selected').map(m => m.kind)).toEqual(['alternative', 'exact'])
    expect(buildDatasheetPlan([first, second], 'selected').partNumbers).toEqual(['SYNTHETIC_UP'])
  })
  it('prioritizes original footprint, then smaller, then larger even with fewer changes on the larger package', () => {
    const r = find([product('SYNTHETIC_LARGER', 2.2e6, 10, '0603'), product('SYNTHETIC_SMALLER', 4.7e6, 16, '0201'), product('SYNTHETIC_SAME', 4.7e6)])
    expect(names(r)).toEqual(['SYNTHETIC_SAME', 'SYNTHETIC_SMALLER', 'SYNTHETIC_LARGER'])
    expect(r.alternatives[2].differences![0].label).toContain('大一档')
  })
  it('never jumps past a present larger-package tier that has no matching product', () => {
    const intermediate = product('SYNTHETIC_INTERMEDIATE', 2.2e6, 10, '0603'); intermediate.spec.tolerance.value = 10
    expect(names(find([intermediate, product('SYNTHETIC_TWO_LARGER', 2.2e6, 10, '0805')]))).toEqual([])
  })
  it('separates a customer-line-1-like 0805 item above H1.0 from usable substitutes', () => {
    const p = product('SYNTHETIC_0805_HEIGHT_REF', 22e6, 10, '0805', 'X6S'); p.spec.thicknessMm = 1.25; p.spec.thicknessMaxMm = 1.45
    const r = find([p], 'CAP X6S 22uF +/-20% 10V CH0603 H1.0mm RO')
    expect(r.totalMatches).toBe(0); expect(r.alternatives).toEqual([])
    expect(r.heightReferences[0]).toMatchObject({ kind: 'height-reference', product: { partNo: 'SYNTHETIC_0805_HEIGHT_REF' } })
    expect(r.heightReferences[0].differences!.map(d => d.field)).toEqual(['size', 'maxHeightMm'])
    expect(r.heightReferences[0].differences![1]).toMatchObject({ requested: '≤1mm', actual: '1.45mm' })
    expect(r.heightReferences[0].warnings.join()).toContain('RO')
  })
  it('keeps a customer-line-4-like taller 0402 item as reference and a line-5-like item without H as substitute', () => {
    const tall = product('SYNTHETIC_0402_TALL', 4.7e6, 6.3); tall.spec.thicknessMaxMm = .55
    const r = find([tall], 'CAP X5R 4.7uF +/-20% 6.3V CH0201 H0.39mm RO')
    expect(r.alternatives).toEqual([]); expect(r.heightReferences).toHaveLength(1)
    const withoutHeight = find([product('SYNTHETIC_0402_NO_H', 2.2e6, 6.3)], 'CAP X5R 2.2uF +/-20% 6.3V CH0201 RO')
    expect(names(withoutHeight)).toEqual(['SYNTHETIC_0402_NO_H']); expect(withoutHeight.heightReferences).toEqual([])
  })
  it('allows height-only references but never infers excess height from missing maximum thickness', () => {
    const tooTall = product('SYNTHETIC_HEIGHT_ONLY'); tooTall.spec.thicknessMaxMm = .8
    const unknown = product('SYNTHETIC_HEIGHT_UNKNOWN'); unknown.spec.thicknessMaxMm = null
    const r = find([tooTall, unknown], input + ' H0.7mm')
    expect(r.heightReferences.map(m => m.product.partNo)).toEqual(['SYNTHETIC_HEIGHT_ONLY'])
    expect(r.heightReferences[0].differences!.map(d => d.field)).toEqual(['maxHeightMm'])
    expect(names(r)).toEqual([])
  })
  it('does not show any references if exact matching succeeds or the query is below 1uF', () => {
    const tall = product('SYNTHETIC_TALL'); tall.spec.thicknessMaxMm = .8
    expect(find([product('SYNTHETIC_EXACT'), tall], input + ' H0.7mm').heightReferences).toEqual([])
    expect(find([tall], '0402 0.9uF 10V X5R ±20% H0.7mm').heightReferences).toEqual([])
  })
  it.each(['precision', 'application', 'aec', 'review'] as const)('does not relax %s for a height reference', field => {
    const tall = product('SYNTHETIC_TALL'); tall.spec.thicknessMaxMm = .8
    if (field === 'precision') tall.spec.tolerance.value = 10
    if (field === 'application') tall.classification!.applicationRaw = '医疗I×植入式医疗器械设备或医疗器械设备[GHTF D]'
    if (field === 'aec') { tall.classification!.characteristicsRaw = []; tall.compliance.aecQ200 = false }
    if (field === 'review') review(tall)
    const r = translateOfficialInput(input + ' H0.7mm', 'A', catalog([tall]), [], 20, ['general'], true).official!
    expect(r.heightReferences).toEqual([])
  })
  it('limits height-reference display without corrupting totals or selected export classification', () => {
    const rows = Array.from({ length: 3 }, (_, i) => { const p = product(`SYNTHETIC_TALL_${i}`); p.spec.thicknessMaxMm = .8; return p })
    const c = catalog(rows), text = input + ' H0.7mm'
    const t = translateOfficialInput(text, 'A', c, [], 1)
    expect(t.official!.totalHeightReferences).toBe(3); expect(t.official!.heightReferences).toHaveLength(1)
    const entry: BatchExportEntry = { row: { input: text, fileName: '', sheetName: '', rowNumber: 1 }, translation: t, applications: ['general'], selectedPartNumbers: new Set(['SYNTHETIC_TALL_0']) }
    expect(batchExportTables([entry]).candidates).toHaveLength(1)
    const selected = batchExportTables([entry], true)
    expect(selected.candidates[1][2]).toContain('高度不符合')
    expect(selected.candidates[1][4]).toContain('不是替代候选')
    expect(selected.candidates[1].at(-1)).toContain('≤0.7mm → 0.8mm')
    expect(selected.summaries[1][selected.summaries[0].indexOf('高度不符合参考总数')]).toBe('3')
    expect(buildDatasheetPlan([entry], 'displayed-normal').partNumbers).toEqual([])
    expect(buildDatasheetPlan([entry], 'selected').partNumbers).toEqual(['SYNTHETIC_TALL_0'])
    expect(datasheetMatches([entry], 'selected')[0].kind).toBe('height-reference')
  })
})
