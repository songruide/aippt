<script setup lang="ts">
import { GripVertical } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import type { CSSProperties } from 'vue'
import {
  CORNER_HANDLES,
  EDGE_HANDLES,
  NARROW_BLOCK_HIDE_CORNER,
  gripOffsetStyle,
  pct,
  type RectLike,
} from '@/features/deck/flexEditGeometry'
import type { ColumnDivider, ResizeSide, RowDivider } from '@/features/deck/flexTree'
import type { DeckSlide } from '@/features/deck/types'
import { useFlexPointerSession } from '@/features/deck/useFlexPointerSession'
import { cn } from '@/lib/utils'
import type { FlexContainer } from '@/render/flexLayout'

/**
 * flex 编辑叠加层：拖拽重排/侧栏拖入插入、行列拉伸。
 */
const props = withDefaults(
  defineProps<{
    projectId: string
    slide: DeckSlide
    tree: FlexContainer
    selectedBlockId: string | null
    /** 保存中：范围框与手柄照常显示，只是不接新手势，避免每次保存都闪一下 */
    busy?: boolean
  }>(),
  { busy: false },
)

const emit = defineEmits<{
  previewTree: [next: FlexContainer | null]
  commitTree: [next: FlexContainer]
  selectBlock: [blockId: string]
  draggingChange: [dragging: boolean]
}>()

const {
  rootRef,
  drag,
  rowDividers,
  columnDividers,
  blockIds,
  placements,
  dragging,
  draggingBlockId,
  visibleHandleId,
  selectedRect,
  hitClass,
  ghostLabel,
  startReorder,
  startRatio,
  startGrow,
  beginBlockResize,
  beginCornerResize,
} = useFlexPointerSession({
  projectId: props.projectId,
  slide: () => props.slide,
  tree: () => props.tree,
  selectedBlockId: () => props.selectedBlockId,
  busy: () => props.busy,
  onPreviewTree: (next) => emit('previewTree', next),
  onCommitTree: (next) => emit('commitTree', next),
  onSelectBlock: (blockId) => emit('selectBlock', blockId),
  onDraggingChange: (value) => emit('draggingChange', value),
})

// 悬停高亮是叠加层自己的视觉状态，留在本组件里（会话不对外暴露 setter）
const hoveredDividerKey = ref<string | null>(null)

/**
 * 会话内部持有根节点引用，模板只能用函数 ref 回写：
 * 字符串 ref 不会被 vue-tsc 计为「已使用」，会误报未使用变量。
 */
function bindRootEl(el: unknown) {
  rootRef.value = (el as HTMLDivElement | null) ?? null
}
const onDividerEnter = (key: string) => {
  hoveredDividerKey.value = key
}
const onDividerLeave = (key: string) => {
  if (hoveredDividerKey.value === key) hoveredDividerKey.value = null
}

const isRowActive = (divider: RowDivider, key: string) => {
  const current = drag.value
  if (
    current?.kind === 'ratio' &&
    current.rowId === divider.rowId &&
    current.leftIndex === divider.leftIndex
  ) {
    return true
  }
  return hoveredDividerKey.value === key
}

const isColumnActive = (divider: ColumnDivider, key: string) => {
  const current = drag.value
  if (
    current?.kind === 'grow' &&
    current.columnId === divider.columnId &&
    current.topIndex === divider.topIndex
  ) {
    return true
  }
  return hoveredDividerKey.value === key
}

const visibleGrips = computed(() => {
  const result: Array<{ blockId: string; rect: RectLike; isSelected: boolean }> = []
  for (const blockId of blockIds.value) {
    if (draggingBlockId.value === blockId) continue
    const rect = placements.value.get(blockId)
    if (!rect) continue
    if (visibleHandleId.value !== blockId) continue
    result.push({ blockId, rect, isSelected: props.selectedBlockId === blockId })
  }
  return result
})

const activeDragBox = computed(() => {
  const current = drag.value
  if (!current) return false
  if (current.kind !== 'grow' && current.kind !== 'box' && current.kind !== 'ratio') return false
  return current.activated
})

const showHandles = computed(() =>
  Boolean(props.selectedBlockId && selectedRect.value && !dragging.value),
)

const corners = computed(() => {
  const rect = selectedRect.value
  if (!rect || !showHandles.value || rect.w < NARROW_BLOCK_HIDE_CORNER) return []
  return CORNER_HANDLES.map((handle) => ({ handle, style: handle.style(rect) }))
})

const edges = computed(() => {
  const rect = selectedRect.value
  if (!rect || !showHandles.value) return []
  return EDGE_HANDLES.map((handle) => ({ handle, style: handle.style(rect) }))
})

const ghostStyle = computed<CSSProperties | null>(() => {
  const current = drag.value
  if (!current) return null
  if (current.kind !== 'reorder' && current.kind !== 'insert') return null
  if (current.kind === 'insert' && !current.activated) return null
  return {
    left: `${(current.pointerX - current.grabOffsetX) * 100}%`,
    top: `${(current.pointerY - current.grabOffsetY) * 100}%`,
    width: `${current.ghostW * 100}%`,
    height: `${current.ghostH * 100}%`,
    opacity: 0.92,
  }
})

const dropLineStyle = computed<CSSProperties | null>(() => {
  const current = drag.value
  if (!current) return null
  const visible = current.kind === 'reorder' || (current.kind === 'insert' && current.activated)
  if (!visible) return null
  const line = current.drop?.line
  if (!line) return null
  return line.axis === 'y'
    ? {
        left: `${line.x * 100}%`,
        top: `${line.y * 100}%`,
        width: `${line.w * 100}%`,
        height: 3,
        transform: 'translateY(-1.5px)',
      }
    : {
        left: `${line.x * 100}%`,
        top: `${line.y * 100}%`,
        width: 3,
        height: `${line.h * 100}%`,
        transform: 'translateX(-1.5px)',
      }
})

const beginCorner = (sideX: ResizeSide, sideY: ResizeSide, event: PointerEvent) => {
  const blockId = props.selectedBlockId
  if (!blockId) return
  beginCornerResize(blockId, sideX, sideY, event)
}

const beginEdge = (axis: 'x' | 'y', side: ResizeSide, event: PointerEvent) => {
  const blockId = props.selectedBlockId
  if (!blockId) return
  beginBlockResize(blockId, axis, side, event)
}
</script>

<template>
  <div :ref="bindRootEl" class="pointer-events-none absolute inset-0 z-10">
    <div
      v-for="divider in rowDividers"
      :key="`row:${divider.rowId}-${divider.leftIndex}`"
      role="separator"
      aria-orientation="vertical"
      title="拖动调整宽度"
      :class="
        cn(hitClass, 'absolute z-20 flex w-3 -translate-x-1/2 cursor-col-resize justify-center')
      "
      :style="{
        left: `${divider.x * 100}%`,
        top: `${divider.y * 100}%`,
        height: `${divider.h * 100}%`,
      }"
      @pointerenter="onDividerEnter(`row:${divider.rowId}-${divider.leftIndex}`)"
      @pointerleave="onDividerLeave(`row:${divider.rowId}-${divider.leftIndex}`)"
      @pointerdown="startRatio(divider, $event)"
    >
      <span
        :class="
          cn(
            'h-full w-0.5 rounded-full transition-colors',
            isRowActive(divider, `row:${divider.rowId}-${divider.leftIndex}`)
              ? 'bg-accent/60'
              : 'bg-transparent',
          )
        "
      />
    </div>

    <div
      v-for="divider in columnDividers"
      :key="`col:${divider.columnId}-${divider.topIndex}`"
      role="separator"
      aria-orientation="horizontal"
      title="拖动调整高度"
      :class="
        cn(hitClass, 'absolute z-20 flex h-3 -translate-y-1/2 cursor-row-resize items-center')
      "
      :style="{
        left: `${divider.x * 100}%`,
        top: `${divider.y * 100}%`,
        width: `${divider.w * 100}%`,
      }"
      @pointerenter="onDividerEnter(`col:${divider.columnId}-${divider.topIndex}`)"
      @pointerleave="onDividerLeave(`col:${divider.columnId}-${divider.topIndex}`)"
      @pointerdown="startGrow(divider, $event)"
    >
      <span
        :class="
          cn(
            'w-full h-0.5 rounded-full transition-colors',
            isColumnActive(divider, `col:${divider.columnId}-${divider.topIndex}`)
              ? 'bg-accent/60'
              : 'bg-transparent',
          )
        "
      />
    </div>

    <button
      v-for="grip in visibleGrips"
      :key="grip.blockId"
      type="button"
      title="拖动排序；按住 Alt 微调位置，方向键 1pt / Shift 10pt"
      aria-label="拖动排序"
      :class="
        cn(
          hitClass,
          'absolute z-20 grid size-5 place-items-center',
          'rounded-md border bg-surface text-ink-muted shadow-sm transition-opacity',
          'cursor-grab active:cursor-grabbing',
          grip.isSelected
            ? 'border-accent/50 text-ink opacity-100'
            : 'border-line opacity-90 hover:opacity-100 hover:text-ink',
        )
      "
      :style="gripOffsetStyle(grip.rect)"
      @pointerdown="startReorder(grip.blockId, $event)"
    >
      <GripVertical class="size-3" />
    </button>

    <div
      v-if="props.selectedBlockId && selectedRect && activeDragBox"
      aria-hidden
      class="pointer-events-none absolute z-[25] rounded-sm border border-accent/55 bg-accent/5"
      :style="{
        left: pct(selectedRect.x),
        top: pct(selectedRect.y),
        width: pct(selectedRect.w),
        height: pct(selectedRect.h),
      }"
    />

    <template v-if="showHandles">
      <div
        v-for="item in corners"
        :key="item.handle.key"
        role="separator"
        title="拖动同时调整宽高"
        :class="
          cn(
            hitClass,
            'absolute z-30 grid size-3 -translate-x-1/2 -translate-y-1/2 place-items-center',
            item.handle.className,
          )
        "
        :style="item.style"
        @pointerdown="beginCorner(item.handle.sideX, item.handle.sideY, $event)"
      >
        <span class="size-2 rounded-[2px] border border-accent/70 bg-surface shadow-sm" />
      </div>
      <!-- 边手柄叠在角点之上（四角已 inset），保证上下边拖是纯纵向 -->
      <div
        v-for="item in edges"
        :key="item.handle.key"
        role="separator"
        :title="item.handle.title"
        :class="
          cn(hitClass, 'absolute z-[31] flex items-center justify-center', item.handle.className)
        "
        :style="item.style"
        @pointerdown="beginEdge(item.handle.axis, item.handle.side, $event)"
      >
        <span :class="item.handle.barClassName" />
      </div>
    </template>

    <div
      v-if="ghostStyle"
      aria-hidden
      class="absolute z-40 overflow-hidden rounded-lg border border-accent/50 bg-surface/90 px-2 py-1.5 shadow-pop backdrop-blur-sm"
      :style="ghostStyle"
    >
      <div class="flex h-full items-start gap-1.5">
        <GripVertical class="mt-0.5 size-3 shrink-0 text-ink-muted" />
        <span class="line-clamp-3 text-[11px] leading-snug text-ink-soft">{{ ghostLabel }}</span>
      </div>
    </div>

    <div
      v-if="dropLineStyle"
      aria-hidden
      class="absolute z-30 rounded-full bg-accent/80"
      :style="dropLineStyle"
    />
  </div>
</template>
