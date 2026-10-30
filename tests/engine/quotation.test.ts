import { describe, expect, it, vi } from 'vitest'
import * as XLSX from 'xlsx'
import type { NormalizedMurataProduct } from '../../src/engine/official/types'
import type { BatchExportEntry } from '../../src/utils/batch-files'
import { createOfficialCatalog } from '../../src/engine/official/catalog'
import { translateOfficialInput } from '../../src/engine/official/translate'
import { quotationY40, randomQuotationUsage, selectedQuotationItems, buildQuotationClipboard } from '../../src/utils/quotation'
import { readBatchWorkbook, selectBatchRows } from '../../src/utils/batch-files'

function product(partNo = 'SYNTHETIC_GRM'): NormalizedMurataProduct {
  return {
    schemaVersion: 1, manufacturer: 'murata', componentType: 'mlcc', partNo, partNoWithoutPackageCode: null, productName: null, series: 'GRM',
    classification: { applicationRaw: '民用设备,工业设备,汽车[信息娱乐/舒适设备]', characteristicsRaw: ['High Q'] },
    spec: { capacitancePf: 100000, voltages: [{ valueV: 16, type: 'DC', safetyClass: null, state: 'consistent', sourceField: 'Specs.RatedVoltageDC' }], sizeInch: '0402', sizeMetric: '1005M', lengthMm: 1, widthMm: .5, thicknessMm: .5, thicknessMaxMm: .55, temperature: 'X7R', temperatureStandard: 'EIA', tolerance: { kind: 'percent', value: 10, unit: '%' } },
    compliance: { aecQ200: false, rohsRaw: null, reachRaw: null }, lifecycle: { category: 'active', rawStatus: '目前生产', newProductRaw: null },
    links: { datasheets: [], productDetail: null, verified: false }, validation: { status: 'consistent', issues: [], datasheetReviewed: false, companyAccepted: false },
    auditReference: { file: 'normalization-audit.jsonl', line: 1 }, provenance: { sourcePath: 'synthetic.jsonl', sourceIndex: 1 },
  }
}
function entry(products = [product()]): BatchExportEntry {
  products.forEach((p, i) => { p.provenance.sourceIndex = i + 1; p.auditReference.line = i + 1 })
  const catalog = createOfficialCatalog({ schemaVersion: 1, completed: true, products: products.length, consistentProducts: products.length, reviewProducts: 0, mode: 'CheckedSamples', fullDatabaseRead: false, source: 'synthetic.json', sourceBytes: 100, sourceModifiedUtc: '', inputFiles: ['synthetic.jsonl'], conflictingPartNumbers: [], issueCounts: {}, generatedAt: '' }, products)
  return { row: { input: '0402 100nF X7R ±10% 16V', fileName: '', sheetName: '', rowNumber: 1 }, translation: translateOfficialInput('0402 100nF X7R ±10% 16V', 'A', catalog, [], 20, ['general']), applications: ['general'], selectedPartNumbers: new Set(products.map(p => p.partNo!)) }
}
const item = (pn = 'SYNTHETIC#', usage = 1) => ({ partNo: pn, y40: 'WLMD5G' as const, usage, descriptions: [], warnings: [] })

describe('quotation clipboard aligned to the company A:AR template', () => {
  it('populates only C/G/I/J/K/L/M/O, with C=Y and P:T and all other columns blank', () => {
    const { rows, text, html } = buildQuotationClipboard([item('SYNTHETIC#', 37), { ...item('SYNTHETIC_2', 100), y40: 'ADAS-OT' }])
    expect(rows.map(row => row.length)).toEqual([44, 44])
    expect(rows[0].filter(Boolean)).toEqual(['Y', 'SYNTHETIC#', 'WLMD5G', 'IoT module', '100000', '37', '3700000', 'pcs/month'])
    expect(rows[0][2]).toBe('Y'); expect(rows[0][6]).toBe('SYNTHETIC#'); expect(rows[0][8]).toBe('WLMD5G')
    expect(rows[0][9]).toBe('IoT module'); expect(rows[0][10]).toBe('100000'); expect(rows[0][11]).toBe('37'); expect(rows[0][12]).toBe('3700000'); expect(rows[0][14]).toBe('pcs/month')
    expect(rows[1][12]).toBe('10000000')
    for (const row of rows) for (let i = 0; i < 44; i++) if (![2, 6, 8, 9, 10, 11, 12, 14].includes(i)) expect(row[i]).toBe('')
    expect(text.startsWith('\t\tY\t')).toBe(true)
    expect(text.split('\r\n').map(row => row.split('\t').length)).toEqual([44, 44])
    expect(text.endsWith('\r\n')).toBe(false)
    expect(html.match(/<td /g)?.length).toBe(88)
    expect(html).toContain('mso-number-format:'); expect(html).not.toContain('<th')
  })
  it('can be read back as tabular text and HTML without shifting G/I/M/O or adding header rows', () => {
    const payload = buildQuotationClipboard([item('SYNTHETIC_01', 9), item('SYNTHETIC_02', 10)])
    const book = readBatchWorkbook('quote.csv', new TextEncoder().encode(payload.text).buffer as ArrayBuffer)
    expect(selectBatchRows(book, 0, 6, false).map(x => x.input)).toEqual(['SYNTHETIC_01', 'SYNTHETIC_02'])
    const excel = XLSX.read(payload.html, { type: 'string' }), sheet = excel.Sheets[excel.SheetNames[0]]
    expect(sheet.C1.v).toBe('Y'); expect(sheet.G1.v).toBe('SYNTHETIC_01'); expect(sheet.I1.v).toBe('WLMD5G')
    expect(String(sheet.M1.v)).toBe('900000'); expect(sheet.O2.v).toBe('pcs/month')
    expect(sheet.P1?.v ?? '').toBe(''); expect(sheet.AR2?.v ?? '').toBe('')
  })
  it('uses the user business routing with GCM priority over generic AEC', () => {
    const p = product(); expect(quotationY40(p)).toBe('WLMD5G')
    p.compliance.aecQ200 = true; expect(quotationY40(p)).toBe('IVI-OT')
    p.series = 'GCM'; expect(quotationY40(p)).toBe('ADAS-OT')
    p.series = 'GRT'; expect(quotationY40(p)).toBe('IVI-OT')
  })
  it('leaves unknown/conflicting/nonindustrial classifications for explicit choice', () => {
    const p = product(); p.compliance.aecQ200 = null; expect(quotationY40(p)).toBe('')
    p.classification!.characteristicsRaw = ['AEC-Q200']; expect(quotationY40(p)).toBe('IVI-OT')
    p.compliance.aecQ200 = false; expect(quotationY40(p)).toBe('')
    p.classification!.characteristicsRaw = []; p.classification!.applicationRaw = '医疗I×植入式医疗器械设备或医疗器械设备[GHTF D]'; expect(quotationY40(p)).toBe('')
  })
  it('uses only selected official results; merges duplicate PNs and retains all warnings', () => {
    const first = entry([product('SYNTHETIC_A'), product('SYNTHETIC_B')]); first.selectedPartNumbers = new Set(['SYNTHETIC_B'])
    const second = structuredClone(first); second.translation.official!.matches[1].kind = 'height-reference'
    second.translation.official!.matches[1].differences = [{ field: 'maxHeightMm', label: '最大高度', requested: '≤0.4mm', actual: '0.55mm' }]
    const items = selectedQuotationItems([first, second], new Map(), () => 0)
    expect(items.map(x => x.partNo)).toEqual(['SYNTHETIC_B'])
    expect(items[0].warnings.join('；')).toContain('高度不符合')
    expect(items[0].warnings.join('；')).toContain('≤0.4mm → 0.55mm')
    expect(items[0].descriptions.join('')).toContain('100nF')
  })
  it('does not copy unknown, unselected or error results', () => {
    const e = entry(); e.selectedPartNumbers = new Set(['NOT_IN_RESULTS']); expect(selectedQuotationItems([e])).toEqual([])
    e.selectedPartNumbers = new Set(['SYNTHETIC_GRM']); e.translation.errors.push('bad input'); expect(selectedQuotationItems([e])).toEqual([])
  })
  it('generates inclusive integer endpoints and caches values across reopening/copying', () => {
    expect(randomQuotationUsage(() => 0)).toBe(1); expect(randomQuotationUsage(() => .999999)).toBe(100)
    const cache = new Map<string, number>(), random = vi.fn(() => .37), e = entry()
    const first = selectedQuotationItems([e], cache, random), second = selectedQuotationItems([e], cache, random)
    expect(first[0].usage).toBe(38); expect(second[0].usage).toBe(38); expect(random).toHaveBeenCalledTimes(1)
    expect(buildQuotationClipboard(first).text).toBe(buildQuotationClipboard(second).text)
  })
  it.each([0, 101, 1.2, NaN, Infinity])('rejects invalid usage %s rather than copying a wrong demand', usage => {
    expect(() => buildQuotationClipboard([item('SYNTHETIC', usage)])).toThrow('1–100')
  })
  it.each(['=HYPERLINK("url")', '+CMD', '-1', '@SUM', 'PN\tNEXT', 'PN\nNEXT', '<img>', ' PN'])('rejects formula/delimiter/HTML injection PN %s', pn => {
    expect(() => buildQuotationClipboard([item(pn)])).toThrow('料号格式异常')
  })
  it('does not insert a missing Y40 or duplicate PN silently', () => {
    expect(() => buildQuotationClipboard([{ ...item(), y40: '' }])).toThrow('Y40')
    expect(() => buildQuotationClipboard([item(), item()])).toThrow('重复')
    expect(() => buildQuotationClipboard([])).toThrow('先勾选')
  })
})
