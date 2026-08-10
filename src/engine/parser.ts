/**
 * engine/parser.ts
 *
 * Parses free-text component descriptions into structured parameter objects.
 * Uses regex patterns defined in rule files to extract parameters.
 * Handles normalization of various input formats.
 */

import type { RuleSet } from './types'

/** Structured parameters extracted from a description */
export interface ParsedParams {
  size?: string
  capacitance?: string   // normalized to pF numeric string
  voltage?: string       // normalized to numeric string (volts)
  tc?: string            // normalized to standard code (X7R, C0G, etc.)
  tolerance?: string     // normalized percentage string
  componentType?: string // detected component type keyword
  [key: string]: string | undefined
}

/** Result of parsing, including any warnings */
export interface ParseResult {
  params: ParsedParams
  warnings: string[]
  rawInput: string
}

/**
 * Parse a free-text description into structured parameters
 */
export function parseDescription(input: string, rule: RuleSet): ParseResult {
  const warnings: string[] = []
  const params: ParsedParams = {}

  // Normalize input: trim, collapse whitespace, normalize Chinese punctuation
  const normalized = input
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/（/g, '(')
    .replace(/）/g, ')')
    .replace(/，/g, ',')
    .replace(/；/g, ';')
    .replace(/±/g, '±')      // normalize fullwidth +/- to regular
    .replace(/＋/g, '+')
    .replace(/－/g, '-')
    .replace(/μ/g, 'u')      // normalize Greek mu to u
    .replace(/µ/g, 'u')

  // Apply each parser pattern from the rule, sorted by priority (highest first)
  const patterns = [...rule.parser.patterns].sort((a, b) => (b.priority || 0) - (a.priority || 0))

  for (const pattern of patterns) {
    // Skip if this param is already matched (first match wins)
    if (params[pattern.param]) continue

    try {
      // Strip inline (?i) if present (we use 'gi' flag)
      const cleanRegex = pattern.regex.replace(/^\(\?i\)/, '')
      const regex = new RegExp(cleanRegex, 'gi')
      const match = regex.exec(normalized)
      if (match) {
        // Use match[1] (first capture group) if it exists and looks like a full value;
        // for params like capacitance where unit is part of the capture, use match[1].
        // For params where only the number is captured, that's also match[1].
        const rawValue = match[1] || match[0]
        // Apply normalizer if defined
        if (rule.parser.normalizers?.[pattern.param]) {
          const normalizerName = rule.parser.normalizers[pattern.param]
          const normalizedValue = applyNormalizer(normalizerName, rawValue)
          if (normalizedValue) {
            params[pattern.param] = normalizedValue
          }
        } else {
          params[pattern.param] = rawValue
        }
      }
    } catch (e) {
      warnings.push(`Invalid regex pattern for "${pattern.param}": ${pattern.regex}`)
    }
  }

  // Detect component type from keywords
  for (const keyword of rule.componentKeywords || []) {
    if (normalized.toLowerCase().includes(keyword.toLowerCase())) {
      params.componentType = keyword
      break
    }
  }

  // Report unextracted common parameters
  if (!params.size) warnings.push('未识别到尺寸参数（如 0402, 0603）')
  if (!params.capacitance) warnings.push('未识别到容值参数（如 100nF, 10uF）')
  if (!params.voltage) warnings.push('未识别到电压参数（如 16V, 50V）')
  if (!params.tc) warnings.push('未识别到温度特性参数（如 X7R, C0G）')

  return { params, warnings, rawInput: input }
}

// ─── Normalizers ───────────────────────────────────────────────

function applyNormalizer(name: string, value: string): string | null {
  switch (name) {
    case 'normalizeSize': return normalizeSize(value)
    case 'normalizeCapacitance': return normalizeCapacitance(value)
    case 'normalizeVoltage': return normalizeVoltage(value)
    case 'normalizeTc': return normalizeTc(value)
    case 'normalizeTolerance': return normalizeTolerance(value)
    default: return value
  }
}

/**
 * Normalize size: accept "0402", "1005" (metric), "1.0x0.5mm"
 * Returns standard imperial 4-digit code
 */
function normalizeSize(value: string): string {
  const val = value.trim()
  // Already an imperial code
  if (/^\d{4}$/.test(val)) return val
  // Metric to imperial mapping
  const metricMap: Record<string, string> = {
    '0603': '0201', '1005': '0402', '1608': '0603',
    '2012': '0805', '3216': '1206', '3225': '1210',
    '4532': '1812', '5750': '2220'
  }
  if (metricMap[val]) return metricMap[val]
  return val
}

/**
 * Normalize capacitance to picofarads as a string
 * Accepts: "100nF", "10uF", "0.1uF", "22pF", "100000pF", "100"
 */
export function normalizeCapacitance(value: string): string {
  const val = value.trim().replace(/\s+/g, '')
  const match = val.match(/^(\d+(?:\.\d+)?)\s*([pPnNuUμ]?)\s*[Ff]?$/i)
  if (!match) return value

  const num = parseFloat(match[1])
  const unit = (match[2] || 'p').toLowerCase()

  let pF: number
  switch (unit) {
    case 'p': pF = num; break
    case 'n': pF = num * 1000; break
    case 'u':
    case 'μ':
    case 'µ': pF = num * 1_000_000; break
    default:
      // No unit specified, assume pF if >= 1, otherwise try to guess
      pF = num >= 1 ? num : num * 1_000_000
  }

  return pF.toString()
}

/**
 * Normalize voltage: "16V", "50V", "16", "50"
 * Returns numeric string
 */
function normalizeVoltage(value: string): string {
  const match = value.trim().match(/^(\d+(?:\.\d+)?)\s*V?$/i)
  return match ? match[1] : value
}

/**
 * Normalize TC code to standard form
 * Maps NP0 → C0G, COG → C0G
 */
function normalizeTc(value: string): string {
  const upper = value.trim().toUpperCase()
  const aliases: Record<string, string> = {
    'NP0': 'C0G',
    'COG': 'C0G',
    'X5R': 'X5R',
    'X6S': 'X6S',
    'X7R': 'X7R',
    'X7S': 'X7S',
    'X7T': 'X7T',
    'X8R': 'X8R',
    'Y5V': 'Y5V',
  }
  return aliases[upper] || upper
}

/**
 * Normalize tolerance: "±10%", "10%", "10", "K" → "10"
 */
function normalizeTolerance(value: string): string {
  const val = value.trim()
  // If it's already a letter code, convert back to percentage
  const codeToPercent: Record<string, string> = {
    'W': '0.05', 'B': '0.1', 'C': '0.25', 'D': '0.5',
    'F': '1', 'G': '2', 'J': '5', 'K': '10', 'M': '20', 'Z': '80'
  }
  const upper = val.toUpperCase()
  if (codeToPercent[upper]) return codeToPercent[upper]
  // Strip ± and %
  const match = val.match(/(\d+(?:\.\d+)?)/)
  return match ? match[1] : val
}
