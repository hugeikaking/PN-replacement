<template>
  <div class="param-detail" v-if="segments.length > 0">
    <div class="param-detail__title">参数详情</div>
    <div class="param-detail__table">
      <div
        v-for="seg in visibleSegments"
        :key="seg.id"
        class="param-detail__row"
      >
        <span class="param-detail__label">{{ seg.label }}</span>
        <span class="param-detail__code">{{ seg.code }}</span>
        <span class="param-detail__value">{{ seg.value }}</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { DecodedSegment } from '@/engine/types'

const props = defineProps<{
  segments: DecodedSegment[]
}>()

// Filter out internal codes and fixed segments that don't add value for display
const visibleSegments = computed(() => {
  const hideIds = new Set(['series', 'internal', 'suffix'])
  return props.segments.filter(s => !hideIds.has(s.id) && s.value)
})
</script>

<style lang="scss" scoped>
.param-detail {
  margin: var(--spacing-md) var(--spacing-lg);
  background: var(--color-bg-card);
  border-radius: var(--radius-md);
  overflow: hidden;

  &__title {
    padding: var(--spacing-md) var(--spacing-lg);
    font-size: var(--font-size-sm);
    font-weight: 600;
    color: var(--color-text-secondary);
    border-bottom: 1px solid var(--color-divider);
  }

  &__table {
    padding: var(--spacing-xs) 0;
  }

  &__row {
    display: flex;
    align-items: center;
    padding: 10px var(--spacing-lg);
    border-bottom: 1px solid var(--color-divider);

    &:last-child {
      border-bottom: none;
    }
  }

  &__label {
    width: 72px;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    flex-shrink: 0;
  }

  &__code {
    width: 48px;
    font-size: var(--font-size-md);
    font-weight: 600;
    font-family: 'SF Mono', 'Cascadia Code', 'Consolas', monospace;
    color: var(--color-murata);
    text-align: center;
    flex-shrink: 0;
  }

  &__value {
    flex: 1;
    font-size: var(--font-size-sm);
    color: var(--color-text-primary);
    text-align: right;
    margin-left: var(--spacing-md);
  }
}
</style>
