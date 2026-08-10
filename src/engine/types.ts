/**
 * engine/types.ts
 *
 * TypeScript type definitions for rule sets and engine data structures.
 */

/** A single segment (field) in a part number */
export interface Segment {
  id: string
  position: number
  length: number
  label?: string
  labelEn?: string
  description?: string
  fixed?: string                     // Always this value
  refTable?: string                  // Reference table name (e.g. "size-codes")
  refKey?: string                    // Sub-key in ref table (e.g. "murata")
  computed?: boolean                 // Programmatically computed
  computedFrom?: string              // Which param this reads from
  formatter?: string                 // Formatter function name
  options?: Record<string, string>   // Inline key-value options
}

/** Parser pattern definition */
export interface ParserPattern {
  regex: string
  param: string
  priority?: number
  description?: string
}

/** Mode A: Description → Part Number rules */
export interface ModeARules {
  template: string
  segments: Segment[]
  defaults: Record<string, string>
}

/** Parser rules */
export interface ParserRules {
  patterns: ParserPattern[]
  normalizers?: Record<string, string>
}

/** Complete rule set for one manufacturer + component type */
export interface RuleSet {
  manufacturer: string
  componentType: string
  displayName?: string
  displayNameEn?: string
  description?: string
  componentKeywords: string[]
  modeA: ModeARules
  parser: ParserRules
}

/** A decoded segment with its human-readable value */
export interface DecodedSegment {
  id: string
  label: string
  labelEn: string
  code: string          // The code from the part number
  value: string         // Human-readable decoded value
}

/** Result of Mode A translation */
export interface TranslationResult {
  success: boolean
  input: string
  partNumber: string
  segments: DecodedSegment[]
  warnings: string[]
  error?: string
}
