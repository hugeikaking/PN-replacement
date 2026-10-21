import lineup from '../../rules/murata/lineup-reference.json'
import type { NormalizedMurataProduct } from './types'

export type ApplicationCategory = 'general' | 'infotainment' | 'powertrain'
export const applicationLabels: Record<ApplicationCategory, string> = {
  infotainment: '汽车[信息娱乐 / 舒适设备]',
  general: '民用设备 / 工业设备',
  powertrain: '汽车[动力总成 / 安全设备]',
}
const key = (s: string) => s.toLowerCase().replace(/\s/g, '')
const aliases: Record<string, ApplicationCategory> = Object.create(null)
for (const [category, values] of Object.entries({
  general: ['Consumer equipment', 'Industrial equipment', 'General Purpose', 'Consumer Electronics & Industrial Equipment', '民用设备', '工业设备', '民用设备/工业设备', '民用×民用设备', '工业×工业设备'],
  infotainment: ['Automotive infotainment/comfort equipment', '汽车[信息娱乐/舒适设备]', '汽车I×汽车信息娱乐/舒适设备'],
  powertrain: ['Automotive powertrain/safety equipment', '汽车[动力总成/安全设备]', '汽车P×汽车动力总成/安全设备'],
})) for (const value of values) aliases[key(value)] = category as ApplicationCategory
// Calibrated from the user's company field-report photos (first 20,000 records).
// Medical-only records are known outside the three requested application filters.
const otherApplications = new Set([
  '医疗eI×植入式以外的医疗器械设备[GHTF A/B/C]',
  '医疗I×植入式医疗器械设备或医疗器械设备[GHTF D]',
].map(key))

function textLabels(raw: unknown): string[] | undefined {
  if (typeof raw === 'string') return raw.split(/[;；\n|]/).map(s => s.trim()).filter(Boolean)
  if (Array.isArray(raw) && raw.every(x => typeof x === 'string')) return raw.flatMap(x => textLabels(x) || [])
  return undefined
}
/** Only an explicit product-characteristics tag qualifies; never infer from a series. */
export function hasAecQ200Characteristic(product: NormalizedMurataProduct): boolean {
  return (textLabels(product.classification?.characteristicsRaw) || []).some(label =>
    label.toUpperCase().replace(/[\s‐‑–—-]/g, '') === 'AECQ200')
}
function rawDisplay(raw: unknown) {
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw)
  return text ? text.slice(0, 500) : ''
}
function certificateUrls(raw: unknown): string[] {
  const values = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : []
  return [...new Set(values.filter((value): value is string => {
    if (typeof value !== 'string' || !value.trim()) return false
    try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' }
    catch { return false }
  }))]
}
interface Reference { applications: string[]; standards: string[]; features: string[] }
export function productClassification(product: NormalizedMurataProduct) {
  // Only a complete Series field is used; never infer a family from a PN prefix.
  const reference = Object.prototype.hasOwnProperty.call(lineup.series, product.series || '') ? (lineup.series as Record<string, Reference>)[product.series!] : undefined
  const raw = product.classification?.applicationRaw
  const labels = textLabels(raw)?.flatMap(s => s.split(/[,，]/).map(x => x.trim()).filter(Boolean))
  const hasRaw = raw !== undefined && raw !== null && !(labels && labels.length === 0)
  const applications: ApplicationCategory[] = hasRaw ? [...new Set((labels || []).map(x => aliases[key(x)]).filter(Boolean))] :
    (reference?.applications || []) as ApplicationCategory[]
  const applicationUnknown = hasRaw ? !labels || labels.some(x => !aliases[key(x)] && !otherApplications.has(key(x))) : !reference
  const applicationBasis = hasRaw ? '原记录 Application' : reference ? '村田官方系列资料' : '未记录 / 未校准'
  const featuresRaw = product.classification?.characteristicsRaw
  const featuresLabels = textLabels(featuresRaw)
  // Preserve explicit raw wording, including "not High Q" or coded objects.
  // We do not turn boolean/coded properties or ProductName into High Q flags.
  const features = featuresRaw !== undefined && featuresRaw !== null ?
    (featuresLabels ? featuresLabels.join('；') || '未记录' : `原值待解释：${rawDisplay(featuresRaw)}`) : reference?.features.join('；') || '未记录 / 待确认'
  const featureBasis = featuresRaw !== undefined && featuresRaw !== null ? '原记录 Specs.Characteristics' : reference?.features.length ? '村田官方系列资料' : ''
  const standards: string[] = []
  const standardRaw = product.classification?.standardRaw
  const hasStandard = standardRaw !== undefined && standardRaw !== null
  const standardLabels = textLabels(standardRaw)
  let standardBasis = ''
  if (hasStandard) {
    standards.push(standardLabels?.join('；') || (standardLabels ? '未记录' : `原值待解释：${rawDisplay(standardRaw)}`))
    standardBasis = '原记录 Standard；证书未核验'
  } else {
    const safetyTags = featuresLabels?.filter(x => ['安全规格认证品', '符合日本国内电气用品安全法'].includes(x)) || []
    if (safetyTags.length) { standards.push(...safetyTags); standardBasis = '原记录 Specs.Characteristics；证书未核验' }
    else if (reference?.standards.length) {
      standards.push(...reference.standards.map(s => `${s}（系列资料）`))
      standardBasis = '村田官方系列资料；此型号证书未核验'
    }
  }
  // AEC-Q200 stays in the separate qualification display; EIA/JIS/MURATA
  // temperature-characteristic standards are not safety certifications.
  const classes = [...new Set(product.spec.voltages.filter(v => v.safetyClass !== null && v.state === 'consistent').map(v => v.safetyClass))]
  if (classes.length) standards.push(`安规额定类别：${classes.join(' / ')}（认证待核对）`)
  return {
    applications, applicationUnknown, applicationBasis,
    applicationText: applications.map(x => applicationLabels[x]).join('；') + (applicationUnknown ? `${applications.length ? '；' : ''}应用待确认${hasRaw ? `（原值：${rawDisplay(raw)}）` : ''}` : !applications.length ? '不属于当前三个应用分类' : ''),
    standards: standards.join('；') || '未记录 / 待确认', standardBasis, features, featureBasis,
    safetyCertificateUrls: certificateUrls(product.classification?.safetyCertificatesRaw),
    referenceUrl: reference && (!hasRaw || featureBasis === '村田官方系列资料' || standardBasis.startsWith('村田官方系列资料')) ? lineup.source : undefined,
  }
}
