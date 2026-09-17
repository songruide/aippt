import { describe, expect, it } from 'vitest'
import { mergeBlockCommit, sanitizeBulletsItems } from '@/features/deck/mergeBlockCommit'
import type { DeckSlide } from '@/features/deck/types'

function slideOf(blocks: Record<string, unknown>[]): DeckSlide {
  return { blocks } as unknown as DeckSlide
}

const bulletsSlide = slideOf([
  { id: 'bl', type: 'bullets', items: ['a', 'b', 'c'], slot_id: 's' },
])

describe('sanitizeBulletsItems', () => {
  it('空列表保底一个占位', () => {
    expect(sanitizeBulletsItems([])).toEqual([''])
    expect(sanitizeBulletsItems(['x'])).toEqual(['x'])
  })
})

describe('mergeBlockCommit', () => {
  it('text：整块替换', () => {
    const slide = slideOf([{ id: 't', type: 'text', text: '旧', slot_id: 's' }])
    expect(mergeBlockCommit(slide, 't', { type: 'text', text: '新' })).toEqual({
      type: 'text',
      text: '新',
    })
  })

  it('bullets：insert 在目标项后插入空占位', () => {
    expect(
      mergeBlockCommit(bulletsSlide, 'bl', { type: 'bullets', kind: 'insert', index: 0 }),
    ).toEqual({ type: 'bullets', items: ['a', '', 'b', 'c'] })
  })

  it('bullets：remove 保留其余项', () => {
    expect(
      mergeBlockCommit(bulletsSlide, 'bl', { type: 'bullets', kind: 'remove', index: 1 }),
    ).toEqual({ type: 'bullets', items: ['a', 'c'] })
  })

  it('bullets：最后一项删除时保留空占位', () => {
    const slide = slideOf([{ id: 'one', type: 'bullets', items: ['only'], slot_id: 's' }])
    expect(
      mergeBlockCommit(slide, 'one', { type: 'bullets', kind: 'remove', index: 0 }),
    ).toEqual({ type: 'bullets', items: [''] })
  })

  it('bullets：叠加在未发出的覆盖之上（previous），而不是旧的服务端值', () => {
    const previous = { type: 'bullets' as const, items: ['a-override', 'b', 'c'] }
    expect(
      mergeBlockCommit(bulletsSlide, 'bl', { type: 'bullets', kind: 'insert', index: 0 }, previous),
    ).toEqual({ type: 'bullets', items: ['a-override', '', 'b', 'c'] })
  })

  it('kpi：字段编辑只改目标字段，note 空串归 null', () => {
    const slide = slideOf([
      { id: 'k', type: 'kpi', value: '10', label: '产能', note: '备注', slot_id: 's' },
    ])
    expect(
      mergeBlockCommit(slide, 'k', { type: 'kpi', field: 'value', text: '99' }),
    ).toEqual({ type: 'kpi', value: '99', label: '产能', note: '备注' })
    expect(
      mergeBlockCommit(slide, 'k', { type: 'kpi', field: 'note', text: '' }),
    ).toEqual({ type: 'kpi', value: '10', label: '产能', note: null })
  })

  it('table：单元格编辑只改目标格', () => {
    const slide = slideOf([
      {
        id: 'tb',
        type: 'table',
        header: ['H1', 'H2'],
        rows: [
          ['a', 'b'],
          ['c', 'd'],
        ],
        slot_id: 's',
      },
    ])
    expect(
      mergeBlockCommit(slide, 'tb', { type: 'table', kind: 'cell', row: 1, col: 0, text: 'C' }),
    ).toEqual({
      type: 'table',
      header: ['H1', 'H2'],
      rows: [
        ['a', 'b'],
        ['C', 'd'],
      ],
    })
  })

  it('块不存在或类型不符返回 null', () => {
    expect(mergeBlockCommit(bulletsSlide, 'missing', { type: 'text', text: 'x' })).toBeNull()
    expect(mergeBlockCommit(bulletsSlide, 'bl', { type: 'text', text: 'x' })).toBeNull()
  })
})
