import { describe, it, expect } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { createOfficialCatalog } from '../../src/engine/official/catalog'
import { parseOfficialDescription } from '../../src/engine/official/query'
import { matchOfficialProducts } from '../../src/engine/official/matcher'

// Every record here is synthetic, including the suffixes. Nothing is an
// assertion that these complete part numbers exist in the manufacturer catalog.
const prefixes = ['GRT155R71C104KE01', 'GGM155R71C104KA55', 'GCH155R71C104KE01', 'GCM155R71C104KA55', 'GRM155R71C104KA88', 'GCM155R71C104KA40']
function product(pn: string, overrides = {}) {
  return {
    Partno: pn, Series: 'GRM', Status: '目前生产',
    Specs: { Capacitance: .0000001, CapacitanceText: '100nF', RatedVoltageDC: 16, RatedVoltageDCText: '16Vdc', SizeCodeInInch: '0402', SizecodeMm: '1005M', Length: .001, LengthText: '1mm', Width: .0005, WidthText: '0.5mm', Thickness: .0005, ThicknessText: '0.5mm', ThicknessMax: .00055, ThicknessMaxText: '0.55mm', ToleranceCapacitance: '±10%', TemperatureCharacteristics: 'X7R', TemperatureCharacteristicsCompliedStandard: 'EIA', ...overrides },
    ComplianceInfo: { AecQ200Support: false }, MediaFileUrls: { SpecificationsSheet: 'https://example.invalid/synthetic.pdf' },
  }
}
const quote = (s: string) => `'${s.replace(/'/g, "''")}'`
function setup(rows: unknown[], samples: unknown[], malformed = false) {
  const root = mkdtempSync(join(tmpdir(), 'pnrep-coverage-'))
  const source = join(root, 'synthetic.json'), checks = join(root, 'checks'), out = join(root, 'out')
  const check = join(checks, 'check-synthetic')
  mkdirSync(check, { recursive: true })
  const data = JSON.stringify({ Products: rows }) + (malformed ? ' malformed trailing JSON' : '')
  writeFileSync(source, data)
  writeFileSync(join(check, 'selected-products.jsonl'), samples.map(x => JSON.stringify(x)).join('\n') + '\n')
  return { root, source, check, checks, out, data }
}
function run(f: ReturnType<typeof setup>, mismatched = false) {
  const command = `$f=Get-Item -LiteralPath ${quote(f.source)}; [ordered]@{Completed=$true;Source=$f.FullName;SourceBytes=($f.Length+${mismatched ? 1 : 0});SourceModifiedUtc=$f.LastWriteTimeUtc.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath ${quote(join(f.check, 'run-summary.json'))} -Encoding UTF8; & ${quote(resolve('scripts/Expand-MurataQueryData.ps1'))} -InputPath ${quote(f.source)} -CheckDirectory ${quote(f.checks)} -OutputDirectory ${quote(f.out)}`
  return execFileSync('powershell.exe', ['-NoProfile', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], { timeout: 30000, stdio: 'pipe' })
}
function output(f: ReturnType<typeof setup>) {
  const dir = join(f.out, readdirSync(f.out)[0])
  const summary = JSON.parse(readFileSync(join(dir, 'normalization-summary.json'), 'utf8').replace(/^\uFEFF/, ''))
  const records = readFileSync(join(dir, 'normalized-products.jsonl'), 'utf8').trim().split(/\r?\n/).map(x => JSON.parse(x))
  return { dir, summary, records }
}

describe.skipIf(process.platform !== 'win32')('company query coverage extension', () => {
  it('preserves prior samples and scans to the end for additional real source records without relaxing the query', () => {
    const old = product('SYNTHETIC_OLD', { Capacitance: .00000000001, CapacitanceText: '10pF', SizeCodeInInch: '008004' })
    const otherTc = product('SYNTHETIC_OTHER_TC', { TemperatureCharacteristics: 'X5R' })
    const irrelevant = product('SYNTHETIC_NOT_SELECTED', { Capacitance: .000001, CapacitanceText: '1uF' })
    const targets = prefixes.map(p => product(p + '_SYNTHETIC', { CapacitanceText: '0.1uF' }))
    const badNumeric = product('SYNTHETIC_BAD_CAP', { Capacitance: .000001 })
    const wrongVoltage = product('SYNTHETIC_WRONG_V', { RatedVoltageDC: 10, RatedVoltageDCText: '10Vdc' })
    const nrnd = { ...product('SYNTHETIC_NRND'), Status: 'NRND' }
    const conflict = product('SYNTHETIC_CONFLICT')
    const changed = product('SYNTHETIC_CONFLICT', { RatedVoltageDC: 25, RatedVoltageDCText: '25Vdc' })
    const rows = [old, otherTc, irrelevant, conflict, ...Array.from({ length: 20 }, (_, i) => product(`SYNTHETIC_FILLER_${i}`, { SizeCodeInInch: '0805' })), ...targets, badNumeric, wrongVoltage, nrnd, changed]
    const f = setup(rows, [old, otherTc, conflict])
    run(f)
    const { dir, summary, records } = output(f)
    expect(readFileSync(f.source, 'utf8')).toBe(f.data)
    expect(summary.completed).toBe(true)
    expect(summary.fullDatabaseRead).toBe(false)
    expect(summary.mode).toBe('CheckedSamples')
    expect(summary.selection.rawScanCompleted).toBe(true)
    expect(summary.selection.rawRecordsScanned).toBe(rows.length)
    // The preserved 10pF sample is outside the new source selection, so only
    // the two existing 100nF/0402 records occur twice.
    expect(summary.exactDuplicateRecordsSkipped).toBe(2)
    for (const prefix of prefixes) {
      expect(summary.selection.referenceCounts[prefix]).toBe(1)
      expect(summary.selection.referenceExamples[prefix]).toEqual([prefix + '_SYNTHETIC'])
    }
    expect(records.some(r => r.partNo === 'SYNTHETIC_OLD')).toBe(true)
    expect(records.some(r => r.partNo === 'SYNTHETIC_NOT_SELECTED')).toBe(false)
    expect(records.filter(r => r.partNo === 'SYNTHETIC_CONFLICT').every(r => r.validation.status === 'review')).toBe(true)
    expect(records.find(r => r.partNo === 'SYNTHETIC_BAD_CAP').spec.capacitancePf).toBeNull()
    const catalog = createOfficialCatalog(summary, records)
    const result = matchOfficialProducts(catalog, parseOfficialDescription('三星 MLCC 0402 X7R 100nF ±10% 16V'))
    expect(result.matches.map(x => x.product.partNo).sort()).toEqual(targets.map(x => x.Partno).sort())
    expect(result.reviewMatches.map(x => x.product.partNo)).toEqual(['SYNTHETIC_NRND'])
    expect(readFileSync(join(dir, 'local-coverage-report.html'), 'utf8')).toContain('GRT155R71C104KE01_SYNTHETIC')
  }, 35000)
  it('refuses to merge old samples from a different source snapshot', () => {
    const p = product('SYNTHETIC_NEW')
    const f = setup([p], [p])
    expect(() => run(f, true)).toThrow()
    expect(readFileSync(f.source, 'utf8')).toBe(f.data)
  }, 35000)
  it('marks malformed trailing source data incomplete so it cannot be imported', () => {
    const p = product('SYNTHETIC_INCOMPLETE')
    const f = setup([p], [p], true)
    expect(() => run(f)).toThrow()
    const { summary, records } = output(f)
    expect(summary.completed).toBe(false)
    expect(summary.selection.rawScanCompleted).toBe(false)
    expect(() => createOfficialCatalog(summary, records)).toThrow(/整理未完成/)
  }, 35000)
})
