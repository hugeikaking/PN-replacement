import type { BatchExportEntry } from './batch-files'
import type { OfficialMatch } from '../engine/official/matcher'

export type DatasheetScope = 'displayed-normal' | 'selected'
/** Keep all selected query contexts, including different substitutions for one PN. */
export function datasheetMatches(rows: BatchExportEntry[], scope: DatasheetScope): OfficialMatch[] {
  return rows.flatMap(row => {
    const result = row.translation.official
    if (!result || row.translation.errors.length || result.errors.length) return []
    return scope === 'selected' ? [...result.matches, ...result.reviewMatches, ...(result.alternatives || []), ...(result.heightReferences || [])].filter(m => row.selectedPartNumbers.has(m.product.partNo!)) : result.matches
  })
}
export interface DatasheetPlan {
  format: 'pnrep-datasheet-download-v1'
  scope: DatasheetScope
  generatedAt: string
  partNumbers: string[]
  entries: { url: string; partNumbers: string[] }[]
  missingPartNumbers: string[]
  rejectedLinks: { partNo: string; url: string; reason: string }[]
}
export const DATASHEET_HOSTS = ['pim.murata.com', 'search.murata.co.jp', 'www.murata.com'] as const
export function officialDatasheetUrl(raw: string): string | undefined {
  try {
    if (!raw || raw.length > 4096 || /[\u0000-\u0020\u007f]/.test(raw)) return
    const url = new URL(raw)
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !DATASHEET_HOSTS.some(h => h === url.hostname)) return
    url.hash = ''
    return url.href
  } catch { return }
}
/** Collect displayed results, never the entire catalog or inferred spec URLs. */
export function buildDatasheetPlan(rows: BatchExportEntry[], scope: DatasheetScope): DatasheetPlan {
  const plan: DatasheetPlan = { format: 'pnrep-datasheet-download-v1', scope, generatedAt: new Date().toISOString(), partNumbers: [], entries: [], missingPartNumbers: [], rejectedLinks: [] }
  const parts = new Map<string, Set<string>>()
  const links = new Map<string, Set<string>>()
  for (const { product } of datasheetMatches(rows, scope)) {
      const pn = product.partNo
      if (!pn) continue
      if (!parts.has(pn)) parts.set(pn, new Set())
      for (const raw of product.links.datasheets) {
        const url = officialDatasheetUrl(raw)
        if (!url) { if (!plan.rejectedLinks.some(x => x.partNo === pn && x.url === raw)) plan.rejectedLinks.push({ partNo: pn, url: raw, reason: '链接不在支持的村田 HTTPS 域名范围内' }); continue }
        parts.get(pn)!.add(url)
        if (!links.has(url)) links.set(url, new Set())
        links.get(url)!.add(pn)
      }
  }
  if (parts.size > 1000 || links.size > 1000) throw new Error('每批最多 1000 个料号和 1000 份规格书，请缩小查询或分批勾选')
  plan.partNumbers = [...parts.keys()]
  plan.missingPartNumbers = [...parts].filter(([, urls]) => !urls.size).map(([pn]) => pn)
  plan.entries = [...links].map(([url, pns]) => ({ url, partNumbers: [...pns] }))
  return plan
}

/** Re-filter after confirmation-dialog edits; retain shared links only once. */
export function selectedDatasheetLinks(plan: DatasheetPlan, selected: ReadonlySet<string>) {
  return plan.entries.filter(entry => entry.partNumbers.some(pn => selected.has(pn)))
}

/** One explicit user click requests one new tab; never drain a queue in a loop. */
export function nextDatasheetLink(plan: DatasheetPlan, selected: ReadonlySet<string>, requested: ReadonlySet<string>) {
  return selectedDatasheetLinks(plan, selected).find(entry => !requested.has(entry.url))
}
