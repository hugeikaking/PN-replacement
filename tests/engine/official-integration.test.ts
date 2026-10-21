import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { createOfficialCatalog } from '../../src/engine/official/catalog'
import { translateOfficialInput } from '../../src/engine/official/translate'
import type { NormalizedMurataProduct } from '../../src/engine/official/types'
import { useOfficialStore } from '../../src/stores/official'
import { useTranslationStore } from '../../src/stores/translation'
import type { KnowledgeRule } from '../../src/stores/knowledge'

// Synthetic products check routing, never validate a manufacturer's actual suffix.
function product(pn = 'TESTA'): NormalizedMurataProduct {
  return {
    schemaVersion: 1, manufacturer: 'murata', componentType: 'mlcc', partNo: pn,
    partNoWithoutPackageCode: null, productName: null, series: 'GRM',
    spec: { capacitancePf: 100000, voltages: [{ valueV: 16, type: 'DC', safetyClass: null, state: 'consistent', sourceField: 'Specs.RatedVoltageDC' }], sizeInch: '0603', sizeMetric: '1608M', lengthMm: 1.6, widthMm: .8, thicknessMm: .8, thicknessMaxMm: .9, temperature: 'X7R', temperatureStandard: 'EIA', tolerance: { kind: 'percent', value: 10, unit: '%' } },
    compliance: { aecQ200: false, rohsRaw: null, reachRaw: null },
    lifecycle: { category: 'active', rawStatus: '目前生产', newProductRaw: null },
    links: { datasheets: [], productDetail: null, verified: false },
    validation: { status: 'consistent', issues: [], datasheetReviewed: false, companyAccepted: false },
    auditReference: { file: 'normalization-audit.jsonl', line: 1 }, provenance: { sourcePath: 'synthetic.jsonl', sourceIndex: 1 },
  }
}
function catalog(rows: NormalizedMurataProduct[]) {
  rows.forEach((p, i) => { p.auditReference.line = i + 1 })
  const issueCounts: Record<string, number> = {}
  rows.forEach(p => p.validation.issues.forEach(x => { issueCounts[x.code] = (issueCounts[x.code] || 0) + 1 }))
  return createOfficialCatalog({ schemaVersion: 1, completed: true, products: rows.length, consistentProducts: rows.filter(p => p.validation.status === 'consistent').length, reviewProducts: rows.filter(p => p.validation.status === 'review').length, mode: 'CheckedSamples', fullDatabaseRead: false, source: 'synthetic.json', sourceBytes: 1, sourceModifiedUtc: '2026-10-05T00:00:00Z', generatedAt: '2026-10-05T00:00:00Z', inputFiles: ['synthetic.jsonl'], conflictingPartNumbers: [], issueCounts }, rows)
}
const pns = (r: ReturnType<typeof translateOfficialInput>) => r.official?.matches.map(x => x.product.partNo)

describe('unified official translation', () => {
  it('uses identical parameters and returns identical candidates in modes A and B', () => {
    const c = catalog([product()])
    const a = translateOfficialInput('0603 100nF 16V X7R ±10%', 'A', c)
    const b = translateOfficialInput('CL10B104KO8NNNC', 'B', c)
    expect(a.errors).toEqual([]); expect(b.errors).toEqual([])
    expect(a.parsed?.query).toEqual(b.parsed?.query)
    expect(pns(b)).toEqual(pns(a)); expect(pns(b)).toEqual(['TESTA'])
    expect(b.description).toBe('三星 MLCC 0603 X7R 100nF ±10% 16V')
  })
  it('preserves TDK temperature when the decoded value equals the original code', () => {
    const p = product(); p.spec.voltages[0].valueV = 50
    const b = translateOfficialInput('c1608x7r1h104k080aa', 'B', catalog([p]))
    expect(b.description).toContain('0603 X7R 100nF ±10% 50V')
    expect(pns(b)).toEqual(['TESTA'])
    const different = product(); different.spec.temperature = 'X5R'; different.spec.voltages[0].valueV = 50
    expect(pns(translateOfficialInput('C1608X7R1H104K080AA', 'B', catalog([different])))).toEqual([])
  })
  it('retains the corrected 20-character Taiyo layout and 2.5V / 4.7uF', () => {
    const p = product(); p.spec.sizeInch = '0201'; p.spec.temperature = 'X5R'; p.spec.capacitancePf = 4700000; p.spec.voltages[0].valueV = 2.5; p.spec.tolerance.value = 20
    const b = translateOfficialInput('MSASP063EB5475MFNA01', 'B', catalog([p]))
    expect(b.errors).toEqual([])
    expect(b.description).toBe('太阳诱电 MLCC 0201 X5R 4.7uF ±20% 2.5V')
    expect(b.parsed?.query.capacitancePf).toBe(4700000)
    expect(b.parsed?.query.voltage?.valueV).toBe(2.5)
    expect(pns(b)).toEqual(['TESTA'])
    const pasted = translateOfficialInput(b.description, 'A', catalog([p]))
    expect(pasted.errors).toEqual([])
    expect(pasted.parsed?.query).toEqual(b.parsed?.query)
    expect(pns(pasted)).toEqual(pns(b))
    const emptyCatalog = catalog([product()])
    const directEmpty = translateOfficialInput('MSASP063EB5475MFNA01', 'B', emptyCatalog)
    const pastedEmpty = translateOfficialInput(b.description, 'A', emptyCatalog)
    expect(directEmpty.errors).toEqual([]); expect(pastedEmpty.errors).toEqual([])
    expect(pastedEmpty.official?.diagnostics).toEqual(directEmpty.official?.diagnostics)
  })
  it.each(['CL10B104KO8NNNC', 'C1608X7R1H104K080AA'])('accepts the copied manufacturer + MLCC description for %s', pn => {
    const p = product(); if (pn.startsWith('C1608')) p.spec.voltages[0].valueV = 50
    const c = catalog([p]); const b = translateOfficialInput(pn, 'B', c)
    const pasted = translateOfficialInput(b.description, 'A', c)
    expect(pasted.errors).toEqual([])
    expect(pasted.parsed?.query).toEqual(b.parsed?.query)
    expect(pns(pasted)).toEqual(['TESTA'])
  })
  it('does not hide unknown parameters when accepting a manufacturer label', () => {
    expect(translateOfficialInput('三星 MLCC 0603 X7R 100nF ±10% 16V 其他参数', 'A', catalog([product()])).errors.join(' ')).toContain('其他参数')
  })
  it.each(['CL10B104KO8NNN', 'CL10B104KO8NNNCC', 'CL10Z104KO8NNNC', 'CL10BXYZKO8NNNC', 'CL10B000KO8NNNC', 'CL10B108KO8NNNC', 'CL10B104KZ8NNNC', 'CGA1608X7R1H104K080AA', 'RC0603KR0710KL', 'WR06X104JTL', 'CC0603KRX7R9BB104', 'MSASU31BB5106KTNA01', 'JMK107BBJ226MA-T', 'CL10B104KO8NNNC comment'])('blocks unsupported/unknown/shifted layout %s before matching', pn => {
    const b = translateOfficialInput(pn, 'B', catalog([product()]))
    expect(b.errors.length).toBeGreaterThan(0)
    expect(b.official).toBeUndefined()
    expect(b.description).toBe('')
  })
  it('allows description decoding without a catalog but never assembles a Murata PN', () => {
    const b = translateOfficialInput('CL10B104KO8NNNC', 'B')
    expect(b.description).toContain('100nF'); expect(b.errors).toEqual([]); expect(b.official).toBeUndefined()
    expect(b.warnings.join(' ')).toContain('导入')
    expect(translateOfficialInput('0603 100nF 16V', 'A').errors.join(' ')).toContain('不会拼接')
  })
  it('does not let saved text/PDF attachments override structured mappings', () => {
    const reference: KnowledgeRule = { id: 'reference', manufacturer: 'samsung', manufacturerLabel: '三星', componentType: 'mlcc', componentLabel: 'MLCC', description: '104=540uF, O=4V', fileType: 'text', createdAt: 1, updatedAt: 1 }
    const r = translateOfficialInput('CL10B104KO8NNNC', 'B', catalog([product()]), [reference, { ...reference, id: 'pdf', fileType: 'pdf', fileName: 'reference.pdf' }])
    expect(r.description).toContain('100nF ±10% 16V')
    expect(pns(r)).toEqual(['TESTA'])
  })
  it('handles the additional temperature symbols documented in the Taiyo table in both modes', () => {
    const p = product(); p.spec.temperature = 'C0H'; p.spec.sizeInch = '0201'; p.spec.capacitancePf = 10; p.spec.voltages[0].valueV = 2.5; p.spec.tolerance.value = 20
    const c = catalog([p])
    const b = translateOfficialInput('MSARP063ECH100MFNA01', 'B', c)
    const a = translateOfficialInput('0201 10pF 2.5V C0H ±20%', 'A', c)
    expect(b.errors).toEqual([]); expect(a.errors).toEqual([])
    expect(pns(b)).toEqual(pns(a)); expect(pns(b)).toEqual(['TESTA'])
  })
  it('reads Murata records directly and does not guess a missing voltage', () => {
    const p = product('KRMTEST'); p.spec.voltages = []; p.validation.status = 'review'; p.validation.issues.push({ severity: 'error', code: 'missing-verified-voltage', field: 'Specs.RatedVoltage', rawValue: null, textValue: null })
    p.spec.sizeInch = null; p.spec.sizeMetric = null; p.spec.capacitancePf = 99999.99999999
    const r = translateOfficialInput('KRMTEST', 'B', catalog([p]))
    expect(r.description).toContain('电压待核查')
    expect(r.description).toContain('1.6x0.8mm X7R 100nF')
    expect(r.parsed?.query.voltage).toBeUndefined()
    expect(r.official?.reviewMatches[0].kind).toBe('partial')
    expect(r.official?.matches).toEqual([])
  })
  it('does not arbitrarily choose one of multiple AC/DC/safety ratings', () => {
    const p = product(); p.spec.voltages.push({ type: 'AC', safetyClass: null, state: 'consistent', sourceField: 'Specs.RatedVoltageAC', valueV: 25 })
    const r = translateOfficialInput('TESTA', 'B', catalog([p]))
    expect(r.description).toContain('16Vdc / 25Vac')
    expect(r.parsed?.query.voltage).toBeUndefined()
    expect(r.official?.matches[0].kind).toBe('partial')
  })
  it('keeps NRND in the review group for both routes', () => {
    const p = product(); p.lifecycle = { category: 'nrnd', rawStatus: 'NRND', newProductRaw: null }; p.validation.status = 'review'; p.validation.issues.push({ severity: 'warning', code: 'lifecycle-nrnd', field: 'Status', rawValue: 'NRND', textValue: null })
    const r = translateOfficialInput('CL10B104KO8NNNC', 'B', catalog([p]))
    expect(r.official?.matches).toEqual([])
    expect(r.official?.reviewMatches[0].warnings.join(' ')).toContain('NRND')
  })
  it('blocks duplicate record lookup and rejects unrepresentable asymmetric tolerance', () => {
    const c = catalog([product(), product()])
    expect(translateOfficialInput('TESTA', 'B', c).errors.join(' ')).toContain('冲突')
    const z = translateOfficialInput('CL10B104ZO8NNNC', 'B', catalog([product()]))
    expect(z.errors.length).toBeGreaterThan(0); expect(z.official).toBeUndefined()
  })
})

describe('H5 store official routing', () => {
  const saved = new Map<string, string>()
  const write = vi.fn((key: string, value: string) => saved.set(key, value))
  beforeEach(() => {
    setActivePinia(createPinia()); saved.clear(); write.mockClear()
    vi.stubGlobal('localStorage', { getItem: (key: string) => saved.get(key) ?? null, setItem: write, removeItem: (key: string) => saved.delete(key) })
  })
  afterEach(() => { vi.unstubAllGlobals() })
  it('routes both modes through the loaded official catalog', async () => {
    useOfficialStore().setCatalog(catalog([product()]))
    const store = useTranslationStore()
    store.setInput('0603 100nF 16V X7R ±10%'); await store.translate()
    expect(store.currentResults[0].partNumber).toBe('TESTA')
    store.setMode('B'); store.setInput('CL10B104KO8NNNC'); await store.translate()
    expect(store.currentResults[0].partNumber).toContain('100nF')
    expect(store.currentResults[0].official?.matches[0].product.partNo).toBe('TESTA')
    expect(write).not.toHaveBeenCalled()
  })
  it('clears the loaded catalog and never falls back to assembled PNs', async () => {
    const official = useOfficialStore(); official.setCatalog(catalog([product()])); official.setCatalog()
    const store = useTranslationStore(); store.setInput('0603 100nF 16V X7R ±10%'); await store.translate()
    expect(store.currentResults[0].success).toBe(false)
    expect(store.currentResults[0].partNumber).toBe('')
  })
  it('does not replay cached assembled part numbers as official results', () => {
    saved.set('pn-translator-history', JSON.stringify([{ results: [{ success: true, partNumber: 'OLD-ASSEMBLED-PN' }] }]))
    expect(useTranslationStore().history).toEqual([])
    expect(useOfficialStore().catalog).toBeUndefined()
  })
  it('retains separate inputs and results when switching and only clears the chosen mode', async () => {
    useOfficialStore().setCatalog(catalog([product()]))
    const store = useTranslationStore()
    store.setInput('三星 MLCC 0603 X7R 100nF ±10% 16V'); await store.translate()
    store.setMode('B'); expect(store.currentInput).toBe('')
    store.setInput('CL10B104KO8NNNC'); await store.translate()
    store.setMode('A')
    expect(store.currentInput).toBe('三星 MLCC 0603 X7R 100nF ±10% 16V')
    expect(store.currentResults[0].partNumber).toBe('TESTA')
    store.setMode('B')
    expect(store.currentInput).toBe('CL10B104KO8NNNC')
    expect(store.currentResults[0].partNumber).toContain('三星 MLCC')
    store.setMode('B'); expect(store.currentInput).toBe('CL10B104KO8NNNC')
    store.clearResult(); expect(store.currentInput).toBe(''); expect(store.currentResults).toEqual([])
    store.setMode('A'); expect(store.currentResults[0].partNumber).toBe('TESTA')
  })
  it('keeps a completed inactive query in its own mode without overwriting the visible mode', () => {
    const store = useTranslationStore(); store.setMode('B'); store.setInput('CL10B104KO8NNNC'); store.setMode('A'); store.setInput('100nF')
    store.acceptResults([translateOfficialInput('CL10B104KO8NNNC', 'B')], 'B')
    expect(store.currentInput).toBe('100nF'); expect(store.currentResults).toEqual([])
    expect(store.history[0].mode).toBe('B')
    store.setMode('B'); expect(store.currentResults[0].partNumber).toContain('三星 MLCC')
  })
})
