/**
 * engine/matcher.ts
 *
 * Maps parsed parameter values to manufacturer part number codes
 * using reference tables and rule segment definitions.
 */

import type { RuleSet, Segment, DecodedSegment } from './types'
import sizeCodes from '../rules/shared/size-codes.json'
import voltageCodes from '../rules/shared/voltage-codes.json'
import toleranceCodes from '../rules/shared/tolerance-codes.json'
import temperatureCodes from '../rules/shared/temperature-codes.json'
import type { ParsedParams } from './parser'

// Registry of all reference tables for dynamic lookup
const refTables: Record<string, Record<string, string>> = {
  'size-codes': { ...sizeCodes.murata, ...sizeCodes.samsung, ...sizeCodes.tdk },
  'voltage-codes': { ...voltageCodes.murata, ...voltageCodes.samsung, ...voltageCodes.tdk },
  'tolerance-codes': { ...toleranceCodes.murata },
  'temperature-codes': { ...temperatureCodes.murata, ...temperatureCodes.samsung, ...temperatureCodes.tdk },
}

/** Result of matching: maps segment IDs to their codes */
export type MatchResult = Map<string, string>

/**
 * Match parsed parameters to part number segment codes
 * @returns Map of segmentId → manufacturer code
 */
export function matchParams(
  params: ParsedParams,
  rule: RuleSet
): { codes: MatchResult; decoded: DecodedSegment[]; warnings: string[] } {
  const codes: MatchResult = new Map()
  const decoded: DecodedSegment[] = []
  const warnings: string[] = []

  for (const segment of rule.modeA.segments) {
    try {
      const result = matchSegment(segment, params, rule)
      if (result) {
        codes.set(segment.id, result.code)
        decoded.push(result)
      }
    } catch (e) {
      warnings.push(`无法匹配 "${segment.label || segment.id}": ${e}`)
    }
  }

  return { codes, decoded, warnings }
}

function matchSegment(
  segment: Segment,
  params: ParsedParams,
  _rule: RuleSet
): DecodedSegment | null {
  let code: string | undefined
  let value: string | undefined

  // 1. Fixed value
  if (segment.fixed) {
    code = segment.fixed
    value = segment.description || segment.fixed
  }
  // 2. Computed value (e.g. capacitance 3-digit code)
  else if (segment.computed && segment.computedFrom) {
    const paramValue = params[segment.computedFrom]
    if (!paramValue) return null
    const result = computeSegment(segment, paramValue)
    if (result) {
      code = result.code
      value = result.value
    } else {
      return null
    }
  }
  // 3. Reference table lookup
  else if (segment.refTable && segment.refKey && params[segment.id]) {
    code = lookupRefTable(segment.refTable, segment.refKey, params[segment.id]!)
    value = params[segment.id]
  }
  // 4. Inline options lookup
  else if (segment.options && params[segment.id]) {
    code = segment.options[params[segment.id]!]
    value = params[segment.id]
  }
  // 5. Direct match (param value IS the code)
  else if (params[segment.id]) {
    code = params[segment.id]
    value = params[segment.id]
  }

  if (!code) return null

  return {
    id: segment.id,
    label: segment.label || segment.id,
    labelEn: segment.labelEn || segment.id,
    code,
    value: value || code,
  }
}

/**
 * Look up a value in a reference table
 * Uses aliases when direct lookup fails
 */
function lookupRefTable(tableName: string, manufacturerKey: string, paramValue: string): string | null {
  const table = getRefTable(tableName)
  if (!table) return null

  // Try direct lookup
  if (table[paramValue]) return table[paramValue]

  // Try alias lookup (e.g. "10" → "±10%" in tolerance)
  const aliases = getAliases(tableName)
  if (aliases) {
    const resolved = aliases[paramValue]
    if (resolved && table[resolved]) return table[resolved]
  }

  return null
}

function getRefTable(tableName: string): Record<string, string> | null {
  // Import the correct ref table
  // The refTables registry above contains the manufacturer-specific entries
  // For now, we use a simple approach
  switch (tableName) {
    case 'size-codes': return sizeCodes.murata as Record<string, string>
    case 'voltage-codes': return voltageCodes.murata as Record<string, string>
    case 'tolerance-codes': {
      // Handle aliases for tolerance
      const t: Record<string, string> = {}
      for (const [k, v] of Object.entries(toleranceCodes.murata)) {
        t[k] = v as string
      }
      return t
    }
    case 'temperature-codes': return temperatureCodes.murata as Record<string, string>
    default: return null
  }
}

function getAliases(tableName: string): Record<string, string> | null {
  switch (tableName) {
    case 'tolerance-codes': return toleranceCodes.aliases as Record<string, string>
    default: return null
  }
}

/**
 * Compute a segment value programmatically
 */
function computeSegment(
  segment: Segment,
  paramValue: string
): { code: string; value: string } | null {
  switch (segment.formatter) {
    case 'capacitance3Digit':
      return computeCapacitance3Digit(paramValue, segment)
    default:
      return null
  }
}

/**
 * Encode capacitance value (in pF as string) to 3-digit EIA code
 *
 * For values >= 10pF: 3-digit code (first 2 sig figs + multiplier)
 *   e.g., 100000pF → "104" (10 × 10^4)
 * For values < 10pF: R notation
 *   e.g., 1.5pF → "1R5"
 */
export function computeCapacitance3Digit(
  pFString: string,
  _segment?: Segment
): { code: string; value: string } | null {
  const pF = parseFloat(pFString)
  if (isNaN(pF) || pF <= 0) return null

  // Handle values < 10pF with R notation
  if (pF < 10) {
    // Round to 1 decimal place
    const rounded = Math.round(pF * 10) / 10
    const intPart = Math.floor(rounded)
    const decPart = Math.round((rounded - intPart) * 10)
    if (decPart === 0) {
      // Integer, pad to 3 chars
      return {
        code: `${intPart}${0}${0}`.padStart(3, '0').substring(0, 3),
        value: `${rounded}pF`
      }
    }
    // R notation: 1R5, 2R2, etc.
    return {
      code: `${intPart}R${decPart}`,
      value: `${rounded}pF`
    }
  }

  // For >= 10pF: compute 3-digit code
  // Find sig × 10^n where 10 <= sig < 100
  let n = 0
  let sig = pF
  while (sig >= 100) {
    sig /= 10
    n++
  }
  sig = Math.round(sig)

  // Handle rounding overflow (e.g., 9.9 → 10)
  if (sig >= 100) {
    sig /= 10
    n++
  }

  const code = `${sig}${n}`.padStart(3, '0').substring(0, 3)
  return { code, value: formatCapacitanceValue(pF) }
}

/** Format a pF value as human-readable capacitance */
export function formatCapacitanceValue(pF: number): string {
  if (pF >= 1_000_000) {
    const uF = pF / 1_000_000
    return uF === Math.floor(uF) ? `${uF}uF` : `${uF}uF`
  }
  if (pF >= 1_000) {
    const nF = pF / 1_000
    return nF === Math.floor(nF) ? `${nF}nF` : `${nF}nF`
  }
  return `${pF}pF`
}
