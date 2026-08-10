<template>
  <div class="batch-page">
    <div class="batch-page__nav">
      <button class="batch-page__back" @click="goHome">← 返回</button>
      <span class="batch-page__nav-title">批量翻译</span>
      <div class="batch-page__nav-spacer"></div>
    </div>

    <div class="batch-coming">
      <div class="batch-coming__icon">📁</div>
      <h2 class="batch-coming__title">批量翻译</h2>
      <p class="batch-coming__desc">
        上传 Excel 或 CSV 文件，批量翻译物料描述为村田料号。
      </p>
      <p class="batch-coming__status">此功能即将推出</p>
      <button class="batch-coming__btn" @click="goHome">← 返回首页</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { navigateTo } from '@/utils/router'

function goHome() {
  navigateTo('/')
}
</script>

<style lang="scss" scoped>
.batch-page {
  min-height: 100vh;

  &__nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px var(--spacing-lg);
    background: var(--color-bg-card);
    border-bottom: 1px solid var(--color-border);
  }

  &__back {
    font-size: var(--font-size-md);
    color: var(--color-primary);
    background: none;
    border: none;
    cursor: pointer;
  }

  &__nav-title {
    font-size: var(--font-size-lg);
    font-weight: 600;
  }

  &__nav-spacer {
    width: 48px;
  }
}

.batch-coming {
  text-align: center;
  padding: 64px var(--spacing-lg);

  &__icon {
    font-size: 56px;
    margin-bottom: var(--spacing-lg);
  }

  &__title {
    font-size: var(--font-size-xl);
    font-weight: 600;
    margin-bottom: var(--spacing-md);
  }

  &__desc {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    line-height: 1.6;
  }

  &__status {
    margin-top: var(--spacing-lg);
    font-size: var(--font-size-sm);
    color: var(--color-warning);
  }

  &__btn {
    margin-top: var(--spacing-xl);
    padding: 10px 32px;
    border-radius: 20px;
    background: var(--color-primary);
    color: #fff;
    font-size: var(--font-size-md);
    border: none;
    cursor: pointer;
  }
}
</style>
