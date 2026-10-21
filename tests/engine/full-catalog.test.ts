import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createOfficialCatalog, readOfficialJsonLines, OFFICIAL_CATALOG_LIMITS } from '../../src/engine/official/catalog'
import { parseOfficialDescription } from '../../src/engine/official/query'
import { matchOfficialProducts } from '../../src/engine/official/matcher'

describe('bounded full-source import', () => {
  it('admits the larger file range without using Blob.text', async () => {
    // The advertised size checks the boundary only; this is not a 129MB performance claim.
    const contents = new TextEncoder().encode('{"synthetic":true}\n')
    const file = { size: 129 * 1024 * 1024, stream: () => new Blob([contents]).stream() } as Blob
    expect(await readOfficialJsonLines(file)).toEqual([{ synthetic: true }])
    await expect(readOfficialJsonLines({ size: OFFICIAL_CATALOG_LIMITS.maxBytes + 1 } as Blob)).rejects.toThrow('512MB')
  })
  it('reads past the previous record ceiling and rejects excess records instead of truncating', async () => {
    const counts: number[] = []
    const rows = await readOfficialJsonLines(new Blob(['{}\n'.repeat(100001)]), n => counts.push(n))
    expect(rows).toHaveLength(100001)
    expect(counts.at(-1)).toBe(100001)
    await expect(readOfficialJsonLines(new Blob(['{}\n'.repeat(250001)]))).rejects.toThrow('250000')
  })
  it('rejects invalid UTF-8 and the raw JSON wrapper instead of treating it as normalized records', async () => {
    await expect(readOfficialJsonLines(new Blob([new Uint8Array([0xff])]))).rejects.toThrow()
    const rows = await readOfficialJsonLines(new Blob(['{"Products":[]}']))
    expect(() => createOfficialCatalog({ schemaVersion: 1, completed: true, products: 1 }, rows)).toThrow()
  })
})

describe.skipIf(process.platform !== 'win32')('company full-source preparation with real PowerShell', () => {
  const runner = resolve('deliverables/Murata-Step6-v2_6-offline/Prepare-MurataFullCatalog.ps1')
  const product = {
    Partno: 'SYNTHETIC_FULL_ACTIVE', Series: 'GRM', Status: '目前生产',
    Application: '民用×民用设备,工业×工业设备', Standard: 'SYNTHETIC_STANDARD',
    Specs: { Capacitance: .0000001, CapacitanceText: '100nF', RatedVoltageDC: 16, RatedVoltageDCText: '16Vdc', SizeCodeInInch: '0402', SizecodeMm: '1005M', Length: .001, LengthText: '1mm', Width: .0005, WidthText: '0.5mm', Thickness: .0005, ThicknessText: '0.5mm', ThicknessMax: .00055, ThicknessMaxText: '0.55mm', ToleranceCapacitance: '±10%', TemperatureCharacteristics: 'X7R', TemperatureCharacteristicsCompliedStandard: 'EIA', Characteristics: ['SYNTHETIC_FEATURE'] },
    ComplianceInfo: { AecQ200Support: false }, MediaFileUrls: { SpecificationsSheet: 'https://example.invalid/synthetic.pdf' },
  }
  it('processes every source row, skips exact duplicates, preserves classifications and produces importable data', async () => {
    const root = mkdtempSync(join(tmpdir(), 'pnrep-full-source-'))
    try {
      const source = join(root, 'Murata_MLCC.synthetic.json')
      const input = JSON.stringify({ Products: [product, product, { ...product, Partno: 'SYNTHETIC_FULL_NRND', Status: 'NRND' }] })
      writeFileSync(source, input)
      const out = join(root, 'output')
      execFileSync('powershell.exe', ['-NoProfile', '-File', runner, '-InputPath', source, '-OutputRoot', out], { timeout: 30000 })
      const run = join(out, readdirSync(out)[0])
      const json = (name: string) => JSON.parse(readFileSync(join(run, name), 'utf8').replace(/^\uFEFF/, ''))
      const report = json('full-catalog-preparation.json')
      expect(report).toMatchObject({ sourceRecordsProcessed: 3, exactDuplicateRecordsSkipped: 1, normalizedProducts: 2, consistentProducts: 1, reviewProducts: 1, fitsWebV26Limits: true, websiteCoverageVerified: false, companyAccepted: false })
      expect(report.sourceSha256).toMatch(/^[0-9A-F]{64}$/)
      expect(readFileSync(source, 'utf8')).toBe(input)
      const summary = json('normalization-summary.json')
      expect(summary).toMatchObject({ mode: 'Full', fullDatabaseRead: true, completed: true })
      const rows = await readOfficialJsonLines(new Blob([readFileSync(join(run, 'normalized-products.jsonl'))]))
      const catalog = createOfficialCatalog(summary, rows)
      expect(catalog.records[0].classification?.standardRaw).toBe('SYNTHETIC_STANDARD')
      expect(catalog.records[0].classification?.characteristicsRaw).toEqual(['SYNTHETIC_FEATURE'])
      const result = matchOfficialProducts(catalog, parseOfficialDescription('0402 100nF 16V X7R ±10%'))
      expect(result.matches.map(m => m.product.partNo)).toEqual(['SYNTHETIC_FULL_ACTIVE'])
      expect(result.reviewMatches.map(m => m.product.partNo)).toEqual(['SYNTHETIC_FULL_NRND'])
      expect(result.warnings.join(' ')).toContain('来源文件')
      expect(result.warnings.join(' ')).toContain('不能证明官网不存在')
      const ro = matchOfficialProducts(catalog, parseOfficialDescription('CAP X7R 100nF +/-10% 16V CH0402 H0.55mm RO'))
      expect(ro.matches[0].kind).toBe('partial')
      expect(readFileSync(join(run, 'full-catalog-preparation.html'), 'utf8')).toContain('不等于已核实官网')
    } finally { rmSync(root, { recursive: true, force: true }) }
  }, 35000)
  it('refuses truncated raw data and never publishes a preparation-success report', () => {
    const root = mkdtempSync(join(tmpdir(), 'pnrep-full-invalid-'))
    try {
      const source = join(root, 'truncated.synthetic.json')
      writeFileSync(source, '{"Products":[' + JSON.stringify(product))
      const out = join(root, 'output')
      expect(() => execFileSync('powershell.exe', ['-NoProfile', '-File', runner, '-InputPath', source, '-OutputRoot', out], { timeout: 30000, stdio: 'pipe' })).toThrow()
      const run = join(out, readdirSync(out)[0])
      const summary = JSON.parse(readFileSync(join(run, 'normalization-summary.json'), 'utf8').replace(/^\uFEFF/, ''))
      expect(summary.completed).toBe(false); expect(summary.fullDatabaseRead).toBe(false)
      expect(readdirSync(run)).not.toContain('full-catalog-preparation.html')
    } finally { rmSync(root, { recursive: true, force: true }) }
  }, 35000)
})
