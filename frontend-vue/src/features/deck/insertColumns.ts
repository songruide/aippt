import { createSlideBlock, updateFlexLayout } from '@/features/deck/api'
import { findContainerById, wrapBlockIdsAsColumns } from '@/features/deck/flexTree'
import type { DeckSlide } from '@/features/deck/types'
import type { FlexContainer } from '@/render/flexLayout'

export type InsertAnchor = { parentId: string; index: number }

/**
 * 一次拖入 N 列：先串行新建 N 个文本块，再把它们包成列容器。
 * 从 React 版 BlockInsertRail.tsx 抽出：纯编排逻辑，与框架无关。
 */
export async function insertColumnsAt(
  projectId: string,
  slide: DeckSlide,
  anchor: InsertAnchor,
  count: 2 | 3,
): Promise<DeckSlide> {
  let current = slide
  const before = new Set(current.blocks.map((block) => block.id))
  let insertAt = anchor.index

  for (let i = 0; i < count; i++) {
    current = await createSlideBlock(projectId, slide.id, {
      revision: current.revision,
      type: 'text',
      parent_id: anchor.parentId,
      index: insertAt,
    })
    insertAt += 1
  }

  const newIds = current.blocks
    .filter((block) => !before.has(block.id) && block.type === 'text')
    .map((block) => block.id)
    .slice(-count)

  if (newIds.length !== count || current.layout_tree == null) {
    throw new Error('列插入未得到预期内容块')
  }

  const tree = current.layout_tree as FlexContainer
  const parent = findContainerById(tree, anchor.parentId)
  if (!parent) throw new Error('插入目标容器不存在')
  const wrapped = wrapBlockIdsAsColumns(tree, newIds)
  if (!wrapped) throw new Error('无法组装多列布局')

  return updateFlexLayout(projectId, slide.id, {
    revision: current.revision,
    layout_tree: wrapped,
  })
}
