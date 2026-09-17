<script setup lang="ts">
import { AlertTriangle, Loader2 } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import WorkbenchHeader from '@/components/WorkbenchHeader.vue'
import Button from '@/components/ui/Button.vue'
import {
  useCancelDeck,
  useDeck,
  useDeleteSlide,
  useDuplicateSlide,
  useGenerateDeck,
  useInsertSlide,
  useReorderSlides,
} from '@/features/deck/api'
import DeleteSlideDialog from '@/features/deck/DeleteSlideDialog.vue'
import EditorHeaderActions from '@/features/deck/EditorHeaderActions.vue'
import EditorRail from '@/features/deck/EditorRail.vue'
import type { BlockSelection, RailTab } from '@/features/deck/editorTypes'
import { ZOOM_STEPS } from '@/features/deck/editorTypes'
import EmptyStage from '@/features/deck/EmptyStage.vue'
import ExportDialog from '@/features/deck/ExportDialog.vue'
import Filmstrip from '@/features/deck/Filmstrip.vue'
import PresentMode from '@/features/deck/PresentMode.vue'
import RelayoutDock from '@/features/deck/RelayoutPanel.vue'
import SlideStage from '@/features/deck/SlideStage.vue'
import { useDeckProgress } from '@/features/deck/useDeckProgress'
import type { ProjectDetail } from '@/features/projects/types'
import { errorMessage } from '@/lib/errors'
import { resolveTheme } from '@/render/themeOverrides'

const props = defineProps<{ project: ProjectDetail }>()

const deckQuery = useDeck(props.project.id)
const deck = computed(() => deckQuery.data.value)
const slides = computed(() => deck.value?.slides ?? [])
const generating = computed(() => {
  const current = deck.value
  if (current?.status === 'generating') return true
  return props.project.status === 'generating' && (
    current == null ||
    (current.status !== 'ready' && current.slides.some((slide) => slide.status === 'pending' || slide.status === 'generating'))
  )
})
const progress = useDeckProgress(props.project.id, generating)
const theme = computed(() => resolveTheme(props.project.theme_id, props.project.theme_overrides ?? {}))

const generate = useGenerateDeck(props.project.id)
const cancel = useCancelDeck(props.project.id)
const reorder = useReorderSlides(props.project.id)
const insertSlide = useInsertSlide(props.project.id)
const duplicateSlide = useDuplicateSlide(props.project.id)
const deleteSlide = useDeleteSlide(props.project.id)

const activeId = ref<string | null>(null)
const scrollRequest = ref<{ id: string; nonce: number } | null>(null)
const selection = ref<BlockSelection | null>(null)
const rail = ref<RailTab | null>(null)
const relayoutOpen = ref(false)
// 初始缩放必须与 React 一致：React 是 useState(1) → ZOOM_STEPS[1] = 0.8
const zoomIndex = ref(1)
const presenting = ref(false)
const exporting = ref(false)
const removingId = ref<string | null>(null)

const slideIdsKey = computed(() => slides.value.map((slide) => slide.id).join('|'))
// immediate：React 的 useEffect 挂载即跑，deck 命中缓存时 slideIdsKey 首帧就已确定，
// 缺 immediate 会导致 activeId 一直为 null（没有当前页）。
watch(
  slideIdsKey,
  (key) => {
    const ids = key ? key.split('|') : []
    if (!activeId.value || !ids.includes(activeId.value)) activeId.value = ids[0] ?? null
  },
  { immediate: true },
)
watch(activeId, (id) => {
  if (selection.value && selection.value.slideId !== id) selection.value = null
  relayoutOpen.value = false
})
watch(
  () => deck.value?.slides,
  (next) => {
    const selected = selection.value
    if (!selected || !next) return
    const slide = next.find((item) => item.id === selected.slideId)
    if (!slide || !slide.blocks.some((block) => block.id === selected.blockId)) selection.value = null
  },
)

const active = computed(() => slides.value.find((slide) => slide.id === activeId.value) ?? null)
const removing = computed(() => slides.value.find((slide) => slide.id === removingId.value) ?? null)
const pageBusy = computed(() => insertSlide.isPending.value || duplicateSlide.isPending.value || deleteSlide.isPending.value)
const ready = computed(() => progress.event.value?.ready ?? deck.value?.ready ?? 0)
const failed = computed(() => progress.event.value?.failed ?? deck.value?.failed ?? 0)
const total = computed(() => progress.event.value?.total ?? deck.value?.total ?? 0)
const actionError = computed(() => generate.error.value ?? cancel.error.value ?? reorder.error.value ?? insertSlide.error.value ?? duplicateSlide.error.value ?? deleteSlide.error.value)

function focusSlide(id: string) {
  activeId.value = id
  scrollRequest.value = { id, nonce: Date.now() }
}

function focusResult(result: { slide_id?: string | null }) {
  if (result.slide_id) focusSlide(result.slide_id)
}

function closeRailOrOpen(tab: RailTab) {
  relayoutOpen.value = false
  rail.value = rail.value === tab ? null : tab
}

function openRelayout() {
  relayoutOpen.value = true
  rail.value = null
}
</script>

<template>
  <div class="flex h-screen flex-col overflow-hidden">
    <WorkbenchHeader :title="props.project.title">
      <template #meta>
        <span v-if="generating" class="flex shrink-0 items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-medium text-accent tabular-nums">
          <Loader2 class="size-3 animate-spin" />{{ ready }} / {{ total }} 页
        </span>
        <span v-else-if="failed > 0" class="flex shrink-0 items-center gap-1.5 rounded-full bg-negative/10 px-2.5 py-0.5 text-[11px] font-medium text-negative">
          <AlertTriangle class="size-3" />{{ failed }} 页失败
        </span>
        <span v-else-if="total > 0" class="shrink-0 rounded-full bg-surface-soft px-2.5 py-0.5 text-[11px] font-medium text-ink-muted tabular-nums">{{ total }} 页</span>
      </template>

      <Button v-if="generating" variant="ghost" size="sm" :disabled="cancel.isPending.value" @click="cancel.mutate()">
        {{ cancel.isPending.value ? '正在取消…' : '取消生成' }}
      </Button>
      <EditorHeaderActions
        v-else
        :slides="slides"
        :failed="failed"
        :deck-status="deck?.status"
        :generate-pending="generate.isPending.value"
        @continue-generate="generate.mutate({ regenerateAll: false })"
        @present="presenting = true"
        @export="exporting = true"
        @regenerate-all="generate.mutate({ regenerateAll: true })"
      />
    </WorkbenchHeader>

    <p v-if="actionError" role="alert" class="bg-negative/8 px-5 py-2 text-[13px] text-negative">{{ errorMessage(actionError) }}</p>

    <div class="flex min-h-0 flex-1">
      <Filmstrip
        v-if="slides.length > 0"
        :project-id="props.project.id"
        :slides="slides"
        :theme="theme"
        :active-id="activeId"
        :locked="generating"
        :busy="pageBusy"
        @select="focusSlide"
        @reorder="reorder.mutate"
        @insert="(after) => insertSlide.mutate(after, { onSuccess: focusResult })"
        @duplicate="(id) => duplicateSlide.mutate(id, { onSuccess: focusResult })"
        @delete="(id) => (removingId = id)"
      />

      <EmptyStage v-if="slides.length === 0" :pending="generate.isPending.value || deckQuery.isPending.value" @generate="generate.mutate({ regenerateAll: false })" />
      <SlideStage
        v-else
        :project-id="props.project.id"
        :slides="slides"
        :active-id="activeId"
        :scroll-request="scrollRequest"
        :theme="theme"
        :locked="generating"
        :zoom="ZOOM_STEPS[zoomIndex]"
        :can-zoom-out="zoomIndex > 0"
        :can-zoom-in="zoomIndex < ZOOM_STEPS.length - 1"
        :selection="selection"
        @selection-change="selection = $event"
        @active-change="activeId = $event"
        @open-relayout="openRelayout"
        @zoom="(delta) => (zoomIndex = Math.min(Math.max(zoomIndex + delta, 0), ZOOM_STEPS.length - 1))"
      />

      <RelayoutDock
        v-if="active && relayoutOpen && active.layout_mode === 'flex'"
        :project-id="props.project.id"
        :slide="active"
        :theme="theme"
        :open="relayoutOpen"
        :disabled="generating || active.status !== 'ready'"
        @close="relayoutOpen = false"
      />
      <EditorRail
        v-if="active"
        :project="props.project"
        :slide="active"
        :theme="theme"
        :tab="rail"
        :locked="generating"
        :selected-block-id="selection?.slideId === active.id ? selection.blockId : null"
        @tab="closeRailOrOpen"
        @open-relayout="openRelayout"
      />
    </div>

    <PresentMode
      v-if="presenting"
      :slides="slides.filter((slide) => slide.status === 'ready')"
      :theme="theme"
      :start-index="Math.max(0, slides.filter((slide) => slide.status === 'ready').findIndex((slide) => slide.id === activeId))"
      @close="presenting = false"
    />
    <ExportDialog v-if="exporting && deck" :project-id="props.project.id" :deck="deck" @close="exporting = false" @locate="focusSlide" />
    <DeleteSlideDialog
      v-if="removing"
      :slide="removing"
      :slide-count="slides.length"
      :pending="deleteSlide.isPending.value"
      @close="removingId = null"
      @confirm="deleteSlide.mutate(removing.id, { onSuccess: (result) => { removingId = null; focusResult(result) } })"
    />
  </div>
</template>
