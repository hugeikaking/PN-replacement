import { describe, it, expect } from 'vitest'
import { decodePartNumber, detectManufacturer, decodeCapacitance3Digit, decodeThickness3Digit } from '../../src/engine/decoder'

const value = (r: ReturnType<typeof decodePartNumber>, id: string) =>
  r.decodedParts.find(p => p.id === id)?.value

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

describe('decodeThickness3Digit', () => {
  it('decodes "080" → "0.80mm"', () => {
    expect(decodeThickness3Digit('080')).toBe('0.80mm')
  })

  it('decodes "100" → "1.00mm"', () => {
    expect(decodeThickness3Digit('100')).toBe('1.00mm')
  })
})

describe('detectManufacturer', () => {
  it('detects Samsung CL prefix', () => {
    expect(detectManufacturer('CL10B104KO8NNNC')?.key).toBe('samsung')
  })

  it('detects Murata GRM prefix', () => {
    expect(detectManufacturer('GRM155R71C104KA88D')?.key).toBe('murata')
  })

  it('detects TDK C prefix', () => {
    expect(detectManufacturer('C1608X7R1H104K080AA')?.key).toBe('tdk')
  })

  it('returns null for unknown prefix', () => {
    expect(detectManufacturer('XXXXX')).toBeNull()
  })
})

describe('decodePartNumber (Samsung MLCC)', () => {
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
})

describe('decodePartNumber (TDK MLCC)', () => {
  it('decodes C1608X7R1H104K080AA field by field', () => {
    const r = decodePartNumber('C1608X7R1H104K080AA')
    expect(r.success).toBe(true)
    expect(r.manufacturer).toBe('tdk')
    expect(value(r, 'size')).toBe('0603')
    expect(value(r, 'tc')).toBe('X7R')
    expect(value(r, 'voltage')).toBe('50V')
    expect(value(r, 'capacitance')).toBe('100nF')
    expect(value(r, 'tolerance')).toBe('±10%')
    expect(value(r, 'thickness')).toBe('0.80mm')
  })
})

describe('decodePartNumber (Taiyo Yuden MLCC)', () => {
  it('decodes TMK107BJ226MA-T field by field', () => {
    const r = decodePartNumber('TMK107BJ226MA-T')
    expect(r.success).toBe(true)
    expect(r.manufacturer).toBe('taiyo-yuden')
    expect(value(r, 'size')).toBe('0603')
    expect(value(r, 'tc')).toBe('X7R')
    expect(value(r, 'capacitance')).toBe('22uF')
    expect(value(r, 'tolerance')).toBe('±20%')
  })
})

describe('decodePartNumber (Yageo MLCC)', () => {
  it('decodes CC0603KRX7R9BB104 field by field', () => {
    const r = decodePartNumber('CC0603KRX7R9BB104')
    expect(r.success).toBe(true)
    expect(r.manufacturer).toBe('yageo')
    expect(value(r, 'size')).toBe('0603')
    expect(value(r, 'tolerance')).toBe('±10%')
    expect(value(r, 'tc')).toBe('X7R')
    expect(value(r, 'voltage')).toBe('25V')
    expect(value(r, 'capacitance')).toBe('100nF')
  })
})

describe('decodePartNumber (Walsin MLCC)', () => {
  it('decodes WR06X104JTL field by field', () => {
    const r = decodePartNumber('WR06X104JTL')
    expect(r.success).toBe(true)
    expect(r.manufacturer).toBe('walsin')
    expect(value(r, 'size')).toBe('0603')
    expect(value(r, 'tc')).toBe('X7R')
    expect(value(r, 'capacitance')).toBe('100nF')
    expect(value(r, 'tolerance')).toBe('±5%')
  })
})
