import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { readBatchWorkbook, selectBatchRows, batchExportTables, encodeBatchCsv, encodeBatchExcel, batchTemplate } from '../../src/utils/batch-files'
import type { BatchExportEntry } from '../../src/utils/batch-files'
import { createOfficialCatalog } from '../../src/engine/official/catalog'
import { translateOfficialInput } from '../../src/engine/official/translate'
import type { NormalizedMurataProduct } from '../../src/engine/official/types'

const bytes = (text: string) => new TextEncoder().encode(text).buffer as ArrayBuffer
function workbook(sheets: Record<string, XLSX.WorkSheet>) {
  const book = XLSX.utils.book_new()
  Object.entries(sheets).forEach(([name, sheet]) => XLSX.utils.book_append_sheet(book, sheet, name))
  return XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}
function product(pn: string, nrnd = false): NormalizedMurataProduct {
  return {
    schemaVersion: 1, manufacturer: 'murata', componentType: 'mlcc', partNo: pn, partNoWithoutPackageCode: null, productName: null, series: 'GRM',
    classification: { applicationRaw: '民用×民用设备,工业×工业设备', characteristicsRaw: ['High Q'], standardRaw: '安全规格认证品', safetyCertificatesRaw: 'https://example.invalid/cert' },
    spec: { capacitancePf: 100000, voltages: [{ valueV: 16, type: 'DC', safetyClass: null, state: 'consistent', sourceField: 'Specs.RatedVoltageDC' }], sizeInch: '0603', sizeMetric: '1608M', lengthMm: 1.6, widthMm: .8, thicknessMm: .8, thicknessMaxMm: .9, temperature: 'X7R', temperatureStandard: 'EIA', tolerance: { kind: 'percent', value: 10, unit: '%' } },
    compliance: { aecQ200: false, rohsRaw: null, reachRaw: null }, lifecycle: { category: nrnd ? 'nrnd' : 'active', rawStatus: nrnd ? 'NRND' : '目前生产', newProductRaw: null },
    links: { datasheets: ['https://example.invalid/datasheet'], productDetail: null, verified: false },
    validation: { status: nrnd ? 'review' : 'consistent', issues: nrnd ? [{ code: 'lifecycle-nrnd', severity: 'warning', field: 'Status', rawValue: 'NRND', textValue: null }] : [], datasheetReviewed: false, companyAccepted: false },
    auditReference: { file: 'normalization-audit.jsonl', line: nrnd ? 2 : 1 }, provenance: { sourcePath: 'synthetic.jsonl', sourceIndex: nrnd ? 2 : 1 },
  }
}
function entries(): BatchExportEntry[] {
  const catalog = createOfficialCatalog({ schemaVersion: 1, completed: true, products: 2, consistentProducts: 1, reviewProducts: 1, mode: 'CheckedSamples', fullDatabaseRead: false, source: 'synthetic.json', sourceBytes: 100, sourceModifiedUtc: '', inputFiles: ['synthetic.jsonl'], conflictingPartNumbers: [], issueCounts: { 'lifecycle-nrnd': 1 }, generatedAt: '' }, [product('SYNTHETIC_NORMAL'), product('SYNTHETIC_NRND', true)])
  return ['CL10B104KO8NNNC', 'UNKNOWN', 'MSASP063EB5475MFNA01'].map((input, index) => ({ row: { input, fileName: '输入.xlsx', sheetName: '料号', rowNumber: index + 2 }, translation: translateOfficialInput(input, 'B', catalog, [], 20, ['general']), applications: ['general'], selectedPartNumbers: new Set<string>() }))
}

describe('batch input files', () => {
  it('keeps Chinese, quoted delimiters and original row numbers across blank rows', () => {
    const book = readBatchWorkbook('采购.csv', bytes('\uFEFF备注,描述\r\n"采购,研发",0603 100nF 16V X7R\r\n,\r\n第二行,100nF\r\n'))
    expect(selectBatchRows(book, 0, 1, true)).toEqual([
      { input: '0603 100nF 16V X7R', fileName: '采购.csv', sheetName: 'CSV', rowNumber: 2 },
      { input: '100nF', fileName: '采购.csv', sheetName: 'CSV', rowNumber: 4 },
    ])
    expect(selectBatchRows(book, 0, 0, true)[0].input).toBe('采购,研发')
  })
  it.each([';', '\t'])('accepts delimiter %s and optional headers without losing first input', delimiter => {
    const book = readBatchWorkbook('pn.csv', bytes(`PN1${delimiter}备注\nPN2${delimiter}备注`))
    expect(selectBatchRows(book, 0, 0, false).map(x => x.input)).toEqual(['PN1', 'PN2'])
    expect(selectBatchRows(book, 0, 0, true)[0]).toMatchObject({ input: 'PN2', rowNumber: 2 })
  })
  it('selects sheets and columns and preserves Excel formatted leading zeros', () => {
    const sheet = XLSX.utils.aoa_to_sheet([['其他', '输入'], ['备注', 402], ['', 'CL10B104KO8NNNC']]); sheet.B2.z = '0000'
    const book = readBatchWorkbook('输入.xlsx', workbook({ 空表: {}, 输入: sheet }))
    expect(selectBatchRows(book, 1, 1, true).map(x => x.input)).toEqual(['0402', 'CL10B104KO8NNNC'])
    expect(selectBatchRows(book, 1, 1, true)[0]).toMatchObject({ sheetName: '输入', rowNumber: 2 })
  })
  it('rejects selected formulas even with cached values while ignoring unselected formulas', () => {
    const sheet = XLSX.utils.aoa_to_sheet([['原输入', '公式'], ['100nF', '100nF']]); sheet.B2.f = 'CONCAT("100","nF")'
    const book = readBatchWorkbook('公式.xlsx', workbook({ 输入: sheet }))
    expect(selectBatchRows(book, 0, 0, true)[0].input).toBe('100nF')
    expect(() => selectBatchRows(book, 0, 1, true)).toThrow(/第 2 行.*公式/)
  })
  it('reads legacy Excel .xls and rejects boolean input cells', () => {
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['料号', '布尔值'], ['CL10B104KO8NNNC', false]]), '旧表')
    const input = readBatchWorkbook('旧表.xls', XLSX.write(book, { type: 'array', bookType: 'biff8' }))
    expect(selectBatchRows(input, 0, 0, true)[0]).toMatchObject({ input: 'CL10B104KO8NNNC', rowNumber: 2, sheetName: '旧表' })
    expect(() => selectBatchRows(input, 0, 1, true)).toThrow('布尔值')
  })
  it('rejects multiline selected cells instead of splitting one product into several', () => {
    const book = readBatchWorkbook('输入.csv', bytes('输入\n"100nF\n16V"'))
    expect(() => selectBatchRows(book, 0, 0, true)).toThrow('含换行')
  })
  it.each(['输入\n"abc', '输入\nabc"def', '输入\n"abc"def'])('rejects malformed CSV %s', text => {
    expect(() => readBatchWorkbook('bad.csv', bytes(text))).toThrow('引号')
  })
  it('rejects 101 inputs without silently truncating', () => {
    const book = readBatchWorkbook('输入.csv', bytes(['输入', ...Array(101).fill('100nF')].join('\n')))
    expect(() => selectBatchRows(book, 0, 0, true)).toThrow('没有截取或丢弃')
  })
  it('rejects invalid encoding, empty, oversized and unsupported files', () => {
    expect(() => readBatchWorkbook('旧.csv', new Uint8Array([255]).buffer)).toThrow('UTF-8')
    expect(() => readBatchWorkbook('空.csv', bytes(' \n'))).toThrow('没有可读取')
    expect(() => readBatchWorkbook('大.csv', new ArrayBuffer(5 * 1024 * 1024 + 1))).toThrow('5MB')
    expect(() => readBatchWorkbook('输入.pdf', bytes('pdf'))).toThrow('仅支持')
  })
  it('detects excessive Excel ranges rather than accepting a truncated sheet', () => {
    const sheet = XLSX.utils.aoa_to_sheet([['输入']]); sheet['!ref'] = 'A1:A10000'
    expect(() => readBatchWorkbook('大.xlsx', workbook({ 输入: sheet }))).toThrow('范围过大')
  })
  it.each(['A', 'B'] as const)('round-trips Chinese CSV template for mode %s', mode => {
    const rows = selectBatchRows(readBatchWorkbook('模板.csv', bytes(encodeBatchCsv(batchTemplate(mode)))), 0, 0, true)
    expect(rows.map(x => x.input)).toEqual(batchTemplate(mode).slice(1).map(x => x[0]))
    expect(rows[0].rowNumber).toBe(2)
  })
})

describe('batch query exports', () => {
  it('keeps errors and no-match rows, real source rows and classification without exporting NRND by default', () => {
    const tables = batchExportTables(entries())
    expect(tables.summaries).toHaveLength(4); expect(tables.candidates).toHaveLength(2); expect(tables.flat).toHaveLength(4)
    expect(tables.summaries[1].slice(1, 4)).toEqual(['输入.xlsx', '料号', '2'])
    expect(tables.summaries[2][7]).toBe('输入或查询错误'); expect(tables.summaries[3][7]).toBe('当前目录范围无匹配')
    expect(tables.summaries[1][12]).toBe('1')
    expect(tables.candidates[1][1]).toBe('SYNTHETIC_NORMAL')
    expect(tables.candidates[1]).toContain('High Q'); expect(tables.candidates[1]).toContain('安全规格认证品')
    expect(tables.candidates.flat()).not.toContain('SYNTHETIC_NRND')
  })
  it('exports a review candidate only when explicitly selected and labels it', () => {
    const rows = entries(); rows[0].selectedPartNumbers.add('SYNTHETIC_NRND')
    expect(batchExportTables(rows).candidates.flat()).not.toContain('SYNTHETIC_NRND')
    const tables = batchExportTables(rows, true)
    expect(tables.candidates).toHaveLength(2); expect(tables.flat).toHaveLength(2)
    expect(tables.candidates[1].slice(1, 4)).toEqual(['SYNTHETIC_NRND', '待核查（明确勾选）', '是'])
    expect(tables.candidates[1]).toContain('NRND')
  })
  it('separates total counts from currently displayed export rows', () => {
    const rows = entries(); rows[0].translation.official!.totalMatches = 55
    const tables = batchExportTables(rows)
    expect(tables.summaries[1].slice(10, 12)).toEqual(['55', '1']); expect(tables.candidates).toHaveLength(2)
  })
  it('writes a real Excel workbook with two linked sheets and formula-looking input as text', () => {
    const tables = batchExportTables(entries()); tables.summaries[1][5] = '=1+1'
    const book = XLSX.read(encodeBatchExcel(tables), { type: 'array' })
    expect(book.SheetNames).toEqual(['查询汇总', '候选明细'])
    expect(book.Sheets.查询汇总.F2).toMatchObject({ t: 's', v: '=1+1' }); expect(book.Sheets.查询汇总.F2.f).toBeUndefined()
    expect(book.Sheets.候选明细.B2.v).toBe('SYNTHETIC_NORMAL')
  })
  it('escapes CSV quotes and neutralizes formula prefixes including whitespace', () => {
    const csv = encodeBatchCsv([['=1+1', ' +2', '-3', '@SUM(A1)', '原文,"描述"']])
    expect(csv).toBe('\uFEFF"\'=1+1","\' +2","\'-3","\'@SUM(A1)","原文,""描述"""')
  })
})
