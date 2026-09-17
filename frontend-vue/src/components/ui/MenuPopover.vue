<script setup lang="ts">
import { ref, watch } from 'vue'
import { cn } from '@/lib/utils'

/**
 * 轻量下拉菜单：触发器 + 浮层，点击外部或按 Esc 关闭。
 *
 * 触发器插槽拿到 open 只用于表达按钮态；开合由本组件持有，调用方不必各自
 * 复制一份「点空白处关掉」的监听。
 */
withDefaults(
  defineProps<{
    align?: 'left' | 'right'
    label?: string
    /** 浮层上的额外类名（面板本体，不是触发器） */
    panelClass?: string
  }>(),
  { align: 'right' },
)

const open = ref(false)
const rootRef = ref<HTMLDivElement | null>(null)

const toggle = () => {
  open.value = !open.value
}
const close = () => {
  open.value = false
}

watch(open, (isOpen, _prev, onCleanup) => {
  if (!isOpen) return
  const onPointer = (event: MouseEvent) => {
    if (!rootRef.value?.contains(event.target as Node)) open.value = false
  }
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') open.value = false
  }
  document.addEventListener('mousedown', onPointer)
  document.addEventListener('keydown', onKeyDown)
  onCleanup(() => {
    document.removeEventListener('mousedown', onPointer)
    document.removeEventListener('keydown', onKeyDown)
  })
})
</script>

<template>
  <div ref="rootRef" class="relative">
    <slot name="trigger" :open="open" :toggle="toggle" />
    <div
      v-if="open"
      role="menu"
      :aria-label="label"
      :class="
        cn(
          'absolute top-full z-40 mt-2 overflow-hidden rounded-2xl border border-line bg-surface shadow-pop',
          align === 'right' ? 'right-0' : 'left-0',
          panelClass,
        )
      "
    >
      <slot :close="close" />
    </div>
  </div>
</template>
