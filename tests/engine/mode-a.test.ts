import { describe, it, expect } from 'vitest'
import { translateDescription } from '../../src/engine/index'
import murataMlcc from '../../src/rules/murata/mlcc.json'
import type { RuleSet } from '../../src/engine/types'

const rule = murataMlcc as RuleSet

describe('Mode A: Description → Murata Part Number (end-to-end)', () => {
  it('translates "0402 100nF 16V X7R ±10%" to correct Murata PN', () => {
    const result = translateDescription('0402 100nF 16V X7R ±10%', rule)
    expect(result.success).toBe(true)
    expect(result.partNumber).toContain('GRM')
    expect(result.partNumber).toContain('15')  // 0402 size code
    expect(result.partNumber).toContain('R7')  // X7R TC code
    expect(result.partNumber).toContain('1C')  // 16V code
    expect(result.partNumber).toContain('104') // 100nF code
    expect(result.partNumber).toContain('K')   // ±10% tolerance
  })

  it('translates "0603 10uF 25V X5R ±5%"', () => {
    const result = translateDescription('0603 10uF 25V X5R ±5%', rule)
    expect(result.success).toBe(true)
    expect(result.partNumber).toContain('GRM')
    expect(result.partNumber).toContain('18')   // 0603
    expect(result.partNumber).toContain('R6')   // X5R
    expect(result.partNumber).toContain('1E')   // 25V
    expect(result.partNumber).toContain('106')  // 10uF
    expect(result.partNumber).toContain('J')    // ±5%
  })

  it('translates "0402 22pF 50V C0G ±5%"', () => {
    const result = translateDescription('0402 22pF 50V C0G ±5%', rule)
    expect(result.success).toBe(true)
    expect(result.partNumber).toContain('5C')   // C0G
    expect(result.partNumber).toContain('1H')   // 50V
    expect(result.partNumber).toContain('220')  // 22pF
    expect(result.partNumber).toContain('J')    // ±5%
  })

  it('translates "0805 4.7uF 16V X7R ±10%"', () => {
    const result = translateDescription('0805 4.7uF 16V X7R ±10%', rule)
    expect(result.success).toBe(true)
    expect(result.partNumber).toContain('21')   // 0805
    expect(result.partNumber).toContain('475')  // 4.7uF
    expect(result.partNumber).toContain('1C')   // 16V
    expect(result.partNumber).toContain('K')    // ±10%
  })

  it('translates "1206 100uF 6.3V X5R ±20%"', () => {
    const result = translateDescription('1206 100uF 6.3V X5R ±20%', rule)
    expect(result.success).toBe(true)
    expect(result.partNumber).toContain('31')   // 1206
    expect(result.partNumber).toContain('107')  // 100uF
    expect(result.partNumber).toContain('0J')   // 6.3V
    expect(result.partNumber).toContain('M')    // ±20%
  })

  it('returns error for empty input', () => {
    const result = translateDescription('', rule)
    expect(result.success).toBe(false)
    expect(result.error).toBeDefined()
  })

  it('returns error for gibberish input', () => {
    const result = translateDescription('asdfghjkl', rule)
    expect(result.success).toBe(false)
  })

  it('handles descriptions with minimal parameters (uses defaults)', () => {
    const result = translateDescription('0603 100nF', rule)
    // Should still produce something with defaults
    expect(result.partNumber.length).toBeGreaterThan(0)
  })

  it('produces valid part number segments', () => {
    const result = translateDescription('0402 100nF 16V X7R ±10%', rule)
    expect(result.segments.length).toBeGreaterThan(0)
    // Check decoded segments
    const capSeg = result.segments.find(s => s.id === 'capacitance')
    expect(capSeg).toBeDefined()
    expect(capSeg?.code).toBe('104')
  })
})
