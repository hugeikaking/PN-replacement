import * as XLSX from 'xlsx'
import type { OfficialTranslation, OfficialTranslationMode } from '../engine/official/translate'
import type { ApplicationCategory } from '../engine/official/classification'
import { applicationLabels, productClassification } from '../engine/official/classification'

export const MAX_BATCH_ITEMS = 100
const MAX_FILE_BYTES = 5 * 1024 * 1024
const MAX_TABLE_ROWS = 1001
const MAX_COLUMNS = 100
interface BatchCell { text: string; invalid?: string }
export interface BatchSheet { name: string; rows: BatchCell[][]; firstRow: number }
export interface BatchWorkbook { fileName: string; sheets: BatchSheet[] }
export interface BatchInputRow { input: string; fileName: string; sheetName: string; rowNumber: number }

/** Parse CSV as records, including quoted delimiters/newlines; never evaluate cells. */
function csvRecords(text: string): string[][] {
  text = text.replace(/^\uFEFF/, '')
  let quoted = false
  const counts = { ',': 0, ';': 0, '\t': 0 }
  for (const char of text) {
    if (char === '"') quoted = !quoted
    if (!quoted && (char === '\r' || char === '\n')) break
    if (!quoted && char in counts) counts[char as keyof typeof counts]++
  }
  const delimiter = (Object.keys(counts) as (keyof typeof counts)[]).sort((a, b) => counts[b] - counts[a])[0]
  const rows: string[][] = []
  let row: string[] = [], cell = '', inQuotes = false, closed = false
  const pushCell = () => {
    row.push(cell); cell = ''; closed = false
    if (row.length > MAX_COLUMNS) throw new Error('表格最多支持 100 列，请只保留需要的列')
  }
  const pushRow = () => {
    pushCell(); rows.push(row); row = []
    if (rows.length > MAX_TABLE_ROWS) throw new Error('表格范围过大，请另存所需的 100 条输入')
  }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++ }
        else { inQuotes = false; closed = true }
      } else cell += char
    } else if (char === delimiter) pushCell()
    else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[i + 1] === '\n') i++
      pushRow()
    } else if (char === '"') {
      if (cell || closed) throw new Error('CSV 引号格式不正确，请从 Excel 重新另存为 CSV UTF-8')
      inQuotes = true
    } else {
      if (closed) throw new Error('CSV 引号后存在多余内容，请检查文件格式')
      cell += char
    }
  }
  if (inQuotes) throw new Error('CSV 引号没有闭合，文件可能不完整')
  if (cell || row.length || closed) pushRow()
  return rows
}

export function readBatchWorkbook(fileName: string, bytes: ArrayBuffer): BatchWorkbook {
  if (!bytes.byteLength || bytes.byteLength > MAX_FILE_BYTES) throw new Error('请选择不超过 5MB 的 Excel/CSV 文件')
  const extension = fileName.split('.').pop()?.toLowerCase()
  if (extension === 'csv') {
    let text: string
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
    catch { throw new Error('CSV 编码不是 UTF-8，请在 Excel 中另存为 CSV UTF-8') }
    const rows = csvRecords(text).map(row => row.map(value => ({ text: value })))
    if (!rows.some(row => row.some(cell => cell.text.trim()))) throw new Error('文件没有可读取的内容')
    return { fileName, sheets: [{ name: 'CSV', rows, firstRow: 1 }] }
  }
  if (extension !== 'xlsx' && extension !== 'xls') throw new Error('仅支持 .xlsx、.xls、.csv 文件')
  let book: XLSX.WorkBook
  try { book = XLSX.read(bytes, { type: 'array', sheetRows: MAX_TABLE_ROWS + 1, cellFormula: true, cellText: true, bookVBA: false }) }
  catch { throw new Error('Excel 文件无法读取，请检查是否完整、已加密或扩展名不正确') }
  if (!book.SheetNames.length || book.SheetNames.length > 50) throw new Error('工作簿为空或工作表超过 50 个')
  const sheets = book.SheetNames.map(name => {
    const sheet = book.Sheets[name]
    const reference = sheet['!fullref'] || sheet['!ref']
    if (!reference) return { name, rows: [], firstRow: 1 }
    const range = XLSX.utils.decode_range(reference)
    if (range.e.r - range.s.r + 1 > MAX_TABLE_ROWS || range.e.c + 1 > MAX_COLUMNS) throw new Error(`工作表“${name}”范围过大，请另存需要的输入区域（最多 100 列）`)
    const rows: BatchCell[][] = []
    for (let r = range.s.r; r <= range.e.r; r++) {
      const row: BatchCell[] = []
      for (let c = 0; c <= range.e.c; c++) {
        const cell = sheet[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined
        row.push({ text: cell ? cell.w ?? String(cell.v ?? '') : '', invalid: cell?.f || cell?.F ? '输入列含公式，请先复制并粘贴为值' : cell && !['s', 'n', 'z'].includes(cell.t) ? '输入列含错误、布尔值或非文本内容' : undefined })
      }
      rows.push(row)
    }
    return { name, rows, firstRow: range.s.r + 1 }
  })
  return { fileName, sheets }
}

export function selectBatchRows(book: BatchWorkbook, sheetIndex: number, columnIndex: number, hasHeader: boolean): BatchInputRow[] {
  const sheet = book.sheets[sheetIndex]
  if (!sheet || !Number.isInteger(columnIndex) || columnIndex < 0 || columnIndex >= MAX_COLUMNS) throw new Error('请选择工作表和输入列')
  const selected: BatchInputRow[] = []
  sheet.rows.forEach((cells, index) => {
    if (hasHeader && index === 0) return
    const cell = cells[columnIndex]
    const rowNumber = sheet.firstRow + index
    if (cell?.invalid) throw new Error(`第 ${rowNumber} 行：${cell.invalid}`)
    const input = cell?.text.trim() || ''
    if (!input) return
    if (/[\r\n]/.test(input)) throw new Error(`第 ${rowNumber} 行输入格含换行，请把一个物料的完整描述或料号放在同一行`)
    if (input.length > 1000) throw new Error(`第 ${rowNumber} 行输入超过 1000 字符，请检查是否选对列`)
    selected.push({ input, fileName: book.fileName, sheetName: sheet.name, rowNumber })
  })
  if (!selected.length) throw new Error('所选输入列没有数据，请检查列或取消“首行为标题”')
  if (selected.length > MAX_BATCH_ITEMS || selected.map(row => row.input).join('\n').length > 100000) throw new Error('一次最多导入 100 条输入，请拆成多次查询；没有截取或丢弃记录')
  return selected
}

export interface BatchExportEntry {
  row: BatchInputRow
  translation: OfficialTranslation
  applications: ApplicationCategory[]
  selectedPartNumbers: Set<string>
}
const summaryHeaders = ['输入序号', '来源文件', '工作表', '原表行号', '翻译方式', '原输入', '规格描述', '查询状态', '应用筛选', '目录范围', '正常生产候选总数', '正常生产当前显示数', '待核查候选总数', '待核查当前显示数', '缺少条件', '错误', '查询提示', '替代候选总数', '替代候选当前显示数', '高度不符合参考总数', '高度不符合参考当前显示数']
const candidateHeaders = ['输入序号', '村田料号', '结果分组', '是否已选', '匹配类型', '容值(pF)', '英制封装', '公制封装', '温度特性', '精度', '电压（类型/安规类别/状态）', '生命周期原文', 'AEC-Q200', '应用', '应用依据', '标准（安全规格）', '标准依据', '特征', '特征依据', '规格书（未核验）', '安全证书（未核验）', '候选提示', '标称高度(mm)', '最大高度(mm)', '与原描述的差异']

/** Preserve row links and truncation counts; normal export never includes review PNs. */
export function batchExportTables(entries: BatchExportEntry[], selectedOnly = false) {
  const summaries: string[][] = [summaryHeaders]
  const candidates: string[][] = [candidateHeaders]
  const flat: string[][] = [[...summaryHeaders, ...candidateHeaders.slice(1)]]
  entries.forEach(({ row, translation: t, applications, selectedPartNumbers }, index) => {
    const result = t.official
    const errors = [...t.errors, ...(result?.errors || [])]
    const status = errors.length ? '输入或查询错误' : !result ? '仅解析，未查询目录' : result.totalMatches ? '有正常生产候选' : result.totalAlternatives ? '无正常匹配；有替代候选，需人工确认' : result.totalHeightReferences ? '无正常匹配；有高度不符合的参考料' : result.totalReviewMatches ? '仅有待核查候选' : '当前目录范围无匹配'
    const scope = result ? result.scope === 'Full' ? 'Full 模式导入记录（完整性见数据汇总）' : '导入的样本范围' : '未查询'
    const summary = [String(index + 1), row.fileName, row.sheetName, String(row.rowNumber), t.mode === 'A' ? '描述→村田料号' : '料号→规格描述', t.input, t.description, status, applications.map(x => applicationLabels[x]).join('；'), scope, String(result?.totalMatches ?? 0), String(result?.matches.length ?? 0), String(result?.totalReviewMatches ?? 0), String(result?.reviewMatches.length ?? 0), (result?.missingFields || t.parsed?.missingFields || []).join('；'), errors.join('；'), [...t.warnings, ...(result?.warnings || [])].join('；')]
    summaries.push(summary)
    summary.push(String(result?.totalAlternatives ?? 0), String(result?.alternatives?.length ?? 0))
    summary.push(String(result?.totalHeightReferences ?? 0), String(result?.heightReferences?.length ?? 0))
    const normal = errors.length ? [] : result?.matches || []
    const review = errors.length ? [] : result?.reviewMatches || []
    const alternatives = errors.length ? [] : result?.alternatives || []
    const references = errors.length ? [] : result?.heightReferences || []
    const chosen = selectedOnly ? [...normal, ...review, ...alternatives, ...references].filter(m => selectedPartNumbers.has(m.product.partNo!)) : normal
    for (const match of chosen) {
      const p = match.product, s = p.spec, classification = productClassification(p)
      const group = match.kind === 'height-reference' ? '高度不符合，仅供参考（明确勾选）' : match.kind === 'alternative' ? '替代候选（明确勾选，需人工确认）' : normal.includes(match) ? '正常生产且字段一致' : '待核查（明确勾选）'
      const cells = [String(index + 1), p.partNo || '', group, selectedPartNumbers.has(p.partNo!) ? '是' : '否', match.kind === 'exact' ? '精确参数匹配' : '部分参数匹配', s.capacitancePf === null ? '' : String(s.capacitancePf), s.sizeInch || '', s.sizeMetric || '', s.temperature || '', s.tolerance.value === null ? '' : `±${s.tolerance.value}${s.tolerance.unit}`, s.voltages.map(v => `${v.safetyClass || ''} ${v.type} ${v.valueV === null ? '待核查' : v.valueV + 'V'} (${v.state})`.trim()).join('；'), p.lifecycle.rawStatus || '', p.compliance.aecQ200 === null ? '未知' : p.compliance.aecQ200 ? '是' : '否', classification.applicationText, classification.applicationBasis, classification.standards, classification.standardBasis, classification.features, classification.featureBasis, p.links.datasheets.join('\n'), classification.safetyCertificateUrls.join('\n'), match.warnings.join('；'), s.thicknessMm === null ? '' : String(s.thicknessMm), s.thicknessMaxMm === null ? '' : String(s.thicknessMaxMm)]
      if (match.kind === 'alternative') cells[4] = '替代候选（非精确匹配）'
      if (match.kind === 'height-reference') cells[4] = '高度不符合（不是替代候选）'
      cells.push((match.differences || []).map(d => `${d.label}：${d.requested} → ${d.actual}`).join('；'))
      candidates.push(cells); flat.push([...summary, ...cells.slice(1)])
    }
    if (!chosen.length && !selectedOnly) flat.push([...summary, ...candidateHeaders.slice(1).map(() => '')])
  })
  return { summaries, candidates, flat }
}

export function encodeBatchCsv(rows: string[][]): string {
  // Quoting alone does not stop Excel from treating imported CSV text as formulas.
  return '\uFEFF' + rows.map(row => row.map(value => {
    const safe = /^[\s\uFEFF]*[=+\-@]/.test(value) ? "'" + value : value
    return '"' + safe.replace(/"/g, '""') + '"'
  }).join(',')).join('\r\n')
}

export function encodeBatchExcel(tables: { summaries: string[][]; candidates: string[][] }): ArrayBuffer {
  const book = XLSX.utils.book_new()
  for (const [name, rows] of [['查询汇总', tables.summaries], ['候选明细', tables.candidates]] as const) {
    const sheet = XLSX.utils.aoa_to_sheet(rows)
    sheet['!cols'] = rows[0].map(() => ({ wch: 22 }))
    XLSX.utils.book_append_sheet(book, sheet, name)
  }
  return XLSX.write(book, { type: 'array', bookType: 'xlsx', compression: true }) as ArrayBuffer
}

export function batchTemplate(mode: OfficialTranslationMode): string[][] {
  return mode === 'A' ? [['物料描述', '备注'], ['008004 10pF 16V C0G ±2%', '每格一个完整描述'], ['0805 10uF 16V X5R ±10%', '']] : [['料号', '备注'], ['CL10B104KO8NNNC', '每格一个完整料号'], ['MSASP063EB5475MFNA01', '']]
}
