import type { NormalizedVoltage } from './types'
import type { ApplicationCategory } from './classification'

export interface OfficialQuery {
  capacitancePf?: number
  voltage?: { valueV?: number; type: NormalizedVoltage['type']; safetyClass: NormalizedVoltage['safetyClass'] }
  size?: { system: 'inch' | 'metric'; code: string }
  dimensions?: { lengthMm: number; widthMm: number }
  maxHeightMm?: number
  temperature?: string
  tolerance?: { kind: 'percent' | 'absolute'; value: number; unit: '%' | 'pF' }
  aecQ200?: boolean
  aecQ200Characteristic?: true
  series?: string
  applications?: ApplicationCategory[]
  unverifiedRequirements?: string[]
}

export interface OfficialQueryParse {
  query: OfficialQuery
  missingFields: string[]
  warnings: string[]
  errors: string[]
}

export function officialMissingFields(query: OfficialQuery): string[] {
  return [query.capacitancePf === undefined ? '容值' : '', query.voltage?.valueV === undefined ? '电压' : '', !query.size && !query.dimensions ? '尺寸' : '', ...(query.unverifiedRequirements || []).map(term => `${term}（含义待确认）`)].filter(Boolean)
}

/** Strict, unit-aware parser: ambiguous or unsupported text never becomes an exact query. */
export function parseOfficialDescription(input: string): OfficialQueryParse {
  const query: OfficialQuery = {}
  const errors: string[] = []
  const warnings: string[] = []
  let rest = input.trim().replace(/[µμ]/g, 'u').replace(/[，；]/g, ';').replace(/[（]/g, '(').replace(/[）]/g, ')')
  if (rest.length > 2000) return { query, missingFields: [], warnings, errors: ['单条描述最多 2000 个字符'] }
  // Manufacturer labels emitted by mode B identify the source, not a Murata
  // filtering condition. Only allow known labels directly before MLCC.
  rest = rest.replace(/^(?:三星|太阳诱电|TDK|Samsung|Taiyo[\s-]+Yuden)\s+(?=MLCC\b)/i, '')
  const n = '(?:[0-9]+|[0-9]{1,3}(?:,[0-9]{3})+)(?:\\.[0-9]+)?|\\.[0-9]+'
  const bounded = (body: string) => new RegExp(`(?<![A-Za-z0-9_.+,/\\-])(?:${body})(?![A-Za-z0-9_.])`, 'gi')
  const number = (s: string) => Number(s.replace(/,/g, ''))
  const scales: Record<string, number> = { pf: 1, nf: 1000, uf: 1e6, f: 1e12 }
  const set = <K extends keyof OfficialQuery>(key: K, value: OfficialQuery[K], label: string) => {
    if (query[key] !== undefined && JSON.stringify(query[key]) !== JSON.stringify(value)) errors.push(`${label}存在多个不同值，请每行填写一个物料`)
    else query[key] = value
  }
  const scan = (regex: RegExp, consume: (match: RegExpMatchArray) => void) => {
    for (const match of rest.matchAll(regex)) consume(match)
    rest = rest.replace(regex, match => ' '.repeat(match.length))
  }
  scan(bounded(`H\\s*(${n})\\s*mm`), m => {
    const value = number(m[1])
    if (!Number.isFinite(value) || value <= 0) errors.push('最大允许高度必须是带 mm 单位的正数')
    else set('maxHeightMm', value, '最大允许高度')
  })
  scan(bounded(`(${n})\\s*(?:x|×|\\*)\\s*(${n})\\s*mm`), m => {
    const lengthMm = number(m[1]); const widthMm = number(m[2])
    if (!(lengthMm > 0 && widthMm > 0 && Number.isFinite(lengthMm + widthMm))) errors.push('实际尺寸必须是正数')
    else set('dimensions', { lengthMm, widthMm }, '实际尺寸')
  })
  scan(bounded(`(?:±|\\+/-)\\s*(${n})\\s*(%|pF|nF|uF)`), m => {
    const value = number(m[1]) * (m[2] === '%' ? 1 : scales[m[2].toLowerCase()])
    if (!Number.isFinite(value) || value <= 0) errors.push('精度必须是正数')
    else set('tolerance', { kind: m[2] === '%' ? 'percent' : 'absolute', value, unit: m[2] === '%' ? '%' : 'pF' }, '精度')
  })
  scan(bounded(`(${n})\\s*%`), m => {
    const value = number(m[1])
    if (!(value > 0) || !Number.isFinite(value)) errors.push('精度必须是正数')
    else set('tolerance', { kind: 'percent', value, unit: '%' }, '精度')
  })
  scan(bounded(`(${n})\\s*(pF|nF|uF|F)`), m => {
    const value = number(m[1]) * scales[m[2].toLowerCase()]
    if (!Number.isFinite(value) || value <= 0) errors.push('容值必须是带单位的正数')
    else set('capacitancePf', value, '容值')
  })
  let genericVoltage = false
  scan(bounded(`(${n})\\s*V\\s*(dc|ac)?`), m => {
    const valueV = number(m[1])
    if (!Number.isFinite(valueV) || valueV <= 0) errors.push('电压必须是正数')
    else {
      if (!m[2]) genericVoltage = true
      set('voltage', { valueV, type: m[2]?.toUpperCase() === 'AC' ? 'AC' : 'DC', safetyClass: null }, '电压')
    }
  })
  const safety = new Set<string>()
  scan(/\b(X1|X2|Y1|Y2)\b/gi, m => safety.add(m[1].toUpperCase()))
  if (safety.size > 1) errors.push('一次查询只指定一种安规类别和电压')
  if (safety.size === 1) {
    if (!query.voltage || genericVoltage) errors.push('安规查询请明确电压和类型，如 X1 440Vac')
    else query.voltage.safetyClass = [...safety][0] as NormalizedVoltage['safetyClass']
  }
  if (genericVoltage) warnings.push('未标 AC/DC 的 V 按普通直流 DC 查询；安规电压请明确指定')
  scan(bounded('CH([0-9]{4,6})'), m => set('size', { system: 'inch', code: m[1] }, '封装'))
  scan(/(?:公制|metric)\s*([0-9]{4,6})(?:M)?\b|\b([0-9]{4,6})M\b/gi, m => set('size', { system: 'metric', code: m[1] || m[2] }, '封装'))
  scan(/\b([0-9]{4,6})\b/g, m => set('size', { system: 'inch', code: m[1] }, '封装'))
  scan(/\b(X5R|X6S|X6T|X7R|X7S|X7T|X8R|C0G|C0H|C0J|C0K|U2J|U2K|COG|NP0|Y5V|SL)\b/gi, m => {
    const value = m[1].toUpperCase()
    set('temperature', ['COG', 'NP0'].includes(value) ? 'C0G' : value, '温度特性')
  })
  scan(/非车规|工规|车规|AEC\s*-?\s*Q200/gi, m => set('aecQ200', !['非车规', '工规'].includes(m[0]), '车规要求'))
  scan(/\b(GRM|GCM|KRM|DK1|GCB|GA2|GA3)\b/gi, m => set('series', m[1].toUpperCase(), '系列'))
  scan(bounded('RO'), () => { query.unverifiedRequirements = ['RO'] })
  if (query.unverifiedRequirements?.length) warnings.push('RO 含义待确认，未推断为 RoHS 或其他认证；以下仅为已识别参数的候选，不属于全部条件已核对的精确匹配')
  if (query.maxHeightMm !== undefined) warnings.push(`H${query.maxHeightMm}mm 表示最大允许高度；仅匹配目录最大厚度不超过该值的记录，缺少最大厚度时不判定满足高度要求`)
  rest = rest.replace(/\b(?:MLCC|CAP|capacitor|Murata)\b|贴片电容|陶瓷电容|电容|村田|英制|inch/gi, ' ')
  const unknown = rest.replace(/[\s;,()]/g, '')
  if (unknown) errors.push(`暂不能识别：${unknown}。请填写带单位的参数，不能混入其他描述`)
  if (Object.keys(query).filter(key => key !== 'unverifiedRequirements').length === 0 && errors.length === 0) errors.push('至少填写一个可识别参数')
  const missingFields = officialMissingFields(query)
  if (query.size?.system === 'inch') warnings.push('未标公制的封装代码按英制查询；公制请写 1005M 或“公制 1005”')
  if (missingFields.length) warnings.push(`缺少或待确认：${missingFields.join('、')}；仅按已识别条件搜索，不属于精确匹配`)
  return { query, missingFields, warnings, errors: [...new Set(errors)] }
}
