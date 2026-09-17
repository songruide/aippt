<script setup lang="ts">
import { Plus } from 'lucide-vue-next'
import { computed } from 'vue'
import FilmstripItem from '@/features/deck/FilmstripItem.vue'
import type { DeckSlide } from '@/features/deck/types'
import { useDragSort } from '@/hooks/useDragSort'
import type { Theme } from '@/render/types'

/**
 * 页面缩略图条：真实渲染每一页，而不是画占位方块。
 * 生成中禁止拖拽与增删——后端此时会整块覆盖 blocks，改结构必然撞车。
 */
const props = defineProps<{
  projectId: string
  slides: DeckSlide[]
  theme: Theme
  activeId: string | null
  locked: boolean
  busy: boolean
}>()

const emit = defineEmits<{
  select: [slideId: string]
  reorder: [slideIds: string[]]
  insert: [afterSlideId: string | null]
  duplicate: [slideId: string]
  delete: [slideId: string]
}>()

const drag = useDragSort((from, to) => {
  const ids = props.slides.map((slide) => slide.id)
  const [moved] = ids.splice(from, 1)
  ids.splice(to, 0, moved)
  emit('reorder', ids)
}, true)

const overIndex = computed(() => drag.overIndex.value)
const draggingIndex = computed(() => drag.draggingIndex.value)

// 生成中不挂拖拽事件：useDragSort 的 enabled 是静态参数，改由这里按 locked 动态取舍
const itemDragProps = (index: number) => (props.locked ? {} : drag.itemProps(index))
</script>

<template>
  <nav
    aria-label="页面列表"
    class="scrollbar-slim flex w-46 shrink-0 flex-col gap-2 overflow-y-auto border-r border-line bg-surface p-3"
  >
    <FilmstripItem
      v-for="(slide, index) in props.slides"
      :key="slide.id"
      :project-id="props.projectId"
      :slide="slide"
      :theme="props.theme"
      :index="index"
      :active="slide.id === props.activeId"
      :drag-props="itemDragProps(index)"
      :drag-over="overIndex === index"
      :dragging="draggingIndex === index"
      :locked="props.locked"
      :can-delete="props.slides.length > 1"
      :pending="props.busy"
      @select="emit('select', slide.id)"
      @insert="emit('insert', slide.id)"
      @duplicate="emit('duplicate', slide.id)"
      @delete="emit('delete', slide.id)"
    />

    <button
      type="button"
      :disabled="props.locked || props.busy"
      class="flex items-center justify-center gap-1.5 rounded-lg border border-line border-dashed py-2 text-[12px] text-ink-muted transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
      @click="emit('insert', null)"
    >
      <Plus class="size-3.5" />
      新增页面
    </button>
  </nav>
</template>
