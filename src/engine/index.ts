/**
 * engine/index.ts
 *
 * Translation engine entry point.
 * Dispatches to Mode A (Description → Part Number) or Mode B (Part Number → Description).
 */

import type { RuleSet, TranslationResult } from './types'
import { parseDescription } from './parser'
import { matchParams } from './matcher'
import { buildPartNumber, buildDescription, validatePartNumber } from './builder'

/**
 * Mode A: Translate a component description to a Murata part number
 */
export function translateDescription(
  input: string,
  rule: RuleSet
): TranslationResult {
  // 1. Parse description into structured parameters
  const parseResult = parseDescription(input, rule)

  if (!parseResult.params.capacitance && !parseResult.params.size) {
    return {
      success: false,
      input,
      partNumber: '',
      segments: [],
      warnings: parseResult.warnings,
      error: '未能从描述中识别出有效参数。请检查输入格式，例如：0402 100nF 16V X7R 10%',
    }
  }

  // 2. Match parameters to manufacturer codes
  const matchResult = matchParams(parseResult.params, rule)

  // 3. Build the part number string
  const partNumber = buildPartNumber(matchResult.codes, rule)

  // 4. Validate
  const valid = validatePartNumber(partNumber, rule)

  return {
    success: valid,
    input,
    partNumber,
    segments: matchResult.decoded,
    warnings: [...parseResult.warnings, ...matchResult.warnings],
  }
}

/**
 * Load a rule set by manufacturer and component type
 *
 * Currently uses static imports. In the future, this can be extended
 * to support dynamic loading, SimSurfing API integration, etc.
 */
export async function loadRule(
  manufacturer: string,
  componentType: string
): Promise<RuleSet | null> {
  try {
    // Static imports for known rule sets
    // As we add more rules, extend this registry
    const ruleMap: Record<string, () => Promise<RuleSet>> = {
      'murata/mlcc': () => import('../rules/murata/mlcc.json').then(m => m.default as RuleSet),
    }

    const key = `${manufacturer}/${componentType}`
    if (ruleMap[key]) {
      return await ruleMap[key]()
    }
    return null
  } catch {
    return null
  }
}

/**
 * Re-export for convenience
 */
export { parseDescription } from './parser'
export type { ParsedParams } from './parser'
export { matchParams } from './matcher'
export { buildPartNumber, buildDescription } from './builder'
export * from './types'
