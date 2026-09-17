<script setup lang="ts">
import * as echarts from 'echarts'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { resolveColor, webFontStack } from '@/render/style'
import {
  CANVAS_HEIGHT_PT,
  CANVAS_WIDTH_PT,
  type ChartBlock,
  type Slot,
  type Theme,
} from '@/render/types'

const props = defineProps<{
  block: ChartBlock
  slotData: Slot
  theme: Theme
}>()

/**
 * 幻灯片其余部分靠 cqw 等比缩放，而图表库的字号、描边、边距都是像素数，
 * 不会跟着容器变。因此这里量出实际像素宽度换算成缩放比，把图表画在与 PPTX
 * 相同的 pt 坐标系里再整体缩放——两端的构图比例因此严格一致。
 * （React 版用 Recharts，Vue 版换 ECharts，坐标系与主题映射保持同一套。）
 */

const hostRef = ref<HTMLDivElement | null>(null)
const surfaceRef = ref<HTMLDivElement | null>(null)
const scale = ref(0)

const width = computed(() => props.slotData.rect.w * CANVAS_WIDTH_PT)
const height = computed(() => props.slotData.rect.h * CANVAS_HEIGHT_PT)

/** 一次算好图表内所有视觉常量，避免各处重复从主题里翻 */
function chartContext(theme: Theme, seriesCount: number) {
  const label = theme.text_styles.chart_label
  const text = {
    fontSize: label.size_pt,
    fontFamily: webFontStack(theme.fonts.body),
    color: resolveColor(theme, label.color),
  }
  return {
    text,
    gridColor: resolveColor(theme, 'line'),
    axisColor: resolveColor(theme, 'line_strong'),
    background: resolveColor(theme, 'background'),
    colors: theme.palette.chart_series,
    // 只有一条系列时图例里也只有一项，纯属噪音
    showLegend: seriesCount > 1,
  }
}

function buildOption(block: ChartBlock, theme: Theme): echarts.EChartsOption {
  const style = chartContext(theme, block.series.length)
  const axisLabel = { ...style.text, show: true }
  const splitLine = { lineStyle: { color: style.gridColor, width: 1 } }
  const legend = {
    show: style.showLegend,
    bottom: 0,
    icon: 'rect',
    itemWidth: style.text.fontSize * 0.8,
    itemHeight: style.text.fontSize * 0.8,
    textStyle: { ...style.text },
    itemGap: 10,
  }
  const common = { animation: false }

  if (block.chart_type === 'pie') {
    return {
      ...common,
      color: style.colors,
      series: [
        {
          type: 'pie',
          radius: '72%',
          center: ['50%', '50%'],
          // 饼图每一片代表一个分类而非一条系列，因此按数据点着色（color 数组）
          data: block.categories.map((name, index) => ({
            name,
            value: block.series[0]?.values[index] ?? 0,
          })),
          label: {
            ...style.text,
            formatter: '{b}',
          },
          labelLine: { lineStyle: { color: style.axisColor } },
          itemStyle: { borderColor: style.background, borderWidth: 1 },
        },
      ],
    }
  }

  const horizontal = block.chart_type === 'bar'
  const unitName = block.unit
    ? {
        name: block.unit,
        nameLocation: 'middle' as const,
        nameRotate: 90,
        nameGap: 26,
        nameTextStyle: { ...style.text },
      }
    : {}

  if (block.chart_type === 'line') {
    return {
      ...common,
      grid: {
        top: 8,
        right: 8,
        bottom: style.showLegend ? 24 : 4,
        left: block.unit ? 36 : 8,
        containLabel: true,
      },
      legend,
      xAxis: {
        type: 'category',
        data: block.categories,
        axisLine: { lineStyle: { color: style.axisColor } },
        axisTick: { show: false },
        axisLabel,
      },
      yAxis: {
        type: 'value',
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel,
        splitLine,
        ...unitName,
      },
      series: block.series.map((series, index) => ({
        type: 'line',
        name: series.name,
        data: series.values,
        smooth: true,
        showSymbol: false,
        lineStyle: { width: 2, color: style.colors[index % style.colors.length] },
        itemStyle: { color: style.colors[index % style.colors.length] },
      })),
    }
  }

  // bar / column：bar 数值轴在 X（横向条形），column 数值轴在 Y
  return {
    ...common,
    grid: {
      top: 8,
      right: 8,
      bottom: style.showLegend ? 24 : 4,
      left: horizontal ? 8 : block.unit ? 36 : 8,
      containLabel: true,
    },
    legend,
    xAxis: horizontal
      ? {
          type: 'value',
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel,
          splitLine,
        }
      : {
          type: 'category',
          data: block.categories,
          axisLine: { lineStyle: { color: style.axisColor } },
          axisTick: { show: false },
          axisLabel,
        },
    yAxis: horizontal
      ? {
          type: 'category',
          data: block.categories,
          axisLine: { lineStyle: { color: style.axisColor } },
          axisTick: { show: false },
          axisLabel,
        }
      : {
          type: 'value',
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel,
          splitLine,
          ...unitName,
        },
    series: block.series.map((series, index) => ({
      type: 'bar',
      name: series.name,
      data: series.values,
      barMaxWidth: 36,
      itemStyle: { color: style.colors[index % style.colors.length] },
    })),
  }
}

const option = computed(() => buildOption(props.block, props.theme))

let chart: echarts.ECharts | null = null
let observer: ResizeObserver | null = null

/**
 * 图面 div 在 scale > 0 之后才渲染，所以不能在 onMounted 里直接 init
 * （那时 querySelector 还是 null，echarts.init 会抛 invalid dom）。
 * 改为等图面真的进了 DOM 再建实例；DOM 被重建过（scale 回到 0 又变正）则先销毁再重建。
 */
function syncChart() {
  const surface = surfaceRef.value
  if (!surface) return
  if (chart && chart.getDom() === surface) return
  chart?.dispose()
  chart = echarts.init(surface, undefined, {
    width: width.value,
    height: height.value,
  })
  chart.setOption(option.value)
}

onMounted(() => {
  const host = hostRef.value
  if (!host) return

  observer = new ResizeObserver((entries) => {
    const entry = entries[0]
    if (entry) scale.value = entry.contentRect.width / width.value
  })
  observer.observe(host)
})

// flush: 'post' 保证图面 ref 已经写入后再建实例
watch([scale, surfaceRef], syncChart, { flush: 'post' })

// 数据或主题变化：增量 setOption，重建 DOM 交给外层 key
watch(option, (next) => {
  chart?.setOption(next)
})

// 槽位几何变化（重排 / 换版式）：图面尺寸跟着变
watch([width, height], ([w, h]) => {
  chart?.resize({ width: w, height: h })
})

onBeforeUnmount(() => {
  observer?.disconnect()
  chart?.dispose()
  chart = null
})
</script>

<template>
  <div ref="hostRef" style="width: 100%; height: 100%; overflow: hidden">
    <div
      v-if="scale > 0"
      :style="{
        width: `${width}pt`,
        height: `${height}pt`,
        transformOrigin: 'top left',
        transform: `scale(${scale})`,
      }"
    >
      <div ref="surfaceRef" data-chart-surface :style="{ width: `${width}pt`, height: `${height}pt` }" />
    </div>
  </div>
</template>
