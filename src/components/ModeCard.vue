<template>
  <div class="mode-card" :class="{ 'mode-card--active': active }" @click="$emit('click')">
    <div class="mode-card__icon">{{ icon }}</div>
    <div class="mode-card__content">
      <div class="mode-card__title">{{ title }}</div>
      <div class="mode-card__subtitle">{{ subtitle }}</div>
      <div class="mode-card__desc">{{ description }}</div>
    </div>
    <div class="mode-card__arrow">→</div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  icon: string
  title: string
  subtitle: string
  description: string
  active?: boolean
}>()

defineEmits<{
  click: []
}>()
</script>

<style lang="scss" scoped>
.mode-card {
  display: flex;
  align-items: center;
  padding: var(--spacing-lg);
  margin: var(--spacing-md) var(--spacing-lg);
  background: var(--color-bg-card);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-card);
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.15s;
  min-height: var(--touch-min);
  user-select: none;

  &:active {
    transform: scale(0.98);
    box-shadow: var(--shadow-elevated);
  }

  &--active {
    border: 1.5px solid var(--color-primary);
  }

  &__icon {
    font-size: 28px;
    width: 48px;
    height: 48px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-divider);
    border-radius: var(--radius-sm);
    flex-shrink: 0;
    margin-right: var(--spacing-md);
  }

  &__content {
    flex: 1;
    min-width: 0;
  }

  &__title {
    font-size: var(--font-size-lg);
    font-weight: 600;
    color: var(--color-text-primary);
    line-height: 1.4;
  }

  &__subtitle {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    margin-top: 2px;
  }

  &__desc {
    font-size: var(--font-size-xs);
    color: var(--color-text-hint);
    margin-top: 4px;
  }

  &__arrow {
    font-size: 20px;
    color: var(--color-text-hint);
    flex-shrink: 0;
    margin-left: var(--spacing-sm);
  }
}
</style>
