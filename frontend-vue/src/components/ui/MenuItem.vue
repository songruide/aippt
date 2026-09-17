<script setup lang="ts">
import type { Component } from 'vue'

withDefaults(
  defineProps<{
    hint?: string
    icon?: Component
    disabled?: boolean
    danger?: boolean
  }>(),
  { disabled: false, danger: false },
)

const emit = defineEmits<{ select: [] }>()
</script>

<template>
  <button
    type="button"
    role="menuitem"
    :disabled="disabled"
    class="flex w-full items-start gap-2.5 px-4 py-2.5 text-left text-[13px] transition-colors disabled:opacity-50"
    :class="
      danger
        ? 'text-negative hover:bg-negative/8'
        : 'text-ink-soft hover:bg-surface-soft hover:text-ink'
    "
    @click="emit('select')"
  >
    <component :is="icon" v-if="icon" class="mt-0.5 size-3.5 shrink-0" />
    <span class="min-w-0 flex-1">
      <slot />
      <span v-if="hint" class="mt-0.5 block text-xs text-ink-muted">{{ hint }}</span>
    </span>
  </button>
</template>
