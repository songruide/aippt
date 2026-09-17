<script setup lang="ts">
import { Image as ImageIcon } from 'lucide-vue-next'
import { computed } from 'vue'
import ImagePanelSlot from '@/features/deck/ImagePanelSlot.vue'
import { imageBlocks, type DeckSlide } from '@/features/deck/types'

const props = withDefaults(
  defineProps<{
    projectId: string
    slide: DeckSlide
    disabled?: boolean
  }>(),
  { disabled: false },
)

const images = computed(() => imageBlocks(props.slide))
</script>

<template>
  <div
    v-if="images.length === 0"
    class="rounded-xl border border-dashed border-line-strong px-4 py-8 text-center"
  >
    <ImageIcon class="mx-auto mb-2 size-4 text-ink-muted" />
    <p class="text-[13px] text-ink-muted">这一页的版式里没有图片位</p>
    <p class="mt-1 text-xs text-ink-muted">换一个带图的版式即可放图</p>
  </div>

  <div v-else class="flex flex-col gap-4">
    <ImagePanelSlot
      v-for="(block, index) in images"
      :key="block.id"
      :project-id="props.projectId"
      :slide="props.slide"
      :block="block"
      :label="images.length > 1 ? `图片 ${index + 1}` : '图片'"
      :disabled="props.disabled"
    />
  </div>
</template>
