import { describe, it, expect } from 'vitest'
import { buildDatasheetPlan, officialDatasheetUrl, selectedDatasheetLinks, nextDatasheetLink } from '../../src/utils/datasheet-download'
import type { BatchExportEntry } from '../../src/utils/batch-files'
import { DATASHEET_DOWNLOADER } from '../../src/utils/datasheet-downloader'
import { readFileSync } from 'node:fs'

const url = 'https://pim.murata.com/asset/pim4/synthetic-spec'
function entry(normal: [string, string[]][], review: [string, string[]][] = [], selected: string[] = []): BatchExportEntry {
  const matches = (rows: [string, string[]][]) => rows.map(([partNo, datasheets]) => ({ product: { partNo, links: { datasheets } } }))
  return { row: { input: 'synthetic', fileName: '', sheetName: '', rowNumber: 1 }, applications: ['general'], selectedPartNumbers: new Set(selected), translation: { input: 'synthetic', mode: 'A', description: '', errors: [], warnings: [], official: { errors: [], matches: matches(normal), reviewMatches: matches(review) } } } as unknown as BatchExportEntry
}
describe('datasheet batch plan', () => {
  it('downloads only displayed normal candidates by default and deduplicates shared links and repeated queries', () => {
    const plan = buildDatasheetPlan([entry([['A', [url]], ['B', [url + '#section']]], [['C', [url + '/review']]]), entry([['A', [url]]])], 'displayed-normal')
    expect(plan.partNumbers).toEqual(['A', 'B'])
    expect(plan.entries).toEqual([{ url, partNumbers: ['A', 'B'] }])
  })
  it('selected scope includes explicitly checked review candidates and skips unselected ones', () => {
    const plan = buildDatasheetPlan([entry([['A', [url]]], [['C', [url + '/review']]], ['C'])], 'selected')
    expect(plan.partNumbers).toEqual(['C'])
    expect(plan.entries[0].partNumbers).toEqual(['C'])
    expect(buildDatasheetPlan([entry([['A', [url]]])], 'selected').entries).toEqual([])
  })
  it('retains missing and rejected links without inventing a datasheet URL', () => {
    const plan = buildDatasheetPlan([entry([['A', []], ['B', ['https://example.invalid/file.pdf']], ['C', ['http://pim.murata.com/file.pdf', url]]])], 'displayed-normal')
    expect(plan.missingPartNumbers).toEqual(['A', 'B'])
    expect(plan.rejectedLinks).toHaveLength(2)
    expect(plan.entries).toEqual([{ url, partNumbers: ['C'] }])
  })
  it('rejects userinfo, unsafe schemes, lookalike hosts, custom ports and literal control characters', () => {
    for (const raw of ['javascript:alert(1)', 'file:///C:/x', 'https://pim.murata.com.evil.test/a', 'https://evil@pim.murata.com/a', 'https://pim.murata.com:8443/a', 'https://pim.murata.com/a b', 'https://pim.murata.com/\na']) expect(officialDatasheetUrl(raw), raw).toBeUndefined()
    expect(officialDatasheetUrl('https://search.murata.co.jp/Ceramy/a.pdf')).toBeDefined()
  })
  it('refuses oversized plans and excludes error results', () => {
    expect(() => buildDatasheetPlan([entry(Array.from({ length: 1001 }, (_, i) => ['SYNTHETIC' + i, [url]]))], 'displayed-normal')).toThrow('1000')
    const e = entry([['A', [url]]]); e.translation.errors.push('invalid')
    expect(buildDatasheetPlan([e], 'displayed-normal').partNumbers).toEqual([])
  })
  it('respects dialog deselection while preserving shared-link deduplication', () => {
    const plan = buildDatasheetPlan([entry([['A', [url]], ['B', [url]], ['C', [url + '/other']]])], 'displayed-normal')
    expect(selectedDatasheetLinks(plan, new Set(['B']))).toEqual([{ url, partNumbers: ['A', 'B'] }])
    expect(selectedDatasheetLinks(plan, new Set())).toEqual([])
    expect(selectedDatasheetLinks(plan, new Set(['A', 'B']))).toHaveLength(1)
    expect(plan.entries).toHaveLength(2)
  })
  it('requests only one distinct link per step, keeps remaining links, and respects later deselection', () => {
    const plan = buildDatasheetPlan([entry([['A', [url]], ['B', [url]], ['C', [url + '/2']], ['D', [url + '/3']], ['E', [url + '/4']]])], 'displayed-normal')
    const selected = new Set(plan.partNumbers), requested = new Set<string>()
    for (const suffix of ['', '/2', '/3', '/4']) {
      const next = nextDatasheetLink(plan, selected, requested)!
      expect(next.url).toBe(url + suffix)
      requested.add(next.url)
    }
    expect(requested.size).toBe(4)
    expect(nextDatasheetLink(plan, selected, requested)).toBeUndefined()
    requested.clear()
    requested.add(url)
    selected.delete('C')
    expect(nextDatasheetLink(plan, selected, requested)?.url).toBe(url + '/3')
    expect(nextDatasheetLink(plan, new Set(), requested)).toBeUndefined()
    // Failed requests are not marked by the caller and remain the next item.
    expect(nextDatasheetLink(plan, selected, requested)?.url).toBe(url + '/3')
  })
  it('embeds exactly the reviewed Windows downloader delivered to the company', () => {
    expect(DATASHEET_DOWNLOADER).toBe(readFileSync('deliverables/archive/Murata-Step6-v2_6_3-download/Download-MurataDatasheets.ps1', 'utf8'))
  })
})
