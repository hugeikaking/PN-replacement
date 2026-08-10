import { describe, it, expect } from 'vitest'
import { matchParams, computeCapacitance3Digit } from '../../src/engine/matcher'
import type { RuleSet, ParsedParams } from '../../src/engine'

const testRule: RuleSet = {
  manufacturer: 'murata',
  componentType: 'mlcc',
  componentKeywords: [],
  modeA: {
    template: '{series}{size}{tc}{voltage}{capacitance}{tolerance}',
    segments: [
      { id: 'series', position: 0, length: 3, fixed: 'GRM', label: '系列', labelEn: 'Series' },
      { id: 'size', position: 3, length: 2, refTable: 'size-codes', refKey: 'murata', label: '尺寸', labelEn: 'Size' },
      { id: 'tc', position: 5, length: 2, refTable: 'temperature-codes', refKey: 'murata', label: '温度特性', labelEn: 'TC' },
      { id: 'voltage', position: 7, length: 2, refTable: 'voltage-codes', refKey: 'murata', label: '电压', labelEn: 'Voltage' },
      { id: 'capacitance', position: 9, length: 3, computed: true, computedFrom: 'capacitance', formatter: 'capacitance3Digit', label: '容值', labelEn: 'Cap' },
      { id: 'tolerance', position: 12, length: 1, refTable: 'tolerance-codes', refKey: 'murata', label: '精度', labelEn: 'Tol' },
    ],
    defaults: { series: 'GRM', tolerance: 'K' }
  },
  parser: { patterns: [], normalizers: {} }
}

describe('matchParams', () => {
  it('matches complete params to Murata MLCC codes', () => {
    const params: ParsedParams = {
      size: '0402',
      capacitance: '100000',  // 100nF in pF
      voltage: '16',
      tc: 'X7R',
      tolerance: '10',
    }

    const result = matchParams(params, testRule)
    expect(result.codes.get('series')).toBe('GRM')
    expect(result.codes.get('size')).toBe('15')       // 0402→15
    expect(result.codes.get('tc')).toBe('R7')         // X7R→R7
    expect(result.codes.get('voltage')).toBe('1C')    // 16V→1C
    expect(result.codes.get('capacitance')).toBe('104') // 100nF→104
    expect(result.codes.get('tolerance')).toBe('K')    // ±10%→K
  })

  it('handles different size codes', () => {
    const params: ParsedParams = {
      size: '0603',
      capacitance: '100000',
      voltage: '50',
      tc: 'X7R',
      tolerance: '10',
    }

    const result = matchParams(params, testRule)
    expect(result.codes.get('size')).toBe('18')       // 0603→18
    expect(result.codes.get('voltage')).toBe('1H')    // 50V→1H
  })
})

describe('computeCapacitance3Digit', () => {
  it('encodes 100nF (100000pF) to 104', () => {
    const result = computeCapacitance3Digit('100000')
    expect(result?.code).toBe('104')
  })

  it('encodes 10uF (10000000pF) to 106', () => {
    const result = computeCapacitance3Digit('10000000')
    expect(result?.code).toBe('106')
  })

  it('encodes 22pF to 220', () => {
    const result = computeCapacitance3Digit('22')
    expect(result?.code).toBe('220')
  })

  it('encodes 4.7uF (4700000pF) to 475', () => {
    const result = computeCapacitance3Digit('4700000')
    expect(result?.code).toBe('475')
  })

  it('encodes 1uF (1000000pF) to 105', () => {
    const result = computeCapacitance3Digit('1000000')
    expect(result?.code).toBe('105')
  })

  it('handles small values with R notation', () => {
    const result = computeCapacitance3Digit('1.5')
    expect(result?.code).toBe('1R5')
  })
})
