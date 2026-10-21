import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'

function run(products: object[], limit = 20000) {
  const dir = mkdtempSync(join(tmpdir(), 'pnrep-field-inspector-'))
  const source = join(dir, 'synthetic.json'), out = join(dir, 'out')
  const original = JSON.stringify({ Products: products })
  writeFileSync(source, original)
  execFileSync('powershell.exe', ['-NoProfile', '-File', resolve('scripts/Inspect-MurataClassification.ps1'), '-InputPath', source, '-OutputDirectory', out, '-MaxProducts', String(limit)], { timeout: 30000 })
  expect(readFileSync(source, 'utf8')).toBe(original)
  const folder = join(out, readdirSync(out)[0])
  return {
    report: JSON.parse(readFileSync(join(folder, 'classification-fields.json'), 'utf8').replace(/^\uFEFF/, '')),
    html: readFileSync(join(folder, 'classification-fields.html'), 'utf8'),
  }
}

describe.skipIf(process.platform !== 'win32')('company-local classification inspection', () => {
  it('keeps arrays, coded objects, false, null and missing distinct; discovers safety fields and escapes HTML', () => {
    const result = run([
      { Application: ['Consumer equipment', 'Industrial equipment'], Specs: { Characteristics: { HighQ: false, Code: 12 }, SafetyStandard: '<script>alert(1)</script>', 'Safety<script>': 'A&B', TemperatureCharacteristicsCompliedStandard: 'EIA' }, ComplianceInfo: { AecQ200Support: false } },
      { Application: null, Specs: { Characteristics: 'High Q' } },
      { Specs: {} },
    ])
    expect(result.report).toMatchObject({ completed: true, inspected: 3, reachedArrayEnd: true })
    const fields = result.report.fields as Array<{ field: string; present: number; missing: number; nulls: number; values: Array<{ json: string; type: string }> }>
    expect(fields.find(x => x.field === 'Application')).toMatchObject({ present: 2, missing: 1, nulls: 1 })
    expect(JSON.parse(fields.find(x => x.field === 'Application')!.values[0].json)).toEqual(['Consumer equipment', 'Industrial equipment'])
    expect(fields.find(x => x.field === 'Specs.Characteristics.HighQ')!.values[0]).toMatchObject({ type: 'System.Boolean', json: 'false' })
    expect(fields.find(x => x.field === 'Specs.Characteristics.Code')!.values[0].json).toBe('12')
    expect(fields.find(x => x.field === 'Specs.SafetyStandard')).toBeDefined()
    expect(JSON.parse(fields.find(x => x.field === 'Specs.SafetyStandard')!.values[0].json)).toBe('<script>alert(1)</script>')
    expect(result.html).toContain('Specs.Safety&lt;script&gt;')
    expect(result.html).not.toContain('<script>')
    expect(result.html).toContain('不能当作安全认证')
  }, 35000)
  it('marks bounded inspection as incomplete coverage and does not invent absent values', () => {
    const { report, html } = run([{ Application: 17 }, { Application: 'ONLY_AFTER_LIMIT', Specs: { Characteristics: 'High Q' } }], 1)
    expect(report).toMatchObject({ inspected: 1, reachedArrayEnd: false })
    expect(report.fields.find((x: { field: string }) => x.field === 'Specs.Characteristics')).toMatchObject({ present: 0, missing: 1, nulls: 0, values: [] })
    expect(html).toContain('达到检查上限')
    expect(html).not.toContain('ONLY_AFTER_LIMIT')
  }, 35000)
})
