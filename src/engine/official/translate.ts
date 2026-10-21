import type { KnowledgeRule } from '../../stores/knowledge'
import type { DecodeResult, DecodedPart } from '../decoder'
import { decodeCapacitance3Digit, decodeThickness3Digit, detectManufacturer } from '../decoder'
import type { ModeBRuleSet } from '../types'
import samsung from '../../rules/samsung/mlcc.json'
import tdk from '../../rules/tdk/mlcc.json'
import taiyo from '../../rules/taiyo-yuden/mlcc.json'
import type { OfficialCatalog } from './catalog'
import { matchOfficialProducts } from './matcher'
import type { OfficialMatchResult } from './matcher'
import { officialMissingFields, parseOfficialDescription } from './query'
import type { OfficialQuery, OfficialQueryParse } from './query'

export type OfficialTranslationMode = 'A' | 'B'
export interface OfficialTranslation {
  input: string
  mode: OfficialTranslationMode
  description: string
  decoded?: DecodeResult
  parsed?: OfficialQueryParse
  official?: OfficialMatchResult
  warnings: string[]
  errors: string[]
}

// Only these layouts have been calibrated in this project. Other legacy rules remain
// reference material; a guessed map must never drive official product selection.
const layouts: Record<string, { pattern: RegExp; rule: ModeBRuleSet; label: string }> = {
  samsung: { pattern: /^CL[A-Z0-9]{13}$/, rule: samsung as ModeBRuleSet, label: '三星' },
  tdk: { pattern: /^C\d{4}[A-Z0-9]{14}$/, rule: tdk as ModeBRuleSet, label: 'TDK' },
  'taiyo-yuden': { pattern: /^MS(?:AS|AR|BL|AY|RL)[A-Z0-9]{16}$/, rule: taiyo as ModeBRuleSet, label: '太阳诱电' },
}
const temperatureCodes = new Set(['C0G', 'X5R', 'X6S', 'X6T', 'X7R', 'X7S', 'X7T', 'X8R', 'Y5V'])
const keys = ['size', 'tc', 'capacitance', 'tolerance', 'voltage']
const displayNumber = (value: number) => Number(value.toPrecision(12))
const formatCap = (pF: number) => pF >= 1e6 ? `${displayNumber(pF / 1e6)}uF` : pF >= 1000 ? `${displayNumber(pF / 1000)}nF` : `${displayNumber(pF)}pF`

function queryFromParts(parts: DecodedPart[]): OfficialQueryParse {
  const value = (id: string) => parts.find(p => p.id === id)?.value
  // Keep vendor names/series/thickness out of the parameter parser. Explicitly
  // recognized TC is transferred as a condition, including C0H/U2J families.
  const parsed = parseOfficialDescription(['size', 'capacitance', 'tolerance', 'voltage'].map(id => value(id)).filter(Boolean).join(' '))
  if (value('tc')) parsed.query.temperature = value('tc')
  parsed.missingFields = officialMissingFields(parsed.query)
  return parsed
}

/** One route to real catalog products for both descriptions and decoded PNs. */
export function translateOfficialInput(input: string, mode: OfficialTranslationMode, catalog?: OfficialCatalog, knowledge: KnowledgeRule[] = [], limit = 20, applications?: OfficialQuery['applications'], aecQ200Characteristic = false): OfficialTranslation {
  const result: OfficialTranslation = { input, mode, description: '', warnings: [], errors: [] }
  if (mode === 'A') {
    result.parsed = parseOfficialDescription(input)
  } else {
    const pn = input.trim().toUpperCase()
    if (!pn || pn.length > 100 || !/^[A-Z0-9#-]+$/.test(pn)) {
      result.errors.push('请每行填写一个完整料号，不要混入说明文字')
      return result
    }
    // An exact catalog record takes precedence over any naming rule, even for
    // a Murata series not covered by the old prefix detector.
    const records = catalog?.records.filter(p => p.partNo?.toUpperCase() === pn) || []
    if (catalog?.blockedPartNumbers.has(pn)) {
      result.errors.push('该料号有重复或冲突记录，暂不能解析或推荐')
      return result
    }
    if (records.length === 1) {
      const p = records[0]; const s = p.spec
      const query: OfficialQuery = {}
      if (s.capacitancePf !== null) query.capacitancePf = s.capacitancePf
      if (s.sizeInch) query.size = { system: 'inch', code: s.sizeInch }
      else if (s.sizeMetric) query.size = { system: 'metric', code: s.sizeMetric }
      else if (s.lengthMm !== null && s.widthMm !== null) query.dimensions = { lengthMm: s.lengthMm, widthMm: s.widthMm }
      if (s.temperature) query.temperature = s.temperature
      if (s.tolerance.kind && s.tolerance.value !== null && s.tolerance.unit) query.tolerance = { kind: s.tolerance.kind, value: s.tolerance.value, unit: s.tolerance.unit }
      const verified = s.voltages.filter(v => v.state === 'consistent' && v.valueV !== null)
      // Never arbitrarily choose one of multiple safety/DC/AC ratings.
      if (verified.length === 1) query.voltage = { type: verified[0].type, safetyClass: verified[0].safetyClass, valueV: verified[0].valueV! }
      const voltageText = verified.map(v => `${v.safetyClass ? v.safetyClass + ' ' : ''}${v.valueV}V${v.type.toLowerCase()}`).join(' / ')
      const sizeText = s.sizeInch || s.sizeMetric || (query.dimensions ? `${s.lengthMm}x${s.widthMm}mm` : '尺寸待核查')
      result.description = ['村田 MLCC', sizeText, s.temperature, s.capacitancePf === null ? '容值待核查' : formatCap(s.capacitancePf), s.tolerance.value === null ? '' : `±${s.tolerance.value}${s.tolerance.unit}`, voltageText || '电压待核查'].filter(Boolean).join(' ')
      result.warnings.push('规格描述来自导入记录；规格书及公司选型验收仍需确认')
      if (p.validation.status === 'review') result.warnings.push(...p.validation.issues.map(x => `${x.field}：${x.code}`))
      if (verified.length !== 1) result.warnings.push(verified.length ? '存在多个电压额定值，未自动选取；候选仅作部分参数查询' : '原记录没有可核对电压，未按料号猜测')
      result.parsed = { query, missingFields: officialMissingFields(query), errors: [], warnings: [] }
    } else {
      const detected = detectManufacturer(pn)
      const layout = detected && layouts[detected.key]
      if (!layout || !layout.pattern.test(pn)) {
        const attachmentCount = knowledge.filter(r => r.manufacturer === detected?.key && r.fileType !== 'text').length
        result.errors.push(/^([A-Z]{2}K|TMK|JMK)/.test(pn) ? '太阳诱电旧料号暂未校准，请提供对应官方编码资料；不会套用 MSAS 规则' : '当前尚无该系列的已校准解析规则。村田料号需先导入包含该完整料号的规格记录')
        if (attachmentCount) result.warnings.push('已保存 PDF / 图片附件，但附件不会自动变成可执行的编码规则')
        return result
      }
      const parts: DecodedPart[] = []
      for (const seg of layout.rule.modeB.segments) {
        const code = pn.slice(seg.position, seg.position + seg.length)
        let value: string | undefined
        if (seg.fixed && code !== seg.fixed) result.errors.push(`${seg.label}编码与规则不符`)
        if (seg.map) value = Object.prototype.hasOwnProperty.call(seg.map, code) ? seg.map[code] : undefined
        else if (seg.decoder === 'capacitance3Digit') {
          // Multipliers 8/9 are not calibrated by this legacy decoder.
          if (/^(?:\d{2}[0-7]|\dR\d)$/.test(code)) value = decodeCapacitance3Digit(code) || undefined
          if (value && parseFloat(value) <= 0) value = undefined
        } else if (seg.decoder === 'thickness3Digit') value = decodeThickness3Digit(code) || undefined
        else if (seg.id === 'tc' && temperatureCodes.has(code)) value = code
        else if (!keys.includes(seg.id)) value = seg.fixed ? seg.description || code : code
        if (!value && keys.includes(seg.id)) result.errors.push(`${seg.label}编码 ${code} 尚未识别，未进行候选匹配`)
        else if (!value) result.warnings.push(`${seg.label}编码 ${code} 尚未识别；未作为匹配条件`)
        parts.push({ id: seg.id, position: seg.position, length: seg.length, code, label: seg.label, value: value || `未识别（${code}）` })
      }
      result.decoded = { success: !result.errors.length, input, manufacturer: detected!.key, manufacturerLabel: layout.label, matchedRules: [], decodedParts: parts }
      result.warnings.push('料号按项目现有结构化规则解析，不代表型号存在或在产；村田候选按基础参数查询，厚度与包装等不作为本步筛选条件，替代选型仍需核对完整规格')
      if (result.errors.length) return result
      result.description = `${layout.label} MLCC ${keys.map(id => parts.find(p => p.id === id)!.value).join(' ')}`
      result.parsed = queryFromParts(parts)
    }
  }
  if (!result.parsed) return result
  if (applications?.length) result.parsed.query.applications = [...applications]
  if (aecQ200Characteristic) {
    result.parsed.query.aecQ200Characteristic = true
    result.parsed.warnings.push('产品特点筛选：原记录 Specs.Characteristics 明确标记 AEC-Q200（不区分 Grade）')
    if (result.parsed.query.aecQ200 === false) result.parsed.errors.push('描述要求非 AEC-Q200，与已勾选的产品特点 AEC-Q200 冲突，请修改后查询')
  }
  result.errors.push(...result.parsed.errors)
  if (result.errors.length) return result
  if (catalog) result.official = matchOfficialProducts(catalog, result.parsed, limit, mode === 'A')
  else if (mode === 'A') result.errors.push('请先导入村田规格数据；当前不会拼接或猜测料号')
  else result.warnings.push('已解析规格描述。导入村田规格数据后，可继续查询官方候选料号')
  return result
}
