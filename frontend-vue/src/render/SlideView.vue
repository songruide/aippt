<script setup lang="ts">
import { computed } from 'vue'
import type { CSSProperties } from 'vue'
import BlockView from '@/render/BlockView.vue'
import { iterAmbientShapes, type AmbientShape } from '@/render/ambient'
import { getLayout } from '@/render/design'
import { solve, type FlexContainer } from '@/render/flexLayout'
import { iterSkinDecorations, type SkinDecoration } from '@/render/flexSkin'
import { pt, rectToStyle, resolveColor, webFontStack } from '@/render/style'
import {
  CANVAS_HEIGHT_PT,
  CANVAS_WIDTH_PT,
  type Block,
  type EditableBlockCommit,
  type Rect,
  type Slide,
  type Slot,
  type TextStyleName,
  type Theme,
} from '@/render/types'

const props = withDefaults(
  defineProps<{
    slide: Slide
    theme: Theme
    editable?: boolean
    selectedBlockId?: string | null
    /** clip=演示/缩略图裁切；reveal=编辑态溢出可见 + 分割线 */
    overflowMode?: 'clip' | 'reveal'
    /** 槽位/块 id：在其底边画溢出分割线 */
    overflowSlotIds?: ReadonlySet<string> | string[]
    /** 页序，供主题氛围层的页码水印使用 */
    slideIndex?: number
  }>(),
  {
    editable: false,
    selectedBlockId: null,
    overflowMode: 'clip',
    overflowSlotIds: undefined,
    slideIndex: 0,
  },
)

const emit = defineEmits<{
  selectBlock: [blockId: string | null]
  commit: [blockId: string, body: EditableBlockCommit]
}>()

type PlacedEntry = { rect: Rect; text_style?: string | null }

function isFlexMode(slide: Slide): slide is Slide & { layout_tree: FlexContainer } {
  return slide.layout_mode === 'flex' && slide.layout_tree != null
}

/** flex 模式无布局槽位时，为 BlockView 构造最小伪槽（几何与 text_style 来自 solver） */
function flexPseudoSlot(block: Block, placed: PlacedEntry): Slot {
  return {
    id: block.slot_id,
    accepts: [block.type],
    rect: placed.rect,
    required: true,
    text_style: (placed.text_style ?? undefined) as TextStyleName | null | undefined,
    capacity: {},
  }
}

/**
 * 内容实占的矩形，供氛围层避让。
 *
 * 只算真正渲染出来的块（槽位空着的话那块地方就是空的），与后端
 * placed_by_block_id 同源，避让结果两端才一致。
 */
function occupiedRects(
  blocks: Block[],
  placements: Map<string, PlacedEntry> | null,
  layout: { slots: Slot[] } | null,
): Rect[] {
  return blocks
    .map((block) =>
      placements
        ? placements.get(block.id)?.rect
        : layout?.slots.find((slot) => slot.id === block.slot_id)?.rect,
    )
    .filter((rect): rect is Rect => rect != null)
}

function toIdSet(ids?: ReadonlySet<string> | string[]): Set<string> {
  if (!ids) return new Set()
  return ids instanceof Set ? ids : new Set(ids)
}

const flex = computed(() => isFlexMode(props.slide))
const layout = computed(() => (flex.value ? null : getLayout(props.slide.layout_id)))
const placements = computed<Map<string, PlacedEntry> | null>(() =>
  flex.value
    ? new Map(solve(props.slide.layout_tree as FlexContainer).map((p) => [p.block_id, p]))
    : null,
)

const ambient = computed(() =>
  iterAmbientShapes(
    props.theme,
    props.slide.layout_id,
    props.slideIndex,
    occupiedRects(props.slide.blocks, placements.value, layout.value),
  ),
)

const skinDecorations = computed(() =>
  flex.value ? iterSkinDecorations(props.slide.layout_tree as FlexContainer) : [],
)

const reveal = computed(() => props.overflowMode === 'reveal')
const overflowIds = computed(() => toIdSet(props.overflowSlotIds))
const lineColor = computed(() => resolveColor(props.theme, 'line'))

interface RenderedBlock {
  block: Block
  rect: Rect
  slot: Slot
  selected: boolean
  markOverflow: boolean
}

/** 逐块解出几何与伪槽；flex 页里找不到落位的块直接跳过 */
const renderedBlocks = computed<RenderedBlock[]>(() => {
  const result: RenderedBlock[] = []
  for (const block of props.slide.blocks) {
    let rect: Rect
    let slot: Slot

    if (flex.value && placements.value) {
      const placed = placements.value.get(block.id)
      if (!placed) continue
      rect = placed.rect
      slot = flexPseudoSlot(block, placed)
    } else {
      const found = layout.value!.slots.find((candidate) => candidate.id === block.slot_id)
      if (!found) continue
      slot = found
      rect = found.rect
    }

    const selected = props.selectedBlockId === block.id
    const markOverflow =
      reveal.value &&
      (overflowIds.value.has(block.slot_id) ||
        overflowIds.value.has(block.id) ||
        // 无具体槽位时：任意溢出标记都画在该块（少见）
        (overflowIds.value.has('*') && (block.type === 'text' || block.type === 'bullets')))

    result.push({ block, rect, slot, selected, markOverflow })
  }
  return result
})

function blockStyle(entry: RenderedBlock): CSSProperties {
  return {
    ...rectToStyle(entry.rect),
    overflow: reveal.value ? 'visible' : 'hidden',
    outline: entry.selected
      ? `2px solid ${resolveColor(props.theme, 'accent')}`
      : '2px solid transparent',
    outlineOffset: entry.selected ? '2px' : 0,
    cursor: props.editable ? 'pointer' : undefined,
    zIndex: entry.selected ? 3 : 1,
  }
}

function onBlockPointerDown(event: PointerEvent, blockId: string) {
  if (!props.editable) return
  // 不阻断 contenteditable 的聚焦；仅同步选中
  event.stopPropagation()
  emit('selectBlock', blockId)
}

function onRootPointerDown(event: PointerEvent) {
  if (!props.editable) return
  // 点在空白处（非 block）才清空选中
  if ((event.target as HTMLElement).closest('[data-block-id]')) return
  emit('selectBlock', null)
}

function ambientShapeStyle(shape: AmbientShape): CSSProperties {
  const base = {
    ...rectToStyle(shape.rect),
    zIndex: 0,
    pointerEvents: 'none' as const,
  }
  if (shape.kind !== 'text') {
    return {
      ...base,
      background: shape.color,
      borderRadius: shape.kind === 'ellipse' ? '50%' : undefined,
    }
  }
  const family = shape.font === 'body' ? props.theme.fonts.body : props.theme.fonts.display
  return {
    ...base,
    display: 'flex',
    alignItems: 'center',
    justifyContent:
      shape.align === 'center' ? 'center' : shape.align === 'right' ? 'flex-end' : 'flex-start',
    fontFamily: webFontStack(family),
    fontSize: pt(shape.size_pt ?? 0),
    fontWeight: shape.weight ?? 400,
    letterSpacing: shape.letter_spacing_pt ? pt(shape.letter_spacing_pt) : undefined,
    lineHeight: 1,
    color: shape.color,
    whiteSpace: 'nowrap',
  }
}

/** 主题氛围层图元：只有矩形/椭圆/文本三种，与 PPTX 导出一一对应 */
function skinStyle(decoration: SkinDecoration): CSSProperties {
  const color = resolveColor(props.theme, decoration.color_token)
  const base = rectToStyle(decoration.rect)

  if (decoration.kind === 'fill_box') {
    return {
      ...base,
      background: color,
      borderRadius: pt(decoration.radius_pt ?? 0),
      zIndex: 0,
      pointerEvents: 'none' as const,
    }
  }
  if (decoration.kind === 'outline_box') {
    return {
      ...base,
      border: `${pt(1.5)} solid ${color}`,
      borderRadius: pt(decoration.radius_pt ?? 0),
      boxSizing: 'border-box',
      zIndex: 0,
      pointerEvents: 'none' as const,
    }
  }
  if (decoration.kind === 'timeline_dot') {
    return { ...base, background: color, borderRadius: '50%', zIndex: 0, pointerEvents: 'none' as const }
  }
  if (decoration.kind === 'number_badge') {
    return {
      ...base,
      background: color,
      borderRadius: '50%',
      display: 'grid',
      placeItems: 'center',
      color: resolveColor(props.theme, 'background'),
      fontSize: pt(11),
      fontWeight: 700,
      lineHeight: 1,
      zIndex: 0,
      pointerEvents: 'none' as const,
    }
  }
  // side_line / timeline_axis
  return { ...base, background: color, zIndex: 0, pointerEvents: 'none' as const }
}
</script>

<template>
  <!--
    通用幻灯片渲染器。
    它不认识任何具体布局，只按布局数据把内容块摆到槽位里。
    PPTX 渲染器做的是同一件事，两端因此天然一致：
    新增布局只需增加一份 JSON，两端都不用改代码。
    编辑态复用同一棵渲染树：仅把可写字段换成受约束的 contenteditable。
    flex 模式走 layout_tree solver，跳过固定布局装饰。
  -->
  <div
    :style="{
      containerType: 'size',
      position: 'relative',
      width: '100%',
      aspectRatio: `${CANVAS_WIDTH_PT} / ${CANVAS_HEIGHT_PT}`,
      background: resolveColor(theme, 'background'),
      overflow: reveal ? 'visible' : 'hidden',
    }"
    @pointerdown="onRootPointerDown"
  >
    <!-- 氛围层单独套一层裁切容器：装饰有意出血，编辑态外层 overflow visible 时不能漏出画布 -->
    <div
      v-if="ambient.length"
      aria-hidden
      :style="{ position: 'absolute', inset: 0, overflow: 'hidden', zIndex: 0 }"
    >
      <div
        v-for="(shape, index) in ambient"
        :key="`ambient-${index}`"
        aria-hidden
        :style="ambientShapeStyle(shape)"
      >
        <template v-if="shape.kind === 'text'">{{ shape.text }}</template>
      </div>
    </div>

    <template v-if="!flex">
      <div
        v-for="(decoration, index) in layout!.decorations"
        :key="`${decoration.type}-${index}`"
        aria-hidden
        :style="{
          ...rectToStyle(decoration.rect),
          background: resolveColor(theme, decoration.color),
        }"
      />
    </template>

    <template v-else>
      <div
        v-for="(decoration, index) in skinDecorations"
        :key="`skin-${decoration.kind}-${index}`"
        aria-hidden
        :style="skinStyle(decoration)"
      >
        <template v-if="decoration.kind === 'number_badge'">{{ decoration.text }}</template>
      </div>
    </template>

    <div
      v-for="entry in renderedBlocks"
      :key="entry.block.id"
      :data-block-id="entry.block.id"
      :style="blockStyle(entry)"
      @pointerdown="onBlockPointerDown($event, entry.block.id)"
    >
      <span
        v-if="editable && entry.block.locked"
        role="img"
        title="已人工修改，AI 不会覆盖"
        aria-label="已人工修改，AI 不会覆盖"
        :style="{
          position: 'absolute',
          top: pt(4),
          right: pt(4),
          zIndex: 2,
          width: pt(6),
          height: pt(6),
          background: resolveColor(theme, 'accent'),
        }"
      />
      <BlockView
        :block="entry.block"
        :slot-data="entry.slot"
        :theme="theme"
        :editable="editable"
        @commit="(blockId, body) => emit('commit', blockId, body)"
        @select="emit('selectBlock', $event)"
      />
      <div
        v-if="entry.markOverflow"
        aria-hidden
        data-overflow-divider="slot"
        :style="{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          borderBottom: `1.5px dashed ${lineColor}`,
          pointerEvents: 'none' as const,
          zIndex: 4,
        }"
      />
    </div>

    <div
      v-if="reveal && overflowIds.size > 0"
      aria-hidden
      data-overflow-divider="canvas"
      title="以下内容超出 16:9 画布"
      :style="{
        position: 'absolute',
        left: 0,
        right: 0,
        top: '100%',
        marginTop: 0,
        borderTop: `1.5px dashed ${lineColor}`,
        pointerEvents: 'none' as const,
        zIndex: 5,
      }"
    >
      <span
        :style="{
          position: 'absolute',
          left: pt(8),
          top: pt(4),
          fontSize: pt(10),
          color: resolveColor(theme, 'ink_muted'),
          letterSpacing: '0.02em',
          whiteSpace: 'nowrap',
        }"
      >
        超出画布
      </span>
    </div>
  </div>
</template>
