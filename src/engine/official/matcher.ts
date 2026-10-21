import type { OfficialCatalog } from './catalog'
import type { OfficialQuery, OfficialQueryParse } from './query'
import { officialMissingFields } from './query'
import type { NormalizedMurataProduct } from './types'
import { productClassification, applicationLabels } from './classification'
import { matchesQuery, close } from './conditions'
import { findSubstitutes } from './substitutes'

export interface OfficialMatch {
  product: NormalizedMurataProduct
  kind: 'exact' | 'partial' | 'alternative' | 'height-reference'
  differences?: { field: 'capacitancePf' | 'voltage' | 'temperature' | 'size' | 'maxHeightMm'; label: string; requested: string; actual: string }[]
  warnings: string[]
  applicationState?: 'matched' | 'unknown'
}
export interface OfficialMatchResult {
  missingFields: string[]
  warnings: string[]
  errors: string[]
  matches: OfficialMatch[]
  reviewMatches: OfficialMatch[]
  totalMatches: number
  totalReviewMatches: number
  alternatives: OfficialMatch[]
  totalAlternatives: number
  heightReferences: OfficialMatch[]
  totalHeightReferences: number
  alternativeNote?: string
  blockedRecords: number
  scope: OfficialCatalog['summary']['mode']
  diagnostics?: OfficialMatchDiagnostics
}
export interface OfficialMatchDiagnostics {
  catalogRecords: number
  eligibleRecords: number
  conditions: { field: keyof OfficialQuery; label: string; expected: string; matchingRecords: number; remainingRecords: number; otherConditionsRecords: number }[]
}
const tempRank = (s: string | null) => ({ X5R: 0, X6S: 1, X7R: 2 }[s || ''] ?? 3)

/** Explain only the loaded records; counts never become relaxed candidates. */
function diagnoseEmptyMatch(catalog: OfficialCatalog, q: OfficialQuery): OfficialMatchDiagnostics {
  const display = (n: number | undefined, unit: string) => n === undefined ? '' : `${Number(n.toPrecision(12))}${unit}`
  const cap = (n: number) => n >= 1e6 ? display(n / 1e6, 'uF') : n >= 1000 ? display(n / 1000, 'nF') : display(n, 'pF')
  const labels: Record<keyof OfficialQuery, string> = { capacitancePf: '容值', size: '封装', dimensions: '实际尺寸', maxHeightMm: '最大允许高度', temperature: '温度特性', tolerance: '精度', voltage: '电压', aecQ200: '车规要求', aecQ200Characteristic: '产品特点 AEC-Q200', series: '系列', applications: '应用范围', unverifiedRequirements: '待确认要求' }
  const expected: Partial<Record<keyof OfficialQuery, string>> = {
    capacitancePf: q.capacitancePf === undefined ? undefined : cap(q.capacitancePf),
    size: q.size && `${q.size.system === 'inch' ? '英制' : '公制'} ${q.size.code}`,
    dimensions: q.dimensions && `${display(q.dimensions.lengthMm, 'mm')} × ${display(q.dimensions.widthMm, 'mm')}`,
    maxHeightMm: q.maxHeightMm === undefined ? undefined : `≤${display(q.maxHeightMm, 'mm')}`,
    temperature: q.temperature,
    tolerance: q.tolerance && `±${q.tolerance.value}${q.tolerance.unit}`,
    voltage: q.voltage && `${q.voltage.safetyClass ? q.voltage.safetyClass + ' ' : ''}${q.voltage.type} ${q.voltage.valueV === undefined ? '任意额定值' : display(q.voltage.valueV, 'V')}`,
    aecQ200: q.aecQ200 === undefined ? undefined : q.aecQ200 ? '是' : '否',
    aecQ200Characteristic: q.aecQ200Characteristic ? '已明确标记' : undefined,
    series: q.series,
    applications: q.applications?.map(x => applicationLabels[x]).join(' 或 '),
  }
  const fields: (keyof OfficialQuery)[] = ['capacitancePf', 'size', 'dimensions', 'maxHeightMm', 'temperature', 'tolerance', 'voltage', 'aecQ200', 'aecQ200Characteristic', 'series', 'applications']
  const conditions = fields.filter(field => q[field] !== undefined).map(field => ({
    field, label: labels[field], expected: expected[field]!, matchingRecords: 0, remainingRecords: 0, otherConditionsRecords: 0,
  }))
  const diagnostic: OfficialMatchDiagnostics = { catalogRecords: catalog.records.length, eligibleRecords: 0, conditions }
  for (const p of catalog.records) {
    if (!p.partNo || catalog.blockedPartNumbers.has(p.partNo.toUpperCase())) continue
    diagnostic.eligibleRecords++
    const passes = conditions.map(c => matchesQuery(p, { [c.field]: q[c.field] }))
    let cumulative = true
    const failures: number[] = []
    passes.forEach((pass, i) => {
      if (pass) conditions[i].matchingRecords++; else failures.push(i)
      cumulative = cumulative && pass
      if (cumulative) conditions[i].remainingRecords++
    })
    if (failures.length === 1) conditions[failures[0]].otherConditionsRecords++
  }
  return diagnostic
}

/** Keep original matches strict; optional substitutes have their own group and differences. */
export function matchOfficialProducts(catalog: OfficialCatalog, parsed: OfficialQueryParse, limit = 20, allowSubstitutes = true): OfficialMatchResult {
  const result: OfficialMatchResult = {
    missingFields: officialMissingFields(parsed.query), warnings: [...parsed.warnings], errors: [...parsed.errors],
    matches: [], reviewMatches: [], totalMatches: 0, totalReviewMatches: 0, alternatives: [], totalAlternatives: 0, heightReferences: [], totalHeightReferences: 0,
    blockedRecords: catalog.records.filter(p => !p.partNo || catalog.blockedPartNumbers.has(p.partNo.toUpperCase())).length,
    scope: catalog.summary.mode,
  }
  if (catalog.summary.mode !== 'Full' || !catalog.summary.fullDatabaseRead) result.warnings.push('当前仅查询已导入的样本范围；没有找到不代表官方数据库没有此产品')
  else result.warnings.push('当前查询已读完本次来源文件的记录；来源文件的日期及官网覆盖范围仍需核对，没有结果不能证明官网不存在')
  result.warnings.push('参数匹配不等于公司选型验收；规格书、供货及适用性仍需确认')
  if (parsed.errors.length) return result
  const query = parsed.query
  if (!Object.keys(query).length) { result.errors.push('至少填写一个查询条件'); return result }
  // The capacitance index is exact; fall back to scanning for rounded numeric equivalents.
  const source = query.capacitancePf === undefined ? catalog.records :
    [...catalog.byCapacitance.entries()].filter(([value]) => close(value, query.capacitancePf!)).flatMap(([, rows]) => rows)
  for (const p of source) {
    if (!p.partNo || catalog.blockedPartNumbers.has(p.partNo.toUpperCase()) || !matchesQuery(p, { ...query, applications: undefined })) continue
    const classification = query.applications?.length ? productClassification(p) : undefined
    const applicationMatch = !classification || classification.applications.some(x => query.applications!.includes(x))
    if (!applicationMatch && !classification?.applicationUnknown) continue
    const warnings: string[] = []
    const qualificationConflict = Boolean(query.aecQ200Characteristic && p.compliance.aecQ200 === false)
    if (qualificationConflict) warnings.push('产品特点含 AEC-Q200，但合规字段为否；须核查来源记录，不作为正常推荐')
    if (query.unverifiedRequirements?.length) warnings.push(`待确认要求：${query.unverifiedRequirements.join('、')}；此料号仅匹配已识别参数，尚未核对全部要求`)
    if (!applicationMatch) warnings.push('应用范围待确认，未作为符合所选应用的正常结果')
    if (p.lifecycle.category === 'nrnd') warnings.push('NRND：不推荐用于新设计，需选型确认')
    if (p.lifecycle.category === 'unknown') warnings.push(`生命周期待确认：${p.lifecycle.rawStatus || '缺失'}`)
    if (p.validation.status === 'review') warnings.push(...p.validation.issues.filter(x => x.code !== 'lifecycle-nrnd').map(x => `${x.field}：${x.code}`))
    if (p.compliance.aecQ200 === null) warnings.push('AEC-Q200 未确认')
    const match: OfficialMatch = { product: p, kind: result.missingFields.length || !applicationMatch || qualificationConflict ? 'partial' : 'exact', warnings, applicationState: applicationMatch ? 'matched' : 'unknown' }
    if (p.lifecycle.category === 'active' && p.validation.status === 'consistent' && applicationMatch && !qualificationConflict) result.matches.push(match)
    else result.reviewMatches.push(match)
  }
  const sort = (a: OfficialMatch, b: OfficialMatch) => tempRank(a.product.spec.temperature) - tempRank(b.product.spec.temperature) || a.product.partNo!.localeCompare(b.product.partNo!, 'en')
  result.matches.sort(sort)
  result.reviewMatches.sort((a, b) => Number(a.product.lifecycle.category !== 'nrnd') - Number(b.product.lifecycle.category !== 'nrnd') || sort(a, b))
  result.totalMatches = result.matches.length; result.totalReviewMatches = result.reviewMatches.length
  if (allowSubstitutes && !result.totalMatches) {
    const substitutes = findSubstitutes(catalog, query)
    result.alternatives = substitutes.matches; result.totalAlternatives = substitutes.matches.length; result.alternativeNote = substitutes.note
    result.heightReferences = substitutes.heightReferences; result.totalHeightReferences = substitutes.heightReferences.length
  }
  if (!result.totalMatches && !result.totalReviewMatches) result.diagnostics = diagnoseEmptyMatch(catalog, query)
  const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(500, Math.floor(limit))) : 20
  result.matches = result.matches.slice(0, safeLimit); result.reviewMatches = result.reviewMatches.slice(0, safeLimit)
  result.alternatives = result.alternatives.slice(0, safeLimit)
  result.heightReferences = result.heightReferences.slice(0, safeLimit)
  return result
}
