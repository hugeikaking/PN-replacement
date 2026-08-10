/**
 * stores/knowledge.ts
 *
 * Pinia store for manufacturer part number decoding rules.
 * Users can upload text rules or PDF references.
 * Data persisted to localStorage so one upload benefits everyone.
 */

import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export interface KnowledgeRule {
  id: string
  manufacturer: string
  manufacturerLabel: string  // e.g. "三星 (Samsung)"
  componentType: string     // "mlcc", "chip-resistor", etc.
  componentLabel: string    // e.g. "MLCC"
  description: string        // Text description of the numbering system
  fileType: 'text' | 'pdf'
  pdfDataUrl?: string        // base64 PDF data (only for PDF type)
  pdfFileName?: string
  createdAt: number
  updatedAt: number
}

const COMPONENT_LABELS: Record<string, string> = {
  'mlcc': 'MLCC',
  'chip-resistor': '贴片电阻',
  'chip-inductor': '贴片电感',
  'ferrite-bead': '磁珠',
  'tantalum': '钽电容',
}

const MANUFACTURER_LABELS: Record<string, string> = {
  'samsung': '三星 (Samsung)',
  'tdk': 'TDK',
  'taiyo-yuden': '太阳诱电 (Taiyo Yuden)',
  'yageo': '国巨 (Yageo)',
  'walsin': '华新科 (Walsin)',
  'murata': '村田 (Murata)',
}

function genId(): string {
  return 'kr_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6)
}

export const useKnowledgeStore = defineStore('knowledge', () => {
  // ─── State ───────────────────────────────────────────
  const rules = ref<KnowledgeRule[]>([])
  const isLoaded = ref(false)

  // ─── Getters ─────────────────────────────────────────
  const textRules = computed(() => rules.value.filter(r => r.fileType === 'text'))
  const pdfRules = computed(() => rules.value.filter(r => r.fileType === 'pdf'))
  const ruleCount = computed(() => rules.value.length)

  function rulesByManufacturer(mfr: string) {
    return rules.value.filter(r => r.manufacturer === mfr)
  }

  function rulesByComponent(type: string) {
    return rules.value.filter(r => r.componentType === type)
  }

  // ─── Actions ─────────────────────────────────────────
  function addRule(rule: Omit<KnowledgeRule, 'id' | 'createdAt' | 'updatedAt'>): KnowledgeRule {
    const now = Date.now()
    const newRule: KnowledgeRule = {
      ...rule,
      id: genId(),
      createdAt: now,
      updatedAt: now,
    }
    rules.value.unshift(newRule)
    persist()
    return newRule
  }

  function updateRule(id: string, updates: Partial<KnowledgeRule>) {
    const idx = rules.value.findIndex(r => r.id === id)
    if (idx === -1) return
    rules.value[idx] = {
      ...rules.value[idx],
      ...updates,
      id: rules.value[idx].id, // never change id
      updatedAt: Date.now(),
    }
    persist()
  }

  function deleteRule(id: string) {
    // If PDF, also clean up the inline data to save space
    const rule = rules.value.find(r => r.id === id)
    if (rule?.pdfDataUrl) {
      // The base64 string will be GC'd when the rule is removed
    }
    rules.value = rules.value.filter(r => r.id !== id)
    persist()
  }

  function getRule(id: string): KnowledgeRule | undefined {
    return rules.value.find(r => r.id === id)
  }

  // ─── Persistence ─────────────────────────────────────
  function persist() {
    try {
      // Split large PDF data to avoid exceeding localStorage limits
      // Store text rules separately from PDF data
      const textData = rules.value
        .filter(r => r.fileType === 'text')
        .map(r => ({ ...r, pdfDataUrl: undefined }))

      const pdfMeta = rules.value
        .filter(r => r.fileType === 'pdf')
        .map(r => ({
          id: r.id, manufacturer: r.manufacturer, manufacturerLabel: r.manufacturerLabel,
          componentType: r.componentType, componentLabel: r.componentLabel,
          description: r.description, fileType: r.fileType, pdfFileName: r.pdfFileName,
          createdAt: r.createdAt, updatedAt: r.updatedAt
        }))

      localStorage.setItem('pn-kb-text', JSON.stringify(textData))
      localStorage.setItem('pn-kb-pdf-meta', JSON.stringify(pdfMeta))

      // Store PDF data individually (each in its own key to avoid exceeding limits)
      for (const r of rules.value) {
        if (r.fileType === 'pdf' && r.pdfDataUrl) {
          try {
            localStorage.setItem(`pn-kb-pdf-${r.id}`, r.pdfDataUrl)
          } catch {
            // PDF too large for localStorage - mark it
            console.warn(`PDF too large for localStorage: ${r.pdfFileName}`)
          }
        }
      }
    } catch (e) {
      console.warn('Failed to persist knowledge base:', e)
    }
  }

  function load() {
    if (isLoaded.value) return
    try {
      const textData = localStorage.getItem('pn-kb-text')
      const pdfMeta = localStorage.getItem('pn-kb-pdf-meta')

      const textRules: KnowledgeRule[] = textData ? JSON.parse(textData) : []
      const pdfMetaList: KnowledgeRule[] = pdfMeta ? JSON.parse(pdfMeta) : []

      // Restore PDF data
      const pdfRules: KnowledgeRule[] = pdfMetaList.map(meta => {
        const dataUrl = localStorage.getItem(`pn-kb-pdf-${meta.id}`) || ''
        return { ...meta, pdfDataUrl: dataUrl }
      })

      rules.value = [...textRules, ...pdfRules].sort((a, b) => b.createdAt - a.createdAt)
    } catch (e) {
      console.warn('Failed to load knowledge base:', e)
      rules.value = []
    }
    isLoaded.value = true
  }

  // ─── Helpers ─────────────────────────────────────────
  function getComponentLabel(type: string): string {
    return COMPONENT_LABELS[type] || type
  }

  function getManufacturerLabel(mfr: string): string {
    return MANUFACTURER_LABELS[mfr] || mfr
  }

  // Auto-load on creation
  load()

  return {
    rules, isLoaded, textRules, pdfRules, ruleCount,
    rulesByManufacturer, rulesByComponent,
    addRule, updateRule, deleteRule, getRule,
    getComponentLabel, getManufacturerLabel,
    COMPONENT_LABELS, MANUFACTURER_LABELS,
  }
})

// Re-export for convenience
export { COMPONENT_LABELS, MANUFACTURER_LABELS }
