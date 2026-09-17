import { ref } from 'vue'

/**
 * 列表拖拽排序。大纲页与编辑器缩略图条共用一套手感，
 * 因此只维护"从哪来 / 悬停在哪"两个状态，落点由调用方决定怎么改数据。
 *
 * 用法：`v-for` 里 `v-bind="itemProps(index)"` 挂上拖拽事件。
 */
export function useDragSort(onMove: (from: number, to: number) => void, enabled = true) {
  let from: number | null = null
  const overIndex = ref<number | null>(null)
  const draggingIndex = ref<number | null>(null)

  const reset = () => {
    from = null
    overIndex.value = null
    draggingIndex.value = null
  }

  const itemProps = (index: number) => {
    if (!enabled) return {}
    return {
      draggable: true,
      onDragstart: (event: DragEvent) => {
        // 菜单等控件落在可拖拽父节点里时，按下会被当成拖拽起点，click 发不出去。
        // 不笼统排除 button：胶片缩略图本身就是 button，还要能拖。
        const target = event.target
        if (
          target instanceof Element &&
          target.closest('a, input, textarea, select, [data-no-drag]')
        ) {
          event.preventDefault()
          return
        }
        from = index
        draggingIndex.value = index
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
      },
      onDragover: (event: DragEvent) => {
        if (from == null) return
        event.preventDefault()
        overIndex.value = index
      },
      onDragleave: () => {
        if (overIndex.value === index) overIndex.value = null
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault()
        const origin = from
        reset()
        if (origin != null && origin !== index) onMove(origin, index)
      },
      onDragend: reset,
    }
  }

  return { itemProps, overIndex, draggingIndex }
}

export function moveItem<T>(items: T[], from: number, to: number): T[] {
  const next = [...items]
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved)
  return next
}
