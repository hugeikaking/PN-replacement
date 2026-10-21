import type { NormalizedMurataProduct } from './types'

export interface OfficialCatalogSummary {
  schemaVersion: 1
  completed: true
  products: number
  consistentProducts: number
  reviewProducts: number
  mode: 'CheckedSamples' | 'Preview' | 'Full'
  fullDatabaseRead: boolean
  source: string
  sourceBytes: number
  sourceModifiedUtc: string
  inputFiles: string[]
  conflictingPartNumbers: string[]
  issueCounts: Record<string, number>
  generatedAt: string
  toolBuild?: string
}
export interface OfficialCatalog {
  summary: OfficialCatalogSummary
  records: NormalizedMurataProduct[]
  byCapacitance: Map<number, NormalizedMurataProduct[]>
  blockedPartNumbers: Set<string>
}

function fail(message: string): never { throw new Error(`不能使用该数据：${message}`) }
function object(v: unknown): v is Record<string, unknown> { return !!v && typeof v === 'object' && !Array.isArray(v) }
function integer(v: unknown): v is number { return typeof v === 'number' && Number.isSafeInteger(v) && v >= 0 }
function text(v: unknown) { return typeof v === 'string' || v === null }
function positive(v: unknown) { return v === null || (typeof v === 'number' && Number.isFinite(v) && v > 0) }
function stringArray(v: unknown): v is string[] { return Array.isArray(v) && v.every(x => typeof x === 'string') }
function url(v: string) { try { return ['http:', 'https:'].includes(new URL(v).protocol) } catch { return false } }

/** Validate runtime data before indexing. This checks consistency, not manufacturer authenticity. */
export function createOfficialCatalog(summaryInput: unknown, rows: unknown[]): OfficialCatalog {
  if (!object(summaryInput) || summaryInput.schemaVersion !== 1 || summaryInput.completed !== true) fail('整理未完成或数据版本不支持')
  const s = summaryInput
  if (!integer(s.products) || !integer(s.consistentProducts) || !integer(s.reviewProducts) || s.products !== s.consistentProducts + s.reviewProducts || s.products !== rows.length) fail('汇总与规格记录数量不一致，请选择同一次运行的文件')
  if (!['CheckedSamples', 'Preview', 'Full'].includes(String(s.mode)) || typeof s.fullDatabaseRead !== 'boolean' || (s.fullDatabaseRead && s.mode !== 'Full')) fail('读取范围标志不一致')
  if (typeof s.source !== 'string' || !integer(s.sourceBytes) || typeof s.sourceModifiedUtc !== 'string' || typeof s.generatedAt !== 'string' || !stringArray(s.inputFiles) || !stringArray(s.conflictingPartNumbers) || !object(s.issueCounts)) fail('来源或问题汇总信息缺失')
  const summary = s as unknown as OfficialCatalogSummary
  const paths = new Set(summary.inputFiles.map(x => x.toLowerCase()))
  const records: NormalizedMurataProduct[] = []
  const seen = new Set<string>()
  const blockedPartNumbers = new Set(summary.conflictingPartNumbers.map(x => x.toUpperCase()))
  const issueCounts: Record<string, number> = Object.create(null)
  let consistent = 0
  for (const [index, raw] of rows.entries()) {
    const bad = () => fail(`第 ${index + 1} 行结构或字段不符合第二步规格格式`)
    if (!object(raw) || raw.schemaVersion !== 1 || raw.manufacturer !== 'murata' || raw.componentType !== 'mlcc' || !text(raw.partNo) || !text(raw.series) || !object(raw.spec) || !object(raw.validation) || !object(raw.lifecycle) || !object(raw.compliance) || !object(raw.links) || !object(raw.provenance) || !object(raw.auditReference)) bad()
    // Control-flow narrowing uses an explicit assertion after the structure check above.
    const r = raw as unknown as NormalizedMurataProduct
    if (r.classification !== undefined && (!object(r.classification) || !Object.prototype.hasOwnProperty.call(r.classification, 'applicationRaw') || !Object.prototype.hasOwnProperty.call(r.classification, 'characteristicsRaw'))) bad()
    const spec = r.spec
    if (!['capacitancePf', 'lengthMm', 'widthMm', 'thicknessMm', 'thicknessMaxMm'].every(k => positive((spec as unknown as Record<string, unknown>)[k]))) bad()
    if (spec.thicknessMm !== null && spec.thicknessMaxMm !== null && spec.thicknessMm > spec.thicknessMaxMm) bad()
    if (![spec.sizeInch, spec.sizeMetric, spec.temperature, spec.temperatureStandard].every(text) || (spec.sizeInch !== null && !/^\d{4,6}$/.test(spec.sizeInch))) bad()
    if (!object(spec.tolerance) || !['percent', 'absolute', null].includes(spec.tolerance.kind) || !positive(spec.tolerance.value) || !['%', 'pF', null].includes(spec.tolerance.unit)) bad()
    if (spec.tolerance.kind === null ? spec.tolerance.value !== null || spec.tolerance.unit !== null : spec.tolerance.value === null || spec.tolerance.unit !== (spec.tolerance.kind === 'percent' ? '%' : 'pF')) bad()
    if (!Array.isArray(spec.voltages)) bad()
    const voltageKeys = new Set<string>()
    for (const v of spec.voltages) {
      if (!object(v) || !['DC', 'AC'].includes(v.type) || !['X1', 'X2', 'Y1', 'Y2', null].includes(v.safetyClass) || !['consistent', 'review'].includes(v.state) || !positive(v.valueV) || (v.state === 'consistent' ? v.valueV === null : v.valueV !== null)) bad()
      if (v.sourceField !== `Specs.${v.safetyClass || ''}RatedVoltage${v.type}` || voltageKeys.has(`${v.type}/${v.safetyClass}`)) bad()
      voltageKeys.add(`${v.type}/${v.safetyClass}`)
    }
    if (!['active', 'nrnd', 'unknown'].includes(r.lifecycle.category) || !text(r.lifecycle.rawStatus) || (r.lifecycle.rawStatus === 'NRND' && r.lifecycle.category !== 'nrnd' && r.lifecycle.category !== 'unknown')) bad()
    if (r.compliance.aecQ200 !== null && typeof r.compliance.aecQ200 !== 'boolean') bad()
    if (!stringArray(r.links.datasheets) || !r.links.datasheets.every(url) || (r.links.productDetail !== null && (typeof r.links.productDetail !== 'string' || !url(r.links.productDetail)))) bad()
    if (r.links.verified !== false || r.validation.companyAccepted !== false || r.validation.datasheetReviewed !== false) bad()
    if (!['consistent', 'review'].includes(r.validation.status) || !Array.isArray(r.validation.issues)) bad()
    for (const issue of r.validation.issues) {
      if (!object(issue) || !['warning', 'error'].includes(issue.severity) || typeof issue.code !== 'string' || typeof issue.field !== 'string') bad()
      issueCounts[issue.code] = (issueCounts[issue.code] || 0) + 1
      if (issue.code === 'conflicting-duplicate-part-number' && r.partNo) blockedPartNumbers.add(r.partNo.toUpperCase())
    }
    if (r.validation.status === 'consistent') {
      if (!r.partNo?.trim() || r.validation.issues.length || spec.capacitancePf === null || !spec.voltages.some(v => v.state === 'consistent') || (!spec.sizeInch && (spec.lengthMm === null || spec.widthMm === null)) || r.lifecycle.category !== 'active') bad()
      consistent++
    } else if (!r.validation.issues.length) bad()
    if (typeof r.provenance.sourcePath !== 'string' || !paths.has(r.provenance.sourcePath.toLowerCase()) || !integer(r.provenance.sourceIndex) || r.provenance.sourceIndex < 1 || r.auditReference.file !== 'normalization-audit.jsonl' || r.auditReference.line !== index + 1) bad()
    if (r.partNo) {
      const key = r.partNo.toUpperCase()
      if (!r.partNo.trim() || /[\r\n]/.test(r.partNo)) blockedPartNumbers.add(key)
      if (seen.has(key)) blockedPartNumbers.add(key)
      seen.add(key)
    }
    records.push(r)
  }
  if (consistent !== summary.consistentProducts) fail('字段一致数量与汇总不符')
  for (const key of new Set([...Object.keys(issueCounts), ...Object.keys(summary.issueCounts)])) {
    const count = summary.issueCounts[key] ?? 0
    if (!integer(count) || count !== (issueCounts[key] || 0)) fail(`问题 ${key} 的次数与汇总不符`)
  }
  const byCapacitance = new Map<number, NormalizedMurataProduct[]>()
  for (const r of records) {
    if (r.partNo && !blockedPartNumbers.has(r.partNo.toUpperCase()) && r.spec.capacitancePf !== null) {
      const bucket = byCapacitance.get(r.spec.capacitancePf) || []
      bucket.push(r); byCapacitance.set(r.spec.capacitancePf, bucket)
    }
  }
  return { summary, records, byCapacitance, blockedPartNumbers }
}

export const OFFICIAL_CATALOG_LIMITS = { maxBytes: 512 * 1024 * 1024, maxRecords: 250000 } as const

/** Stream normalized records with explicit browser memory bounds; never silently truncate. */
export async function readOfficialJsonLines(file: Blob, progress?: (count: number) => void): Promise<unknown[]> {
  if (file.size > OFFICIAL_CATALOG_LIMITS.maxBytes) fail('规格文件超过 512MB，请保留原文件并联系维护者；不会截取样本代替全量')
  const reader = file.stream().getReader()
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let buffer = ''; let lines = 0
  const rows: unknown[] = []
  const parse = (line: string) => {
    lines++
    if (!line.trim()) return
    if (line.length > 16 * 1024 * 1024) fail(`第 ${lines} 行过大`)
    try { rows.push(JSON.parse(line)) } catch { fail(`第 ${lines} 行不是有效 JSON`) }
    if (rows.length > OFFICIAL_CATALOG_LIMITS.maxRecords) fail('规格记录超过 250000 条，请保留原文件并联系维护者；不会截取记录')
  }
  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      let end: number
      while ((end = buffer.indexOf('\n')) >= 0) { parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1) }
      if (buffer.length > 16 * 1024 * 1024) fail('JSONL 单行超过上限，请勿导入原始数据库 JSON')
      progress?.(rows.length)
      if (done) break
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    if (buffer.trim()) parse(buffer)
  } finally { await reader.cancel(); reader.releaseLock() }
  return rows
}
