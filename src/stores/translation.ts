import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { TranslationResult } from '@/engine/types'
import { translateOfficialInput } from '@/engine/official/translate'
import type { OfficialTranslation } from '@/engine/official/translate'
import type { OfficialMatchResult } from '@/engine/official/matcher'
import { useKnowledgeStore } from '@/stores/knowledge'
import { useOfficialStore } from '@/stores/official'

export type TranslationMode = 'A' | 'B'
export interface IntegratedResult extends TranslationResult { official?: OfficialMatchResult }
export interface HistoryItem { id: string; timestamp: number; mode: TranslationMode; input: string; results: IntegratedResult[] }

export const useTranslationStore = defineStore('translation', () => {
  const currentMode = ref<TranslationMode>('A')
  const currentInput = ref('')
  const selectedComponentType = ref('mlcc')
  const currentResults = ref<IntegratedResult[]>([])
  const drafts: Record<TranslationMode, { input: string; results: IntegratedResult[] }> = {
    A: { input: '', results: [] }, B: { input: '', results: [] },
  }
  const isTranslating = ref(false)
  // Official records and query history stay in memory; do not reload old assembled
  // PNs from localStorage as if they had passed official verification.
  const history = ref<HistoryItem[]>([])
  const hasResult = computed(() => currentResults.value.length > 0)
  const resultCount = computed(() => currentResults.value.length)
  const hasError = computed(() => currentResults.value.some(r => !r.success))
  const firstResult = computed(() => currentResults.value[0] || null)
  const resultPartNumber = computed(() => firstResult.value?.partNumber || '')
  const resultSegments = computed(() => firstResult.value?.segments || [])
  const resultWarnings = computed(() => firstResult.value?.warnings || [])
  const recentHistory = computed(() => history.value.slice(0, 20))

  function setMode(mode: TranslationMode) {
    drafts[currentMode.value] = { input: currentInput.value, results: currentResults.value }
    currentMode.value = mode; currentInput.value = drafts[mode].input; currentResults.value = drafts[mode].results
  }
  function setInput(text: string) { currentInput.value = text }
  function setComponentType(type: string) { selectedComponentType.value = type }
  function acceptResults(translated: OfficialTranslation[], mode: TranslationMode = currentMode.value) {
    const results = translated.map(r => ({
      success: !r.errors.length && !r.official?.errors.length, input: r.input,
      partNumber: r.mode === 'B' ? r.description : r.official?.matches.map(x => x.product.partNo).join('\n') || '',
      segments: r.decoded?.decodedParts.map(p => ({ id: p.id || `pos${p.position}`, label: p.label, labelEn: p.label, code: p.code, value: p.value })) || [],
      warnings: [...r.warnings, ...(r.official?.warnings || [])],
      error: [...r.errors, ...(r.official?.errors || [])].join('；') || undefined,
      official: r.official,
    }))
    drafts[mode].results = results
    if (mode === currentMode.value) currentResults.value = results
    history.value.unshift({ id: Date.now().toString(36), timestamp: Date.now(), mode, input: translated.map(r => r.input).join('\n'), results })
    history.value = history.value.slice(0, 50)
  }
  async function translate() {
    const lines = currentInput.value.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
    if (!lines.length) return
    isTranslating.value = true
    try {
      if (lines.length > 100) throw new Error('一次最多处理 100 行')
      if (selectedComponentType.value !== 'mlcc') throw new Error('当前官方查询仅支持 MLCC')
      acceptResults(lines.map(line => translateOfficialInput(line, currentMode.value, useOfficialStore().catalog, useKnowledgeStore().rules)))
    } catch (e) {
      currentResults.value = [{ success: false, input: currentInput.value, partNumber: '', segments: [], warnings: [], error: e instanceof Error ? e.message : '翻译失败' }]
    } finally { isTranslating.value = false }
  }
  function clearResult(mode: TranslationMode = currentMode.value) {
    drafts[mode] = { input: '', results: [] }
    if (mode === currentMode.value) { currentResults.value = []; currentInput.value = '' }
  }
  function clearHistory() { history.value = [] }
  return { currentMode, currentInput, selectedComponentType, currentResults, isTranslating, history, hasResult, hasError, resultCount, firstResult, resultPartNumber, resultSegments, resultWarnings, recentHistory, setMode, setInput, setComponentType, translate, acceptResults, clearResult, clearHistory }
})
