<template>
  <div class="input-panel">
    <!-- Component Type Selector -->
    <div class="input-panel__type-selector">
      <label class="input-panel__label">元件类型</label>
      <div class="input-panel__type-tabs">
        <button
          v-for="opt in componentTypes"
          :key="opt.value"
          class="type-tab"
          :class="{ 'type-tab--active': modelValue === opt.value }"
          @click="$emit('update:modelValue', opt.value)"
        >
          {{ opt.label }}
        </button>
      </div>
    </div>

    <!-- Text Input -->
    <div class="input-panel__input-area">
      <label class="input-panel__label">{{ inputLabel }}</label>
      <textarea
        class="input-panel__textarea"
        :value="input"
        :placeholder="placeholder"
        :rows="3"
        @input="$emit('update:input', ($event.target as HTMLTextAreaElement).value)"
      ></textarea>
      <div class="input-panel__hint">{{ hint }}</div>
    </div>

    <!-- Translate Button -->
    <button
      class="input-panel__submit"
      :disabled="!input.trim() || loading"
      @click="$emit('submit')"
    >
      <span v-if="loading" class="input-panel__spinner"></span>
      {{ loading ? '翻译中...' : buttonText }}
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  input: string
  modelValue: string
  inputLabel?: string
  placeholder?: string
  hint?: string
  buttonText?: string
  loading?: boolean
}>()

defineEmits<{
  'update:input': [value: string]
  'update:modelValue': [value: string]
  submit: []
}>()

const componentTypes = [
  { label: 'MLCC', value: 'mlcc' },
  { label: '贴片电阻', value: 'chip-resistor' },
  { label: '贴片电感', value: 'chip-inductor' },
  { label: '磁珠', value: 'ferrite-bead' },
]
</script>

<style lang="scss" scoped>
.input-panel {
  background: var(--color-bg-card);
  border-radius: var(--radius-md);
  padding: var(--spacing-lg);
  margin: var(--spacing-md) var(--spacing-lg);

  &__type-selector {
    margin-bottom: var(--spacing-md);
  }

  &__label {
    display: block;
    font-size: var(--font-size-sm);
    font-weight: 500;
    color: var(--color-text-secondary);
    margin-bottom: 8px;
  }

  &__type-tabs {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  &__input-area {
    margin-bottom: var(--spacing-md);
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
    transition: border-color 0.2s;
    line-height: 1.6;

    &:focus {
      border-color: var(--color-primary);
    }

    &::placeholder {
      color: var(--color-text-hint);
    }
  }

  &__hint {
    font-size: var(--font-size-xs);
    color: var(--color-text-hint);
    margin-top: 6px;
  }

  &__submit {
    width: 100%;
    height: var(--touch-min);
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
    transition: background 0.2s;

    &:hover {
      background: var(--color-primary-dark);
    }

    &:active {
      transform: scale(0.98);
    }

    &:disabled {
      background: #C8C8C8;
      color: #999;
      cursor: not-allowed;
    }
  }

  &__spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.3);
    border-top-color: #fff;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
}

.type-tab {
  padding: 6px 16px;
  border: 1.5px solid var(--color-border);
  border-radius: 20px;
  background: var(--color-bg);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.2s;
  white-space: nowrap;

  &--active {
    background: rgba(7, 193, 96, 0.1);
    border-color: var(--color-primary);
    color: var(--color-primary);
    font-weight: 500;
  }
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
</style>
