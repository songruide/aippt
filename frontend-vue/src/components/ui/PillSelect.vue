<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Check, ChevronDown } from 'lucide-vue-next'
import { cn } from '@/lib/utils'

export interface PillSelectOption {
  value: string | number
  label: string
  /** 菜单里可选的一行弱说明 */
  description?: string
}

const props = withDefaults(
  defineProps<{
    label: string
    value: string | number
    options: ReadonlyArray<PillSelectOption>
    disabled?: boolean
  }>(),
  { disabled: false },
)

const emit = defineEmits<{ change: [value: string] }>()

const open = ref(false)
const rootRef = ref<HTMLDivElement | null>(null)
const listRef = ref<HTMLDivElement | null>(null)

const selected = computed(() =>
  props.options.find((option) => String(option.value) === String(props.value)),
)
const selectedIndex = computed(() =>
  Math.max(
    0,
    props.options.findIndex((option) => String(option.value) === String(props.value)),
  ),
)

watch(open, (isOpen, _prev, onCleanup) => {
  if (!isOpen) return
  const onPointerDown = (event: PointerEvent) => {
    if (!rootRef.value?.contains(event.target as Node)) open.value = false
  }
  const onKey = (event: KeyboardEvent) => {
    if (event.key === 'Escape') open.value = false
  }
  document.addEventListener('pointerdown', onPointerDown)
  document.addEventListener('keydown', onKey)

  // 打开时把当前选中项滚进可视区
  requestAnimationFrame(() => {
    const active = listRef.value?.querySelector<HTMLElement>('[data-active="true"]')
    active?.scrollIntoView({ block: 'nearest' })
  })

  onCleanup(() => {
    document.removeEventListener('pointerdown', onPointerDown)
    document.removeEventListener('keydown', onKey)
  })
})

function pick(next: string | number) {
  emit('change', String(next))
  open.value = false
}

function onTriggerKeyDown(event: KeyboardEvent) {
  if (props.disabled) return
  if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    open.value = true
  }
}

function onListKeyDown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const delta = event.key === 'ArrowDown' ? 1 : -1
    const next = (selectedIndex.value + delta + props.options.length) % props.options.length
    emit('change', String(props.options[next]!.value))
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    open.value = false
  }
}
</script>

<template>
  <!-- Gamma 风格参数胶囊：轻量触发器 + 浮动菜单。不用原生 select，避免系统蓝底选中块。 -->
  <div ref="rootRef" class="relative">
    <button
      type="button"
      :disabled="disabled"
      :aria-label="label"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :class="
        cn(
          'group inline-flex h-9 items-center gap-1.5 rounded-full px-3.5',
          'bg-surface-soft/90 text-[13px] font-medium text-ink-soft',
          'ring-1 ring-transparent transition-all duration-150',
          'hover:bg-white hover:text-ink hover:ring-line hover:shadow-sm',
          open && 'bg-white text-ink shadow-sm ring-line',
          'disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-surface-soft/90 disabled:hover:shadow-none disabled:hover:ring-transparent',
        )
      "
      @click="open = !open"
      @keydown="onTriggerKeyDown"
    >
      <slot name="leading" />
      <span class="max-w-36 truncate">{{ selected?.label ?? String(value) }}</span>
      <ChevronDown
        :class="
          cn(
            'size-3.5 shrink-0 text-ink-muted transition-transform duration-200',
            open && 'rotate-180 text-ink-soft',
          )
        "
      />
    </button>

    <div
      v-if="open"
      ref="listRef"
      role="listbox"
      :aria-label="label"
      tabindex="-1"
      class="absolute top-[calc(100%+6px)] left-0 z-50 min-w-[11.5rem] origin-top-left outline-none"
      :class="
        cn(
          'animate-in rounded-2xl border border-line/80 bg-white/95 p-1.5 shadow-pop backdrop-blur-md',
        )
      "
      @keydown="onListKeyDown"
    >
      <div class="max-h-64 overflow-y-auto overscroll-contain py-0.5">
        <button
          v-for="option in options"
          :key="String(option.value)"
          type="button"
          role="option"
          :aria-selected="String(option.value) === String(value)"
          :data-active="String(option.value) === String(value) || undefined"
          class="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors"
          :class="
            String(option.value) === String(value)
              ? 'bg-surface-soft text-ink'
              : 'text-ink-soft hover:bg-canvas hover:text-ink'
          "
          @click="pick(option.value)"
        >
          <span
            class="mt-0.5 grid size-4 shrink-0 place-items-center rounded-full"
            :class="
              String(option.value) === String(value) ? 'bg-ink text-white' : 'bg-transparent'
            "
          >
            <Check
              v-if="String(option.value) === String(value)"
              class="size-2.5 stroke-[2.5]"
            />
          </span>
          <span class="min-w-0 flex-1">
            <span class="block text-[13px] font-medium leading-snug">{{ option.label }}</span>
            <span
              v-if="option.description"
              class="mt-0.5 block text-[11px] leading-snug text-ink-muted"
            >
              {{ option.description }}
            </span>
          </span>
        </button>
      </div>
    </div>
  </div>
</template>
