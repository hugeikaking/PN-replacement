import type { BatchExportEntry } from './batch-files'
import type { NormalizedMurataProduct } from '../engine/official/types'
import { hasAecQ200Characteristic, productClassification } from '../engine/official/classification'
import { datasheetMatches } from './datasheet-download'

export const QUOTATION_COLUMNS = 44
export const QUOTATION_SET_QTY = 100000
export const QUOTATION_Y40 = ['WLMD5G', 'IVI-OT', 'ADAS-OT'] as const
export type QuotationY40 = typeof QUOTATION_Y40[number]
export interface QuotationItem {
  partNo: string
  y40: QuotationY40 | ''
  usage: number
  descriptions: string[]
  warnings: string[]
}

/** Company-specific routing supplied by the user, not a certification or Grade claim. */
export function quotationY40(product: NormalizedMurataProduct): QuotationY40 | '' {
  if (product.series?.trim().toUpperCase() === 'GCM') return 'ADAS-OT'
  const characteristic = hasAecQ200Characteristic(product)
  if (characteristic && product.compliance.aecQ200 === false) return ''
  if (characteristic || product.compliance.aecQ200 === true) return 'IVI-OT'
  if (product.compliance.aecQ200 === false && productClassification(product).applications.includes('general')) return 'WLMD5G'
  return ''
}

export function randomQuotationUsage(random: () => number = Math.random): number {
  const value = random()
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error('用量随机值无效')
  return Math.floor(value * 100) + 1
}

/** One row per selected PN; retain warnings from every selected query context. */
export function selectedQuotationItems(entries: BatchExportEntry[], usageCache = new Map<string, number>(), random?: () => number): QuotationItem[] {
  const items = new Map<string, QuotationItem>()
  for (const match of datasheetMatches(entries, 'selected')) {
    const product = match.product, partNo = product.partNo
    if (!partNo) continue
    if (!items.has(partNo)) {
      if (items.size >= 1000) throw new Error('每批最多复制 1000 个料号，请分批勾选')
      const usage = usageCache.get(partNo) ?? randomQuotationUsage(random)
      usageCache.set(partNo, usage)
      items.set(partNo, { partNo, y40: quotationY40(product), usage, descriptions: [], warnings: [] })
    }
    const item = items.get(partNo)!
    if (item.y40 !== quotationY40(product)) item.y40 = ''
    const spec = product.spec
    const cap = spec.capacitancePf === null ? '' : spec.capacitancePf >= 1e6 ? `${spec.capacitancePf / 1e6}uF` : spec.capacitancePf >= 1000 ? `${spec.capacitancePf / 1000}nF` : `${spec.capacitancePf}pF`
    const voltage = spec.voltages.filter(v => v.state === 'consistent' && v.valueV !== null).map(v => `${v.type} ${v.valueV}V`).join(' / ')
    const description = [spec.sizeInch, spec.temperature, cap, spec.tolerance.value === null ? '' : `±${spec.tolerance.value}${spec.tolerance.unit}`, voltage].filter(Boolean).join(' ')
    if (description && !item.descriptions.includes(description)) item.descriptions.push(description)
    const warnings = [...match.warnings]
    if (match.kind === 'alternative') warnings.push('替代候选，非精确匹配')
    if (match.kind === 'height-reference') warnings.push('高度不符合，仅供参考')
    if (match.kind === 'partial') warnings.push('部分匹配，存在待确认条件')
    if (product.lifecycle.category !== 'active' || product.validation.status !== 'consistent') warnings.push('产品状态或字段待核查')
    for (const difference of match.differences || []) warnings.push(`${difference.label}：${difference.requested} → ${difference.actual}`)
    if (!item.y40) warnings.push('Y40 分类缺失或冲突，请按实际用途选择')
    for (const warning of warnings) if (!item.warnings.includes(warning)) item.warnings.push(warning)
  }
  return [...items.values()]
}

export interface QuotationClipboard { text: string; html: string; rows: string[][] }
const htmlEscape = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Fixed A:AR rectangle, no headers or formulas; paste into A5 or a later empty row. */
export function buildQuotationClipboard(items: readonly QuotationItem[]): QuotationClipboard {
  if (!items.length) throw new Error('请先勾选要申请报价的村田料号')
  if (items.length > 1000) throw new Error('每批最多复制 1000 个料号')
  const seen = new Set<string>()
  const rows = items.map(item => {
    if (!item.partNo || item.partNo !== item.partNo.trim() || item.partNo.length > 200 || /[\u0000-\u0020\u007f"<>]/.test(item.partNo) || /^[=+\-@]/.test(item.partNo)) throw new Error('料号格式异常，不能生成报价行')
    if (seen.has(item.partNo)) throw new Error('报价清单存在重复料号')
    seen.add(item.partNo)
    if (!QUOTATION_Y40.includes(item.y40 as QuotationY40)) throw new Error(`${item.partNo}：请先选择 Y40 分类`)
    if (!Number.isInteger(item.usage) || item.usage < 1 || item.usage > 100) throw new Error(`${item.partNo}：Usage 必须是 1–100 的整数`)
    const row = Array<string>(QUOTATION_COLUMNS).fill('')
    row[2] = 'Y'
    row[6] = item.partNo
    row[8] = item.y40
    row[9] = 'IoT module'
    row[10] = String(QUOTATION_SET_QTY)
    row[11] = String(item.usage)
    row[12] = String(QUOTATION_SET_QTY * item.usage)
    row[14] = 'pcs/month'
    return row
  })
  const text = rows.map(row => row.join('\t')).join('\r\n')
  // Explicit text formatting helps Excel retain part-number text and empty columns.
  const html = '<html><head><meta charset="utf-8"></head><body><table><tbody>' + rows.map(row => '<tr>' + row.map(value => '<td style=\'mso-number-format:"\\@"\'>' + htmlEscape(value) + '</td>').join('') + '</tr>').join('') + '</tbody></table></body></html>'
  return { text, html, rows }
}

/** Rich HTML + TSV; fallback also writes both formats without opening another page. */
export async function writeQuotationClipboard(payload: QuotationClipboard): Promise<boolean> {
  try {
    if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
      await navigator.clipboard.write([new ClipboardItem({ 'text/plain': new Blob([payload.text], { type: 'text/plain' }), 'text/html': new Blob([payload.html], { type: 'text/html' }) })])
      return true
    }
  } catch { /* Local company pages may need the synchronous copy-event fallback. */ }
  let handled = false
  const handler = (event: ClipboardEvent) => {
    if (!event.clipboardData) return
    event.clipboardData.setData('text/plain', payload.text)
    event.clipboardData.setData('text/html', payload.html)
    event.preventDefault(); handled = true
  }
  document.addEventListener('copy', handler)
  try { return document.execCommand('copy') && handled }
  catch { return false }
  finally { document.removeEventListener('copy', handler) }
}
