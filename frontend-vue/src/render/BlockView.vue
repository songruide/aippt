<script setup lang="ts">
import { ref } from 'vue'
import type { CSSProperties } from 'vue'
import { boxCss, mergeTextCss } from '@/render/blockStyle'
import ChartView from '@/render/ChartView.vue'
import EditableText from '@/render/EditableText.vue'
import { pt, resolveColor } from '@/render/style'
import type {
  Block,
  BulletsBlock,
  CalloutBlock,
  EditableBlockCommit,
  Slot,
  TextStyleName,
  Theme,
} from '@/render/types'

const props = withDefaults(
  defineProps<{
    block: Block
    /** Vue 保留字 slot 不能作 prop 名，改名 slotData */
    slotData: Slot
    theme: Theme
    editable?: boolean
  }>(),
  { editable: false },
)

const emit = defineEmits<{
  commit: [blockId: string, body: EditableBlockCommit]
  select: [blockId: string]
}>()

/** 标题类与单元格按单行约束；正文允许换行 */
const MULTILINE_STYLES = new Set<TextStyleName>(['body', 'bullet'])

const canEdit = () => props.editable

function blockStyle(): Block['style'] {
  return props.block.style
}

function textCss(): CSSProperties {
  const styleName = props.slotData.text_style ?? 'body'
  return mergeTextCss(props.theme, styleName, blockStyle())
}

function box(): CSSProperties {
  return boxCss(props.theme, blockStyle())
}

// ---- bullets：列表项的增删跳转焦点（闭包会丢 v-if 收窄，事件统一走这里的函数） ----
const bulletsFocus = ref<{ index: number; token: number; caret: 'start' | 'end' } | null>(null)
let focusSeq = 0

function jumpTo(index: number, caret: 'start' | 'end' = 'start') {
  focusSeq += 1
  bulletsFocus.value = { index, token: focusSeq, caret }
}

function bulletsBlock(): BulletsBlock {
  return props.block as BulletsBlock
}

function bulletsListStyle(): CSSProperties {
  const textStyle = mergeTextCss(props.theme, props.slotData.text_style ?? 'bullet', blockStyle())
  return {
    ...textStyle,
    listStyle: 'none',
    margin: 0,
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: pt(12),
  }
}

function bulletsItemStyle(): CSSProperties {
  const textStyle = mergeTextCss(props.theme, props.slotData.text_style ?? 'bullet', blockStyle())
  return { ...textStyle, flex: 1 }
}

function bulletMarkerStyle(): CSSProperties {
  const accent = resolveColor(props.theme, 'accent')
  const marker = props.theme.shape.bullet_marker

  if (marker === 'index') {
    return {
      color: accent,
      flexShrink: 0,
      width: pt(22),
      fontVariantNumeric: 'tabular-nums',
    }
  }
  if (marker === 'dot') {
    return {
      flexShrink: 0,
      width: pt(6),
      height: pt(6),
      marginRight: pt(14),
      marginTop: pt(9),
      borderRadius: '50%',
      background: accent,
    }
  }
  return {
    flexShrink: 0,
    width: pt(14),
    height: pt(1.5),
    marginRight: pt(14),
    marginTop: pt(11),
    background: accent,
  }
}

function onBulletCommit(index: number, text: string) {
  emit('commit', props.block.id, { type: 'bullets', index, text })
}

function onBulletEnter(index: number) {
  emit('commit', props.block.id, { type: 'bullets', kind: 'insert', index })
  jumpTo(index + 1, 'start')
}

function onBulletBackspace(index: number) {
  // 最后一项不再删：列表至少保留一个占位
  if (bulletsBlock().items.length <= 1) return
  emit('commit', props.block.id, { type: 'bullets', kind: 'remove', index })
  jumpTo(Math.max(0, index - 1), 'end')
}

// ---- image ----
function imageBorderStyle(): CSSProperties {
  const style = blockStyle() as { border_color?: string; border_width_pt?: number } | null
  const bordered =
    style?.border_color != null && style?.border_width_pt != null && style.border_width_pt > 0
  if (!bordered) return { width: '100%', height: '100%' }
  return {
    border: `${pt(style!.border_width_pt!)} solid ${
      style!.border_color!.startsWith('#')
        ? style!.border_color!
        : resolveColor(props.theme, style!.border_color!)
    }`,
    boxSizing: 'border-box',
    width: '100%',
    height: '100%',
  }
}

// ---- table ----
const CARD_PAD_PT = 12

function tableCellStyle(): CSSProperties {
  const cellStyle = mergeTextCss(props.theme, 'table_cell', blockStyle())
  const padding: CSSProperties = { padding: `${pt(9)} ${pt(12)}`, textAlign: 'left' }
  const align = (blockStyle() as { align?: string } | null)?.align
  if (align) padding.textAlign = align as CSSProperties['textAlign']
  return { ...cellStyle, ...padding }
}

function tableHeaderStyle(): CSSProperties {
  const headerStyle = mergeTextCss(props.theme, 'table_header', blockStyle())
  return {
    ...headerStyle,
    padding: `${pt(9)} ${pt(12)}`,
    textAlign: 'left',
    borderBottom: `${pt(1.5)} solid ${resolveColor(props.theme, 'accent')}`,
  }
}

function tableRowBorder(): string {
  return `${pt(props.theme.shape.border_width_pt)} solid ${resolveColor(props.theme, 'line')}`
}

// ---- kpi ----
function kpiShell(): CSSProperties {
  const chrome = boxCss(props.theme, blockStyle())
  // 衬线大字号侧轴承常超出 em 盒；窄列 + 槽位裁切时需整块留白（盖过 chrome.padding）
  return {
    ...chrome,
    display: 'flex',
    flexDirection: 'column',
    gap: pt(8),
    boxSizing: 'border-box',
    width: '100%',
    height: '100%',
    minWidth: 0,
    padding: undefined,
    paddingInline: pt(14),
    paddingBlock: pt(8),
    overflow: 'visible',
  }
}

function kpiValueCss(): CSSProperties {
  const valueStyle = mergeTextCss(props.theme, 'kpi_value', blockStyle())
  return {
    ...valueStyle,
    whiteSpace: 'nowrap',
    overflow: 'visible',
    // 再给首字一点光学边距，避免 Instrument Serif「5」贴边
    paddingInlineStart: '0.12em',
  }
}

// ---- cards ----
function cardsShell(): CSSProperties {
  const chrome = boxCss(props.theme, blockStyle())
  return {
    ...chrome,
    display: 'flex',
    flexDirection: 'row',
    gap: pt(16),
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
  }
}

function cardItemStyle(): CSSProperties {
  return {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: pt(6),
    padding: pt(CARD_PAD_PT),
    background: resolveColor(props.theme, 'surface'),
    borderRadius: pt(props.theme.shape.radius_pt),
    boxSizing: 'border-box',
  }
}

// ---- callout ----
function calloutTextCss(): CSSProperties {
  const block = props.block as CalloutBlock
  const isSource = block.variant === 'source'
  return mergeTextCss(props.theme, isSource ? 'caption' : 'body', blockStyle())
}

function calloutShell(): CSSProperties {
  const block = props.block as CalloutBlock
  const isSource = block.variant === 'source'
  const chrome = boxCss(props.theme, blockStyle())
  const accent = resolveColor(props.theme, 'accent')
  const surface = resolveColor(props.theme, 'surface')
  const background = resolveColor(props.theme, 'background')
  const fill = isSource
    ? `color-mix(in srgb, ${surface} 35%, ${background})`
    : `color-mix(in srgb, ${accent} 18%, ${background})`

  return {
    ...chrome,
    display: 'flex',
    alignItems: 'flex-start',
    gap: pt(8),
    width: '100%',
    height: '100%',
    padding: `${pt(CARD_PAD_PT * 0.75)} ${pt(CARD_PAD_PT)}`,
    background: chrome.background ?? fill,
    borderRadius: pt(props.theme.shape.radius_pt),
    boxSizing: 'border-box',
  }
}
</script>

<template>
  <!-- 文本 -->
  <div v-if="block.type === 'text'" :style="box()">
    <p :style="{ ...textCss(), margin: 0 }">
      <span v-if="!canEdit()">{{ block.text }}</span>
      <EditableText
        v-else
        :value="block.text"
        :ariaLabel="'编辑文字'"
        :multiline="MULTILINE_STYLES.has(slotData.text_style ?? 'body')"
        :style="textCss()"
        @focus="emit('select', block.id)"
        @commit="(text) => emit('commit', block.id, { type: 'text', text })"
      />
    </p>
  </div>

  <!-- 列表 -->
  <div v-else-if="block.type === 'bullets'" :style="box()">
    <ul :style="bulletsListStyle()">
      <li
        v-for="(item, index) in block.items"
        :key="`${block.id}-${index}`"
        style="display: flex; align-items: flex-start"
      >
        <span :style="bulletMarkerStyle()">{{
          theme.shape.bullet_marker === 'index' ? String(index + 1).padStart(2, '0') : ''
        }}</span>
        <EditableText
          v-if="canEdit()"
          :value="item"
          :ariaLabel="`编辑要点 ${index + 1}`"
          :style="bulletsItemStyle()"
          :focus-token="bulletsFocus?.index === index ? bulletsFocus.token : null"
          :focus-caret="bulletsFocus?.index === index ? bulletsFocus.caret : 'start'"
          @focus="emit('select', block.id)"
          @commit="(text) => onBulletCommit(index, text)"
          @enter="onBulletEnter(index)"
          @backspace-when-empty="onBulletBackspace(index)"
        />
        <span v-else>{{ item }}</span>
      </li>
    </ul>
  </div>

  <!-- 图片 -->
  <template v-else-if="block.type === 'image'">
    <div v-if="!block.url" :style="imageBorderStyle()">
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        :aria-label="block.alt"
        style="width: 100%; height: 100%; display: block"
      >
        <!-- 图源缺失时的降级图形，按主题色绘制，不依赖网络 -->
        <rect width="100" height="100" :fill="resolveColor(theme, 'accent_soft')" />
        <circle cx="74" cy="28" r="30" :fill="resolveColor(theme, 'accent')" opacity="0.22" />
        <circle cx="74" cy="28" r="18" :fill="resolveColor(theme, 'accent')" opacity="0.3" />
        <path
          d="M0 78 L34 52 L58 70 L100 40 L100 100 L0 100 Z"
          :fill="resolveColor(theme, 'accent')"
          opacity="0.16"
        />
        <rect x="8" y="86" width="18" height="1.2" :fill="resolveColor(theme, 'accent')" />
      </svg>
    </div>
    <img
      v-else
      :src="block.url"
      :alt="block.alt"
      :style="{ ...imageBorderStyle(), objectFit: 'cover', display: 'block' }"
    />
  </template>

  <!-- 图表 -->
  <ChartView
    v-else-if="block.type === 'chart'"
    :block="block"
    :slot-data="slotData"
    :theme="theme"
  />

  <!-- 表格 -->
  <table
    v-else-if="block.type === 'table'"
    style="width: 100%; border-collapse: collapse; table-layout: fixed"
  >
    <thead>
      <tr>
        <th v-for="(cell, index) in block.header" :key="`h-${index}`" :style="tableHeaderStyle()">
          <EditableText
            v-if="canEdit()"
            :value="cell"
            :ariaLabel="`编辑表头 ${index + 1}`"
            multiline
            :style="tableHeaderStyle()"
            @focus="emit('select', block.id)"
            @commit="
              (text) => emit('commit', block.id, { type: 'table', kind: 'header', index, text })
            "
          />
          <template v-else>{{ cell }}</template>
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="(row, rowIndex) in block.rows" :key="`r-${rowIndex}`">
        <td
          v-for="(cell, cellIndex) in row"
          :key="`c-${rowIndex}-${cellIndex}`"
          :style="{ ...tableCellStyle(), borderBottom: tableRowBorder() }"
        >
          <EditableText
            v-if="canEdit()"
            :value="cell"
            :ariaLabel="`编辑单元格 ${rowIndex + 1}-${cellIndex + 1}`"
            multiline
            :style="tableCellStyle()"
            @focus="emit('select', block.id)"
            @commit="
              (text) =>
                emit('commit', block.id, {
                  type: 'table',
                  kind: 'cell',
                  row: rowIndex,
                  col: cellIndex,
                  text,
                })
            "
          />
          <template v-else>{{ cell }}</template>
        </td>
      </tr>
    </tbody>
  </table>

  <!-- KPI -->
  <div v-else-if="block.type === 'kpi'" :style="kpiShell()">
    <span v-if="!canEdit()" :style="kpiValueCss()">{{ block.value }}</span>
    <EditableText
      v-else
      :value="block.value"
      :ariaLabel="'编辑指标数值'"
      :style="kpiValueCss()"
      @focus="emit('select', block.id)"
      @commit="(text) => emit('commit', block.id, { type: 'kpi', field: 'value', text })"
    />
    <span
      v-if="!canEdit()"
      :style="mergeTextCss(theme, 'kpi_label', blockStyle())"
    >{{ block.label }}</span>
    <EditableText
      v-else
      :value="block.label"
      :ariaLabel="'编辑指标标签'"
      :style="mergeTextCss(theme, 'kpi_label', blockStyle())"
      @focus="emit('select', block.id)"
      @commit="(text) => emit('commit', block.id, { type: 'kpi', field: 'label', text })"
    />
    <span
      v-if="block.note && !canEdit()"
      :style="mergeTextCss(theme, 'kpi_note', blockStyle())"
    >{{ block.note }}</span>
    <EditableText
      v-else-if="canEdit()"
      :value="block.note ?? ''"
      :ariaLabel="'编辑指标备注'"
      :style="mergeTextCss(theme, 'kpi_note', blockStyle())"
      @focus="emit('select', block.id)"
      @commit="(text) => emit('commit', block.id, { type: 'kpi', field: 'note', text })"
    />
  </div>

  <!-- 卡片 -->
  <div v-else-if="block.type === 'cards'" :style="cardsShell()">
    <div
      v-for="(item, index) in block.items"
      :key="`${block.id}-${index}`"
      :style="cardItemStyle()"
    >
      <div style="display: flex; align-items: flex-start; gap: 6pt">
        <span
          v-if="item.icon"
          aria-hidden
          :style="{ ...mergeTextCss(theme, 'subtitle', blockStyle()), flexShrink: 0 }"
        >{{ item.icon }}</span>
        <span
          v-if="!canEdit()"
          :style="{ ...mergeTextCss(theme, 'subtitle', blockStyle()), flex: 1 }"
        >{{ item.title }}</span>
        <EditableText
          v-else
          :value="item.title"
          :ariaLabel="`编辑卡片标题 ${index + 1}`"
          :style="{ ...mergeTextCss(theme, 'subtitle', blockStyle()), flex: 1 }"
          @focus="emit('select', block.id)"
          @commit="
            (text) => emit('commit', block.id, { type: 'cards', index, field: 'title', text })
          "
        />
      </div>
      <span
        v-if="!canEdit()"
        :style="mergeTextCss(theme, 'body', blockStyle())"
      >{{ item.desc }}</span>
      <EditableText
        v-else
        :value="item.desc"
        :ariaLabel="`编辑卡片描述 ${index + 1}`"
        multiline
        :style="mergeTextCss(theme, 'body', blockStyle())"
        @focus="emit('select', block.id)"
        @commit="(text) => emit('commit', block.id, { type: 'cards', index, field: 'desc', text })"
      />
    </div>
  </div>

  <!-- 提示 -->
  <div v-else-if="block.type === 'callout'" :style="calloutShell()">
    <span
      v-if="block.icon"
      aria-hidden
      :style="{ ...calloutTextCss(), flexShrink: 0 }"
    >{{ block.icon }}</span>
    <span v-if="!canEdit()" :style="{ ...calloutTextCss(), flex: 1 }">{{ block.text }}</span>
    <EditableText
      v-else
      :value="block.text"
      :ariaLabel="'编辑提示文字'"
      multiline
      :style="{ ...calloutTextCss(), flex: 1 }"
      @focus="emit('select', block.id)"
      @commit="(text) => emit('commit', block.id, { type: 'callout', text })"
    />
  </div>
</template>
