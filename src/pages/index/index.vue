<template>
  <div class="home-page">
    <!-- Header -->
    <div class="home-page__header">
      <h1 class="home-page__title">被动件料号翻译</h1>
      <p class="home-page__subtitle">Passive Component PN Translator</p>
    </div>

    <!-- Mode Selection Cards -->
    <div class="home-page__section">
      <div class="home-page__section-title">功能选择</div>

      <ModeCard
        icon="🔄"
        title="描述 → 村田料号"
        subtitle="Mode A: Description → Murata PN"
        description="输入物料参数，获取村田被动元件完整料号。支持 MLCC、电阻、电感、磁珠。"
        @click="goTranslate('A')"
      />

      <ModeCard
        icon="🔍"
        title="料号 → 规格描述"
        subtitle="Mode B: Part Number → Specification"
        description="根据知识库中的编码规则，拆解各厂家料号为详细参数规格。"
        @click="goTranslate('B')"
      />
    </div>

    <!-- Quick Actions -->
    <div class="home-page__section">
      <div class="home-page__section-title">快捷操作</div>

      <div class="home-page__quick-actions">
        <button class="quick-action" @click="goBatch">
          <span class="quick-action__icon">📁</span>
          <span class="quick-action__text">批量翻译</span>
          <span class="quick-action__arrow">→</span>
        </button>
        <button class="quick-action" @click="goKnowledge">
          <span class="quick-action__icon">📚</span>
          <span class="quick-action__text">知识库</span>
          <span class="quick-action__desc">管理厂家编码规则</span>
          <span class="quick-action__arrow">→</span>
        </button>
      </div>
    </div>

    <!-- Recent History (if any) -->
    <div class="home-page__section" v-if="store.recentHistory.length > 0">
      <div class="home-page__section-title">最近记录</div>
      <div
        v-for="item in store.recentHistory.slice(0, 3)"
        :key="item.id"
        class="history-item"
        @click="store.setInput(item.input); goTranslate(item.mode)"
      >
        <div class="history-item__input">{{ item.input }}</div>
        <div class="history-item__result" v-if="item.results[0]?.success">
          {{ item.results[0].partNumber }}
        </div>
        <div class="history-item__count" v-if="item.results.length > 1">
          共 {{ item.results.length }} 条结果
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div class="home-page__footer">
      <p>支持村田、三星、TDK、太阳诱电、国巨、华新科</p>
      <p class="home-page__footer-version">v1.0.0 · Mode B 即将推出</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useTranslationStore } from '@/stores/translation'
import { navigateTo } from '@/utils/router'
import ModeCard from '@/components/ModeCard.vue'

const store = useTranslationStore()

function goTranslate(mode: 'A' | 'B') {
  store.setMode(mode)
  navigateTo('/translate')
}

function goBatch() {
  navigateTo('/batch')
}

function goKnowledge() {
  navigateTo('/knowledge')
}
</script>

<style lang="scss" scoped>
.home-page {
  min-height: 100vh;
  padding-bottom: var(--spacing-xl);

  &__header {
    padding: 32px var(--spacing-lg) var(--spacing-xl);
    text-align: center;
    background: linear-gradient(135deg, rgba(7, 193, 96, 0.08), rgba(7, 193, 96, 0.02));
  }

  &__title {
    font-size: 24px;
    font-weight: 700;
    color: var(--color-text-primary);
    letter-spacing: 1px;
  }

  &__subtitle {
    font-size: var(--font-size-sm);
    color: var(--color-text-hint);
    margin-top: 6px;
  }

  &__section {
    margin-top: var(--spacing-xl);
  }

  &__section-title {
    padding: 0 var(--spacing-lg);
    margin-bottom: var(--spacing-sm);
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-text-secondary);
    text-transform: uppercase;
  }

  &__quick-actions {
    padding: 0 var(--spacing-lg);
  }

  &__footer {
    margin-top: var(--spacing-xl);
    padding: var(--spacing-lg);
    text-align: center;
    font-size: var(--font-size-xs);
    color: var(--color-text-hint);
    line-height: 1.8;
  }

  &__footer-version {
    color: var(--color-text-hint);
    opacity: 0.6;
  }
}

.quick-action {
  display: flex;
  align-items: center;
  width: 100%;
  padding: var(--spacing-md) var(--spacing-lg);
  background: var(--color-bg-card);
  border: none;
  border-radius: var(--radius-md);
  font-size: var(--font-size-md);
  color: var(--color-text-primary);
  box-shadow: var(--shadow-card);
  cursor: pointer;
  min-height: var(--touch-min);

  &:active {
    transform: scale(0.98);
  }

  &__icon {
    font-size: 22px;
    margin-right: var(--spacing-md);
  }

  &__text {
    flex: 1;
    text-align: left;
  }

  &__desc {
    font-size: var(--font-size-xs);
    color: var(--color-text-hint);
    margin-right: var(--spacing-sm);
  }

  &__arrow {
    color: var(--color-text-hint);
    font-size: 18px;
  }
}

.history-item {
  margin: 8px var(--spacing-lg);
  padding: var(--spacing-md);
  background: var(--color-bg-card);
  border-radius: var(--radius-sm);
  cursor: pointer;

  &:active {
    background: var(--color-divider);
  }

  &__input {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  &__result {
    font-size: var(--font-size-md);
    font-weight: 600;
    font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
    color: var(--color-murata);
    margin-top: 4px;
  }
}
</style>
