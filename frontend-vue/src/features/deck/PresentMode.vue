<script setup lang="ts">
import { ChevronLeft, ChevronRight, Maximize2, Minimize2, X } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import PresentChromeButton from '@/features/deck/PresentChromeButton.vue'
import { toRenderSlide, type DeckSlide } from '@/features/deck/types'
import { cn } from '@/lib/utils'
import SlideView from '@/render/SlideView.vue'
import { CANVAS_HEIGHT_PT, CANVAS_WIDTH_PT, type Theme } from '@/render/types'

const CHROME_IDLE_MS = 2200
const TIP_MS = 3200
const ASPECT = CANVAS_WIDTH_PT / CANVAS_HEIGHT_PT

/**
 * 演示放映：全幅 16:9 铺满视口、控件闲置隐藏、底部分段进度、点击左右翻页。
 * 不含演讲者备注 / 聚光灯 / 分享链接。
 */
const props = defineProps<{
  slides: DeckSlide[]
  theme: Theme
  startIndex: number
}>()

const emit = defineEmits<{ close: [] }>()

const index = ref(props.startIndex)
const chromeVisible = ref(true)
const tipVisible = ref(true)
const idleCursor = ref(false)
const isFullscreen = ref(false)
const rootRef = ref<HTMLDivElement | null>(null)
let chromeTimer: number | null = null
// 挂载时创建、卸载时清理的监听与定时器；放在 setup 作用域便于顶层注册 onBeforeUnmount
let previousOverflow = ''
let tipTimer: number | null = null
let onKeyDown: ((event: KeyboardEvent) => void) | null = null
let onFullscreenChange: (() => void) | null = null

const last = computed(() => Math.max(props.slides.length - 1, 0))
const clamp = (next: number) => Math.min(Math.max(next, 0), last.value)
const go = (target: number) => {
  index.value = clamp(target)
}
const prev = () => {
  index.value = Math.max(index.value - 1, 0)
}
const next = () => {
  index.value = Math.min(index.value + 1, last.value)
}

const bumpChrome = () => {
  chromeVisible.value = true
  idleCursor.value = false
  if (chromeTimer != null) window.clearTimeout(chromeTimer)
  chromeTimer = window.setTimeout(() => {
    chromeVisible.value = false
    idleCursor.value = true
    chromeTimer = null
  }, CHROME_IDLE_MS)
}

const toggleFullscreen = async () => {
  const root = rootRef.value
  if (!root) return
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      await root.requestFullscreen()
    }
  } catch {
    // 浏览器拒绝全屏时仍可覆盖层放映
  }
}

onMounted(() => {
  previousOverflow = document.body.style.overflow
  document.body.style.overflow = 'hidden'

  bumpChrome()
  tipTimer = window.setTimeout(() => {
    tipVisible.value = false
  }, TIP_MS)

  onFullscreenChange = () => {
    isFullscreen.value = Boolean(document.fullscreenElement)
  }
  document.addEventListener('fullscreenchange', onFullscreenChange)

  onKeyDown = (event: KeyboardEvent) => {
    bumpChrome()
    if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'PageDown') {
      event.preventDefault()
      index.value = Math.min(index.value + 1, last.value)
    } else if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
      event.preventDefault()
      index.value = Math.max(index.value - 1, 0)
    } else if (event.key === 'Home') {
      event.preventDefault()
      index.value = 0
    } else if (event.key === 'End') {
      event.preventDefault()
      index.value = last.value
    } else if (event.key === 'f' || event.key === 'F') {
      event.preventDefault()
      void toggleFullscreen()
    } else if (event.key === 'Escape') {
      // 全屏时 Esc 先退浏览器全屏；仅非全屏时退出演示
      if (document.fullscreenElement) return
      emit('close')
    }
  }

  document.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  document.body.style.overflow = previousOverflow
  if (onKeyDown) document.removeEventListener('keydown', onKeyDown)
  if (onFullscreenChange) document.removeEventListener('fullscreenchange', onFullscreenChange)
  if (tipTimer != null) window.clearTimeout(tipTimer)
  if (chromeTimer != null) window.clearTimeout(chromeTimer)
  if (document.fullscreenElement) void document.exitFullscreen().catch(() => {})
})

const slide = computed(() => props.slides[clamp(index.value)])
</script>

<template>
  <div
    v-if="slide"
    ref="rootRef"
    role="dialog"
    aria-modal="true"
    aria-label="演示放映"
    :class="
      cn(
        'fixed inset-0 z-[60] bg-black text-white',
        idleCursor && !chromeVisible ? 'cursor-none' : 'cursor-default',
      )
    "
    @mousemove="bumpChrome"
    @pointerdown="bumpChrome"
  >
    <div class="absolute inset-0 grid place-items-center overflow-hidden">
      <div
        :key="slide.id"
        class="present-slide-in overflow-hidden shadow-[0_0_0_1px_rgba(255,255,255,0.04)]"
        :style="{
          width: `min(100vw, calc(100vh * ${ASPECT}))`,
          height: `min(100vh, calc(100vw / ${ASPECT}))`,
        }"
      >
        <SlideView
          :slide="toRenderSlide(slide)"
          :theme="props.theme"
          :slide-index="clamp(index)"
        />
      </div>
    </div>

    <!-- 左右热区翻页；z-index 低于顶栏/底栏，避免抢走控件点击 -->
    <button
      type="button"
      aria-label="上一页"
      :disabled="index === 0"
      class="absolute inset-y-0 left-0 z-[1] w-[28%] cursor-w-resize border-0 bg-transparent disabled:cursor-default"
      @click.stop="prev"
    />
    <button
      type="button"
      aria-label="下一页"
      :disabled="index >= last"
      class="absolute inset-y-0 right-0 z-[1] w-[72%] cursor-e-resize border-0 bg-transparent disabled:cursor-default"
      @click.stop="next"
    />

    <div
      :class="
        cn(
          'pointer-events-none absolute top-5 right-5 z-[3] rounded-md bg-black/70 px-3 py-1.5 text-[12px] text-white/90 shadow-pop backdrop-blur-sm transition-opacity duration-500',
          tipVisible ? 'opacity-100' : 'opacity-0',
        )
      "
    >
      退出演示 Esc
    </div>

    <div
      :class="
        cn(
          'absolute inset-x-0 top-0 z-[3] flex items-start justify-end gap-1 bg-gradient-to-b from-black/55 to-transparent px-4 pt-3 pb-10 transition-opacity duration-300',
          chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
        )
      "
    >
      <PresentChromeButton
        :label="isFullscreen ? '退出全屏' : '进入全屏'"
        @click="void toggleFullscreen()"
      >
        <Minimize2 v-if="isFullscreen" class="size-4" />
        <Maximize2 v-else class="size-4" />
      </PresentChromeButton>
      <PresentChromeButton label="退出放映" @click="emit('close')">
        <X class="size-4" />
      </PresentChromeButton>
    </div>

    <div
      :class="
        cn(
          'absolute inset-x-0 bottom-0 z-[3] bg-gradient-to-t from-black/60 to-transparent px-5 pt-10 pb-4 transition-opacity duration-300',
          chromeVisible ? 'opacity-100' : 'pointer-events-none opacity-0',
        )
      "
    >
      <div class="mx-auto flex max-w-5xl items-center gap-3">
        <PresentChromeButton label="上一页" :disabled="index === 0" @click="prev">
          <ChevronLeft class="size-4" />
        </PresentChromeButton>

        <span class="min-w-14 text-center text-[12px] tabular-nums tracking-wide text-white/75">
          {{ String(index + 1).padStart(2, '0') }} / {{ String(props.slides.length).padStart(2, '0') }}
        </span>

        <PresentChromeButton label="下一页" :disabled="index >= last" @click="next">
          <ChevronRight class="size-4" />
        </PresentChromeButton>

        <div
          class="ml-2 flex min-w-0 flex-1 items-center gap-1"
          role="navigation"
          aria-label="演示进度"
        >
          <button
            v-for="(item, i) in props.slides"
            :key="item.id"
            type="button"
            :aria-label="`第 ${i + 1} 页`"
            :aria-current="i === index ? 'true' : undefined"
            :class="
              cn(
                'h-1 min-w-0 flex-1 rounded-full transition-colors',
                i === index
                  ? 'bg-white'
                  : i < index
                    ? 'bg-white/55 hover:bg-white/75'
                    : 'bg-white/20 hover:bg-white/40',
              )
            "
            @click="go(i)"
          />
        </div>
      </div>
    </div>
  </div>
</template>
