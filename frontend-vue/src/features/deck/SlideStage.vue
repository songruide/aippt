<script setup lang="ts">
import { AlertTriangle } from 'lucide-vue-next'
import { computed } from 'vue'
import type { BlockSelection } from '@/features/deck/editorTypes'
import SlidePage from '@/features/deck/SlidePage.vue'
import type { DeckSlide } from '@/features/deck/types'
import { useSlideVisibility } from '@/features/deck/useSlideVisibility'
import ZoomControls from '@/features/deck/ZoomControls.vue'
import type { Theme } from '@/render/types'

const props = defineProps<{
  projectId: string
  slides: DeckSlide[]
  activeId: string | null
  scrollRequest: { id: string; nonce: number } | null
  theme: Theme
  locked: boolean
  zoom: number
  canZoomIn: boolean
  canZoomOut: boolean
  selection: BlockSelection | null
}>()

const emit = defineEmits<{
  selectionChange: [selection: BlockSelection | null]
  activeChange: [slideId: string]
  openRelayout: []
  zoom: [delta: 1 | -1]
}>()

const slidesRef = computed(() => props.slides)
const scrollRequestRef = computed(() => props.scrollRequest)
const { scrollerRef, bindSlideEl } = useSlideVisibility({
  slides: slidesRef,
  scrollRequest: scrollRequestRef,
  onActiveChange: (id) => emit('activeChange', id),
})

/** 会话持有滚动容器引用，模板用函数 ref 回写（字符串 ref 会被 vue-tsc 判为未使用） */
function bindScrollerEl(el: unknown) {
  scrollerRef.value = (el as HTMLDivElement | null) ?? null
}

const active = computed(() => props.slides.find((slide) => slide.id === props.activeId) ?? null)
const warnings = computed(() => active.value?.issues.filter((issue) => issue.severity === 'warning') ?? [])
</script>

<template>
  <main class="bg-stage flex min-w-0 flex-1 flex-col">
    <div :ref="bindScrollerEl" class="scrollbar-slim flex-1 overflow-y-auto">
      <div class="mx-auto flex w-full max-w-[96rem] flex-col items-center gap-10 px-8 py-8">
        <SlidePage
          v-for="(slide, index) in props.slides"
          :key="slide.id"
          :project-id="props.projectId"
          :slide="slide"
          :theme="props.theme"
          :locked="props.locked"
          :zoom="props.zoom"
          :index="index"
          :total="props.slides.length"
          :active="slide.id === props.activeId"
          :selected-block-id="props.selection?.slideId === slide.id ? props.selection.blockId : null"
          @select-block="(blockId) => emit('selectionChange', blockId ? { slideId: slide.id, blockId } : null)"
          @open-relayout="emit('openRelayout')"
          @bind-el="(node) => bindSlideEl(slide.id, node)"
        />
      </div>
    </div>

    <footer class="flex flex-wrap items-center gap-4 border-t border-line bg-surface/70 px-4 py-2 backdrop-blur">
      <ZoomControls :zoom="props.zoom" :can-zoom-in="props.canZoomIn" :can-zoom-out="props.canZoomOut" @zoom="(delta) => emit('zoom', delta)" />
      <span class="text-xs text-ink-muted">{{ props.locked ? '生成中暂不可编辑' : active?.status === 'ready' ? '点击元素调样式；Ctrl/⌘+Z 撤销，Ctrl/⌘+Shift+Z 重做' : '向下滚动查看其他页面' }}</span>
      <span v-if="warnings.length > 0" class="flex items-center gap-1.5 text-xs text-warning"><AlertTriangle class="size-3.5" />{{ warnings.length }} 处内容偏长</span>
    </footer>
  </main>
</template>
