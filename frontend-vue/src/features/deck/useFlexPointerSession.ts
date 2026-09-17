import { computed, ref, shallowRef, toValue, watch, onMounted, onScopeDispose } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { insertColumnsAt, type InsertAnchor } from '@/features/deck/insertColumns'
import {
  activateCornerGrow,
  growStartT,
  ratioStartT,
  resolveDragTree,
  type DragSession,
  type ResizeDragSession,
} from '@/features/deck/flexEditDragSession'
import {
  AXIS_X_GATE_PX,
  movedPastThreshold,
  resolveAxisLock,
  resolveCornerAxisLock,
} from '@/features/deck/flexEditGeometry'
import { normalizeGrows } from '@/features/deck/flexNormalize'
import {
  collectColumnDividers,
  collectRowDividers,
  ensureResizePair,
  findContainerById,
  iterLeaves,
  leafOffset,
  moveLeaf,
  resolveDropTarget,
  resolveInsertAnchor,
  setLeafOffset,
  type ColumnDivider,
  type ResizePair,
  type ResizeSide,
  type RowDivider,
} from '@/features/deck/flexTree'
import {
  getSlideSaveHandlers,
  registerInsertDragStarter,
} from '@/features/deck/slideSaveBridge'
import type { DeckSlide } from '@/features/deck/types'
import { solve, solveNodeAreas, type FlexContainer } from '@/render/flexLayout'

const BLOCK_LABEL: Record<string, string> = {
  text: '文本',
  bullets: '列表',
  image: '图片',
  kpi: 'KPI',
  cards: '卡片',
  callout: '提示',
  table: '表格',
  chart: '图表',
}

const NUDGE_DIRECTIONS: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

const NUDGE_STEP_PT = 1
const NUDGE_COARSE_STEP_PT = 10
/** 连续按键合并成一次保存与一条撤销记录 */
const NUDGE_FLUSH_MS = 260

function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
}

export function useFlexPointerSession({
  projectId,
  slide,
  tree,
  selectedBlockId,
  busy = false,
  onPreviewTree,
  onCommitTree,
  onSelectBlock,
  onDraggingChange,
}: {
  projectId: string
  slide: MaybeRefOrGetter<DeckSlide>
  tree: MaybeRefOrGetter<FlexContainer>
  selectedBlockId: MaybeRefOrGetter<string | null>
  busy?: MaybeRefOrGetter<boolean>
  onPreviewTree?: (next: FlexContainer | null) => void
  onCommitTree: (next: FlexContainer) => void
  onSelectBlock?: (blockId: string) => void
  onDraggingChange?: (dragging: boolean) => void
}) {
  const rootRef = ref<HTMLDivElement | null>(null)
  // setup 只跑一次，回调闭包天然稳定；toValue 每次读取都拿当前值，
  // 等价于 React 版里那些 *Ref.current = props 的回写。
  const slideNow = () => toValue(slide)
  const treeNow = () => toValue(tree)
  const busyNow = () => toValue(busy)
  const selectedNow = () => toValue(selectedBlockId)

  const drag = shallowRef<DragSession | null>(null)
  const previewTree = shallowRef<FlexContainer | null>(null)
  const hoveredBlockId = ref<string | null>(null)
  const hoveredDividerKey = ref<string | null>(null)

  // 只由 showPreview / clearPreview 维护的草稿：松手提交读这里，
  // 不放响应式系统里，保证读到的一定是最后一次 move 的结果。
  let previewDraft: FlexContainer | null = null
  /** 已提交、正等新树回到 props：期间保住预览，避免中途落回旧树 */
  let awaitCommit = false

  const showPreview = (next: FlexContainer) => {
    previewDraft = next
    previewTree.value = next
    onPreviewTree?.(next)
  }

  const clearPreview = () => {
    awaitCommit = false
    previewDraft = null
    previewTree.value = null
    onPreviewTree?.(null)
  }

  // 提交后的新树到了：撤掉预览，让 props 树接管
  watch(
    () => toValue(tree),
    () => {
      if (!awaitCommit) return
      awaitCommit = false
      previewDraft = null
      previewTree.value = null
      onPreviewTree?.(null)
    },
  )

  const activeTree = computed(() => previewTree.value ?? toValue(tree))
  const placements = computed(() => {
    const map = new Map<string, { x: number; y: number; w: number; h: number }>()
    for (const placed of solve(activeTree.value)) {
      map.set(placed.block_id, placed.rect)
    }
    return map
  })

  const basePlacements = computed(() => {
    const map = new Map<string, { x: number; y: number; w: number; h: number }>()
    for (const placed of solve(toValue(tree))) {
      map.set(placed.block_id, placed.rect)
    }
    return map
  })

  const rowDividers = computed(() => collectRowDividers(activeTree.value, placements.value))
  const columnDividers = computed(() =>
    collectColumnDividers(activeTree.value, placements.value),
  )

  const blockIds = computed(() => iterLeaves(toValue(tree)).map((leaf) => leaf.block_id))

  const dragging = computed(() => drag.value != null)
  const draggingBlockId = computed(() =>
    drag.value?.kind === 'reorder' ? drag.value.blockId : null,
  )

  watch(
    dragging,
    (value) => {
      onDraggingChange?.(value)
    },
    { immediate: true },
  )

  watch(
    [draggingBlockId, previewTree],
    ([blockId], _prev, onCleanup) => {
      const host = rootRef.value?.parentElement
      if (!host || !blockId) return
      const el = host.querySelector<HTMLElement>(
        `[data-block-id="${CSS.escape(blockId)}"]`,
      )
      if (!el) return
      const prev = el.style.opacity
      el.style.opacity = '0.15'
      onCleanup(() => {
        el.style.opacity = prev
      })
    },
    { flush: 'post' },
  )

  // Vue 的状态赋值是同步的：拖拽 handlers 直接读写 drag.value，
  // 不再需要 React 版为绕开异步 setState 而设的 dragRef 写穿技巧。
  watch(
    dragging,
    (isDragging, _prev, onCleanup) => {
      if (!isDragging) return

      const toNorm = (clientX: number, clientY: number) => {
        const el = rootRef.value
        if (!el) return null
        const box = el.getBoundingClientRect()
        if (box.width <= 0 || box.height <= 0) return null
        return {
          x: (clientX - box.left) / box.width,
          y: (clientY - box.top) / box.height,
        }
      }

      const onMove = (event: PointerEvent) => {
        let session = drag.value
        if (!session) return
        const pointer = toNorm(event.clientX, event.clientY)
        if (!pointer) return
        const currentTree = treeNow()

        if (session.kind === 'reorder' || session.kind === 'insert') {
          if (session.kind === 'insert' && !session.activated) {
            if (
              !movedPastThreshold(
                session.startClientX,
                session.startClientY,
                event.clientX,
                event.clientY,
              )
            ) {
              drag.value = {
                ...session,
                pointerX: pointer.x,
                pointerY: pointer.y,
              }
              return
            }
            session = { ...session, activated: true }
          }
          const drop = resolveDropTarget({
            root: currentTree,
            placements: basePlacements.value,
            pointer,
            draggedBlockId: session.kind === 'reorder' ? session.blockId : null,
            mode: session.kind,
          })
          drag.value = {
            ...session,
            drop,
            pointerX: pointer.x,
            pointerY: pointer.y,
          }
          return
        }

        if (
          (session.kind === 'ratio' || session.kind === 'grow' || session.kind === 'box') &&
          session.deferPreview &&
          !session.activated
        ) {
          if (
            !movedPastThreshold(
              session.startClientX,
              session.startClientY,
              event.clientX,
              event.clientY,
            )
          ) {
            return
          }
          const dx = event.clientX - session.startClientX
          const dy = event.clientY - session.startClientY
          // 角点：按主轴决定是否补宽度拉伸对，避免纯纵向意图留下宽度包装
          let activated: ResizeDragSession
          if (session.kind === 'grow' && session.pendingCorner) {
            const adx = Math.abs(dx)
            const ady = Math.abs(dy)
            // 横向主导但未满门槛：继续等，避免 3px 激活后锁死成 Y 无法改宽
            if (adx > ady && adx < AXIS_X_GATE_PX) return
            activated = activateCornerGrow(session, resolveCornerAxisLock(dx, dy))
          } else if (session.kind === 'box') {
            activated = {
              ...session,
              activated: true,
              axisLock: resolveAxisLock(dx, dy),
            }
          } else {
            activated = { ...session, activated: true }
          }
          session = activated
          drag.value = activated
          showPreview(normalizeGrows(activated.baseTree))
        }

        if (
          session.kind !== 'ratio' &&
          session.kind !== 'grow' &&
          session.kind !== 'box' &&
          session.kind !== 'offset'
        ) {
          return
        }
        const next = resolveDragTree(session, pointer)
        if (next) showPreview(next)
      }

      /** 侧栏拖入：落点由 handlers 走服务端新建，本层没有可提交的树 */
      const runInsert = (session: Extract<DragSession, { kind: 'insert' }>) => {
        const handlers = getSlideSaveHandlers(slideNow().id)
        if (!handlers) return
        const anchor: InsertAnchor | null =
          session.activated && session.drop
            ? { parentId: session.drop.parentId, index: session.drop.index }
            : session.activated
              ? null
              : resolveInsertAnchor(treeNow(), selectedNow())
        if (!anchor) return
        const payload = session.payload
        if (payload.kind === 'block') {
          handlers.commitCreateBlock({
            type: payload.type,
            parent_id: anchor.parentId,
            index: anchor.index,
          })
          return
        }
        handlers.commitMutate((current) =>
          insertColumnsAt(toValue(projectId), current, anchor, payload.count),
        )
      }

      /** 松手后要提交的新树；无需提交（未过阈值 / 无落点 / 插入）返回 null */
      const treeToCommit = (
        session: DragSession,
        draft: FlexContainer | null,
      ): FlexContainer | null => {
        if (session.kind === 'reorder') {
          if (!session.drop) return null
          return moveLeaf(
            treeNow(),
            session.blockId,
            session.drop.parentId,
            session.drop.index,
          )
        }
        if (session.kind === 'insert') {
          runInsert(session)
          return null
        }
        if (session.kind !== 'offset' && session.deferPreview && !session.activated) {
          return null
        }
        return draft
      }

      const onUp = () => {
        const session = drag.value
        const draft = previewDraft
        drag.value = null
        const next = session ? treeToCommit(session, draft) : null
        if (!next) {
          clearPreview()
          return
        }
        // 预览留到提交后的新树到达再撤：立刻撤会先落回旧树，选中框闪一下
        awaitCommit = true
        onCommitTree(next)
      }

      window.addEventListener('pointermove', onMove)
      window.addEventListener('pointerup', onUp)
      window.addEventListener('pointercancel', onUp)
      onCleanup(() => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', onUp)
        window.removeEventListener('pointercancel', onUp)
      })
    },
    { flush: 'post' },
  )

  // 只读的悬停跟踪，保存中也继续，避免 busy 期间残留旧的悬停块
  onMounted(() => {
    const el = rootRef.value
    if (!el) return
    const parent = el.parentElement
    if (!parent) return

    const onMove = (event: PointerEvent) => {
      if (drag.value) return
      const box = el.getBoundingClientRect()
      if (box.width <= 0 || box.height <= 0) return
      const pointer = {
        x: (event.clientX - box.left) / box.width,
        y: (event.clientY - box.top) / box.height,
      }
      let hit: string | null = null
      for (const [blockId, rect] of basePlacements.value) {
        if (
          pointer.x >= rect.x &&
          pointer.x <= rect.x + rect.w &&
          pointer.y >= rect.y &&
          pointer.y <= rect.y + rect.h
        ) {
          hit = blockId
          break
        }
      }
      hoveredBlockId.value = hit
    }
    const onLeave = () => {
      if (!drag.value) hoveredBlockId.value = null
    }

    parent.addEventListener('pointermove', onMove)
    parent.addEventListener('pointerleave', onLeave)
    onScopeDispose(() => {
      parent.removeEventListener('pointermove', onMove)
      parent.removeEventListener('pointerleave', onLeave)
    })
  })

  // 方向键微调选中块位置：1pt，按住 Shift 为 10pt
  watch(
    [() => busyNow(), selectedNow],
    ([isBusy, selected], _prev, onCleanup) => {
      if (isBusy || !selected) return

      let pending: FlexContainer | null = null
      let timer: number | null = null

      const flush = () => {
        timer = null
        const next = pending
        pending = null
        if (!next) return
        awaitCommit = true
        onCommitTree(next)
      }

      const onKeyDown = (event: KeyboardEvent) => {
        const direction = NUDGE_DIRECTIONS[event.key]
        if (!direction) return
        if (event.metaKey || event.ctrlKey || event.altKey) return
        if (isTextEntryTarget(event.target)) return
        event.preventDefault()

        const base = pending ?? treeNow()
        const current = leafOffset(base, selected)
        const step = event.shiftKey ? NUDGE_COARSE_STEP_PT : NUDGE_STEP_PT
        const next = setLeafOffset(
          base,
          selected,
          current.x + direction[0] * step,
          current.y + direction[1] * step,
        )
        if (!next) return
        pending = next
        showPreview(next)
        if (timer != null) window.clearTimeout(timer)
        timer = window.setTimeout(flush, NUDGE_FLUSH_MS)
      }

      window.addEventListener('keydown', onKeyDown)
      onCleanup(() => {
        window.removeEventListener('keydown', onKeyDown)
        if (timer != null) window.clearTimeout(timer)
        flush()
      })
    },
    { flush: 'post' },
  )

  const startReorder = (blockId: string, event: PointerEvent) => {
    if (busyNow()) return
    // 按住 Alt 改为像素级微调，不触发重排
    if (event.altKey) {
      startOffset(blockId, event)
      return
    }
    event.preventDefault()
    event.stopPropagation()
    onSelectBlock?.(blockId)

    const rect = basePlacements.value.get(blockId)
    const el = rootRef.value
    if (!rect || !el) {
      drag.value = {
        kind: 'reorder',
        blockId,
        drop: null,
        grabOffsetX: 0.02,
        grabOffsetY: 0.02,
        ghostW: 0.2,
        ghostH: 0.12,
        pointerX: rect?.x ?? 0,
        pointerY: rect?.y ?? 0,
      }
      return
    }
    const box = el.getBoundingClientRect()
    const pointerX = (event.clientX - box.left) / box.width
    const pointerY = (event.clientY - box.top) / box.height
    drag.value = {
      kind: 'reorder',
      blockId,
      drop: null,
      grabOffsetX: pointerX - rect.x,
      grabOffsetY: pointerY - rect.y,
      ghostW: rect.w,
      ghostH: rect.h,
      pointerX,
      pointerY,
    }
  }

  const measureRowSpan = (baseTree: FlexContainer, rowId: string) => {
    const row = findContainerById(baseTree, rowId)
    if (!row || row.type !== 'row') return null
    const areas = solveNodeAreas(baseTree)
    const rowArea = areas.get(rowId)
    if (rowArea && rowArea.w > 0) {
      return { rowX: rowArea.x, rowW: rowArea.w }
    }
    let x0 = Infinity
    let x1 = -Infinity
    for (const child of row.children) {
      for (const leaf of iterLeaves(child)) {
        const rect = solve(baseTree).find((p) => p.block_id === leaf.block_id)?.rect
        if (!rect) continue
        x0 = Math.min(x0, rect.x)
        x1 = Math.max(x1, rect.x + rect.w)
      }
    }
    if (!Number.isFinite(x0) || !Number.isFinite(x1) || x1 <= x0) return null
    return { rowX: x0, rowW: x1 - x0 }
  }

  const measureColSpan = (baseTree: FlexContainer, columnId: string) => {
    const areas = solveNodeAreas(baseTree)
    const colArea = areas.get(columnId)
    if (colArea && colArea.h > 0) {
      return { colY: colArea.y, colH: colArea.h }
    }
    return null
  }

  const startRatio = (
    divider: RowDivider,
    event: PointerEvent,
    baseTree?: FlexContainer,
    opts?: { deferPreview?: boolean },
  ) => {
    if (busyNow()) return
    event.preventDefault()
    event.stopPropagation()

    const base = baseTree ?? treeNow()
    const span = measureRowSpan(base, divider.rowId)
    if (!span) return
    const row = findContainerById(base, divider.rowId)
    if (!row || row.type !== 'row') return
    const ratios =
      row.ratios?.length === row.children.length
        ? [...row.ratios]
        : Array.from({ length: row.children.length }, () => 100 / row.children.length)
    const el = rootRef.value
    if (!el) return
    const box = el.getBoundingClientRect()
    if (box.width <= 0) return
    const originX = (event.clientX - box.left) / box.width
    const deferPreview = Boolean(opts?.deferPreview)

    if (!deferPreview) showPreview(normalizeGrows(base))
    drag.value = {
      kind: 'ratio',
      rowId: divider.rowId,
      leftIndex: divider.leftIndex,
      rowX: span.rowX,
      rowW: span.rowW,
      baseTree: base,
      startT: ratioStartT(ratios, divider.leftIndex),
      originX,
      activated: !deferPreview,
      deferPreview,
      startClientX: event.clientX,
      startClientY: event.clientY,
    }
  }

  const startGrow = (
    divider: ColumnDivider,
    event: PointerEvent,
    baseTree?: FlexContainer,
    opts?: { deferPreview?: boolean },
  ) => {
    if (busyNow()) return
    event.preventDefault()
    event.stopPropagation()

    const base = baseTree ?? treeNow()
    const span = measureColSpan(base, divider.columnId)
    if (!span) return
    const column = findContainerById(base, divider.columnId)
    if (!column || column.type !== 'column') return
    const grows = column.children.map((child) => child.grow ?? 1)
    const el = rootRef.value
    if (!el) return
    const box = el.getBoundingClientRect()
    if (box.height <= 0) return
    const originY = (event.clientY - box.top) / box.height
    const deferPreview = Boolean(opts?.deferPreview)

    if (!deferPreview) showPreview(normalizeGrows(base))
    drag.value = {
      kind: 'grow',
      columnId: divider.columnId,
      topIndex: divider.topIndex,
      colY: span.colY,
      colH: span.colH,
      baseTree: base,
      startT: growStartT(grows, divider.topIndex),
      originY,
      activated: !deferPreview,
      deferPreview,
      startClientX: event.clientX,
      startClientY: event.clientY,
    }
  }

  /** 选中块边手柄：先补占位块/包装，拖过阈值后再 preview */
  const beginBlockResize = (
    blockId: string,
    axis: 'x' | 'y',
    side: ResizeSide,
    event: PointerEvent,
  ) => {
    if (busyNow()) return
    const ensured = ensureResizePair(treeNow(), blockId, axis, side)
    if (!ensured) return
    startFromPair(ensured, axis, event, { deferPreview: true })
  }

  const startFromPair = (
    pair: ResizePair,
    axis: 'x' | 'y',
    event: PointerEvent,
    opts?: { deferPreview?: boolean },
  ) => {
    if (axis === 'x') {
      startRatio(
        { rowId: pair.containerId, leftIndex: pair.index, x: 0, y: 0, h: 0 },
        event,
        pair.tree,
        opts,
      )
      return
    }
    startGrow(
      { columnId: pair.containerId, topIndex: pair.index, x: 0, y: 0, w: 0 },
      event,
      pair.tree,
      opts,
    )
  }

  /**
   * 四角手柄：按下时只补纵向拉伸对；激活后按主轴决定是否补横向。
   * 避免「看起来在上下拉」却已包进宽度对、左右一晃就改宽。
   */
  const beginCornerResize = (
    blockId: string,
    sideX: ResizeSide,
    sideY: ResizeSide,
    event: PointerEvent,
  ) => {
    if (busyNow()) return
    const ensuredY = ensureResizePair(treeNow(), blockId, 'y', sideY)
    if (!ensuredY) {
      beginBlockResize(blockId, 'x', sideX, event)
      return
    }
    const span = measureColSpan(ensuredY.tree, ensuredY.containerId)
    const column = findContainerById(ensuredY.tree, ensuredY.containerId)
    if (!span || !column || column.type !== 'column') {
      beginBlockResize(blockId, 'x', sideX, event)
      return
    }
    const el = rootRef.value
    if (!el) return
    const box = el.getBoundingClientRect()
    if (box.width <= 0 || box.height <= 0) return

    event.preventDefault()
    event.stopPropagation()
    const grows = column.children.map((child) => child.grow ?? 1)
    const originX = (event.clientX - box.left) / box.width
    const originY = (event.clientY - box.top) / box.height
    drag.value = {
      kind: 'grow',
      columnId: ensuredY.containerId,
      topIndex: ensuredY.index,
      colY: span.colY,
      colH: span.colH,
      baseTree: ensuredY.tree,
      startT: growStartT(grows, ensuredY.index),
      originY,
      pendingCorner: { blockId, sideX, originX },
      activated: false,
      deferPreview: true,
      startClientX: event.clientX,
      startClientY: event.clientY,
    }
  }

  /** Alt + 拖动块体：像素级平移，不参与重排 */
  const startOffset = (blockId: string, event: PointerEvent) => {
    const el = rootRef.value
    if (busyNow() || !el) return
    const box = el.getBoundingClientRect()
    if (box.width <= 0 || box.height <= 0) return
    event.preventDefault()
    event.stopPropagation()
    onSelectBlock?.(blockId)

    const base = leafOffset(treeNow(), blockId)
    showPreview(treeNow())
    drag.value = {
      kind: 'offset',
      blockId,
      baseTree: treeNow(),
      baseX: base.x,
      baseY: base.y,
      startX: (event.clientX - box.left) / box.width,
      startY: (event.clientY - box.top) / box.height,
    }
  }

  watch(
    () => slideNow().id,
    (id, _prev, onCleanup) => {
      const unregister = registerInsertDragStarter(
        id,
        (payload, clientX, clientY) => {
          if (busyNow()) return
          const el = rootRef.value
          if (!el) return
          const box = el.getBoundingClientRect()
          if (box.width <= 0 || box.height <= 0) return
          const pointerX = (clientX - box.left) / box.width
          const pointerY = (clientY - box.top) / box.height
          drag.value = {
            kind: 'insert',
            payload,
            drop: null,
            grabOffsetX: 0.06,
            grabOffsetY: 0.04,
            ghostW: 0.2,
            ghostH: 0.12,
            pointerX,
            pointerY,
            activated: false,
            startClientX: clientX,
            startClientY: clientY,
          }
        },
      )
      onCleanup(unregister)
    },
    { immediate: true },
  )

  const visibleHandleId = computed(
    () => draggingBlockId.value ?? selectedNow() ?? hoveredBlockId.value,
  )

  const ghostLabel = computed(() => {
    const current = drag.value
    if (current?.kind === 'insert') {
      if (current.payload.kind === 'columns') return `${current.payload.count} 列`
      return BLOCK_LABEL[current.payload.type] ?? '内容块'
    }
    const blockId = draggingBlockId.value
    if (!blockId) return ''
    const block = slideNow().blocks.find((item) => item.id === blockId)
    if (!block) return '内容块'
    if (block.type === 'text') {
      const text = block.text.trim()
      return text ? text.slice(0, 24) : '文本'
    }
    if (block.type === 'bullets') {
      return block.items[0]?.trim() || '列表'
    }
    if (block.type === 'kpi') return block.value || 'KPI'
    return BLOCK_LABEL[block.type] ?? '内容块'
  })

  const selectedRect = computed(() => {
    const selected = selectedNow()
    return selected != null ? (placements.value.get(selected) ?? null) : null
  })

  /** 保存中手柄照常画，只是不吃指针，位置因此不会闪断 */
  const hitClass = computed(() => (busyNow() ? 'pointer-events-none' : 'pointer-events-auto'))

  return {
    rootRef,
    drag,
    hoveredDividerKey,
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
  }
}
