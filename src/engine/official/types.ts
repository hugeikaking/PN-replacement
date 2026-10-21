/** Schema v1 emitted by Convert-MurataDatabase.ps1. Units are explicit; unknown values stay null. */
export interface NormalizedSpec {
  capacitancePf: number | null
  voltages: NormalizedVoltage[]
  sizeInch: string | null
  sizeMetric: string | null
  lengthMm: number | null
  widthMm: number | null
  thicknessMm: number | null
  thicknessMaxMm: number | null
  temperature: string | null
  temperatureStandard: string | null
  tolerance: { kind: 'percent' | 'absolute' | null; value: number | null; unit: '%' | 'pF' | null }
}

export interface NormalizedVoltage {
  type: 'DC' | 'AC'
  safetyClass: 'X1' | 'X2' | 'Y1' | 'Y2' | null
  valueV: number | null
  state: 'consistent' | 'review'
  sourceField: string
}

export interface NormalizationIssue {
  severity: 'warning' | 'error'
  code: string
  field: string
  rawValue: unknown
  textValue: unknown
}

export interface NormalizedMurataProduct {
  schemaVersion: 1
  manufacturer: 'murata'
  componentType: 'mlcc'
  partNo: string | null
  partNoWithoutPackageCode: string | null
  productName: string | null
  series: string | null
  /** Optional in schema v1: older files remain readable; raw enums stay raw. */
  classification?: {
    applicationRaw: unknown
    characteristicsRaw: unknown
    /** Added in v3.4; absent on older normalized files. */
    standardRaw?: unknown
    safetyCertificatesRaw?: unknown
  }
  spec: NormalizedSpec
  compliance: { aecQ200: boolean | null; rohsRaw: unknown; reachRaw: unknown }
  lifecycle: { rawStatus: string | null; category: 'active' | 'nrnd' | 'unknown'; newProductRaw: unknown }
  links: { datasheets: string[]; productDetail: string | null; verified: false }
  validation: {
    status: 'consistent' | 'review'
    issues: NormalizationIssue[]
    datasheetReviewed: false
    companyAccepted: false
  }
  auditReference: { file: 'normalization-audit.jsonl'; line: number }
  provenance: { sourcePath: string; sourceIndex: number }
}

export interface NormalizationAudit {
  partNo: string | null
  provenance: NormalizedMurataProduct['provenance']
  rawFields: Record<string, unknown>
  checks: Record<string, {
    state: 'absent' | 'consistent' | 'review'
    value: number | null
    fromText: number | null
    textNote: string | null
  }>
}
