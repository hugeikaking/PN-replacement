/**
 * stores/translation.ts
 *
 * Pinia store for translation state, history, and preferences.
 * Supports both single and multi-description translation.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TranslationResult, RuleSet } from '@/engine/types'
import { translateDescription } from '@/engine/index'
import { decodePartNumber } from '@/engine/decoder'
import type { DecodeResult } from '@/engine/decoder'
import { useKnowledgeStore } from '@/stores/knowledge'
import murataMlcc from '@/rules/murata/mlcc.json'

const murataMlccRule = murataMlcc as RuleSet

export type TranslationMode = 'A' | 'B'

export interface HistoryItem {
  id: string
  timestamp: number
  mode: TranslationMode
  input: string
  results: TranslationResult[]
}

export const useTranslationStore = defineStore('translation', () => {
  // ─── State ───────────────────────────────────────────
  const currentMode = ref<TranslationMode>('A')
  const currentInput = ref('')
  const selectedComponentType = ref('mlcc')
  const currentResults = ref<TranslationResult[]>([])
  const isTranslating = ref(false)
  const history = ref<HistoryItem[]>([])
  const maxHistory = 50

  // ─── Getters ─────────────────────────────────────────
  const hasResult = computed(() => currentResults.value.length > 0)
  const resultCount = computed(() => currentResults.value.length)
  const hasError = computed(() => currentResults.value.some(r => !r.success))

  /** First result (backward compat) */
  const firstResult = computed(() => currentResults.value[0] || null)
  const resultPartNumber = computed(() => firstResult.value?.partNumber || '')
  const resultSegments = computed(() => firstResult.value?.segments || [])
  const resultWarnings = computed(() => firstResult.value?.warnings || [])

  const recentHistory = computed(() => history.value.slice(0, 20))

  // ─── Input splitting ─────────────────────────────────
  /**
   * Split input text into individual descriptions.
   * Splits by newline, trims each line, filters empty lines.
   */
  function splitInputs(text: string): string[] {
    return text
      .split(/\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0)
  }

  /**
   * Build a concise material description summary for a Mode B decode result,
   * e.g. "三星 MLCC 0603 X7R 100nF ±10% 16V".
   */
  function buildModeBSummary(r: DecodeResult): string {
    const shortMfr = r.manufacturerLabel.replace(/\s*\(.*\)\s*$/, '').trim() || r.manufacturerLabel
    const keyOrder = ['size', 'tc', 'capacitance', 'tolerance', 'voltage']
    const values: string[] = []
    for (const key of keyOrder) {
      const part = r.decodedParts.find(p => p.id === key)
      if (part && part.value && part.value !== part.code) {
        values.push(part.value)
      }
    }
    if (values.length > 0) {
      return `${shortMfr} MLCC ${values.join(' ')}`
    }
    const compLabel = r.matchedRules.length > 0
      ? r.matchedRules.map(x => x.componentLabel).join('/')
      : '未知类型'
    return `${shortMfr} ${compLabel}`
  }

  // ─── Actions ─────────────────────────────────────────
  function setMode(mode: TranslationMode) {
    currentMode.value = mode
    currentResults.value = []
    currentInput.value = ''
  }

  function setInput(text: string) {
    currentInput.value = text
  }

  function setComponentType(type: string) {
    selectedComponentType.value = type
  }

  async function translate() {
    const lines = splitInputs(currentInput.value)
    if (lines.length === 0) return

    isTranslating.value = true
    const results: TranslationResult[] = []

    try {
      for (const line of lines) {
        if (currentMode.value === 'A') {
          const result = translateDescription(line, murataMlccRule)
          results.push(result)
        } else {
          // Mode B: decode using knowledge base
          const kbStore = useKnowledgeStore()
          const decodeResult = decodePartNumber(line, undefined, kbStore.rules)

          if (decodeResult.success) {
            // Convert DecodeResult to TranslationResult format for unified display
            results.push({
              success: true,
              input: line,
              partNumber: buildModeBSummary(decodeResult),
              segments: decodeResult.decodedParts.map(p => ({
                id: p.id || `pos${p.position}`,
                label: p.label,
                labelEn: p.label,
                code: p.code,
                value: p.value,
              })),
              warnings: decodeResult.decodedParts.length === 0 && decodeResult.matchedRules.length === 0
                ? [`未找到 ${decodeResult.manufacturerLabel} 的编码规则，请前往知识库添加。`]
                : [],
            })
          } else {
            results.push({
              success: false,
              input: line,
              partNumber: '',
              segments: [],
              warnings: [],
              error: decodeResult.error || '解码失败',
            })
          }
        }
      }

      currentResults.value = results

      // Add to history
      const item: HistoryItem = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        timestamp: Date.now(),
        mode: currentMode.value,
        input: currentInput.value,
        results,
      }
      history.value.unshift(item)

      if (history.value.length > maxHistory) {
        history.value = history.value.slice(0, maxHistory)
      }

      persistHistory()
    } catch (e) {
      currentResults.value = [{
        success: false,
        input: currentInput.value,
        partNumber: '',
        segments: [],
        warnings: [],
        error: e instanceof Error ? e.message : '翻译过程中发生未知错误',
      }]
    } finally {
      isTranslating.value = false
    }
  }

  function clearResult() {
    currentResults.value = []
    currentInput.value = ''
  }

  function clearHistory() {
    history.value = []
    localStorage.removeItem('pn-translator-history')
  }

  function persistHistory() {
    try {
      const data = JSON.stringify(history.value.slice(0, 50))
      localStorage.setItem('pn-translator-history', data)
    } catch { /* ignore */ }
  }

  function loadHistory() {
    try {
      const data = localStorage.getItem('pn-translator-history')
      if (data) {
        history.value = JSON.parse(data)
      }
    } catch { /* ignore */ }
  }

  loadHistory()

  return {
    currentMode,
    currentInput,
    selectedComponentType,
    currentResults,
    isTranslating,
    history,
    hasResult,
    hasError,
    resultCount,
    firstResult,
    resultPartNumber,
    resultSegments,
    resultWarnings,
    recentHistory,
    setMode,
    setInput,
    setComponentType,
    translate,
    clearResult,
    clearHistory,
  }
})
