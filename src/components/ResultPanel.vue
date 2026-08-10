<template>
  <div class="result-panel" v-if="result">
    <!-- Error State -->
    <div v-if="result.error" class="result-panel__error">
      <div class="result-panel__error-icon">⚠️</div>
      <div class="result-panel__error-text">{{ result.error }}</div>
    </div>

    <!-- Success State -->
    <template v-else>
      <!-- Part Number Display -->
      <div class="result-panel__pn-section">
        <div class="result-panel__pn-label">村田料号</div>
        <div class="result-panel__pn-value" @click="copyPN">{{ result.partNumber }}</div>
        <button class="result-panel__copy-btn" @click="copyPN">
          {{ copied ? '已复制 ✓' : '复制' }}
        </button>
      </div>

      <!-- Warnings -->
      <div v-if="result.warnings.length > 0" class="result-panel__warnings">
        <div
          v-for="(w, i) in result.warnings"
          :key="i"
          class="result-panel__warning-item"
        >
          ⚡ {{ w }}
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { copyToClipboard, showToast } from '@/utils/clipboard'
import type { TranslationResult } from '@/engine/types'

const props = defineProps<{
  result: TranslationResult | null
}>()

const copied = ref(false)

async function copyPN() {
  if (!props.result?.partNumber) return
  const ok = await copyToClipboard(props.result.partNumber)
  if (ok) {
    copied.value = true
    showToast('已复制到剪贴板')
    setTimeout(() => { copied.value = false }, 2000)
  } else {
    showToast('复制失败，请手动复制')
  }
}
</script>

<style lang="scss" scoped>
.result-panel {
  background: var(--color-bg-card);
  border-radius: var(--radius-md);
  margin: var(--spacing-md) var(--spacing-lg);
  overflow: hidden;

  &__error {
    padding: var(--spacing-xl);
    text-align: center;
  }

  &__error-icon {
    font-size: 40px;
    margin-bottom: var(--spacing-md);
  }

  &__error-text {
    font-size: var(--font-size-md);
    color: var(--color-danger);
    line-height: 1.6;
  }

  &__pn-section {
    padding: var(--spacing-lg);
    text-align: center;
    background: linear-gradient(135deg, rgba(230, 0, 18, 0.05), rgba(230, 0, 18, 0.02));
    border-bottom: 1px solid var(--color-divider);
  }

  &__pn-label {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-bottom: 8px;
  }

  &__pn-value {
    font-size: 20px;
    font-weight: 700;
    font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
    color: var(--color-murata);
    letter-spacing: 1px;
    word-break: break-all;
    padding: 8px 0;
    cursor: pointer;
    user-select: all;
  }

  &__copy-btn {
    margin-top: 8px;
    padding: 6px 24px;
    border: 1.5px solid var(--color-primary);
    border-radius: 20px;
    background: transparent;
    color: var(--color-primary);
    font-size: var(--font-size-sm);
    cursor: pointer;
    transition: all 0.2s;

    &:active {
      background: var(--color-primary);
      color: #fff;
    }
  }

  &__warnings {
    padding: var(--spacing-md) var(--spacing-lg);
  }

  &__warning-item {
    font-size: var(--font-size-xs);
    color: #B8860B;
    padding: 4px 0;
  }
}
</style>
