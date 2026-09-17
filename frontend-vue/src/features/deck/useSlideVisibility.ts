import { computed, ref, toValue, watch } from 'vue'
import type { MaybeRefOrGetter, Ref } from 'vue'
import type { DeckSlide } from '@/features/deck/types'

export interface SlideScrollRequest {
  id: string
  nonce: number
}

/**
 * 滚动容器内按可见比例跟踪当前页；胶片条 / 导出定位时短暂忽略 observer。
 */
export function useSlideVisibility({
  slides,
  scrollRequest,
  onActiveChange,
}: {
  slides: MaybeRefOrGetter<DeckSlide[]>
  scrollRequest: Ref<SlideScrollRequest | null>
  onActiveChange: (slideId: string) => void
}) {
  const scrollerRef: Ref<HTMLDivElement | null> = ref(null)
  const slideEls = new Map<string, HTMLElement>()
  let ignoreObserver = false
  let scrollTimer: number | null = null

  const bindSlideEl = (slideId: string, node: HTMLElement | null) => {
    if (node) slideEls.set(slideId, node)
    else slideEls.delete(slideId)
  }

  // 胶片条 / 导出定位：滚到目标页；滚动过程中忽略 observer，避免中间页抢焦点
  watch(
    () => toValue(scrollRequest),
    (request) => {
      if (!request) return
      const node = slideEls.get(request.id)
      if (!node) return
      ignoreObserver = true
      node.scrollIntoView({ behavior: 'smooth', block: 'center' })
      if (scrollTimer != null) window.clearTimeout(scrollTimer)
      scrollTimer = window.setTimeout(() => {
        ignoreObserver = false
        scrollTimer = null
      }, 450)
    },
  )

  const slideIdsKey = computed(() =>
    toValue(slides)
      .map((slide) => slide.id)
      .join('|'),
  )

  // flush: 'post' 保证在列表变化渲染出新的页面节点后再重建 observer
  watch(
    [slideIdsKey, scrollerRef],
    (_next, _previous, onCleanup) => {
      const root = scrollerRef.value
      if (!root) return

      const ratios = new Map<string, number>()
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const id = (entry.target as HTMLElement).dataset.slideId
            if (!id) continue
            if (entry.isIntersecting) ratios.set(id, entry.intersectionRatio)
            else ratios.delete(id)
          }
          if (ignoreObserver || ratios.size === 0) return
          let bestId: string | null = null
          let bestRatio = 0
          for (const [id, ratio] of ratios) {
            if (ratio > bestRatio) {
              bestRatio = ratio
              bestId = id
            }
          }
          if (bestId) onActiveChange(bestId)
        },
        { root, threshold: [0.25, 0.45, 0.65, 0.85], rootMargin: '-12% 0px -12% 0px' },
      )

      const nodes = Array.from(root.querySelectorAll<HTMLElement>('[data-slide-id]'))
      for (const node of nodes) {
        slideEls.set(node.dataset.slideId!, node)
        observer.observe(node)
      }
      onCleanup(() => observer.disconnect())
    },
    { flush: 'post' },
  )

  return { scrollerRef, bindSlideEl }
}
