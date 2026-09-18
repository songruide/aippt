<script setup lang="ts">
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  MoreHorizontal,
  RotateCcw,
  TableProperties,
  Trash2,
} from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import ElementColorSwatch from '@/features/deck/ElementColorSwatch.vue'
import { cn } from '@/lib/utils'
import {
  type BlockStyle,
  isStyleEmpty,
  patchStyle,
  styleCapability,
} from '@/render/blockStyle'
import type { GroupPreset } from '@/render/flexLayout'
import type { Block, EditableBlockCommit, TableBlock, Theme } from '@/render/types'

const PRESET_CHIPS: Array<{ value: GroupPreset; label: string }> = [
  { value: 'solid_boxes', label: '实心' },
  { value: 'outline_boxes', label: '描边' },
  { value: 'side_line', label: '侧线' },
  { value: 'numbered_steps', label: '步骤' },
  { value: 'timeline', label: '时间线' },
]

const SIZE_STEP = 2

/**
 * 选中元素上方的浮动工具条。挂在 article 上定位，避免画布 overflow 裁切，
 * 也不随 zoom 把工具条字号一起放大。
 */
const props = withDefaults(
  defineProps<{
    articleEl: HTMLElement | null
    blockEl: HTMLElement | null
    block: Block
    theme: Theme
    disabled?: boolean
    /** flex 模式删除内容块 */
    deleteEnabled?: boolean
    /** 表格结构 / 图表数据等整包内容提交（对应 onCommitContent） */
    contentEnabled?: boolean
    /** flex：选中块父容器的预设皮肤（对应 onFlexPresetChange） */
    presetEnabled?: boolean
    flexPreset?: GroupPreset | null
  }>(),
  {
    disabled: false,
    deleteEnabled: false,
    contentEnabled: false,
    presetEnabled: false,
    flexPreset: null,
  },
)

const emit = defineEmits<{
  change: [style: BlockStyle | null]
  commitContent: [change: EditableBlockCommit]
  flexPresetChange: [preset: GroupPreset | null]
  delete: []
  dismiss: []
}>()

const barRef = ref<HTMLDivElement | null>(null)
const pos = ref<{ left: number; top: number } | null>(null)
const colorOpen = ref<'color' | 'fill' | 'border' | null>(null)
const moreOpen = ref(false)

const blockStyle = computed(() => props.block.style ?? null)
const caps = computed(() => styleCapability(props.block.type))
const supported = computed(() => caps.value.text || caps.value.box || caps.value.borderOnly)
const showPreset = computed(() => props.presetEnabled)
const showTableOps = computed(() => props.block.type === 'table' && props.contentEnabled)
const showBar = computed(
  () => supported.value || props.deleteEnabled || showPreset.value || showTableOps.value,
)
const tableBlock = computed<TableBlock | null>(() =>
  props.block.type === 'table' ? props.block : null,
)

const resolvedSize = computed(() =>
  blockStyle.value?.size_pt != null ? Math.round(blockStyle.value.size_pt) : null,
)
const bold = computed(() => (blockStyle.value?.weight ?? 400) >= 600)
const italic = computed(() => Boolean(blockStyle.value?.italic))
const align = computed(() => blockStyle.value?.align ?? 'left')

const apply = (patch: Partial<BlockStyle>) => {
  if (props.disabled) return
  emit('change', patchStyle(blockStyle.value, patch))
}

const reposition = () => {
  if (!props.articleEl || !props.blockEl || !barRef.value) return
  const articleBox = props.articleEl.getBoundingClientRect()
  const blockBox = props.blockEl.getBoundingClientRect()
  const barBox = barRef.value.getBoundingClientRect()
  const gap = 8
  let top = blockBox.top - articleBox.top - barBox.height - gap
  if (top < 4) {
    top = blockBox.bottom - articleBox.top + gap
  }
  let left = blockBox.left - articleBox.left + blockBox.width / 2 - barBox.width / 2
  left = Math.max(4, Math.min(left, articleBox.width - barBox.width - 4))
  const next = { left, top }
  // 坐标未变时不赋值，避免 post-flush watch 死循环把页面打崩
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
  () => [showBar.value, props.articleEl, props.blockEl, props.block.id] as const,
  () => {
    if (!showBar.value) return
    reposition()
  },
  { flush: 'post' },
)

watch(
  () => [showBar.value, props.articleEl, props.blockEl] as const,
  (_next, _previous, onCleanup) => {
    const articleEl = props.articleEl
    const blockEl = props.blockEl
    if (!showBar.value || !articleEl || !blockEl) return
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
  () => showBar.value,
  (visible, _previous, onCleanup) => {
    if (!visible) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        emit('dismiss')
      }
    }
    window.addEventListener('keydown', onKey)
    onCleanup(() => window.removeEventListener('keydown', onKey))
  },
  { flush: 'post' },
)

const toggleColor = (kind: 'color' | 'fill' | 'border') => {
  colorOpen.value = colorOpen.value === kind ? null : kind
}

const pickTextColor = (value: string | null) => {
  apply({ color: value })
  colorOpen.value = null
}

const pickFill = (value: string | null) => {
  apply({ fill: value })
  colorOpen.value = null
}

const pickBorderColor = (value: string | null) => {
  apply({ border_color: value })
  colorOpen.value = null
}

const toggleMore = () => {
  moreOpen.value = !moreOpen.value
  colorOpen.value = null
}

const onRadiusInput = (event: Event) => {
  apply({ radius_pt: Number((event.target as HTMLInputElement).value) })
}

const onPaddingInput = (event: Event) => {
  apply({ padding_pt: Number((event.target as HTMLInputElement).value) })
}

const onBorderWidthInput = (event: Event) => {
  const width = Number((event.target as HTMLInputElement).value)
  apply({
    border_width_pt: width,
    border_color: width > 0 ? (blockStyle.value?.border_color ?? 'line') : null,
  })
}

const tableReplace = (header: string[], rows: string[][]) => {
  emit('commitContent', { type: 'table', kind: 'replace', header, rows })
}

const addRow = () => {
  const block = tableBlock.value
  if (!block) return
  const cols = Math.max(block.header.length, 1)
  tableReplace(block.header, [...block.rows, Array.from({ length: cols }, () => '')])
}

const addColumn = () => {
  const block = tableBlock.value
  if (!block) return
  tableReplace(
    [...block.header, `列${block.header.length + 1}`],
    block.rows.map((row) => [...row, '']),
  )
}

const removeRow = () => {
  const block = tableBlock.value
  if (!block) return
  tableReplace(block.header, block.rows.slice(0, -1))
}

const removeColumn = () => {
  const block = tableBlock.value
  if (!block) return
  tableReplace(
    block.header.slice(0, -1),
    block.rows.map((row) => row.slice(0, -1)),
  )
}

const togglePreset = (preset: GroupPreset) => {
  emit('flexPresetChange', props.flexPreset === preset ? null : preset)
}
</script>

<template>
  <div
    v-if="showBar"
    ref="barRef"
    role="toolbar"
    aria-label="元素样式"
    class="absolute z-50 flex items-center gap-0.5 rounded-xl border border-line bg-surface px-1.5 py-1 shadow-pop"
    :style="{ left: pos?.left ?? 0, top: pos?.top ?? 0, visibility: pos ? 'visible' : 'hidden' }"
    @pointerdown="(event) => event.stopPropagation()"
  >
    <template v-if="caps.text">
      <button
        type="button"
        title="减小字号"
        aria-label="减小字号"
        :disabled="props.disabled"
        class="grid size-7 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink disabled:opacity-40"
        @click="apply({ size_pt: Math.max(8, (resolvedSize ?? 16) - SIZE_STEP) })"
      >
        <span class="text-[11px] font-semibold">A−</span>
      </button>
      <span class="min-w-7 px-0.5 text-center text-[11px] text-ink-muted tabular-nums">
        {{ resolvedSize ?? '—' }}
      </span>
      <button
        type="button"
        title="增大字号"
        aria-label="增大字号"
        :disabled="props.disabled"
        class="grid size-7 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink disabled:opacity-40"
        @click="apply({ size_pt: Math.min(72, (resolvedSize ?? 16) + SIZE_STEP) })"
      >
        <span class="text-[11px] font-semibold">A+</span>
      </button>
      <span aria-hidden class="mx-0.5 h-4 w-px bg-line" />
      <button
        type="button"
        title="加粗"
        aria-label="加粗"
        :aria-pressed="bold"
        :disabled="props.disabled"
        :class="
          cn(
            'grid size-7 place-items-center rounded-lg transition-colors',
            bold ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-surface-soft hover:text-ink',
            'disabled:opacity-40',
          )
        "
        @click="apply({ weight: bold ? 400 : 700 })"
      >
        <Bold class="size-3.5" />
      </button>
      <button
        type="button"
        title="斜体"
        aria-label="斜体"
        :aria-pressed="italic"
        :disabled="props.disabled"
        :class="
          cn(
            'grid size-7 place-items-center rounded-lg transition-colors',
            italic ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-surface-soft hover:text-ink',
            'disabled:opacity-40',
          )
        "
        @click="apply({ italic: !italic })"
      >
        <Italic class="size-3.5" />
      </button>
      <ElementColorSwatch
        label="文字颜色"
        :open="colorOpen === 'color'"
        :theme="props.theme"
        :value="blockStyle?.color ?? null"
        :disabled="props.disabled"
        @toggle="toggleColor('color')"
        @pick="pickTextColor"
      />
      <span aria-hidden class="mx-0.5 h-4 w-px bg-line" />
      <button
        type="button"
        title="左对齐"
        aria-label="左对齐"
        :aria-pressed="align === 'left'"
        :disabled="props.disabled"
        :class="
          cn(
            'grid size-7 place-items-center rounded-lg transition-colors',
            align === 'left' ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-surface-soft hover:text-ink',
            'disabled:opacity-40',
          )
        "
        @click="apply({ align: 'left' })"
      >
        <AlignLeft class="size-3.5" />
      </button>
      <button
        type="button"
        title="居中"
        aria-label="居中"
        :aria-pressed="align === 'center'"
        :disabled="props.disabled"
        :class="
          cn(
            'grid size-7 place-items-center rounded-lg transition-colors',
            align === 'center' ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-surface-soft hover:text-ink',
            'disabled:opacity-40',
          )
        "
        @click="apply({ align: 'center' })"
      >
        <AlignCenter class="size-3.5" />
      </button>
      <button
        type="button"
        title="右对齐"
        aria-label="右对齐"
        :aria-pressed="align === 'right'"
        :disabled="props.disabled"
        :class="
          cn(
            'grid size-7 place-items-center rounded-lg transition-colors',
            align === 'right' ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-surface-soft hover:text-ink',
            'disabled:opacity-40',
          )
        "
        @click="apply({ align: 'right' })"
      >
        <AlignRight class="size-3.5" />
      </button>
    </template>

    <template v-if="caps.box">
      <span v-if="caps.text" aria-hidden class="mx-0.5 h-4 w-px bg-line" />
      <ElementColorSwatch
        label="填充"
        :open="colorOpen === 'fill'"
        :theme="props.theme"
        :value="blockStyle?.fill === 'none' ? null : (blockStyle?.fill ?? null)"
        allow-none
        :disabled="props.disabled"
        @toggle="toggleColor('fill')"
        @pick="pickFill"
      />
      <div class="relative">
        <button
          type="button"
          title="更多"
          aria-label="更多"
          :aria-pressed="moreOpen"
          :disabled="props.disabled"
          :class="
            cn(
              'grid size-7 place-items-center rounded-lg transition-colors',
              moreOpen ? 'bg-accent-soft text-accent' : 'text-ink-soft hover:bg-surface-soft hover:text-ink',
              'disabled:opacity-40',
            )
          "
          @click="toggleMore"
        >
          <MoreHorizontal class="size-3.5" />
        </button>
        <div
          v-if="moreOpen"
          class="absolute top-full left-0 z-50 mt-1 w-52 rounded-xl border border-line bg-surface p-3 shadow-pop"
        >
          <label class="flex flex-col gap-1.5">
            <span class="flex justify-between text-[11px] text-ink-muted">
              <span>圆角</span>
              <span class="tabular-nums">{{ Math.round(blockStyle?.radius_pt ?? 0) }} pt</span>
            </span>
            <input
              type="range"
              :min="0"
              :max="24"
              :step="1"
              :disabled="props.disabled"
              :value="Math.round(blockStyle?.radius_pt ?? 0)"
              class="w-full accent-[var(--color-accent)]"
              @input="onRadiusInput"
            />
          </label>
          <label class="mt-3 flex flex-col gap-1.5">
            <span class="flex justify-between text-[11px] text-ink-muted">
              <span>内边距</span>
              <span class="tabular-nums">{{ Math.round(blockStyle?.padding_pt ?? 0) }} pt</span>
            </span>
            <input
              type="range"
              :min="0"
              :max="32"
              :step="1"
              :disabled="props.disabled"
              :value="Math.round(blockStyle?.padding_pt ?? 0)"
              class="w-full accent-[var(--color-accent)]"
              @input="onPaddingInput"
            />
          </label>
          <label class="mt-3 flex flex-col gap-1.5">
            <span class="flex justify-between text-[11px] text-ink-muted">
              <span>边框宽度</span>
              <span class="tabular-nums">{{ Math.round(blockStyle?.border_width_pt ?? 0) }} pt</span>
            </span>
            <input
              type="range"
              :min="0"
              :max="4"
              :step="0.5"
              :disabled="props.disabled"
              :value="blockStyle?.border_width_pt ?? 0"
              class="w-full accent-[var(--color-accent)]"
              @input="onBorderWidthInput"
            />
          </label>
          <div v-if="(blockStyle?.border_width_pt ?? 0) > 0" class="mt-2">
            <ElementColorSwatch
              label="边框颜色"
              :open="colorOpen === 'border'"
              :theme="props.theme"
              :value="blockStyle?.border_color ?? 'line'"
              :disabled="props.disabled"
              inline
              @toggle="toggleColor('border')"
              @pick="pickBorderColor"
            />
          </div>
        </div>
      </div>
    </template>

    <template v-if="caps.borderOnly">
      <label class="flex items-center gap-1.5 px-1 text-[11px] text-ink-muted">
        边框
        <input
          type="range"
          :min="0"
          :max="4"
          :step="0.5"
          :disabled="props.disabled"
          :value="blockStyle?.border_width_pt ?? 0"
          class="w-16 accent-[var(--color-accent)]"
          @input="onBorderWidthInput"
        />
      </label>
      <ElementColorSwatch
        v-if="(blockStyle?.border_width_pt ?? 0) > 0"
        label="边框颜色"
        :open="colorOpen === 'border'"
        :theme="props.theme"
        :value="blockStyle?.border_color ?? 'line'"
        :disabled="props.disabled"
        @toggle="toggleColor('border')"
        @pick="pickBorderColor"
      />
    </template>

    <template v-if="!isStyleEmpty(blockStyle) && supported">
      <span aria-hidden class="mx-0.5 h-4 w-px bg-line" />
      <button
        type="button"
        title="清除样式"
        aria-label="清除样式"
        :disabled="props.disabled"
        class="grid size-7 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink disabled:opacity-40"
        @click="emit('change', null)"
      >
        <RotateCcw class="size-3.5" />
      </button>
    </template>

    <template v-if="showTableOps && tableBlock">
      <span
        v-if="supported || !isStyleEmpty(blockStyle)"
        aria-hidden
        class="mx-0.5 h-4 w-px bg-line"
      />
      <div class="flex items-center gap-0.5" role="group" aria-label="表格结构">
        <TableProperties class="mx-0.5 size-3.5 text-ink-muted" />
        <button
          type="button"
          title="加行"
          aria-label="加行"
          :disabled="props.disabled"
          class="grid size-7 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink disabled:opacity-40"
          @click="addRow"
        >
          <span class="text-[10px] font-medium">+行</span>
        </button>
        <button
          type="button"
          title="加列"
          aria-label="加列"
          :disabled="props.disabled"
          class="grid size-7 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink disabled:opacity-40"
          @click="addColumn"
        >
          <span class="text-[10px] font-medium">+列</span>
        </button>
        <button
          type="button"
          title="删行"
          aria-label="删行"
          :disabled="props.disabled || tableBlock.rows.length <= 1"
          class="grid size-7 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink disabled:opacity-40"
          @click="removeRow"
        >
          <span class="text-[10px] font-medium">−行</span>
        </button>
        <button
          type="button"
          title="删列"
          aria-label="删列"
          :disabled="props.disabled || tableBlock.header.length <= 1"
          class="grid size-7 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink disabled:opacity-40"
          @click="removeColumn"
        >
          <span class="text-[10px] font-medium">−列</span>
        </button>
      </div>
    </template>

    <template v-if="showPreset">
      <span
        v-if="supported || !isStyleEmpty(blockStyle) || showTableOps"
        aria-hidden
        class="mx-0.5 h-4 w-px bg-line"
      />
      <div role="group" aria-label="容器皮肤" class="flex items-center gap-0.5 px-0.5">
        <button
          v-for="chip in PRESET_CHIPS"
          :key="chip.value"
          type="button"
          :title="chip.label"
          :aria-label="chip.label"
          :aria-pressed="props.flexPreset === chip.value"
          :disabled="props.disabled"
          :class="
            cn(
              'grid size-7 place-items-center rounded-md border transition-colors disabled:opacity-40',
              props.flexPreset === chip.value
                ? 'border-accent bg-accent-soft'
                : 'border-line hover:border-line-strong hover:bg-surface-soft',
            )
          "
          @click="togglePreset(chip.value)"
        >
          <!-- 工具条内的迷你皮肤预览 -->
          <span v-if="chip.value === 'solid_boxes'" aria-hidden class="flex gap-0.5">
            <span class="size-2 rounded-[2px] bg-ink/55" />
            <span class="size-2 rounded-[2px] bg-ink/35" />
          </span>
          <span v-else-if="chip.value === 'outline_boxes'" aria-hidden class="flex gap-0.5">
            <span class="size-2 rounded-[2px] border border-ink/55" />
            <span class="size-2 rounded-[2px] border border-ink/35" />
          </span>
          <span
            v-else-if="chip.value === 'side_line'"
            aria-hidden
            class="flex h-2.5 w-3.5 items-stretch gap-0.5"
          >
            <span class="w-0.5 rounded-full bg-accent" />
            <span class="flex flex-1 flex-col justify-center gap-0.5">
              <span class="h-px w-full bg-ink/40" />
              <span class="h-px w-2/3 bg-ink/25" />
            </span>
          </span>
          <span
            v-else-if="chip.value === 'numbered_steps'"
            aria-hidden
            class="flex items-center gap-0.5"
          >
            <span
              class="grid size-2 place-items-center rounded-full bg-accent text-[5px] leading-none text-white"
            >
              1
            </span>
            <span class="h-px w-1.5 bg-ink/30" />
            <span
              class="grid size-2 place-items-center rounded-full bg-ink/35 text-[5px] leading-none text-white"
            >
              2
            </span>
          </span>
          <span v-else aria-hidden class="relative flex h-2.5 w-3.5 items-center">
            <span class="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink/30" />
            <span class="relative z-10 size-1.5 rounded-full bg-accent" />
            <span class="relative z-10 ml-auto size-1.5 rounded-full bg-ink/40" />
          </span>
        </button>
      </div>
    </template>

    <template v-if="props.deleteEnabled">
      <span
        v-if="supported || !isStyleEmpty(blockStyle) || showPreset || showTableOps"
        aria-hidden
        class="mx-0.5 h-4 w-px bg-line"
      />
      <button
        type="button"
        title="删除"
        aria-label="删除"
        :disabled="props.disabled"
        class="grid size-7 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink disabled:opacity-40"
        @click="emit('delete')"
      >
        <Trash2 class="size-3.5" />
      </button>
    </template>
  </div>
</template>
