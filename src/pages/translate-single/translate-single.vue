<template>
  <div>
    <nav class="translation-nav" aria-label="页面导航">
      <button type="button" @click="navigateTo('/')">← 返回首页</button>
      <button type="button" @click="navigateTo('/knowledge')">知识库</button>
    </nav>
    <div ref="translator"></div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from 'vue'
import { mountOfficialTranslator } from '@/official-preview/translator'
import '@/official-preview/style.css'
import { useTranslationStore } from '@/stores/translation'
import { useOfficialStore } from '@/stores/official'
import { useKnowledgeStore } from '@/stores/knowledge'
import { navigateTo } from '@/utils/router'

const props = defineProps<{ batch?: boolean }>()
const translator = ref<HTMLElement>()
const translation = useTranslationStore()
const official = useOfficialStore()
const knowledge = useKnowledgeStore()
let dispose: (() => void) | undefined
onMounted(() => {
  dispose = mountOfficialTranslator(translator.value!, {
    batchOpen: props.batch,
    initialMode: translation.currentMode,
    initialInput: translation.currentInput,
    catalog: official.catalog,
    onMode: translation.setMode,
    onCatalog: official.setCatalog,
    onInput: translation.setInput,
    onComplete: translation.acceptResults,
    onClear: translation.clearResult,
    getKnowledge: () => knowledge.rules,
  })
})
onBeforeUnmount(() => dispose?.())
</script>

<style scoped>
.translation-nav { display:flex; justify-content:space-between; padding:12px 20px; gap:12px }
.translation-nav button { min-height:44px; padding:8px 12px; border-radius:8px; background:white; color:#08783f }
.translation-nav button:focus-visible { outline:2px solid #07c160 }
</style>
