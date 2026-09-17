<script setup lang="ts">
import { Check, Loader2, Unlock } from 'lucide-vue-next'
import { computed } from 'vue'
import BlockInsertPanel from '@/features/deck/BlockInsertRail.vue'
import {
  useSlideLayouts,
  useSwitchSlideLayout,
  useUnlockSlideFlex,
} from '@/features/deck/api'
import RelayoutOpenButton from '@/features/deck/RelayoutOpenButton.vue'
import type { DeckSlide } from '@/features/deck/types'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import type { Theme } from '@/render/types'

/** 版式切换：只列出这一页内容装得下的版式，装不下的给出原因而不是直接隐藏 */
const props = withDefaults(
  defineProps<{
    projectId: string
    slide: DeckSlide
    theme: Theme
    selectedBlockId?: string | null
    disabled?: boolean
  }>(),
  { selectedBlockId: null, disabled: false },
)

const emit = defineEmits<{ openRelayout: [] }>()

const layouts = useSlideLayouts(props.projectId, props.slide.id, true)
const switchLayout = useSwitchSlideLayout(props.projectId, props.slide.id)
const unlockFlex = useUnlockSlideFlex(props.projectId, props.slide.id)

const options = computed(() => layouts.data.value ?? [])
const isFlex = computed(() => props.slide.layout_mode === 'flex')
const insertDisabled = computed(() => props.disabled || props.slide.status !== 'ready')
</script>

<template>
  <div class="flex flex-col gap-2">
    <button
      v-if="!isFlex"
      type="button"
      :disabled="props.disabled || unlockFlex.isPending.value"
      class="flex items-center gap-2 rounded-xl border border-dashed border-accent/40 bg-accent-soft/40 px-3.5 py-3 text-left transition-colors hover:border-accent hover:bg-accent-soft disabled:opacity-50"
      @click="unlockFlex.mutate({ revision: props.slide.revision })"
    >
      <Loader2
        v-if="unlockFlex.isPending.value"
        class="size-3.5 shrink-0 animate-spin text-accent"
      />
      <Unlock v-else class="size-3.5 shrink-0 text-accent" />
      <span>
        <span class="block text-[13px] font-medium text-accent">自由编辑此页</span>
        <span class="mt-0.5 block text-xs leading-relaxed text-ink-muted">
          可自由增删内容、拖拽调整版面
        </span>
      </span>
    </button>

    <BlockInsertPanel
      v-if="isFlex"
      :project-id="props.projectId"
      :slide="props.slide"
      :selected-block-id="props.selectedBlockId"
      :disabled="insertDisabled"
    />

    <RelayoutOpenButton
      v-if="isFlex"
      :disabled="insertDisabled"
      @open="emit('openRelayout')"
    />

    <p v-if="layouts.isPending.value" class="flex items-center gap-2 text-[13px] text-ink-muted">
      <Loader2 class="size-3.5 animate-spin" />
      正在读取可用版式…
    </p>
    <p v-if="layouts.isError.value" class="text-[13px] text-negative">
      {{ errorMessage(layouts.error.value, '版式列表加载失败') }}
    </p>

    <template v-if="!isFlex">
      <button
        v-for="candidate in options"
        :key="candidate.layout_id"
        type="button"
        :aria-pressed="candidate.current"
        :disabled="
          !candidate.compatible || candidate.current || props.disabled || switchLayout.isPending.value
        "
        :class="
          cn(
            'rounded-xl border px-3.5 py-3 text-left transition-colors',
            candidate.current
              ? 'border-accent bg-accent-soft'
              : !candidate.compatible
                ? 'cursor-not-allowed border-line opacity-55'
                : 'border-line hover:border-line-strong hover:bg-surface-soft',
          )
        "
        @click="
          switchLayout.mutate({ layout_id: candidate.layout_id, revision: props.slide.revision })
        "
      >
        <span class="flex items-center gap-2">
          <span class="flex-1 text-[13px] font-medium">{{ candidate.name }}</span>
          <Check v-if="candidate.current" class="size-3.5 shrink-0 text-accent" />
        </span>
        <span class="mt-0.5 block text-xs leading-relaxed text-ink-muted">
          {{ !candidate.compatible && candidate.reason ? candidate.reason : candidate.usage }}
        </span>
      </button>
    </template>

    <p v-if="switchLayout.isError.value" role="alert" class="text-xs text-negative">
      {{ errorMessage(switchLayout.error.value, '切换失败') }}
    </p>
    <p v-if="unlockFlex.isError.value" role="alert" class="text-xs text-negative">
      {{ errorMessage(unlockFlex.error.value, '解锁失败') }}
    </p>
  </div>
</template>
