import type { OfficialQuery } from './query'
import type { NormalizedMurataProduct } from './types'
import { productClassification, hasAecQ200Characteristic } from './classification'

export const close = (a: number | null, b: number) => a !== null && Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-9)
export const metric = (s: string | null) => s?.toUpperCase().replace(/M$/, '')

/** Shared hard constraints; substitution only replaces fields named in its difference list. */
export function matchesQuery(p: NormalizedMurataProduct, q: OfficialQuery) {
  const s = p.spec
  if (q.capacitancePf !== undefined && !close(s.capacitancePf, q.capacitancePf)) return false
  if (q.voltage && !s.voltages.some(v => v.state === 'consistent' && v.type === q.voltage!.type && v.safetyClass === q.voltage!.safetyClass && (q.voltage!.valueV === undefined || close(v.valueV, q.voltage!.valueV)))) return false
  if (q.size && (q.size.system === 'inch' ? s.sizeInch !== q.size.code : metric(s.sizeMetric) !== metric(q.size.code))) return false
  if (q.dimensions && (!close(s.lengthMm, q.dimensions.lengthMm) || !close(s.widthMm, q.dimensions.widthMm))) return false
  if (q.maxHeightMm !== undefined && (s.thicknessMaxMm === null || !(s.thicknessMaxMm <= q.maxHeightMm || close(s.thicknessMaxMm, q.maxHeightMm)))) return false
  if (q.temperature && s.temperature !== q.temperature) return false
  if (q.tolerance && (s.tolerance.kind !== q.tolerance.kind || s.tolerance.unit !== q.tolerance.unit || !close(s.tolerance.value, q.tolerance.value!))) return false
  if (q.aecQ200Characteristic && !hasAecQ200Characteristic(p)) return false
  if (q.aecQ200 !== undefined && p.compliance.aecQ200 !== q.aecQ200) return false
  if (q.series && p.series !== q.series) return false
  if (q.applications?.length && !productClassification(p).applications.some(x => q.applications!.includes(x))) return false
  return true
}
