<script setup lang="ts">
import { Plus, Trash2 } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { cn } from '@/lib/utils'
import type { ChartBlock, EditableBlockCommit } from '@/render/types'

const CHART_TYPES: Array<{ value: ChartBlock['chart_type']; label: string }> = [
  { value: 'bar', label: '条形' },
  { value: 'column', label: '柱状' },
  { value: 'line', label: '折线' },
  { value: 'pie', label: '饼图' },
]

/**
 * 选中图表时的数据编辑浮层：改类型、类别与系列数值。
 */
const props = withDefaults(
  defineProps<{
    articleEl: HTMLElement | null
    blockEl: HTMLElement | null
    block: ChartBlock
    disabled?: boolean
  }>(),
  { disabled: false },
)

const emit = defineEmits<{
  commit: [change: EditableBlockCommit]
  dismiss: []
}>()

const panelRef = ref<HTMLDivElement | null>(null)
const pos = ref<{ left: number; top: number } | null>(null)
const chartType = ref(props.block.chart_type)
const categories = ref([...props.block.categories])
const series = ref(
  props.block.series.map((item) => ({ name: item.name, values: [...item.values] })),
)
const unit = ref(props.block.unit ?? '')

watch(
  () => props.block,
  (block) => {
    chartType.value = block.chart_type
    categories.value = [...block.categories]
    series.value = block.series.map((item) => ({ name: item.name, values: [...item.values] }))
    unit.value = block.unit ?? ''
  },
  { immediate: true },
)

const reposition = () => {
  if (!props.articleEl || !props.blockEl || !panelRef.value) return
  const articleBox = props.articleEl.getBoundingClientRect()
  const blockBox = props.blockEl.getBoundingClientRect()
  const panelBox = panelRef.value.getBoundingClientRect()
  let top = blockBox.bottom - articleBox.top + 8
  if (top + panelBox.height > articleBox.height - 4) {
    top = Math.max(4, blockBox.top - articleBox.top - panelBox.height - 8)
  }
  let left = blockBox.left - articleBox.left
  left = Math.max(4, Math.min(left, articleBox.width - panelBox.width - 4))
  const next = { left, top }
  const previous = pos.value
  if (
    previous &&
    Math.abs(previous.left - next.left) < 0.5 &&
    Math.abs(previous.top - next.top) < 0.5
  ) {
    return
  }
  pos.value = next
}

watch(
  () => [props.articleEl, props.blockEl, props.block.id, categories.value.length, series.value.length] as const,
  () => reposition(),
  { flush: 'post' },
)

watch(
  () => [props.articleEl, props.blockEl] as const,
  (_next, _previous, onCleanup) => {
    const articleEl = props.articleEl
    const blockEl = props.blockEl
    if (!articleEl || !blockEl) return
    const ro = new ResizeObserver(() => reposition())
    ro.observe(articleEl)
    ro.observe(blockEl)
    window.addEventListener('scroll', reposition, true)
    onCleanup(() => {
      ro.disconnect()
      window.removeEventListener('scroll', reposition, true)
    })
  },
  { flush: 'post' },
)

watch(
  () => props.block.id,
  (_id, _previous, onCleanup) => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        emit('dismiss')
      }
    }
    window.addEventListener('keydown', onKey)
    onCleanup(() => window.removeEventListener('keydown', onKey))
  },
  { flush: 'post', immediate: true },
)

const syncCols = (nextCats: string[]) => {
  categories.value = nextCats
  series.value = series.value.map((item) => ({
    ...item,
    values: nextCats.map((_, index) => item.values[index] ?? 0),
  }))
}

const apply = () => {
  if (props.disabled) return
  const cleanCats = categories.value.map((item) => item.trim() || '类别')
  const cleanSeries = series.value.map((item, index) => ({
    name: item.name.trim() || `系列${index + 1}`,
    values: cleanCats.map((_, col) => Number(item.values[col]) || 0),
  }))
  emit('commit', {
    type: 'chart',
    chart_type: chartType.value,
    categories: cleanCats,
    series: cleanSeries.length
      ? cleanSeries
      : [{ name: '系列1', values: cleanCats.map(() => 0) }],
    unit: unit.value.trim() || null,
  })
}

const gridTemplateColumns = computed(
  () => `4.5rem repeat(${categories.value.length}, minmax(3.5rem, 1fr))`,
)

const onCategoryInput = (index: number, event: Event) => {
  const next = [...categories.value]
  next[index] = (event.target as HTMLInputElement).value
  categories.value = next
}

const onSeriesNameInput = (rowIndex: number, event: Event) => {
  const value = (event.target as HTMLInputElement).value
  series.value = series.value.map((row, i) => (i === rowIndex ? { ...row, name: value } : row))
}

const onValueInput = (rowIndex: number, colIndex: number, event: Event) => {
  const value = Number((event.target as HTMLInputElement).value)
  series.value = series.value.map((row, i) => {
    if (i !== rowIndex) return row
    const values = [...row.values]
    values[colIndex] = Number.isFinite(value) ? value : 0
    return { ...row, values }
  })
}
</script>

<template>
  <div
    ref="panelRef"
    class="absolute z-40 w-[22rem] rounded-xl border border-line bg-surface p-3 shadow-pop"
    :style="pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }"
    @pointerdown="(event) => event.stopPropagation()"
  >
    <div class="mb-2 flex items-center gap-2">
      <span class="flex-1 text-[12px] font-medium text-ink-soft">图表数据</span>
      <div class="flex gap-0.5">
        <button
          v-for="option in CHART_TYPES"
          :key="option.value"
          type="button"
          :disabled="props.disabled"
          :aria-pressed="chartType === option.value"
          :class="
            cn(
              'rounded-md px-1.5 py-0.5 text-[11px] transition-colors disabled:opacity-40',
              chartType === option.value
                ? 'bg-accent-soft text-accent'
                : 'text-ink-muted hover:bg-surface-soft',
            )
          "
          @click="chartType = option.value"
        >
          {{ option.label }}
        </button>
      </div>
    </div>

    <label class="mb-2 flex items-center gap-2 text-[11px] text-ink-muted">
      单位
      <input
        v-model="unit"
        :disabled="props.disabled"
        class="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-[12px] text-ink outline-none focus:border-accent"
        placeholder="可选"
      />
    </label>

    <div class="scrollbar-slim max-h-56 space-y-2 overflow-y-auto">
      <div class="grid gap-1" :style="{ gridTemplateColumns }">
        <span class="text-[10px] text-ink-muted">系列 \\ 类</span>
        <input
          v-for="(cat, index) in categories"
          :key="`cat-${index}`"
          :value="cat"
          :disabled="props.disabled"
          class="rounded border border-line px-1 py-0.5 text-[11px] outline-none focus:border-accent"
          @input="onCategoryInput(index, $event)"
        />
        <template v-for="(item, rowIndex) in series" :key="`s-${rowIndex}`">
          <input
            :value="item.name"
            :disabled="props.disabled"
            class="rounded border border-line px-1 py-0.5 text-[11px] outline-none focus:border-accent"
            @input="onSeriesNameInput(rowIndex, $event)"
          />
          <input
            v-for="(_, colIndex) in categories"
            :key="`v-${rowIndex}-${colIndex}`"
            type="number"
            :value="item.values[colIndex] ?? 0"
            :disabled="props.disabled"
            class="rounded border border-line px-1 py-0.5 text-[11px] outline-none focus:border-accent"
            @input="onValueInput(rowIndex, colIndex, $event)"
          />
        </template>
      </div>
    </div>

    <div class="mt-2 flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        :disabled="props.disabled"
        class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-ink-soft hover:bg-surface-soft disabled:opacity-40"
        @click="syncCols([...categories, `类别${categories.length + 1}`])"
      >
        <Plus class="size-3" />
        类别
      </button>
      <button
        type="button"
        :disabled="props.disabled || categories.length <= 1"
        class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-ink-soft hover:bg-surface-soft disabled:opacity-40"
        @click="syncCols(categories.slice(0, -1))"
      >
        <Trash2 class="size-3" />
        类别
      </button>
      <button
        type="button"
        :disabled="props.disabled"
        class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-ink-soft hover:bg-surface-soft disabled:opacity-40"
        @click="
          series = [
            ...series,
            { name: `系列${series.length + 1}`, values: categories.map(() => 0) },
          ]
        "
      >
        <Plus class="size-3" />
        系列
      </button>
      <button
        type="button"
        :disabled="props.disabled || series.length <= 1"
        class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-ink-soft hover:bg-surface-soft disabled:opacity-40"
        @click="series = series.slice(0, -1)"
      >
        <Trash2 class="size-3" />
        系列
      </button>
      <button
        type="button"
        :disabled="props.disabled"
        class="ml-auto rounded-lg bg-accent px-2.5 py-1 text-[11px] font-medium text-white hover:opacity-90 disabled:opacity-40"
        @click="apply"
      >
        应用
      </button>
    </div>
  </div>
</template>
