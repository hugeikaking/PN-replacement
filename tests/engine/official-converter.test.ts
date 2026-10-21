import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createOfficialCatalog } from '../../src/engine/official/catalog'
import { parseOfficialDescription } from '../../src/engine/official/query'
import { matchOfficialProducts } from '../../src/engine/official/matcher'

describe('actual PowerShell output compatibility', () => {
  it.skipIf(process.platform !== 'win32')('loads converter output and queries it without repairing or inventing data', () => {
    const root = mkdtempSync(join(tmpdir(), 'pnrep-matcher-compat-'))
    const base = {
      Partno: 'SYNTHETIC_ACTIVE', Series: 'GRM', Status: '目前生产',
      Specs: { Capacitance: .0000001, CapacitanceText: '100nF', RatedVoltageDC: 16, RatedVoltageDCText: '16Vdc', SizeCodeInInch: '0402', SizecodeMm: '1005M', Length: .001, LengthText: '1mm', Width: .0005, WidthText: '0.5mm', Thickness: .0015, ThicknessText: '1.5mm +0mm/-0.3mm', ThicknessMax: .0016, ThicknessMaxText: '1.6mm', ToleranceCapacitance: '±10%', TemperatureCharacteristics: 'X7R', TemperatureCharacteristicsCompliedStandard: 'EIA' },
      ComplianceInfo: { AecQ200Support: false }, MediaFileUrls: { SpecificationsSheet: 'https://example.invalid/synthetic.pdf' },
    }
    const nrnd = { ...structuredClone(base), Partno: 'SYNTHETIC_NRND', Status: 'NRND' }
    const missing = { ...structuredClone(nrnd), Partno: 'SYNTHETIC_MISSING' }
    Object.assign(missing.Specs, { RatedVoltageDC: null, RatedVoltageDCText: null })
    const source = join(root, 'synthetic.json'); const out = join(root, 'output')
    writeFileSync(source, JSON.stringify({ Products: [base, nrnd, missing] }), 'utf8')
    execFileSync('powershell.exe', ['-NoProfile', '-File', resolve('scripts/Convert-MurataDatabase.ps1'), '-InputPath', source, '-OutputDirectory', out, '-Mode', 'Full'], { timeout: 30000 })
    const dir = join(out, readdirSync(out)[0])
    const summary = JSON.parse(readFileSync(join(dir, 'normalization-summary.json'), 'utf8').replace(/^\uFEFF/, ''))
    const rows = readFileSync(join(dir, 'normalized-products.jsonl'), 'utf8').trim().split(/\r?\n/).map(s => JSON.parse(s))
    const catalog = createOfficialCatalog(summary, rows)
    const r = matchOfficialProducts(catalog, parseOfficialDescription('0402 100nF 16V X7R ±10%'))
    expect(r.matches.map(x => x.product.partNo)).toEqual(['SYNTHETIC_ACTIVE'])
    expect(r.reviewMatches.map(x => x.product.partNo)).toEqual(['SYNTHETIC_NRND'])
    expect(r.matches[0].product.spec.thicknessMm).toBe(1.5)
    expect(matchOfficialProducts(catalog, parseOfficialDescription('0402 100nF')).totalReviewMatches).toBe(2)
    expect(summary.toolBuild).toBe('v3.1')
  }, 35000)
})
