import { describe, expect, it } from 'vitest'
import {
  applyContentBody,
  contentBodyFromBlock,
  sameContent,
  styleFromBlock,
} from '@/features/deck/blockSnapshot'
import type { DeckSlide } from '@/features/deck/types'

/** 单测只需要内容字段，其余 DeckSlide 字段与快照逻辑无关 */
function blockOf(block: Record<string, unknown>): DeckSlide['blocks'][number] {
  return block as DeckSlide['blocks'][number]
}

describe('blockSnapshot', () => {
  it('text 块：抽取 → 应用 往返一致', () => {
    const block = blockOf({ id: 'b1', type: 'text', text: '标题', slot_id: 's1' })
    const body = contentBodyFromBlock(block)
    expect(body).toEqual({ type: 'text', text: '标题' })
    const next = applyContentBody(block, { type: 'text', text: '新标题' })
    expect(next).toEqual({ ...block, text: '新标题' })
    const after = contentBodyFromBlock(next)
    expect(after).toEqual({ type: 'text', text: '新标题' })
    expect(sameContent(after!, { type: 'text', text: '新标题' })).toBe(true)
  })

  it('bullets 块：items 深拷贝，外部改动不影响已抽出的快照', () => {
    const items = ['第一点', '第二点']
    const block = blockOf({ id: 'b2', type: 'bullets', items, slot_id: 's2' })
    const body = contentBodyFromBlock(block)
    items.push('后来加的')
    expect(body).toEqual({ type: 'bullets', items: ['第一点', '第二点'] })
  })

  it('kpi 块：note 缺省归一为 null', () => {
    const block = blockOf({ id: 'b3', type: 'kpi', value: '42', label: '用户数', slot_id: 's3' })
    expect(contentBodyFromBlock(block)).toEqual({
      type: 'kpi',
      value: '42',
      label: '用户数',
      note: null,
    })
  })

  it('类型不匹配的 body 不改写块', () => {
    const block = blockOf({ id: 'b4', type: 'text', text: '原', slot_id: 's4' })
    const next = applyContentBody(block, { type: 'bullets', items: ['x'] })
    expect(next).toBe(block)
  })

  it('styleFromBlock：无样式返回 null', () => {
    expect(styleFromBlock(blockOf({ id: 'b5', type: 'text', text: 'x', slot_id: 's5' }))).toBeNull()
    const style = { align: 'center' }
    expect(styleFromBlock(blockOf({ id: 'b6', type: 'text', text: 'x', slot_id: 's6', style }))).toEqual(style)
  })
})
