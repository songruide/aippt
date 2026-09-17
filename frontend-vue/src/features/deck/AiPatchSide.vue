<script setup lang="ts">
import { computed } from 'vue'
import AiPatchContent from '@/features/deck/AiPatchContent.vue'
import type { ActiveSide } from '@/features/deck/aiEditShared'
import { cn } from '@/lib/utils'

const props = withDefaults(
  defineProps<{
    label: string
    tone: ActiveSide
    patch: Record<string, unknown> | null
    type: string
    emptyHint: string
    active: boolean
    disabled?: boolean
  }>(),
  { disabled: false },
)

const emit = defineEmits<{ select: [] }>()

const buttonClass = computed(() =>
  cn(
    'px-3 py-3 text-left transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-inset',
    'disabled:cursor-default',
    !props.active && !props.disabled && 'hover:bg-accent-soft/40 cursor-pointer',
    props.tone === 'before' && 'border-b border-line sm:border-r sm:border-b-0',
    props.active && props.tone === 'before' && 'bg-surface-soft',
    props.active && props.tone === 'after' && 'bg-accent-soft/50',
    !props.active && props.tone === 'after' && 'sm:border-l-2 sm:border-l-transparent',
    props.active && props.tone === 'after' && 'sm:border-l-2 sm:border-l-accent',
  ),
)

const labelClass = computed(() =>
  cn(
    'mb-2 text-[10px] tracking-[0.16em] uppercase',
    props.active
      ? props.tone === 'before'
        ? 'text-ink-soft'
        : 'text-accent'
      : props.tone === 'before'
        ? 'text-ink-muted'
        : 'text-accent/80',
  ),
)

const contentClass = computed(() =>
  cn(
    'text-xs leading-relaxed',
    props.tone === 'before' &&
      !props.active &&
      'text-ink-muted line-through decoration-ink-muted/50 opacity-70',
    props.tone === 'before' && props.active && 'text-ink',
    props.tone === 'after' && 'text-ink',
  ),
)
</script>

<template>
  <button
    type="button"
    :disabled="props.disabled || props.active"
    :aria-pressed="props.active"
    :class="buttonClass"
    @click="emit('select')"
  >
    <p :class="labelClass">{{ props.label }}{{ props.active ? ' · 已应用' : '' }}</p>
    <div :class="contentClass">
      <AiPatchContent :patch="props.patch" :type="props.type" :empty-hint="props.emptyHint" />
    </div>
  </button>
</template>
