<template>
  <div class="translate-page">
    <!-- Nav Bar -->
    <div class="translate-page__nav">
      <button class="translate-page__back" @click="goBack">← 返回</button>
      <span class="translate-page__nav-title">单个翻译</span>
      <div class="translate-page__nav-spacer"></div>
    </div>

    <!-- Mode Tabs -->
    <div class="translate-page__tabs">
      <button
        class="mode-tab"
        :class="{ 'mode-tab--active': store.currentMode === 'A' }"
        @click="store.setMode('A')"
      >
        描述 → 村田料号
      </button>
      <button
        class="mode-tab"
        :class="{ 'mode-tab--active': store.currentMode === 'B' }"
        @click="store.setMode('B')"
      >
        料号 → 规格描述
      </button>
    </div>

    <!-- Input Panel (Mode A) -->
    <InputPanel
      v-if="store.currentMode === 'A'"
      v-model="store.selectedComponentType"
      :input="store.currentInput"
      input-label="物料描述/参数"
      placeholder="输入物料参数，每行一个描述，例如：&#10;0402 100nF 16V X7R ±10%&#10;0603 10uF 25V X5R ±5%&#10;0805 4.7uF 16V X7R ±10%"
      hint="支持多行输入，每行一个物料描述。用换行分隔。"
      button-text="翻译"
      :loading="store.isTranslating"
      @update:input="store.setInput"
      @submit="store.translate()"
    />

    <!-- Input Panel (Mode B) -->
    <div v-else class="mode-b-input">
      <div class="mode-b-input__panel">
        <label class="mode-b-input__label">输入料号</label>
        <textarea
          class="mode-b-input__textarea"
          :value="store.currentInput"
          :placeholder="'输入各厂家的被动元件料号，每行一个，例如：&#10;CL10B104KO8NNNC&#10;C1608X7R1H104K080AA&#10;JMK107BBJ226MA-T'"
          rows="3"
          @input="store.setInput(($event.target as HTMLTextAreaElement).value)"
        ></textarea>
        <div class="mode-b-input__hint">
          支持三星、TDK、太阳诱电、国巨、华新科、村田等厂家。
          需先在<a class="mode-b-input__link" @click="goKnowledge">知识库</a>中录入编码规则。
        </div>
        <button
          class="mode-b-input__submit"
          :disabled="!store.currentInput.trim() || store.isTranslating"
          @click="store.translate()"
        >
          <span v-if="store.isTranslating" class="mode-b-input__spinner"></span>
          {{ store.isTranslating ? '解析中...' : '解析料号' }}
        </button>
      </div>
    </div>

    <!-- Results List -->
    <div v-if="store.hasResult" class="translate-page__results">
      <div class="results-header">
        <span class="results-header__title">
          翻译结果
          <span class="results-header__count">（{{ store.resultCount }} 条）</span>
        </span>
        <button
          v-if="store.resultCount > 1"
          class="results-header__copy-all"
          @click="copyAll"
        >
          {{ allCopied ? '已复制 ✓' : '一键复制全部' }}
        </button>
      </div>

      <div
        v-for="(result, index) in store.currentResults"
        :key="index"
        class="result-item"
        :class="{ 'result-item--error': !result.success, 'result-item--expanded': expandedIndex === index }"
      >
        <!-- Compact Row -->
        <div class="result-item__row" @click="toggleExpand(index)">
          <span class="result-item__index">{{ index + 1 }}</span>
          <div class="result-item__content">
            <div class="result-item__input">{{ result.input }}</div>
            <div v-if="result.success" class="result-item__pn">{{ result.partNumber }}</div>
            <div v-else class="result-item__error">{{ result.error }}</div>
          </div>
          <button
            v-if="result.success"
            class="result-item__copy"
            @click.stop="copyPN(result.partNumber, index)"
          >
            {{ copiedIndex === index ? '✓' : '📋' }}
          </button>
        </div>

        <!-- Expanded Detail -->
        <div v-if="expandedIndex === index && result.success" class="result-item__detail">
          <ParamDetail :segments="result.segments" />
          <div v-if="result.warnings.length > 0" class="result-item__warnings">
            <div v-for="(w, i) in result.warnings" :key="i" class="result-item__warning">⚡ {{ w }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- Quick Tips (only show before translation) -->
    <div class="translate-page__tips" v-if="!store.hasResult">
      <div class="tips__title">💡 使用示例（点击填入）</div>
      <div class="tips__item" @click="fillExample('0402 100nF 16V X7R ±10%')">
        → 0402 100nF 16V X7R ±10%
      </div>
      <div class="tips__item" @click="fillExample('0603 10uF 25V X5R ±5%')">
        → 0603 10uF 25V X5R ±5%
      </div>
      <div class="tips__item" @click="fillExample('0805 4.7uF 16V X7R ±10%')">
        → 0805 4.7uF 16V X7R ±10%
      </div>
      <div class="tips__item" @click="fillExample('1206 100uF 6.3V X5R ±20%')">
        → 1206 100uF 6.3V X5R ±20%
      </div>
      <div class="tips__item--multi" @click="fillExample('0402 100nF 16V X7R ±10%\n0603 10uF 25V X5R ±5%\n0805 4.7uF 16V X7R ±10%')">
        → 多行批量翻译示例（点击填入3条）
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useTranslationStore } from '@/stores/translation'
import { navigateTo } from '@/utils/router'
import { copyToClipboard, showToast } from '@/utils/clipboard'
import InputPanel from '@/components/InputPanel.vue'
import ParamDetail from '@/components/ParamDetail.vue'

const store = useTranslationStore()
const expandedIndex = ref<number | null>(null)
const copiedIndex = ref<number | null>(null)

function goBack() {
  store.clearResult()
  navigateTo('/')
}

function fillExample(text: string) {
  store.setInput(text)
}

function goKnowledge() {
  navigateTo('/knowledge')
}

function toggleExpand(index: number) {
  expandedIndex.value = expandedIndex.value === index ? null : index
}

const allCopied = ref(false)

async function copyAll() {
  const allPNs = store.currentResults
    .filter(r => r.success)
    .map(r => r.partNumber)
    .join('\n')
  if (!allPNs) return
  const ok = await copyToClipboard(allPNs)
  if (ok) {
    allCopied.value = true
    showToast(`已复制 ${store.currentResults.filter(r => r.success).length} 条料号`)
    setTimeout(() => { allCopied.value = false }, 2000)
  } else {
    showToast('复制失败，请手动复制')
  }
}

async function copyPN(pn: string, index: number) {
  const ok = await copyToClipboard(pn)
  if (ok) {
    copiedIndex.value = index
    showToast('已复制')
    setTimeout(() => { copiedIndex.value = null }, 1500)
  } else {
    showToast('复制失败，请手动复制')
  }
}
</script>

<style lang="scss" scoped>
.translate-page {
  min-height: 100vh;
  padding-bottom: var(--spacing-xl);

  &__nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px var(--spacing-lg);
    background: var(--color-bg-card);
    border-bottom: 1px solid var(--color-border);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  &__back {
    font-size: var(--font-size-md);
    color: var(--color-primary);
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px 0;
  }

  &__nav-title {
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--color-text-primary);
  }

  &__nav-spacer {
    width: 48px;
  }

  &__tabs {
    display: flex;
    margin: var(--spacing-md) var(--spacing-lg);
    background: var(--color-bg-card);
    border-radius: 8px;
    overflow: hidden;
    box-shadow: var(--shadow-card);
  }

  &__coming-soon {
    text-align: center;
    padding: 48px var(--spacing-lg);
  }

  &__results {
    margin: var(--spacing-md) var(--spacing-lg);
  }

  &__tips {
    margin: var(--spacing-md) var(--spacing-lg);
    padding: var(--spacing-lg);
    background: var(--color-bg-card);
    border-radius: var(--radius-md);
  }
}

.mode-tab {
  flex: 1;
  padding: 10px 0;
  border: none;
  background: var(--color-bg-card);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;

  &--active {
    color: var(--color-primary);
    font-weight: 600;

    &::after {
      content: '';
      position: absolute;
      bottom: 0;
      left: 20%;
      right: 20%;
      height: 2px;
      background: var(--color-primary);
      border-radius: 1px;
    }
  }
}

.coming-soon {
  &__icon { font-size: 48px; margin-bottom: var(--spacing-lg); }
  &__title { font-size: var(--font-size-lg); font-weight: 600; color: var(--color-text-primary); margin-bottom: var(--spacing-sm); }
  &__desc { font-size: var(--font-size-sm); color: var(--color-text-secondary); line-height: 1.6; }
}

// ─── Mode B Input ──────────────────────────────
.mode-b-input {
  &__panel {
    background: var(--color-bg-card);
    border-radius: var(--radius-md);
    padding: var(--spacing-lg);
    margin: var(--spacing-md) var(--spacing-lg);
  }

  &__label {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--color-text-secondary);
    margin-bottom: 8px;
  }

  &__textarea {
    width: 100%;
    padding: 12px;
    border: 1.5px solid var(--color-border);
    border-radius: var(--radius-sm);
    font-size: var(--font-size-md);
    color: var(--color-text-primary);
    background: var(--color-bg);
    resize: vertical;
    outline: none;
    line-height: 1.6;
    font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;

    &:focus { border-color: var(--color-primary); }
    &::placeholder { color: var(--color-text-hint); }
  }

  &__hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-hint);
    margin-top: 6px;
    line-height: 1.6;
  }

  &__link {
    color: var(--color-primary);
    cursor: pointer;
    text-decoration: underline;
    font-weight: 500;
  }

  &__submit {
    width: 100%;
    height: var(--touch-min);
    margin-top: var(--spacing-md);
    background: var(--color-primary);
    color: #fff;
    border: none;
    border-radius: var(--radius-sm);
    font-size: var(--font-size-md);
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;

    &:active { transform: scale(0.98); }
    &:disabled { background: #C8C8C8; color: #999; cursor: not-allowed; }
  }
}

// ─── Results list ───────────────────────────
.results-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--spacing-sm);

  &__title {
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-text-secondary);
  }

  &__count {
    font-weight: 400;
    color: var(--color-text-hint);
  }

  &__copy-all {
    padding: 6px 14px;
    border: 1.5px solid var(--color-primary);
    border-radius: 16px;
    background: transparent;
    color: var(--color-primary);
    font-size: var(--font-size-xs);
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;

    &:active {
      background: var(--color-primary);
      color: #fff;
    }
  }
}

.result-item {
  background: var(--color-bg-card);
  border-radius: var(--radius-sm);
  margin-bottom: 8px;
  overflow: hidden;
  box-shadow: 0 1px 2px rgba(0,0,0,0.04);

  &--error {
    border-left: 3px solid var(--color-danger);
  }

  &--expanded {
    box-shadow: var(--shadow-card);
  }

  &__row {
    display: flex;
    align-items: flex-start;
    padding: 10px 12px;
    cursor: pointer;
    gap: 10px;
    min-height: var(--touch-min);

    &:active {
      background: var(--color-divider);
    }
  }

  &__index {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--color-divider);
    font-size: var(--font-size-xs);
    color: var(--color-text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 2px;
  }

  &__content {
    flex: 1;
    min-width: 0;
  }

  &__input {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    word-break: break-all;
    line-height: 1.4;
  }

  &__pn {
    font-size: var(--font-size-md);
    font-weight: 700;
    font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
    color: var(--color-murata);
    margin-top: 4px;
    letter-spacing: 0.5px;
  }

  &__error {
    font-size: var(--font-size-sm);
    color: var(--color-danger);
    margin-top: 4px;
  }

  &__copy {
    width: 32px;
    height: 32px;
    border: none;
    background: var(--color-divider);
    border-radius: 50%;
    font-size: 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    &:active {
      background: var(--color-primary);
    }
  }

  &__detail {
    border-top: 1px solid var(--color-divider);
    padding: 4px 0;
  }

  &__warnings {
    padding: 4px 12px 8px;
  }

  &__warning {
    font-size: var(--font-size-xs);
    color: #B8860B;
    padding: 2px 0;
  }
}

// ─── Tips ──────────────────────────────────
.tips {
  &__title {
    font-size: var(--font-size-md);
    font-weight: 600;
    color: var(--color-text-primary);
    margin-bottom: var(--spacing-md);
  }

  &__item {
    padding: 10px 0;
    font-size: var(--font-size-sm);
    font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
    color: var(--color-murata);
    cursor: pointer;
    border-bottom: 1px solid var(--color-divider);

    &:last-child { border-bottom: none; }
    &:active { opacity: 0.6; }

    &--multi {
      padding: 10px 0;
      font-size: var(--font-size-sm);
      color: var(--color-primary);
      cursor: pointer;
      font-weight: 500;

      &:active { opacity: 0.6; }
    }
  }
}
</style>
