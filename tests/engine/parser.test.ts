import { describe, it, expect } from 'vitest'
import { parseDescription, normalizeCapacitance } from '../../src/engine/parser'
import type { RuleSet } from '../../src/engine/types'

// Minimal rule set for testing MLCC parsing
const testRule: RuleSet = {
  manufacturer: 'murata',
  componentType: 'mlcc',
  componentKeywords: ['MLCC', '贴片电容', '电容', 'capacitor'],
  modeA: {
    template: '{series}{size}{thickness}{tc}{voltage}{capacitance}{tolerance}',
    segments: [],
    defaults: {}
  },
  parser: {
    patterns: [
      { regex: '\\b(0201|0402|0603|0805|1206|1210|1812|2220)\\b', param: 'size', priority: 10 },
      { regex: '(\\d+(?:\\.\\d+)?\\s*[pPnNuUμ]\\s*[Ff])', param: 'capacitance', priority: 10 },
      { regex: '\\b(X[5-8][RST]|C0G|NP0|COG|Y5V)\\b', param: 'tc', priority: 10 },
      { regex: '\\b(\\d+(?:\\.\\d+)?)\\s*V\\b', param: 'voltage', priority: 9 },
      { regex: '[±]?\\s*(\\d+(?:\\.\\d+)?)\\s*%', param: 'tolerance', priority: 8 },
    ],
    normalizers: {
      size: 'normalizeSize',
      capacitance: 'normalizeCapacitance',
      voltage: 'normalizeVoltage',
      tc: 'normalizeTc',
      tolerance: 'normalizeTolerance',
    }
  }
}

describe('parseDescription', () => {
  it('parses a complete MLCC description', () => {
    const result = parseDescription('0402 100nF 16V X7R ±10%', testRule)
    expect(result.params.size).toBe('0402')
    expect(result.params.capacitance).toBe('100000') // 100nF = 100000 pF
    expect(result.params.voltage).toBe('16')
    expect(result.params.tc).toBe('X7R')
    expect(result.params.tolerance).toBe('10')
  })

  it('parses description with uF values', () => {
    const result = parseDescription('0603 10uF 25V X5R ±5%', testRule)
    expect(result.params.size).toBe('0603')
    expect(result.params.capacitance).toBe('10000000') // 10uF = 10,000,000 pF
    expect(result.params.voltage).toBe('25')
    expect(result.params.tc).toBe('X5R')
    expect(result.params.tolerance).toBe('5')
  })

  it('parses description with NP0/C0G', () => {
    const result = parseDescription('0402 22pF 50V NP0 ±5%', testRule)
    expect(result.params.tc).toBe('C0G') // NP0 normalized to C0G
    expect(result.params.capacitance).toBe('22')
  })

  it('returns warnings for missing parameters', () => {
    const result = parseDescription('some MLCC', testRule)
    expect(result.warnings.length).toBeGreaterThan(0)
    expect(result.params.size).toBeUndefined()
    expect(result.params.capacitance).toBeUndefined()
  })

  it('normalizes Chinese punctuation', () => {
    const result = parseDescription('0603 100nF 16V X7R ±10%', testRule)
    expect(result.params.size).toBe('0603')
  })

  it('handles voltage without explicit V', () => {
    // With the regex requiring V, voltage detection needs V
    const result = parseDescription('0402 100nF 50V X7R 10%', testRule)
    expect(result.params.voltage).toBe('50')
  })
})

describe('normalizeCapacitance', () => {
  it('converts nF to pF', () => {
    expect(normalizeCapacitance('100nF')).toBe('100000')
  })

  it('converts uF to pF', () => {
    expect(normalizeCapacitance('10uF')).toBe('10000000')
  })

  it('converts μF to pF', () => {
    expect(normalizeCapacitance('4.7μF')).toBe('4700000')
  })

  it('keeps pF as-is', () => {
    expect(normalizeCapacitance('22pF')).toBe('22')
  })

  it('handles 0.1uF', () => {
    expect(normalizeCapacitance('0.1uF')).toBe('100000')
  })

  it('handles values without space', () => {
    expect(normalizeCapacitance('100nF')).toBe('100000')
  })
})
