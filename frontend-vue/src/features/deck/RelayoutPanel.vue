<script setup lang="ts">
import { Loader2, RefreshCw, Undo2, X } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useProposeRelayout } from '@/features/deck/api'
import { getSlideSaveHandlers } from '@/features/deck/slideSaveBridge'
import {
  toRenderSlide,
  type DeckSlide,
  type RelayoutProposal,
} from '@/features/deck/types'
import { cloneData } from '@/lib/clone'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import type { FlexContainer } from '@/render/flexLayout'
import SlideThumbnail from '@/render/SlideThumbnail.vue'
import type { Theme } from '@/render/types'

/**
 * 「换排布」右侧面板：点缩略图即应用候选布局树，Undo 恢复上一棵。
 */
const props = withDefaults(
  defineProps<{
    projectId: string
    slide: DeckSlide
    theme: Theme
    open: boolean
    disabled?: boolean
  }>(),
  { disabled: false },
)

const emit = defineEmits<{ close: [] }>()

const propose = useProposeRelayout(props.projectId, props.slide.id)
const proposal = ref<RelayoutProposal | null>(null)
const appliedId = ref<string | null>(null)
const undoTree = ref<FlexContainer | null>(null)
const originalTree = ref<FlexContainer | null>(null)

// 仅在打开时拉取；slide.revision 变化由 apply 后外层刷新。
// 换页时 EditorWorkspace 会关掉 dock，因此 slide.id 在打开期间保持稳定。
watch(
  () => props.open,
  (open) => {
    if (!open) return
    proposal.value = null
    appliedId.value = null
    undoTree.value = null
    const current = (props.slide.layout_tree as FlexContainer | null) ?? null
    originalTree.value = current ? cloneData(current) : null
    propose.mutate(
      { revision: props.slide.revision },
      {
        onSuccess: (data) => {
          proposal.value = data
        },
      },
    )
  },
  { immediate: true },
)

const candidates = computed(() => proposal.value?.candidates ?? [])

const applyTree = (tree: FlexContainer, candidateId: string | null) => {
  const handlers = getSlideSaveHandlers(props.slide.id)
  if (!handlers) return
  const previous = (props.slide.layout_tree as FlexContainer | null) ?? null
  if (previous) undoTree.value = cloneData(previous)
  appliedId.value = candidateId
  handlers.commitFlex(tree)
}

const undo = () => {
  const tree = undoTree.value
  if (!tree) return
  const handlers = getSlideSaveHandlers(props.slide.id)
  if (!handlers) return
  handlers.commitFlex(tree)
  undoTree.value = null
  appliedId.value = null
}

const showMore = () => {
  propose.mutate(
    { revision: props.slide.revision },
    {
      onSuccess: (data) => {
        const current = proposal.value
        if (!current) {
          proposal.value = data
          return
        }
        const seen = new Set(current.candidates.map((candidate) => candidate.id))
        const merged = [...current.candidates]
        for (const candidate of data.candidates) {
          if (!seen.has(candidate.id)) merged.push(candidate)
        }
        proposal.value = { revision: data.revision, candidates: merged }
      },
    },
  )
}

const previewOf = (tree: FlexContainer) =>
  toRenderSlide({ ...props.slide, layout_mode: 'flex', layout_tree: tree })
</script>

<template>
  <aside
    v-if="props.open"
    class="flex h-full w-80 shrink-0 flex-col border-l border-line bg-surface shadow-card"
    aria-label="换排布"
  >
    <div class="flex items-center gap-2 border-b border-line px-4 py-3">
      <h2 class="flex-1 text-[14px] font-semibold">换排布</h2>
      <button
        type="button"
        :disabled="!undoTree || props.disabled"
        class="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12px] text-ink-soft hover:bg-surface-soft disabled:opacity-35"
        @click="undo"
      >
        <Undo2 class="size-3.5" />
        撤销
      </button>
      <button
        type="button"
        aria-label="关闭"
        class="rounded-lg p-1.5 text-ink-muted hover:bg-surface-soft hover:text-ink"
        @click="emit('close')"
      >
        <X class="size-4" />
      </button>
    </div>

    <div class="scrollbar-slim flex-1 space-y-3 overflow-y-auto p-3">
      <p
        v-if="propose.isPending.value && !proposal"
        class="flex items-center gap-2 px-1 py-6 text-[13px] text-ink-muted"
      >
        <Loader2 class="size-3.5 animate-spin" />
        正在生成排布…
      </p>
      <p v-if="propose.isError.value" role="alert" class="text-xs text-negative">
        {{ errorMessage(propose.error.value, '生成排布失败') }}
      </p>

      <button
        v-if="originalTree"
        type="button"
        :aria-pressed="appliedId == null"
        :disabled="props.disabled"
        :class="
          cn(
            'w-full rounded-xl border p-2 text-left transition-colors disabled:opacity-50',
            appliedId == null ? 'border-accent bg-accent-soft/40' : 'border-line hover:border-line-strong',
          )
        "
        @click="applyTree(originalTree, null)"
      >
        <span class="mb-2 block text-[12px] font-medium text-ink-soft">当前</span>
        <div class="pointer-events-none overflow-hidden rounded-lg">
          <SlideThumbnail :slide="previewOf(originalTree)" :theme="props.theme" />
        </div>
      </button>

      <button
        v-for="(candidate, index) in candidates"
        :key="candidate.id"
        type="button"
        :aria-pressed="appliedId === candidate.id"
        :disabled="props.disabled"
        :class="
          cn(
            'w-full rounded-xl border p-2 text-left transition-colors disabled:opacity-50',
            appliedId === candidate.id
              ? 'border-accent bg-accent-soft/40'
              : 'border-line hover:border-line-strong',
          )
        "
        @click="applyTree(candidate.layout_tree, candidate.id)"
      >
        <span class="mb-2 block text-[12px] font-medium text-ink-soft">方案 {{ index + 1 }}</span>
        <div class="pointer-events-none overflow-hidden rounded-lg">
          <SlideThumbnail :slide="previewOf(candidate.layout_tree)" :theme="props.theme" />
        </div>
      </button>
    </div>

    <div class="border-t border-line p-3">
      <button
        type="button"
        :disabled="props.disabled || propose.isPending.value"
        class="flex w-full items-center justify-center gap-2 rounded-xl border border-line px-3 py-2.5 text-[13px] text-ink-soft transition-colors hover:bg-surface-soft disabled:opacity-50"
        @click="showMore"
      >
        <Loader2 v-if="propose.isPending.value" class="size-3.5 animate-spin" />
        <RefreshCw v-else class="size-3.5" />
        显示更多
      </button>
    </div>
  </aside>
</template>
