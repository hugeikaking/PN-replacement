import type { OfficialCatalog } from './catalog'
import type { OfficialQuery } from './query'
import type { OfficialMatch } from './matcher'
import type { NormalizedMurataProduct } from './types'
import sizeRules from '../../rules/shared/size-codes.json'
import rules from '../../rules/shared/substitution.json'
import { close, metric, matchesQuery } from './conditions'

type Temperature = typeof rules.temperature.X5R
const temperatures: Record<string, Temperature> = rules.temperature
const sizes: Record<string, { metric: string; length_mm: number; width_mm: number }> = {
  '008004': { metric: '0201', length_mm: .25, width_mm: .125 },
  '01005': { metric: '0402', length_mm: .4, width_mm: .2 },
  ...sizeRules.imperial,
}
const sizeCode = (code: string, system: 'inch' | 'metric') => system === 'inch' ? sizes[code] && code : Object.keys(sizes).find(k => sizes[k].metric === metric(code))
const productSize = (p: NormalizedMurataProduct) => p.spec.sizeInch && sizes[p.spec.sizeInch] ? p.spec.sizeInch : p.spec.sizeMetric ? sizeCode(p.spec.sizeMetric, 'metric') : undefined
const unique = (values: number[]) => values.sort((a, b) => a - b).filter((n, i, sorted) => !i || !close(n, sorted[i - 1]))
const next = (values: number[], n: number) => values.find(v => v > n && !close(v, n))
const voltageKey = (v: Pick<NonNullable<OfficialQuery['voltage']>, 'type' | 'safetyClass'>) => `${v.type}/${v.safetyClass || ''}`
const cap = (pf: number) => `${Number((pf / 1e6).toPrecision(12))}uF`
const tempText = (code: string) => {
  const t = temperatures[code]
  return t ? `${code}（${t.minC}～${t.maxC}℃，+${t.plusPercent}%/-${t.minusPercent}%）` : code
}

// Build once per imported catalog. Tiers include unblocked review records too: a
// missing usable intermediate tier must never silently become a two-tier jump.
interface Tiers { caps: number[]; volts: Map<string, number[]>; sizes: string[]; temperatures: string[] }
const cachedTiers = new WeakMap<OfficialCatalog, Tiers>()
function catalogTiers(catalog: OfficialCatalog): Tiers {
  const cached = cachedTiers.get(catalog)
  if (cached) return cached
  const caps: number[] = [], volts = new Map<string, number[]>(), presentSizes = new Set<string>(), presentTemps = new Set<string>()
  for (const p of catalog.records) {
    if (!p.partNo || catalog.blockedPartNumbers.has(p.partNo.toUpperCase())) continue
    if (p.spec.capacitancePf !== null) caps.push(p.spec.capacitancePf)
    for (const v of p.spec.voltages) if (v.state === 'consistent' && v.valueV !== null) {
      const key = voltageKey(v), values = volts.get(key) || []
      values.push(v.valueV); volts.set(key, values)
    }
    const code = productSize(p)
    if (code) presentSizes.add(code)
    if (p.spec.temperature && p.spec.temperatureStandard === 'EIA' && temperatures[p.spec.temperature]) presentTemps.add(p.spec.temperature)
  }
  const tiers = { caps: unique(caps), volts: new Map([...volts].map(([k, v]) => [k, unique(v)])), sizes: [...presentSizes], temperatures: [...presentTemps] }
  cachedTiers.set(catalog, tiers)
  return tiers
}

/** Fallback only; all returned PNs exist in the import and are active/consistent.
 * Changed nominal capacitance, voltage, temperature and package are never exact.
 * H stays hard for substitutes; known excess height goes to a separate reference
 * group. Tolerance, dimensions, applications, AEC and series never relax.
 */
export function findSubstitutes(catalog: OfficialCatalog, q: OfficialQuery): { matches: OfficialMatch[]; heightReferences: OfficialMatch[]; note?: string } {
  const matches: OfficialMatch[] = [], heightReferences: OfficialMatch[] = []
  if (q.capacitancePf === undefined || q.capacitancePf < rules.minimumCapacitancePf) return { matches, heightReferences }
  if (!q.size || !q.voltage || q.voltage.valueV === undefined || !q.temperature) return { matches, heightReferences, note: '替代查询需要明确容值（≥1uF）、封装代码、电压及温度特性；缺少条件时不放宽参数。' }
  const requestedSize = sizeCode(q.size.code, q.size.system)
  const tiers = catalogTiers(catalog)
  const capUp = next(tiers.caps, q.capacitancePf), voltUp = next(tiers.volts.get(voltageKey(q.voltage)) || [], q.voltage.valueV)
  const requestedPackage = requestedSize ? sizes[requestedSize] : undefined
  const smallerSize = requestedPackage ? tiers.sizes.filter(code => {
    const s = sizes[code]
    return s.length_mm <= requestedPackage.length_mm && s.width_mm <= requestedPackage.width_mm && s.length_mm * s.width_mm < requestedPackage.length_mm * requestedPackage.width_mm
  }).sort((a, b) => sizes[b].length_mm * sizes[b].width_mm - sizes[a].length_mm * sizes[a].width_mm)[0] : undefined
  const largerSize = requestedPackage ? tiers.sizes.filter(code => {
    const s = sizes[code]
    return s.length_mm >= requestedPackage.length_mm && s.width_mm >= requestedPackage.width_mm && s.length_mm * s.width_mm > requestedPackage.length_mm * requestedPackage.width_mm
  }).sort((a, b) => sizes[a].length_mm * sizes[a].width_mm - sizes[b].length_mm * sizes[b].width_mm)[0] : undefined
  const t = temperatures[q.temperature]
  const higher = t ? tiers.temperatures.filter(code => {
    const candidate = temperatures[code]
    return candidate.minC <= t.minC && candidate.maxC > t.maxC && candidate.minusPercent <= t.minusPercent && candidate.plusPercent <= t.plusPercent
  }) : []
  const nextUpper = higher.length ? Math.min(...higher.map(code => temperatures[code].maxC)) : undefined
  const tempUp = higher.filter(code => temperatures[code].maxC === nextUpper)
  // At most two cap buckets are inspected, regardless of catalog size.
  const source = [...catalog.byCapacitance.entries()].filter(([value]) => close(value, q.capacitancePf!) || capUp !== undefined && close(value, capUp)).flatMap(([, rows]) => rows)
  for (const p of source) {
    if (!p.partNo || catalog.blockedPartNumbers.has(p.partNo.toUpperCase()) || p.lifecycle.category !== 'active' || p.validation.status !== 'consistent') continue
    const s = p.spec, differences: NonNullable<OfficialMatch['differences']> = []
    const relaxed: OfficialQuery = { ...q }
    if (!close(s.capacitancePf, q.capacitancePf)) {
      if (capUp === undefined || !close(s.capacitancePf, capUp)) continue
      relaxed.capacitancePf = capUp
      differences.push({ field: 'capacitancePf', label: '容值升一档', requested: cap(q.capacitancePf), actual: cap(capUp) })
    }
    if (!matchesQuery(p, { voltage: q.voltage })) {
      if (voltUp === undefined || !matchesQuery(p, { voltage: { ...q.voltage, valueV: voltUp } })) continue
      relaxed.voltage = { ...q.voltage, valueV: voltUp }
      differences.push({ field: 'voltage', label: '额定电压升一档', requested: `${q.voltage.valueV}V${q.voltage.type}`, actual: `${voltUp}V${q.voltage.type}` })
    }
    if (s.temperature !== q.temperature) {
      if (!s.temperature || s.temperatureStandard !== 'EIA' || !tempUp.includes(s.temperature)) continue
      relaxed.temperature = s.temperature
      differences.push({ field: 'temperature', label: '温度上限升一档', requested: tempText(q.temperature), actual: tempText(s.temperature) })
    }
    if (!matchesQuery(p, { size: q.size })) {
      const actualSize = productSize(p)
      if (!actualSize || (actualSize !== smallerSize && actualSize !== largerSize)) continue
      const code = q.size.system === 'inch' ? actualSize : sizes[actualSize].metric
      relaxed.size = { system: q.size.system, code }
      differences.push({ field: 'size', label: actualSize === smallerSize ? '封装小一档（需核对焊盘）' : '封装大一档（需核对焊盘及空间）', requested: `${q.size.system === 'inch' ? '英制' : '公制'} ${q.size.code}`, actual: `${q.size.system === 'inch' ? '英制' : '公制'} ${code}` })
    }
    const excessHeight = q.maxHeightMm !== undefined && s.thicknessMaxMm !== null && s.thicknessMaxMm > q.maxHeightMm && !close(s.thicknessMaxMm, q.maxHeightMm)
    if (excessHeight) {
      // This is not a substitute: preserve the failed requirement prominently.
      relaxed.maxHeightMm = undefined
      differences.push({ field: 'maxHeightMm', label: '不满足最大高度', requested: `≤${q.maxHeightMm}mm`, actual: `${Number(s.thicknessMaxMm!.toPrecision(12))}mm` })
    }
    if (!differences.length || !matchesQuery(p, relaxed) || q.aecQ200Characteristic && p.compliance.aecQ200 === false) continue
    const warnings = [excessHeight ? '高度不符合，仅供参考：未满足客户最大高度，不是正常匹配或替代候选；需客户重新确认空间要求。' : '替代候选：与原描述不完全一致，需人工确认；容值增大、耐压提高或封装变化不代表实际电路可直接替换。', ...differences.map(d => `${d.label}：${d.requested} → ${d.actual}`)]
    if (q.unverifiedRequirements?.length) warnings.push(`待确认要求：${q.unverifiedRequirements.join('、')}，未按已满足处理`)
    if (p.compliance.aecQ200 === null) warnings.push('AEC-Q200 未确认')
    ;(excessHeight ? heightReferences : matches).push({ product: p, kind: excessHeight ? 'height-reference' : 'alternative', differences, warnings, applicationState: 'matched' })
  }
  const sizeRank = (m: OfficialMatch) => !m.differences!.some(d => d.field === 'size') ? 0 : productSize(m.product) === smallerSize ? 1 : 2
  const sort = (a: OfficialMatch, b: OfficialMatch) => sizeRank(a) - sizeRank(b) || a.differences!.length - b.differences!.length || a.product.partNo!.localeCompare(b.product.partNo!, 'en')
  matches.sort(sort); heightReferences.sort(sort)
  return { matches, heightReferences, note: '原容值须≥1uF且原条件下无正常匹配。容值、电压取目录紧邻高档，温度取温漂不变差的紧邻更高上限；尺寸顺序为原尺寸、小一档、大一档，可同时变化多个参数。精度、应用、AEC及系列不放宽；替代候选仍须符合H限高，已知超高料另列“高度不符合，仅供参考”。这两组均不混入正常匹配批量操作。' }
}
