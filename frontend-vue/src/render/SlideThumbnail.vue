<script setup lang="ts">
import SlideView from '@/render/SlideView.vue'
import { pt, resolveColor } from '@/render/style'
import type { Slide, Theme } from '@/render/types'

/** 缩略图：与正式渲染共用同一组件，只是容器更小 */
const props = defineProps<{
  slide: Slide
  theme: Theme
  slideIndex?: number
}>()
</script>

<template>
  <div :style="{ border: `1px solid ${resolveColor(props.theme, 'line')}`, padding: pt(0) }">
    <SlideView :slide="props.slide" :theme="props.theme" :slide-index="props.slideIndex ?? 0" overflow-mode="clip" />
  </div>
</template>
