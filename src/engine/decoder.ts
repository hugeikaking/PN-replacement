/**
 * engine/decoder.ts
 *
 * Mode B: Part Number → Description decoding engine.
 * Uses built-in structured rule sets (JSON) to break down competitor part numbers
 * field-by-field, with knowledge-base text rules as a fallback.
 */

import type { KnowledgeRule } from '@/stores/knowledge'
import type { ModeBRuleSet, ModeBSegment } from './types'
import samsungMlcc from '../rules/samsung/mlcc.json'

export interface DecodeResult {
  success: boolean
  input: string
  manufacturer: string
  manufacturerLabel: string
  matchedRules: KnowledgeRule[]
  decodedParts: DecodedPart[]
  error?: string
}

export interface DecodedPart {
  id?: string            // Segment id (e.g. "size", "tc"); absent for heuristic fallback
  position: number
  length: number
  code: string
  label: string
  value: string
}

/**
 * Manufacturer PN prefix patterns for auto-detection.
 * Each manufacturer has unique prefix patterns.
 */
const MFR_PATTERNS: Record<string, { regex: RegExp; label: string }> = {
  'samsung': { regex: /^CL/i, label: '三星 (Samsung)' },
  'tdk': { regex: /^C\d{3}|^CGA|^CEU/i, label: 'TDK' },
  'taiyo-yuden': { regex: /^[A-Z]{2}K|^TMK|^JMK/i, label: '太阳诱电 (Taiyo Yuden)' },
  'yageo': { regex: /^CC\d{3}|^RC\d{3}|^AC\d{3}/i, label: '国巨 (Yageo)' },
  'walsin': { regex: /^WR|^WF|^WL/i, label: '华新科 (Walsin)' },
  'murata': { regex: /^GRM|^GCM|^GRT|^LQM|^BLM/i, label: '村田 (Murata)' },
}

/**
 * Built-in structured Mode B rule sets, keyed by `${manufacturer}/${componentType}`.
 * These provide reliable field-by-field decoding for known part numbering systems.
 */
const BUILTIN_MODE_B_RULES: Record<string, ModeBRuleSet> = {
  'samsung/mlcc': samsungMlcc as ModeBRuleSet,
}

/**
 * Auto-detect manufacturer from part number prefix
 */
export function detectManufacturer(pn: string): { key: string; label: string } | null {
  for (const [key, { regex, label }] of Object.entries(MFR_PATTERNS)) {
    if (regex.test(pn.trim())) {
      return { key, label }
    }
  }
  return null
}

/**
 * Find matching knowledge base rules for a given manufacturer and component type
 */
export function findMatchingRules(
  mfr: string,
  componentType?: string,
  allRules?: KnowledgeRule[]
): KnowledgeRule[] {
  if (!allRules || allRules.length === 0) return []
  return allRules.filter(r => {
    if (r.manufacturer !== mfr) return false
    if (componentType && r.componentType !== componentType) return false
    return true
  })
}

/**
 * Decode a part number into its constituent parts.
 *
 * Priority:
 *   1. Built-in structured rule sets (reliable field-by-field decoding)
 *   2. Knowledge base text rules (heuristic fallback)
 */
export function decodePartNumber(
  pn: string,
  manufacturerHint?: string,
  allRules?: KnowledgeRule[]
): DecodeResult {
  const trimmed = pn.trim()
  if (!trimmed) {
    return { success: false, input: pn, manufacturer: '', manufacturerLabel: '', matchedRules: [], decodedParts: [], error: '请输入料号' }
  }

  // Auto-detect manufacturer
  const detected = detectManufacturer(trimmed)
  const mfrKey = manufacturerHint || detected?.key || ''
  const mfrLabel = detected?.label || manufacturerHint || ''

  if (!mfrKey) {
    return {
      success: false,
      input: pn,
      manufacturer: '',
      manufacturerLabel: '',
      matchedRules: [],
      decodedParts: [],
      error: '无法识别该料号的制造商。请确认料号格式，或在知识库中添加该厂家的编码规则。'
    }
  }

  // 1. Try built-in structured rules first
  const builtinRule = findBuiltinModeBRule(mfrKey)
  if (builtinRule) {
    const decodedParts = decodeWithRuleSet(trimmed, builtinRule)
    return {
      success: true,
      input: pn,
      manufacturer: mfrKey,
      manufacturerLabel: mfrLabel,
      matchedRules: [],
      decodedParts,
    }
  }

  // 2. Fallback to knowledge base text rules (heuristic)
  const matchedRules = findMatchingRules(mfrKey, undefined, allRules)
  const decodedParts = extractPartsFromRules(trimmed, matchedRules)

  return {
    success: true,
    input: pn,
    manufacturer: mfrKey,
    manufacturerLabel: mfrLabel,
    matchedRules,
    decodedParts,
  }
}

/**
 * Resolve a built-in Mode B rule set for a manufacturer.
 * Component type is currently inferred as `mlcc` for Samsung (CL prefix).
 */
function findBuiltinModeBRule(mfrKey: string): ModeBRuleSet | null {
  const key = `${mfrKey}/mlcc`
  return BUILTIN_MODE_B_RULES[key] || null
}

/**
 * Slice the part number into segments according to the rule set,
 * decoding each code into its human-readable value.
 */
function decodeWithRuleSet(pn: string, rule: ModeBRuleSet): DecodedPart[] {
  const parts: DecodedPart[] = []

  for (const seg of rule.modeB.segments) {
    // Skip segments that extend beyond the part number length
    if (seg.position + seg.length > pn.length) continue

    const code = pn.slice(seg.position, seg.position + seg.length)
    parts.push({
      id: seg.id,
      position: seg.position,
      length: seg.length,
      code,
      label: seg.label,
      value: decodeSegmentValue(seg, code),
    })
  }

  return parts
}

/**
 * Decode a single segment code into its human-readable value.
 */
function decodeSegmentValue(seg: ModeBSegment, code: string): string {
  // Fixed code (e.g. series "CL")
  if (seg.fixed) {
    return seg.description || seg.label
  }

  // Special decoder (e.g. capacitance 3-digit code)
  if (seg.decoder) {
    const value = applyDecoder(seg.decoder, code)
    if (value) return value
  }

  // Inline code → value map
  if (seg.map && seg.map[code]) {
    return seg.map[code]
  }

  // Unknown code: return it as-is
  return code
}

/**
 * Apply a named decoder to a code.
 */
function applyDecoder(name: string, code: string): string | null {
  switch (name) {
    case 'capacitance3Digit':
      return decodeCapacitance3Digit(code)
    default:
      return null
  }
}

/**
 * Decode a 3-digit EIA capacitance code (e.g. "104" → "100nF", "1R5" → "1.5pF").
 */
export function decodeCapacitance3Digit(code: string): string | null {
  // R notation: "1R5" = 1.5pF
  if (/^\dR\d$/.test(code)) {
    const [intPart, decPart] = code.split('R')
    return `${parseFloat(`${intPart}.${decPart}`)}pF`
  }

  // 3-digit code: first 2 digits = significant figures, 3rd = multiplier
  if (!/^\d{3}$/.test(code)) return null

  const sig = parseInt(code.slice(0, 2), 10)
  const mult = parseInt(code[2], 10)
  const pF = sig * Math.pow(10, mult)
  return formatCapacitanceValue(pF)
}

/** Format a pF value as a human-readable capacitance string. */
function formatCapacitanceValue(pF: number): string {
  if (pF >= 1_000_000) return `${trimNum(pF / 1_000_000)}uF`
  if (pF >= 1_000) return `${trimNum(pF / 1_000)}nF`
  return `${trimNum(pF)}pF`
}

function trimNum(n: number): string {
  return Number.isInteger(n) ? String(n) : String(parseFloat(n.toFixed(4)))
}

/**
 * Heuristic part extraction from text rule descriptions.
 * Parses the text description to find segment definitions
 * like "CL=系列, 10=0603, B=X7R".
 */
function extractPartsFromRules(pn: string, rules: KnowledgeRule[]): DecodedPart[] {
  const parts: DecodedPart[] = []

  for (const rule of rules) {
    if (rule.fileType !== 'text') continue

    // Try to parse structured patterns from the description
    // Pattern: "XX=YY" or "XX=YY, AA=BB" or "XX → YY"
    const segmentPatterns = rule.description.match(/([A-Z0-9]{1,4})\s*[=＝→]\s*([^,，\n]+)/g)
    if (segmentPatterns) {
      for (const segStr of segmentPatterns) {
        const segMatch = segStr.match(/([A-Z0-9]{1,4})\s*[=＝→]\s*(.+)/)
        if (segMatch && pn.includes(segMatch[1])) {
          parts.push({
            position: pn.indexOf(segMatch[1]),
            length: segMatch[1].length,
            code: segMatch[1],
            label: segMatch[2].trim(),
            value: segMatch[2].trim(),
          })
        }
      }
    }

    // Also try to find the PN itself mentioned in the description
    if (rule.description.includes(pn)) {
      // The description contains an example of this exact PN
      // Extract the surrounding explanatory text
      const idx = rule.description.indexOf(pn)
      const context = rule.description.slice(Math.max(0, idx - 20), idx + pn.length + 100)
      if (parts.length === 0) {
        parts.push({
          position: 0,
          length: pn.length,
          code: pn,
          label: '参考描述',
          value: context.replace(/\n/g, ' ').slice(0, 80) + '...',
        })
      }
    }
  }

  return parts
}
