<script setup lang="ts">
import {
  BarChart3,
  Columns2,
  Columns3,
  Hash,
  Image as ImageIcon,
  LayoutGrid,
  List,
  MessageSquare,
  Table2,
  Type,
} from 'lucide-vue-next'
import { computed } from 'vue'
import type { Component } from 'vue'
import { resolveInsertAnchor, type FlexBlockType } from '@/features/deck/flexTree'
import { insertColumnsAt } from '@/features/deck/insertColumns'
import { getSlideSaveHandlers, requestInsertDrag } from '@/features/deck/slideSaveBridge'
import type { DeckSlide } from '@/features/deck/types'
import { cn } from '@/lib/utils'
import type { FlexContainer } from '@/render/flexLayout'

const BLOCK_BUTTONS: Array<{ type: FlexBlockType; label: string; icon: Component }> = [
  { type: 'text', label: '文本', icon: Type },
  { type: 'bullets', label: '列表', icon: List },
  { type: 'image', label: '图片', icon: ImageIcon },
  { type: 'kpi', label: 'KPI', icon: Hash },
  { type: 'cards', label: '卡片', icon: LayoutGrid },
  { type: 'callout', label: '提示', icon: MessageSquare },
  { type: 'table', label: '表格', icon: Table2 },
  { type: 'chart', label: '图表', icon: BarChart3 },
]

/**
 * 版式侧栏插入条：拖到画布落点插入；未拖动松手则落到选中块后/根末尾。
 */
const props = withDefaults(
  defineProps<{
    projectId: string
    slide: DeckSlide
    selectedBlockId: string | null
    disabled?: boolean
  }>(),
  { disabled: false },
)

const isFlex = computed(() => props.slide.layout_mode === 'flex' && props.slide.layout_tree != null)
const locked = computed(() => Boolean(props.disabled || !getSlideSaveHandlers(props.slide.id)))

const insertBlock = (type: FlexBlockType) => {
  if (locked.value) return
  const handlers = getSlideSaveHandlers(props.slide.id)
  if (!handlers) return
  const tree = props.slide.layout_tree as FlexContainer
  const anchor = resolveInsertAnchor(tree, props.selectedBlockId)
  handlers.commitCreateBlock({ type, parent_id: anchor.parentId, index: anchor.index })
}

// 入队即返回，失败由保存队列的状态提示；这里不做本地 try/catch 以免看起来已兜住
const insertColumns = (count: 2 | 3) => {
  if (locked.value) return
  const handlers = getSlideSaveHandlers(props.slide.id)
  if (!handlers) return
  const tree = props.slide.layout_tree as FlexContainer
  const anchor = resolveInsertAnchor(tree, props.selectedBlockId)
  handlers.commitMutate((current) => insertColumnsAt(props.projectId, current, anchor, count))
}

const beginDragBlock = (type: FlexBlockType, event: PointerEvent) => {
  if (locked.value) return
  event.preventDefault()
  if (!requestInsertDrag(props.slide.id, { kind: 'block', type }, event.clientX, event.clientY)) {
    insertBlock(type)
  }
}

const beginDragColumns = (count: 2 | 3, event: PointerEvent) => {
  if (locked.value) return
  event.preventDefault()
  if (!requestInsertDrag(props.slide.id, { kind: 'columns', count }, event.clientX, event.clientY)) {
    insertColumns(count)
  }
}
</script>

<template>
  <div v-if="isFlex" class="rounded-xl border border-line bg-surface-soft/40 p-3">
    <p class="mb-2 text-[12px] font-medium text-ink-soft">插入内容</p>
    <div class="grid grid-cols-3 gap-0.5">
      <button
        v-for="item in BLOCK_BUTTONS"
        :key="item.type"
        type="button"
        :title="`拖入${item.label}，或轻点插入`"
        :disabled="locked"
        :class="
          cn(
            'flex cursor-grab flex-col items-center gap-1 rounded-lg px-1.5 py-2.5 text-[11px] transition-colors',
            'text-ink-soft hover:bg-surface hover:text-ink active:cursor-grabbing',
            'disabled:opacity-40',
          )
        "
        @pointerdown="beginDragBlock(item.type, $event)"
      >
        <component :is="item.icon" class="size-3.5" />
        {{ item.label }}
      </button>
    </div>
    <div class="mt-2 grid grid-cols-2 gap-0.5 border-t border-line pt-2">
      <button
        type="button"
        :disabled="locked"
        title="拖入 2 列，或轻点插入"
        class="flex cursor-grab items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-ink-soft hover:bg-surface hover:text-ink active:cursor-grabbing disabled:opacity-40"
        @pointerdown="beginDragColumns(2, $event)"
      >
        <Columns2 class="size-3.5" />
        2 列
      </button>
      <button
        type="button"
        :disabled="locked"
        title="拖入 3 列，或轻点插入"
        class="flex cursor-grab items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-[11px] text-ink-soft hover:bg-surface hover:text-ink active:cursor-grabbing disabled:opacity-40"
        @pointerdown="beginDragColumns(3, $event)"
      >
        <Columns3 class="size-3.5" />
        3 列
      </button>
    </div>
  </div>
</template>
