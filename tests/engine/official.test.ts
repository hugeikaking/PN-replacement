import { translateOfficialInput } from '../../src/engine/official/translate'
import { hasAecQ200Characteristic } from '../../src/engine/official/classification'
import { describe, it, expect } from 'vitest'
import { batchExportTables } from '../../src/utils/batch-files'
import { createOfficialCatalog, readOfficialJsonLines } from '../../src/engine/official/catalog'
import { parseOfficialDescription } from '../../src/engine/official/query'
import { matchOfficialProducts } from '../../src/engine/official/matcher'
import type { NormalizedMurataProduct } from '../../src/engine/official/types'

// Deliberately synthetic PNs; these fixtures are never shipped in the offline webpage.
function product(pn = 'SYNTHETIC_A'): NormalizedMurataProduct {
  return {
    schemaVersion: 1, manufacturer: 'murata', componentType: 'mlcc', partNo: pn,
    partNoWithoutPackageCode: null, productName: null, series: 'GRM',
    spec: { capacitancePf: 100000, voltages: [{ valueV: 16, type: 'DC', safetyClass: null, state: 'consistent', sourceField: 'Specs.RatedVoltageDC' }], sizeInch: '0402', sizeMetric: '1005M', lengthMm: 1, widthMm: .5, thicknessMm: .5, thicknessMaxMm: .55, temperature: 'X7R', temperatureStandard: 'EIA', tolerance: { kind: 'percent', value: 10, unit: '%' } },
    compliance: { aecQ200: false, rohsRaw: null, reachRaw: null },
    lifecycle: { category: 'active', rawStatus: '目前生产', newProductRaw: null },
    links: { datasheets: ['https://example.invalid/synthetic.pdf'], productDetail: null, verified: false },
    validation: { status: 'consistent', issues: [], datasheetReviewed: false, companyAccepted: false },
    auditReference: { file: 'normalization-audit.jsonl', line: 1 }, provenance: { sourcePath: 'synthetic.jsonl', sourceIndex: 1 },
  }
}
function catalog(rows: NormalizedMurataProduct[], overrides = {}) {
  rows = structuredClone(rows)
  rows.forEach((r, i) => { r.auditReference.line = i + 1 })
  const issueCounts: Record<string, number> = {}
  rows.forEach(r => r.validation.issues.forEach(x => { issueCounts[x.code] = (issueCounts[x.code] || 0) + 1 }))
  return createOfficialCatalog({ schemaVersion: 1, completed: true, products: rows.length, consistentProducts: rows.filter(x => x.validation.status === 'consistent').length, reviewProducts: rows.filter(x => x.validation.status === 'review').length, mode: 'CheckedSamples', fullDatabaseRead: false, source: 'original-synthetic.json', sourceBytes: 1234, sourceModifiedUtc: '2026-10-05T00:00:00Z', inputFiles: ['synthetic.jsonl'], conflictingPartNumbers: [], issueCounts, generatedAt: '2026-10-05T00:00:00Z', ...overrides }, rows)
}
function review(p: NormalizedMurataProduct, code: string) {
  p.validation.status = 'review'
  p.validation.issues.push({ code, severity: code === 'lifecycle-nrnd' ? 'warning' : 'error', field: 'synthetic', rawValue: null, textValue: null })
  return p
}
const find = (rows: NormalizedMurataProduct[], text: string, limit?: number) => matchOfficialProducts(catalog(rows), parseOfficialDescription(text), limit)

describe('official query parsing', () => {
  it('preserves units, typed voltages, explicit metric and absolute tolerance', () => {
    const q = parseOfficialDescription('公制 1005 0.1µF 16Vdc C0G ±0.5pF AEC-Q200')
    expect(q.errors).toEqual([])
    expect(q.missingFields).toEqual([])
    expect(q.query).toMatchObject({ size: { system: 'metric', code: '1005' }, capacitancePf: 100000, tolerance: { kind: 'absolute', value: .5, unit: 'pF' }, aecQ200: true })
    expect(parseOfficialDescription('DK1 10pF X1 440Vac 11.4x6mm').query).toMatchObject({ voltage: { type: 'AC', safetyClass: 'X1', valueV: 440 }, dimensions: { lengthMm: 11.4, widthMm: 6 } })
    expect(parseOfficialDescription('008004 10pF 16V C0G 2%').errors).toEqual([])
  })
  it.each(['0402 100nF 50V 16V', '0402 100nF 10uF 16V', '0402 100nF 16V X7R X5R', '0402 100nF 16V 工规 车规', '0402 -100nF 16V', '0402 1,00pF 16V', '0402 100nF 16Vac unexpected', '0402 100nF X1 440V', '0402 100nF X1 X2 440Vac', 'MLCC'])('does not silently accept ambiguous/unsupported description %s', text => {
    expect(parseOfficialDescription(text).errors.length).toBeGreaterThan(0)
  })
  it('normalizes equivalent capacitance and explicit package systems without guessing', () => {
    expect(parseOfficialDescription('1,000pF 1005M 16V').query.capacitancePf).toBe(1000)
    expect(parseOfficialDescription('0402 0.1uF 16V').query.capacitancePf).toBe(100000)
    expect(parseOfficialDescription('0603 100nF').query.size).toEqual({ system: 'inch', code: '0603' })
    expect(parseOfficialDescription('100nF').missingFields).toEqual(['电压', '尺寸'])
  })
})

describe('official record matching', () => {
  it('returns source PN and source links, never an assembled PN', () => {
    const r = find([product()], '0402 100nF 16V X7R ±10%')
    expect(r.matches.map(x => x.product.partNo)).toEqual(['SYNTHETIC_A'])
    expect(r.matches[0].kind).toBe('exact')
    expect(r.matches[0].product.links.verified).toBe(false)
    expect(r.warnings.some(x => x.includes('样本'))).toBe(true)
  })
  it('does not substitute voltage, sizes, temperatures or tolerance', () => {
    for (const text of ['0402 100nF 10V', '0201 100nF 16V', '0402 100nF 16V X5R', '0402 100nF 16V ±5%']) expect(find([product()], text).totalMatches).toBe(0)
    const p = product(); p.spec.voltages[0].valueV = 50
    expect(find([p], '0402 100nF 16V').totalMatches).toBe(0)
  })
  it('explains which individual and combined conditions are absent without relaxing the match', () => {
    const p = product(); p.spec.voltages[0].valueV = 50
    const r = find([p], '0402 100nF 16V X7R ±10%')
    expect(r.matches).toEqual([]); expect(r.reviewMatches).toEqual([])
    expect(r.diagnostics).toMatchObject({ catalogRecords: 1, eligibleRecords: 1 })
    expect(r.diagnostics?.conditions.find(c => c.field === 'voltage')).toMatchObject({ expected: 'DC 16V', matchingRecords: 0, remainingRecords: 0, otherConditionsRecords: 1 })
    expect(r.diagnostics?.conditions.find(c => c.field === 'capacitancePf')).toMatchObject({ expected: '100nF', matchingRecords: 1, remainingRecords: 1, otherConditionsRecords: 0 })
    const absentCap = find([p], '0201 4.7uF 2.5V X5R ±20%')
    expect(absentCap.diagnostics?.conditions.find(c => c.field === 'capacitancePf')).toMatchObject({ expected: '4.7uF', matchingRecords: 0, remainingRecords: 0 })
  })
  it('distinguishes individually present conditions from a missing combination', () => {
    const a = product('SYNTHETIC_CAP'); a.spec.voltages[0].valueV = 50
    const b = product('SYNTHETIC_VOLT'); b.spec.capacitancePf = 1000000
    const r = find([a, b], '100nF 16V')
    expect(r.totalMatches + r.totalReviewMatches).toBe(0)
    expect(r.diagnostics?.conditions).toMatchObject([
      { field: 'capacitancePf', matchingRecords: 1, remainingRecords: 1, otherConditionsRecords: 1 },
      { field: 'voltage', matchingRecords: 1, remainingRecords: 0, otherConditionsRecords: 1 },
    ])
  })
  it('includes review records in diagnosis but excludes blocked PNs and never diagnoses parser errors', () => {
    const p = review(product('SYNTHETIC_NRND'), 'lifecycle-nrnd'); p.lifecycle = { category: 'nrnd', rawStatus: 'NRND', newProductRaw: null }; p.spec.voltages[0].valueV = 50
    const blocked = product('SYNTHETIC_BLOCKED')
    const r = find([p, blocked, structuredClone(blocked)], '100nF 16V')
    expect(r.diagnostics).toMatchObject({ catalogRecords: 3, eligibleRecords: 1 })
    expect(r.diagnostics?.conditions.find(c => c.field === 'voltage')?.matchingRecords).toBe(0)
    expect(find([product()], '0402 100nF 16V').diagnostics).toBeUndefined()
    expect(find([product()], '0402 100nF 16V UNKNOWN').diagnostics).toBeUndefined()
    expect(find([product()], '100nF 250Vac').diagnostics?.conditions.find(c => c.field === 'voltage')?.expected).toBe('AC 250V')
  })
  it('ranks unspecified temperature X5R, X6S, X7R but respects specified temperature', () => {
    const rows = ['X7R', 'C0G', 'X6S', 'X5R'].map((t, i) => { const p = product(`SYNTHETIC_${i}`); p.spec.temperature = t; return p })
    expect(find(rows, '0402 100nF 16V').matches.map(x => x.product.spec.temperature)).toEqual(['X5R', 'X6S', 'X7R', 'C0G'])
    expect(find(rows, '0402 100nF 16V X7R').matches.map(x => x.product.spec.temperature)).toEqual(['X7R'])
  })
  it('shows industrial and automotive together unless requested', () => {
    const car = product('SYNTHETIC_CAR'); car.compliance.aecQ200 = true
    expect(find([product(), car], '0402 100nF 16V').totalMatches).toBe(2)
    expect(find([product(), car], '0402 100nF 16V 车规').matches.map(x => x.product.partNo)).toEqual(['SYNTHETIC_CAR'])
    expect(find([product(), car], '0402 100nF 16V 工规').matches.map(x => x.product.partNo)).toEqual(['SYNTHETIC_A'])
  })
  it('keeps NRND and missing voltage in reviewed results, with no guessed voltage', () => {
    const nrnd = review(product('SYNTHETIC_NRND'), 'lifecycle-nrnd'); nrnd.lifecycle = { category: 'nrnd', rawStatus: 'NRND', newProductRaw: null }
    const missing = review(structuredClone(nrnd), 'missing-verified-voltage'); missing.partNo = 'SYNTHETIC_MISSING'; missing.spec.voltages = []
    expect(find([product(), nrnd, missing], '0402 100nF 16V')).toMatchObject({ totalMatches: 1, totalReviewMatches: 1 })
    const partial = find([nrnd, missing], '0402 100nF')
    expect(partial.totalReviewMatches).toBe(2)
    expect(partial.reviewMatches.every(x => x.kind === 'partial')).toBe(true)
    expect(partial.reviewMatches.find(x => x.product.partNo === 'SYNTHETIC_MISSING')!.warnings.join(' ')).toContain('missing-verified-voltage')
  })
  it('distinguishes DC, AC, X1 and Y1 and preserves actual KRM geometry', () => {
    const p = product(); p.spec.voltages = [{ valueV: 250, type: 'AC', safetyClass: 'Y1', state: 'consistent', sourceField: 'Specs.Y1RatedVoltageAC' }]
    expect(find([p], '0402 100nF 250V').totalMatches).toBe(0)
    expect(find([p], '0402 100nF 250Vac').totalMatches).toBe(0)
    expect(find([p], '0402 100nF X1 250Vac').totalMatches).toBe(0)
    expect(find([p], '0402 100nF Y1 250Vac').totalMatches).toBe(1)
    p.spec.sizeInch = '0805'; p.spec.lengthMm = 2.2; p.spec.widthMm = 1.25
    expect(find([p], '100nF Y1 250Vac 2.2x1.25mm').totalMatches).toBe(1)
    expect(find([p], '100nF Y1 250Vac 2x1.25mm').totalMatches).toBe(0)
    expect(find([product()], '1005M 100nF 16V').totalMatches).toBe(1)
  })
  it('never reports exact for an incomplete structured query or parsing errors', () => {
    const parsed = parseOfficialDescription('100nF'); parsed.missingFields = []
    expect(matchOfficialProducts(catalog([product()]), parsed).matches[0].kind).toBe('partial')
    expect(find([product()], '0402 100nF 16V 25V').matches).toEqual([])
  })
  it('blocks all duplicate/conflicting PNs and limits visible results without hiding totals', () => {
    const p = review(product(), 'conflicting-duplicate-part-number')
    expect(find([p], '0402 100nF 16V').reviewMatches).toEqual([])
    expect(find([product(), product()], '0402 100nF 16V').matches).toEqual([])
    const rows = Array.from({ length: 25 }, (_, i) => product(`SYNTHETIC_${i}`))
    expect(find(rows, '0402 100nF 16V', 10)).toMatchObject({ totalMatches: 25 })
    expect(find(rows, '0402 100nF 16V', 10).matches).toHaveLength(10)
  })
})

describe('official catalog import guards', () => {
  it('rejects incomplete summaries, mismatched counts, issues and provenance', () => {
    expect(() => catalog([product()], { completed: false })).toThrow()
    expect(() => catalog([product()], { products: 2 })).toThrow()
    expect(() => catalog([product()], { issueCounts: { unexpected: 3 } })).toThrow()
    const p = product(); p.provenance.sourcePath = 'different-run.jsonl'
    expect(() => catalog([p])).toThrow()
  })
  it('rejects invalid units, unsafe links, wrong voltage semantics and forged validation state', () => {
    const p = product(); (p.spec as any).capacitancePf = '100nF'
    expect(() => catalog([p])).toThrow()
    const link = product(); link.links.datasheets = ['javascript:alert(1)']
    expect(() => catalog([link])).toThrow()
    const safety = product(); safety.spec.voltages[0].safetyClass = 'X1'
    expect(() => catalog([safety])).toThrow()
    const status = product(); status.lifecycle.rawStatus = 'NRND'
    expect(() => catalog([status])).toThrow()
    const empty = product(); empty.spec.voltages = []
    expect(() => catalog([empty])).toThrow()
    const thickness = product(); thickness.spec.thicknessMm = 3
    expect(() => catalog([thickness])).toThrow()
    const accepted = product(); (accepted.validation as any).companyAccepted = true
    expect(() => catalog([accepted])).toThrow()
  })
  it('streams UTF-8 JSONL with BOM, blanks, split Unicode and no final newline', async () => {
    const data = '\uFEFF' + JSON.stringify(product()) + '\n\n' + JSON.stringify(product('SYNTHETIC_2'))
    expect(await readOfficialJsonLines(new Blob([data]))).toHaveLength(2)
    const bytes = new TextEncoder().encode(data)
    const chineseStart = bytes.indexOf(0xe7)
    expect(chineseStart).toBeGreaterThan(2)
    const chunked = { size: bytes.length, stream: () => new ReadableStream<Uint8Array>({ start(controller) { let offset = 0; for (const end of [1, 2, chineseStart + 1, chineseStart + 2, bytes.length]) { controller.enqueue(bytes.slice(offset, end)); offset = end } controller.close() } }) } as Blob
    expect(await readOfficialJsonLines(chunked)).toHaveLength(2)
    await expect(readOfficialJsonLines(new Blob(['{"partNo":']))).rejects.toThrow('不是有效 JSON')
    await expect(readOfficialJsonLines({ size: 513 * 1024 * 1024 } as Blob)).rejects.toThrow('512MB')
  })
})

describe('customer CAP descriptions and nominal height', () => {
  const samples = [
  [
    "CAP X6S 22uF +/-20% 10V CH0603 H1.0mm RO",
    "X6S",
    22000000,
    10,
    "0603",
    1
  ],
  [
    "CAP X5R 10uF +/-20% 6.3V CH0402 H0.7mm RO",
    "X5R",
    10000000,
    6.3,
    "0402",
    0.7
  ],
  [
    "CAP X6S 4.7uF +/-20% 10V CH0402 H0.7mm RO",
    "X6S",
    4700000,
    10,
    "0402",
    0.7
  ],
  [
    "CAP X5R 4.7uF +/-20% 6.3V CH0201 H0.39mm RO",
    "X5R",
    4700000,
    6.3,
    "0201",
    0.39
  ],
  [
    "CAP X5R 2.2uF +/-20% 6.3V CH0201 RO",
    "X5R",
    2200000,
    6.3,
    "0201",
    null
  ],
  [
    "CAP X6S 1uF +/-20% 6.3V CH0201 RO",
    "X6S",
    1000000,
    6.3,
    "0201",
    null
  ],
  [
    "CAP X5R 1uF +/-20% 6.3V CH0201 RO",
    "X5R",
    1000000,
    6.3,
    "0201",
    null
  ]
] as const
  it.each(samples)('parses original customer description %s without losing constraints', (input, temperature, capacitancePf, valueV, code, height) => {
    const parsed = parseOfficialDescription(input)
    expect(parsed.errors).toEqual([])
    expect(parsed.query).toMatchObject({ temperature, capacitancePf, voltage: { valueV, type: 'DC', safetyClass: null }, size: { system: 'inch', code }, tolerance: { kind: 'percent', value: 20, unit: '%' }, unverifiedRequirements: ['RO'] })
    expect(parsed.query.maxHeightMm).toBe(height === null ? undefined : height)
    expect(parsed.missingFields).toEqual(['RO（含义待确认）'])
  })
  it('supports lowercase aliases but still rejects unrecognized requirements and conflicting heights/sizes', () => {
    const p = parseOfficialDescription('cap x5r 10uf +/-20% 6.3v ch0402 h.7mm ro')
    expect(p.errors).toEqual([])
    expect(p.query.maxHeightMm).toBe(.7)
    for (const extra of ['UNKNOWN', 'ROHS', 'R O', 'H-0.7mm', 'H0mm', 'H1cm', 'H0.7mm H0.8mm', 'CH0201']) {
      expect(parseOfficialDescription('CAP X5R 10uF +/-20% 6.3V CH0402 ' + extra).errors.length, extra).toBeGreaterThan(0)
    }
    expect(parseOfficialDescription('CAP RO').errors).not.toEqual([])
    expect(parseOfficialDescription('CAP 0402 100nF 16V H0.50mm H.5mm').errors).toEqual([])
  })
  it('compares maximum thickness to H, accepts equal/thinner limits and refuses missing maximums', () => {
    const equal = product('SYNTHETIC_EQUAL'); equal.spec.thicknessMm = .5; equal.spec.thicknessMaxMm = .7
    const thin = product('SYNTHETIC_THIN'); thin.spec.thicknessMm = .4; thin.spec.thicknessMaxMm = .55
    const thick = product('SYNTHETIC_THICK'); thick.spec.thicknessMm = .7; thick.spec.thicknessMaxMm = .9
    const missing = product('SYNTHETIC_MISSING_MAX'); missing.spec.thicknessMm = .5; missing.spec.thicknessMaxMm = null
    const maxOnly = product('SYNTHETIC_MAX_ONLY'); maxOnly.spec.thicknessMm = null; maxOnly.spec.thicknessMaxMm = .7
    const rows = [equal, thin, thick, missing, maxOnly]
    const result = find(rows, 'CAP X7R 100nF +/-10% 16V CH0402 H0.7mm')
    expect(result.matches.map(x => x.product.partNo).sort()).toEqual(['SYNTHETIC_EQUAL', 'SYNTHETIC_MAX_ONLY', 'SYNTHETIC_THIN'])
    expect(result.matches.every(x => x.kind === 'exact')).toBe(true)
    expect(find(rows, 'CAP X7R 100nF +/-10% 16V CH0402').totalMatches).toBe(5)
    const diagnostic = find([thick, missing], 'CAP X7R 100nF +/-10% 16V CH0402 H0.7mm').diagnostics
    expect(diagnostic?.conditions.find(c => c.field === 'maxHeightMm')).toMatchObject({ label: '最大允许高度', expected: '≤0.7mm', matchingRecords: 0, otherConditionsRecords: 2 })
  })
  it('matches the reported 10uF dimensions and retains unresolved RO as partial', () => {
    // Synthetic identity with the public example dimensions; no invented official PN.
    const p = product('SYNTHETIC_CUSTOMER_10UF')
    p.spec.capacitancePf = 10000000; p.spec.temperature = 'X5R'
    p.spec.tolerance = { kind: 'percent', value: 20, unit: '%' }
    p.spec.voltages[0].valueV = 6.3; p.spec.thicknessMm = .5; p.spec.thicknessMaxMm = .7
    expect(find([p], 'CAP X5R 10uF +/-20% 6.3V CH0402 H0.7mm RO').matches[0].kind).toBe('partial')
    expect(find([p], 'CAP X5R 10uF +/-20% 6.3V CH0402 H0.69mm RO').totalMatches).toBe(0)
    expect(find([p], 'CAP X6S 22uF +/-20% 10V CH0603 H1.0mm RO').totalMatches).toBe(0)
  })
  it('retains RO in partial candidate labels and exports, even if a caller clears parsed missing fields', () => {
    const input = 'CAP X7R 100nF +/-10% 16V CH0402 H0.55mm RO'
    const parsed = parseOfficialDescription(input); parsed.missingFields = []
    const result = matchOfficialProducts(catalog([product()]), parsed)
    expect(result.matches[0].kind).toBe('partial')
    expect(result.matches[0].warnings.join(' ')).toContain('RO')
    const tables = batchExportTables([{ row: { input, fileName: 'customer.csv', sheetName: '输入', rowNumber: 2 }, translation: { input, description: '', mode: 'A', parsed, official: result, errors: [], warnings: [] }, applications: ['general'], selectedPartNumbers: new Set() }])
    expect(tables.summaries[1][5]).toBe(input)
    expect(tables.summaries[1][14]).toContain('RO')
    expect(tables.candidates[1][4]).toBe('部分参数匹配')
    expect(tables.candidates[1][tables.candidates[0].indexOf('标称高度(mm)')]).toBe('0.5')
    expect(tables.candidates[1][tables.candidates[0].indexOf('最大高度(mm)')]).toBe('0.55')
    expect(tables.candidates[1].join(' ')).toContain('尚未核对全部要求')
  })
})


describe('explicit AEC-Q200 product characteristic filter', () => {
  const tagged = (pn: string, raw: unknown, compliance: boolean | null = true) => {
    const p = product(pn)
    p.classification = { applicationRaw: '民用设备', characteristicsRaw: raw, standardRaw: null, safetyCertificatesRaw: null }
    p.compliance.aecQ200 = compliance
    return p
  }
  it('reads exact raw tags without inferring from series, boolean compliance or negative text', () => {
    expect(hasAecQ200Characteristic(tagged('SYNTHETIC_TAG', ['125℃', 'AEC-Q200']))).toBe(true)
    expect(hasAecQ200Characteristic(tagged('SYNTHETIC_STRING', '回流焊接； AEC - Q200'))).toBe(true)
    for (const raw of [undefined, [], 'not AEC-Q200', '非AEC-Q200', { AecQ200: true }, 'AEC-Q200 Grade 2']) {
      expect(hasAecQ200Characteristic(tagged('SYNTHETIC_UNCONFIRMED', raw))).toBe(false)
    }
  })
  it('filters both translation modes, keeps RO partial and diagnoses missing characteristic', () => {
    const a = tagged('SYNTHETICTAG', ['AEC-Q200'])
    const b = tagged('SYNTHETICBOOL', ['回流焊接'])
    const c = catalog([a, b])
    expect(translateOfficialInput('0402 100nF 16V', 'A', c).official?.totalMatches).toBe(2)
    const filtered = translateOfficialInput('0402 100nF 16V RO', 'A', c, [], 20, ['general'], true)
    expect(filtered.official?.matches.map(x => x.product.partNo)).toEqual(['SYNTHETICTAG'])
    expect(filtered.official?.matches[0].kind).toBe('partial')
    const tables = batchExportTables([{ row: { input: filtered.input, fileName: 'customer.csv', sheetName: '输入', rowNumber: 2 }, translation: filtered, applications: ['general'], selectedPartNumbers: new Set() }])
    expect(tables.summaries[1][tables.summaries[0].indexOf('查询提示')]).toContain('Specs.Characteristics 明确标记 AEC-Q200')
    expect(translateOfficialInput('SYNTHETICBOOL', 'B', c, [], 20, ['general'], true).official?.matches.map(x => x.product.partNo)).toEqual(['SYNTHETICTAG'])
    const empty = translateOfficialInput('100nF', 'A', catalog([b]), [], 20, undefined, true)
    expect(empty.official?.diagnostics?.conditions.find(x => x.field === 'aecQ200Characteristic')).toMatchObject({ matchingRecords: 0, expected: '已明确标记' })
  })
  it('rejects contradictory input and sends conflicting source fields to review', () => {
    const p = tagged('SYNTHETICCONFLICT', ['AEC-Q200'], false)
    const c = catalog([p])
    expect(translateOfficialInput('100nF 工规', 'A', c, [], 20, undefined, true).errors.join()).toContain('冲突')
    const r = translateOfficialInput('0402 100nF 16V', 'A', c, [], 20, undefined, true).official!
    expect(r.totalMatches).toBe(0)
    expect(r.reviewMatches[0].kind).toBe('partial')
    expect(r.reviewMatches[0].warnings.join()).toContain('合规字段为否')
  })
})
