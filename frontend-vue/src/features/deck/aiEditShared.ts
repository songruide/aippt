/** AI 修改面板与子组件共用的文案映射与取值小工具。 */

export type ActiveSide = 'before' | 'after'

export const TYPE_LABEL: Record<string, string> = {
  text: '文字',
  bullets: '列表',
  kpi: '指标',
  table: '表格',
  cards: '卡片',
  callout: '提示',
  image: '图片',
  chart: '图表',
}

export const OP_LABEL: Record<string, string> = {
  replace: '替换',
  add: '新增',
  delete: '删除',
  change_type: '改类型',
}

export function asText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

export function asSnapshot(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

export function asStringList(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((item) => (typeof item === 'string' ? item : String(item)))
    : []
}
