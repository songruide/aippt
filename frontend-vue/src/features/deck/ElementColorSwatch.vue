<script setup lang="ts">
import { computed } from 'vue'
import { cn } from '@/lib/utils'
import { COLOR_SWATCHES } from '@/render/blockStyle'
import { resolveColor } from '@/render/style'
import type { Theme } from '@/render/types'

const props = withDefaults(
  defineProps<{
    label: string
    open: boolean
    theme: Theme
    value: string | null
    allowNone?: boolean
    disabled?: boolean
    inline?: boolean
  }>(),
  { allowNone: false, disabled: false, inline: false },
)

const emit = defineEmits<{ toggle: []; pick: [value: string | null] }>()

const preview = computed(() =>
  props.value == null || props.value === 'none'
    ? 'transparent'
    : props.value.startsWith('#')
      ? props.value
      : resolveColor(props.theme, props.value),
)

const previewBackground = computed(() =>
  preview.value === 'transparent'
    ? 'linear-gradient(135deg, transparent 45%, #ccc 45%, #ccc 55%, transparent 55%)'
    : preview.value,
)

const onCustom = (event: Event) => {
  emit('pick', (event.target as HTMLInputElement).value.toUpperCase())
}
</script>

<template>
  <div :class="cn('relative', props.inline && 'static')">
    <button
      type="button"
      :title="props.label"
      :aria-label="props.label"
      :aria-expanded="props.open"
      :disabled="props.disabled"
      class="grid size-7 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-surface-soft disabled:opacity-40"
      @click="emit('toggle')"
    >
      <span
        class="size-3.5 rounded-full border border-line-strong"
        :style="{ background: previewBackground }"
      />
    </button>
    <div
      v-if="props.open"
      role="listbox"
      :aria-label="props.label"
      :class="
        cn(
          // 必须给明确宽度：挂在窄按钮上的 absolute 会被 shrink-to-fit 压扁，色块叠在一起点不到
          'z-50 w-52 rounded-xl border border-line bg-surface p-2 shadow-pop',
          props.inline ? 'relative mt-1' : 'absolute top-full left-1/2 mt-1 -translate-x-1/2',
        )
      "
    >
      <ul class="flex flex-col gap-0.5">
        <li v-for="swatch in COLOR_SWATCHES" :key="swatch.key">
          <button
            type="button"
            role="option"
            :aria-selected="props.value === swatch.key"
            :title="swatch.label"
            :class="
              cn(
                'flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors',
                props.value === swatch.key
                  ? 'bg-accent-soft text-accent'
                  : 'text-ink-soft hover:bg-surface-soft hover:text-ink',
              )
            "
            @click="emit('pick', swatch.key)"
          >
            <span
              aria-hidden
              class="size-6 shrink-0 rounded-md border border-line-strong"
              :style="{ background: resolveColor(props.theme, swatch.key) }"
            />
            <span class="text-[12px]">{{ swatch.label }}</span>
          </button>
        </li>
      </ul>
      <div class="mt-2 flex items-center gap-2 border-t border-line pt-2">
        <label
          class="flex flex-1 cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-soft"
        >
          <input
            type="color"
            :aria-label="`${props.label}自定义`"
            :value="props.value?.startsWith('#') ? props.value : '#888888'"
            :disabled="props.disabled"
            class="h-6 w-6 shrink-0 cursor-pointer rounded border border-line bg-surface p-0"
            @input="onCustom"
          />
          <span class="text-[12px] text-ink-muted">自定义</span>
        </label>
        <button
          v-if="props.allowNone"
          type="button"
          class="shrink-0 rounded-lg px-2 py-1.5 text-[12px] text-ink-muted hover:bg-surface-soft hover:text-accent"
          @click="emit('pick', 'none')"
        >
          无填充
        </button>
      </div>
    </div>
  </div>
</template>
