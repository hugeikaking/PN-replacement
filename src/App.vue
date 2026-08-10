<template>
  <div class="app-container">
    <!-- Hash-based routing -->
    <HomePage v-if="currentPath === '/' || currentPath === ''" />
    <TranslatePage v-else-if="currentPath === '/translate'" />
    <BatchPage v-else-if="currentPath === '/batch'" />
    <KnowledgePage v-else-if="currentPath === '/knowledge'" />
    <div v-else class="app-404">
      <p>页面不存在</p>
      <button @click="navigateTo('/')">返回首页</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import HomePage from '@/pages/index/index.vue'
import TranslatePage from '@/pages/translate-single/translate-single.vue'
import BatchPage from '@/pages/translate-batch/translate-batch.vue'
import KnowledgePage from '@/pages/knowledge/knowledge.vue'

const currentPath = ref(window.location.hash.replace('#', '') || '/')

function onHashChange() {
  currentPath.value = window.location.hash.replace('#', '') || '/'
}

window.addEventListener('hashchange', onHashChange)
</script>

<style lang="scss">
// ─── WeUI-inspired CSS variables ───────────────────
:root {
  --color-primary: #07C160;
  --color-primary-dark: #06AD56;
  --color-danger: #FA5151;
  --color-warning: #FFC300;
  --color-murata: #E60012;
  --color-bg: #F8F8F8;
  --color-bg-card: #FFFFFF;
  --color-text-primary: #191919;
  --color-text-secondary: #888888;
  --color-text-hint: #B2B2B2;
  --color-border: #EDEDED;
  --color-divider: #F0F0F0;
  --radius-sm: 4px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --spacing-xs: 4px;
  --spacing-sm: 8px;
  --spacing-md: 12px;
  --spacing-lg: 16px;
  --spacing-xl: 24px;
  --font-size-xs: 11px;
  --font-size-sm: 13px;
  --font-size-md: 15px;
  --font-size-lg: 17px;
  --font-size-xl: 20px;
  --touch-min: 44px;
  --shadow-card: 0 1px 3px rgba(0, 0, 0, 0.08);
  --shadow-elevated: 0 4px 12px rgba(0, 0, 0, 0.12);
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body {
  height: 100%;
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif;
  font-size: var(--font-size-md);
  color: var(--color-text-primary);
  background: var(--color-bg);
  -webkit-font-smoothing: antialiased;
  -webkit-tap-highlight-color: transparent;
}

.app-container {
  min-height: 100vh;
  background: var(--color-bg);
  max-width: 480px;
  margin: 0 auto;
}

input, textarea, button {
  font-family: inherit;
  font-size: inherit;
}

button {
  cursor: pointer;
  border: none;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}

.app-404 {
  text-align: center;
  padding: 80px 16px;
  color: var(--color-text-secondary);

  p {
    font-size: 20px;
    margin-bottom: 16px;
  }

  button {
    padding: 10px 24px;
    border-radius: 20px;
    background: var(--color-primary);
    color: #fff;
    font-size: 15px;
  }
}
</style>
