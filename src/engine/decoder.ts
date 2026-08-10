/**
 * engine/decoder.ts
 *
 * Mode B: Part Number → Description decoding engine.
 * Uses knowledge base rules to break down competitor part numbers.
 */

import type { KnowledgeRule } from '@/stores/knowledge'

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
 * Attempt to decode a part number using knowledge base rules.
 * This is a heuristic approach - it uses the text descriptions
 * to provide contextual information about the numbering system.
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

  // Find matching rules
  const matchedRules = findMatchingRules(mfrKey, undefined, allRules)

  // Try to extract basic pattern info from text rules
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
