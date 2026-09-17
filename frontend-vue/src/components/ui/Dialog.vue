<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { X } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

/**
 * 轻量模态：只做遮罩、Esc、滚动锁与标题关联，样式交给调用方。
 * 面板宽度等由调用方通过 panelClass 控制（如 max-w-2xl）。
 */
defineProps<{
  title: string
  description?: string
  panelClass?: string
}>()

const emit = defineEmits<{ close: [] }>()

const titleId = useId()
const closeRef = ref<HTMLButtonElement | null>(null)
let previousOverflow = ''
let onKeyDown: ((event: KeyboardEvent) => void) | null = null

onMounted(() => {
  closeRef.value?.focus()
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'
  onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') emit('close')
  }
  document.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  document.body.style.overflow = previousOverflow
  if (onKeyDown) document.removeEventListener('keydown', onKeyDown)
  onKeyDown = null
})
</script>

<template>
  <Teleport to="body">
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label="关闭"
        tabindex="-1"
        class="absolute inset-0 cursor-default bg-ink/25 backdrop-blur-sm"
        @click="emit('close')"
      />
      <div
        role="dialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        :class="
          cn(
            'relative flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-3xl',
            'border border-line bg-surface shadow-pop',
            panelClass,
          )
        "
      >
        <div class="flex items-start gap-4 px-6 pt-5 pb-4">
          <div class="min-w-0 flex-1">
            <h2 :id="titleId" class="text-lg font-semibold tracking-tight">{{ title }}</h2>
            <p v-if="description" class="mt-1 text-[13px] text-ink-muted">{{ description }}</p>
          </div>
          <button
            ref="closeRef"
            type="button"
            aria-label="关闭"
            class="grid size-8 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink"
            @click="emit('close')"
          >
            <X class="size-4" />
          </button>
        </div>

        <div class="scrollbar-slim min-h-0 flex-1 overflow-auto px-6 pb-5">
          <slot />
        </div>

        <div
          v-if="$slots.footer"
          class="flex items-center justify-end gap-3 border-t border-line px-6 py-4"
        >
          <slot name="footer" />
        </div>
      </div>
    </div>
  </Teleport>
</template>
