<script setup lang="ts">
import { Image as ImageIcon, LayoutTemplate, Palette, Wand2 } from 'lucide-vue-next'
import type { Component } from 'vue'
import AiEditPanel from '@/features/deck/AiEditPanel.vue'
import type { RailTab } from '@/features/deck/editorTypes'
import ImagePanel from '@/features/deck/ImagePanel.vue'
import LayoutPanel from '@/features/deck/LayoutPanel.vue'
import ThemePanel from '@/features/deck/ThemePanel.vue'
import type { DeckSlide } from '@/features/deck/types'
import type { ProjectDetail } from '@/features/projects/types'
import { cn } from '@/lib/utils'
import type { Theme } from '@/render/types'

const props = defineProps<{
  project: ProjectDetail
  slide: DeckSlide
  theme: Theme
  tab: RailTab | null
  locked: boolean
  selectedBlockId: string | null
}>()

const emit = defineEmits<{ tab: [tab: RailTab]; openRelayout: [] }>()

const RAIL_TABS: Array<{ tab: RailTab; label: string; icon: Component }> = [
  { tab: 'ai', label: 'AI 修改', icon: Wand2 },
  { tab: 'theme', label: '主题', icon: Palette },
  { tab: 'layout', label: '版式', icon: LayoutTemplate },
  { tab: 'image', label: '图片', icon: ImageIcon },
]
</script>

<template>
  <div class="flex shrink-0">
    <aside
      v-if="props.tab"
      class="scrollbar-slim w-80 overflow-y-auto border-l border-line bg-surface px-4 py-4"
    >
      <!-- 面板内的请求按页缓存（slide.id 在 setup 时固化），换页必须重建，否则请求会打到上一页 -->
      <AiEditPanel
        v-if="props.tab === 'ai'"
        :key="props.slide.id"
        :project-id="props.project.id"
        :slide="props.slide"
      />
      <ThemePanel
        v-else-if="props.tab === 'theme'"
        :project="props.project"
        :disabled="props.locked"
      />
      <LayoutPanel
        v-else-if="props.tab === 'layout'"
        :key="props.slide.id"
        :project-id="props.project.id"
        :slide="props.slide"
        :theme="props.theme"
        :selected-block-id="props.selectedBlockId"
        :disabled="props.locked"
        @open-relayout="emit('openRelayout')"
      />
      <ImagePanel
        v-else-if="props.tab === 'image'"
        :project-id="props.project.id"
        :slide="props.slide"
        :disabled="props.locked"
      />
    </aside>

    <div class="flex w-13 flex-col items-center gap-1.5 border-l border-line bg-surface py-3">
      <button
        v-for="item in RAIL_TABS"
        :key="item.tab"
        type="button"
        :title="item.label"
        :aria-label="item.label"
        :aria-pressed="props.tab === item.tab"
        :class="
          cn(
            'grid size-9 place-items-center rounded-xl transition-colors',
            props.tab === item.tab
              ? 'bg-accent-soft text-accent'
              : 'text-ink-muted hover:bg-surface-soft hover:text-ink',
          )
        "
        @click="emit('tab', item.tab)"
      >
        <component :is="item.icon" class="size-4.5" />
      </button>
    </div>
  </div>
</template>
