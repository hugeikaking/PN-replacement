/**
 * engine/builder.ts
 *
 * Assembles a final part number string by filling in a template
 * with matched segment codes, applying defaults for missing segments.
 */

import type { RuleSet, DecodedSegment } from './types'
import type { MatchResult } from './matcher'

/**
 * Build the final part number string from matched codes and defaults
 * @returns The assembled part number string
 */
export function buildPartNumber(
  codes: MatchResult,
  rule: RuleSet
): string {
  // Resolve the template: replace {segmentId} placeholders with codes or defaults
  let result = rule.modeA.template

  for (const segment of rule.modeA.segments) {
    const placeholder = `{${segment.id}}`
    let code = codes.get(segment.id)

    // If no code found, use default
    if (!code) {
      code = rule.modeA.defaults[segment.id] || ''
    }

    result = result.replace(placeholder, code)
  }

  // Remove any remaining un-filled placeholders
  result = result.replace(/\{[^}]+\}/g, '')

  return result
}

/**
 * Build a human-readable description from decoded segments
 */
export function buildDescription(
  segments: DecodedSegment[],
  _rule: RuleSet
): string {
  const parts: string[] = []

  for (const seg of segments) {
    if (seg.label && seg.value && seg.id !== 'series' && seg.id !== 'internal' && seg.id !== 'suffix') {
      parts.push(`${seg.label}: ${seg.value}`)
    }
  }

  return parts.join(', ')
}

/**
 * Verify that the built part number matches the expected length from the template
 * (A basic sanity check)
 */
export function validatePartNumber(pn: string, rule: RuleSet): boolean {
  const expectedLength = rule.modeA.segments.reduce(
    (sum, seg) => sum + seg.length,
    0
  )
  // Allow some flexibility (±2) due to optional suffix segments
  return Math.abs(pn.length - expectedLength) <= 3
}
