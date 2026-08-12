import { describe, it, expect } from 'vitest'
import { decodePartNumber, detectManufacturer, decodeCapacitance3Digit } from '../../src/engine/decoder'

describe('decodeCapacitance3Digit', () => {
  it('decodes "104" → "100nF"', () => {
    expect(decodeCapacitance3Digit('104')).toBe('100nF')
  })

  it('decodes "106" → "10uF"', () => {
    expect(decodeCapacitance3Digit('106')).toBe('10uF')
  })

  it('decodes "1R5" → "1.5pF"', () => {
    expect(decodeCapacitance3Digit('1R5')).toBe('1.5pF')
  })

  it('decodes "102" → "1nF"', () => {
    expect(decodeCapacitance3Digit('102')).toBe('1nF')
  })
})

describe('detectManufacturer', () => {
  it('detects Samsung CL prefix', () => {
    expect(detectManufacturer('CL10B104KO8NNNC')?.key).toBe('samsung')
  })

  it('detects Murata GRM prefix', () => {
    expect(detectManufacturer('GRM155R71C104KA88D')?.key).toBe('murata')
  })

  it('returns null for unknown prefix', () => {
    expect(detectManufacturer('XXXXX')).toBeNull()
  })
})

describe('decodePartNumber (Samsung MLCC, built-in rule)', () => {
  const value = (r: ReturnType<typeof decodePartNumber>, id: string) =>
    r.decodedParts.find(p => p.id === id)?.value

  it('decodes CL10B104KO8NNNC field by field', () => {
    const r = decodePartNumber('CL10B104KO8NNNC')
    expect(r.success).toBe(true)
    expect(r.manufacturer).toBe('samsung')
    expect(value(r, 'size')).toBe('0603')
    expect(value(r, 'tc')).toBe('X7R')
    expect(value(r, 'capacitance')).toBe('100nF')
    expect(value(r, 'tolerance')).toBe('±10%')
    expect(value(r, 'voltage')).toBe('16V')
  })

  it('decodes CL21A106KAYNNNE (0805 10uF ±10% 25V X5R)', () => {
    const r = decodePartNumber('CL21A106KAYNNNE')
    expect(r.success).toBe(true)
    expect(value(r, 'size')).toBe('0805')
    expect(value(r, 'tc')).toBe('X5R')
    expect(value(r, 'capacitance')).toBe('10uF')
    expect(value(r, 'tolerance')).toBe('±10%')
    expect(value(r, 'voltage')).toBe('25V')
  })
})
