import { computed, ref, onScopeDispose } from 'vue'
import type { Ref } from 'vue'
import { useQueryClient } from '@tanstack/vue-query'
import { ApiError } from '@/api/client'
import { cloneData } from '@/lib/clone'
import {
  commitSlideToCache,
  createSlideBlock,
  deckKey,
  deleteSlideBlock,
  updateFlexLayout,
  updateFlexState,
  updateSlideBlock,
  updateSlideBlockStyle,
} from '@/features/deck/api'
import {
  applyContentBody,
  contentBodyFromBlock,
  sameContent,
  sameStyle,
  styleFromBlock,} from '@/features/deck/blockSnapshot'
import { normalizeGrows } from '@/features/deck/flexNormalize'
import type { FlexBlockType } from '@/features/deck/flexTree'
import { mergeBlockCommit, sanitizeBulletsItems } from '@/features/deck/mergeBlockCommit'
import type { BlockUpdateBody, Deck, DeckSlide } from '@/features/deck/types'
import { errorMessage } from '@/lib/errors'
import type { BlockStyle } from '@/render/blockStyle'
import type { FlexContainer } from '@/render/flexLayout'
import type { EditableBlockCommit } from '@/render/types'

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'conflict' | 'error'

export type StructureSnap = {
  blocks: DeckSlide['blocks']
  layout_tree: FlexContainer
}

type PendingJob =
  | { kind: 'content'; blockId: string; body: BlockUpdateBody }
  | { kind: 'style'; blockId: string; style: BlockStyle | null }
  | { kind: 'flex'; tree: FlexContainer; before: StructureSnap | null }
  | { kind: 'structure'; state: StructureSnap }
  | {
      kind: 'mutate'
      run: (slide: DeckSlide) => Promise<DeckSlide>
      record: boolean
    }

type HistoryEntry =
  | {
      kind: 'content'
      blockId: string
      before: BlockUpdateBody
      after: BlockUpdateBody
    }
  | {
      kind: 'style'
      blockId: string
      before: BlockStyle | null
      after: BlockStyle | null
    }
  | {
      kind: 'structure'
      before: StructureSnap
      after: StructureSnap
    }

const MAX_HISTORY = 50

function cloneSnap(snap: StructureSnap): StructureSnap {
  return {
    blocks: cloneData(snap.blocks),
    layout_tree: cloneData(snap.layout_tree),
  }
}

function structureSnap(slide: DeckSlide): StructureSnap | null {
  if (slide.layout_mode !== 'flex' || slide.layout_tree == null) return null
  return {
    blocks: cloneData(slide.blocks),
    layout_tree: cloneData(slide.layout_tree as FlexContainer),
  }
}

function sameStructure(a: StructureSnap, b: StructureSnap): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/**
 * 同一页的块保存必须串行：每次成功 revision +1，并发必然 409。
 * 内容、样式、灵活布局结构共用队列；同时维护本页撤销/重做栈。
 *
 * 队列与撤销栈沿用 React 版的普通可变对象（不进响应式系统）：
 * 它们的变化通过 historyTick / status 间接反映到视图。
 */
export function useSlideSaveQueue(projectId: string, slideId: string) {
  const queryClient = useQueryClient()
  const queue: PendingJob[] = []
  let running = false
  const contentOverrides = new Map<string, BlockUpdateBody>()
  const styleOverrides = new Map<string, BlockStyle | null>()
  const undoStack: HistoryEntry[] = []
  const redoStack: HistoryEntry[] = []
  let applyingHistory = false
  const status: Ref<SaveStatus> = ref('idle')
  const error = ref<string | null>(null)
  const historyTick = ref(0)
  let savedTimer: number | null = null

  onScopeDispose(() => {
    if (savedTimer != null) window.clearTimeout(savedTimer)
  })

  // 撤销栈按页隔离：本 composable 在 SlidePage 内按页实例化，
  // 换页即新实例，栈随实例自然重建（对应 React 版的 slideId 变更清空）。

  const readSlide = (): DeckSlide | undefined => {
    const deck = queryClient.getQueryData<Deck>(deckKey(projectId))
    return deck?.slides.find((slide) => slide.id === slideId)
  }

  const bumpHistory = () => {
    historyTick.value += 1
  }

  const pushHistory = (entry: HistoryEntry) => {
    if (applyingHistory) return
    if (undoStack.length >= MAX_HISTORY) undoStack.shift()
    undoStack.push(entry)
    redoStack.length = 0
    bumpHistory()
  }

  const paintBlock = (
    blockId: string,
    recipe: (block: DeckSlide['blocks'][number]) => DeckSlide['blocks'][number],
  ) => {
    queryClient.setQueryData<Deck>(deckKey(projectId), (current) => {
      if (!current) return current
      return {
        ...current,
        slides: current.slides.map((slide) => {
          if (slide.id !== slideId) return slide
          return {
            ...slide,
            blocks: slide.blocks.map((block) =>
              block.id === blockId ? recipe(block) : block,
            ),
          }
        }),
      }
    })
  }

  const paintStructure = (state: StructureSnap) => {
    queryClient.setQueryData<Deck>(deckKey(projectId), (current) => {
      if (!current) return current
      return {
        ...current,
        slides: current.slides.map((slide) => {
          if (slide.id !== slideId) return slide
          return {
            ...slide,
            layout_mode: 'flex' as const,
            blocks: state.blocks,
            layout_tree: state.layout_tree,
          }
        }),
      }
    })
  }

  const paintTree = (tree: FlexContainer) => {
    queryClient.setQueryData<Deck>(deckKey(projectId), (current) => {
      if (!current) return current
      return {
        ...current,
        slides: current.slides.map((slide) => {
          if (slide.id !== slideId) return slide
          return { ...slide, layout_tree: tree }
        }),
      }
    })
  }

  const enqueue = (job: PendingJob) => {
    if (job.kind === 'content' || job.kind === 'style') {
      const existing = queue.findIndex(
        (item) => item.kind === job.kind && item.blockId === job.blockId,
      )
      if (existing >= 0) queue[existing] = job
      else queue.push(job)
      return
    }
    queue.push(job)
  }

  const markSaved = () => {
    if (savedTimer != null) window.clearTimeout(savedTimer)
    status.value = 'saved'
    savedTimer = window.setTimeout(() => {
      if (status.value === 'saved') status.value = 'idle'
      savedTimer = null
    }, 1600)
  }

  const pump = async () => {
    if (running) return
    running = true

    while (queue.length > 0) {
      const job = queue.shift()
      if (!job) break

      const slide = readSlide()
      if (!slide) continue

      status.value = 'saving'
      error.value = null

      try {
        let updated: DeckSlide
        if (job.kind === 'content') {
          const raw = contentOverrides.get(job.blockId) ?? job.body
          const body =
            raw.type === 'bullets'
              ? { ...raw, items: sanitizeBulletsItems(raw.items) }
              : raw
          updated = await updateSlideBlock(projectId, slideId, job.blockId, {
            ...body,
            revision: slide.revision,
          })
          if (
            !queue.some(
              (item) => item.kind === 'content' && item.blockId === job.blockId,
            )
          ) {
            contentOverrides.delete(job.blockId)
          }
        } else if (job.kind === 'style') {
          const style = styleOverrides.has(job.blockId)
            ? styleOverrides.get(job.blockId)!
            : job.style
          updated = await updateSlideBlockStyle(projectId, slideId, job.blockId, {
            revision: slide.revision,
            style,
          })
          if (
            !queue.some(
              (item) => item.kind === 'style' && item.blockId === job.blockId,
            )
          ) {
            styleOverrides.delete(job.blockId)
          }
        } else if (job.kind === 'flex') {
          updated = await updateFlexLayout(projectId, slideId, {
            revision: slide.revision,
            layout_tree: job.tree,
          })
          const after = structureSnap(updated)
          if (
            job.before &&
            after &&
            !sameStructure(job.before, after) &&
            !applyingHistory
          ) {
            pushHistory({ kind: 'structure', before: job.before, after })
          }
        } else if (job.kind === 'structure') {
          updated = await updateFlexState(projectId, slideId, {
            revision: slide.revision,
            blocks: job.state.blocks,
            layout_tree: job.state.layout_tree,
          })
        } else {
          const before = job.record ? structureSnap(slide) : null
          updated = await job.run(slide)
          const after = structureSnap(updated)
          if (before && after && !sameStructure(before, after) && !applyingHistory) {
            pushHistory({ kind: 'structure', before, after })
          }
        }

        commitSlideToCache(queryClient, projectId, updated)
        markSaved()
      } catch (cause) {
        const message = errorMessage(cause instanceof Error ? cause : null)
        const conflict =
          cause instanceof ApiError &&
          cause.status === 409 &&
          message.includes('其他操作更新')
        status.value = conflict ? 'conflict' : 'error'
        error.value = conflict ? '页面已被其他操作更新' : message
        if (conflict) {
          queue.length = 0
          break
        }
      }
    }

    running = false
  }

  const applyContent = (blockId: string, body: BlockUpdateBody, record: boolean) => {
    const slide = readSlide()
    const block = slide?.blocks.find((item) => item.id === blockId)
    if (block && record) {
      const before =
        contentOverrides.get(blockId) ?? contentBodyFromBlock(block)
      if (before && !sameContent(before, body)) {
        pushHistory({ kind: 'content', blockId, before, after: body })
      }
    }

    contentOverrides.set(blockId, body)
    paintBlock(blockId, (current) => applyContentBody(current, body))
    enqueue({ kind: 'content', blockId, body })
    void pump()
  }

  const applyStyle = (blockId: string, style: BlockStyle | null, record: boolean) => {
    const slide = readSlide()
    const block = slide?.blocks.find((item) => item.id === blockId)
    if (block && record) {
      const before = styleOverrides.has(blockId)
        ? styleOverrides.get(blockId)!
        : styleFromBlock(block)
      if (!sameStyle(before, style)) {
        pushHistory({ kind: 'style', blockId, before, after: style })
      }
    }

    styleOverrides.set(blockId, style)
    paintBlock(blockId, (current) => ({ ...current, style }))
    enqueue({ kind: 'style', blockId, style })
    void pump()
  }

  const commit = (blockId: string, change: EditableBlockCommit) => {
    if (change.type === 'style') {
      applyStyle(blockId, change.style, true)
      return
    }

    const slide = readSlide()
    if (!slide) return
    const body = mergeBlockCommit(
      slide,
      blockId,
      change,
      contentOverrides.get(blockId),
    )
    if (!body) return
    applyContent(blockId, body, true)
  }

  const commitStyle = (blockId: string, style: BlockStyle | null) => {
    applyStyle(blockId, style, true)
  }

  const commitFlex = (layout_tree: FlexContainer) => {
    const slide = readSlide()
    if (!slide || slide.layout_mode !== 'flex') return
    // 先按后端同款规则归一：否则乐观渲染的是草稿，响应回来又跳一次
    const tree = normalizeGrows(layout_tree)
    // 必须在 paint 前快照，否则 pump 里 before≈after，撤销栈进不去
    const before = structureSnap(slide)
    paintTree(tree)
    enqueue({ kind: 'flex', tree, before })
    void pump()
  }

  const commitCreateBlock = (body: { type: FlexBlockType; parent_id: string; index?: number }) => {
    queue.push({
      kind: 'mutate',
      record: true,
      run: (current) =>
        createSlideBlock(projectId, slideId, {
          revision: current.revision,
          type: body.type,
          parent_id: body.parent_id,
          index: body.index ?? 0,
        }),
    })
    void pump()
  }

  const commitDeleteBlock = (blockId: string) => {
    queue.push({
      kind: 'mutate',
      record: true,
      run: (current) =>
        deleteSlideBlock(projectId, slideId, blockId, { revision: current.revision }),
    })
    void pump()
  }

  /** 多步结构变更（如插入多列）串行执行并记一条撤销 */
  const commitMutate = (run: (slide: DeckSlide) => Promise<DeckSlide>) => {
    queue.push({ kind: 'mutate', record: true, run })
    void pump()
  }

  const applyEntry = (entry: HistoryEntry, side: 'before' | 'after') => {
    applyingHistory = true
    try {
      if (entry.kind === 'content') {
        applyContent(entry.blockId, entry[side], false)
      } else if (entry.kind === 'style') {
        applyStyle(entry.blockId, entry[side], false)
      } else {
        const state = cloneSnap(entry[side])
        paintStructure(state)
        queue.push({ kind: 'structure', state })
        void pump()
      }
    } finally {
      applyingHistory = false
    }
  }

  const undo = (): boolean => {
    const entry = undoStack.pop()
    if (!entry) return false
    redoStack.push(entry)
    bumpHistory()
    applyEntry(entry, 'before')
    return true
  }

  const redo = (): boolean => {
    const entry = redoStack.pop()
    if (!entry) return false
    undoStack.push(entry)
    bumpHistory()
    applyEntry(entry, 'after')
    return true
  }

  const refresh = () => {
    contentOverrides.clear()
    styleOverrides.clear()
    queue.length = 0
    undoStack.length = 0
    redoStack.length = 0
    error.value = null
    status.value = 'idle'
    bumpHistory()
    void queryClient.invalidateQueries({ queryKey: deckKey(projectId) })
  }

  // canUndo/canRedo 依赖 historyTick：每次入栈/出栈都会 bump，computed 随之刷新
  const canUndo = computed(() => {
    void historyTick.value
    return undoStack.length > 0
  })
  const canRedo = computed(() => {
    void historyTick.value
    return redoStack.length > 0
  })

  return {
    commit,
    commitStyle,
    commitFlex,
    commitCreateBlock,
    commitDeleteBlock,
    commitMutate,
    undo,
    redo,
    canUndo,
    canRedo,
    historyTick,
    status,
    error,
    refresh,
  }
}

export type SlideSaveQueue = ReturnType<typeof useSlideSaveQueue>
