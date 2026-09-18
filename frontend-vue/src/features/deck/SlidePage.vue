<script setup lang="ts">
import { AlertTriangle, Loader2, RefreshCw, RotateCw } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import type { ComponentPublicInstance } from 'vue'
import Button from '@/components/ui/Button.vue'
import { useRetrySlide } from '@/features/deck/api'
import ChartDataEditor from '@/features/deck/ChartDataEditor.vue'
import ElementToolbar from '@/features/deck/ElementToolbar.vue'
import FlexEditLayer from '@/features/deck/FlexEditLayer.vue'
import { findLeafParent, setContainerPreset } from '@/features/deck/flexTree'
import { registerSlideSaveHandlers } from '@/features/deck/slideSaveBridge'
import { toRenderSlide, type DeckSlide } from '@/features/deck/types'
import { useSlideSaveQueue } from '@/features/deck/useSlideSaveQueue'
import { cn } from '@/lib/utils'
import type { BlockStyle } from '@/render/blockStyle'
import type { FlexContainer, GroupPreset } from '@/render/flexLayout'
import SlideView from '@/render/SlideView.vue'
import type { EditableBlockCommit, Slide, Theme } from '@/render/types'

const props = defineProps<{
  projectId: string
  slide: DeckSlide
  theme: Theme
  locked: boolean
  zoom: number
  index: number
  total: number
  active: boolean
  selectedBlockId: string | null
}>()

const emit = defineEmits<{
  selectBlock: [blockId: string | null]
  openRelayout: []
  bindEl: [node: HTMLElement | null]
}>()

const {
  commit,
  commitStyle,
  commitFlex,
  commitCreateBlock,
  commitDeleteBlock,
  commitMutate,
  undo,
  redo,
  canUndo,
  canRedo,
  status,
  error,
  refresh,
} = useSlideSaveQueue(props.projectId, props.slide.id)

const retry = useRetrySlide(props.projectId)
const editable = computed(
  () => props.slide.status === 'ready' && !props.locked && status.value !== 'conflict',
)
const isFlex = computed(() => props.slide.layout_mode === 'flex' && props.slide.layout_tree != null)

watch(
  () => props.slide.id,
  (id, _previous, onCleanup) => {
    const unregister = registerSlideSaveHandlers(id, {
      commitFlex,
      commitCreateBlock,
      commitDeleteBlock,
      commitMutate,
      undo,
    })
    onCleanup(unregister)
  },
  { immediate: true },
)

const articleRef = ref<HTMLElement | null>(null)
const blockEl = ref<HTMLElement | null>(null)
const flexPreview = ref<FlexContainer | null>(null)
const flexDragging = ref(false)

const setArticleRef = (node: Element | ComponentPublicInstance | null) => {
  const el = node as HTMLElement | null
  articleRef.value = el
  emit('bindEl', el)
}

const selectedBlock = computed(() =>
  props.selectedBlockId != null
    ? (props.slide.blocks.find((block) => block.id === props.selectedBlockId) ?? null)
    : null,
)

const renderSlide = computed<Slide>(() =>
  flexPreview.value
    ? ({ ...toRenderSlide(props.slide), layout_tree: flexPreview.value } as Slide)
    : toRenderSlide(props.slide),
)

const overflowSlotIds = computed(
  () =>
    new Set(
      props.slide.issues
        .filter(
          (issue) =>
            issue.code === 'overflow' ||
            issue.message.includes('溢出') ||
            issue.message.includes('超出画布'),
        )
        .flatMap((issue) => (issue.slot_id ? [issue.slot_id] : ['*'])),
    ),
)

// 换页或外部改写内容后，丢弃本页的拖拽预览
watch(
  () => [props.slide.id, props.slide.revision] as const,
  () => {
    flexPreview.value = null
  },
)

watch(
  () => [props.selectedBlockId, props.slide.blocks, props.zoom, flexPreview.value] as const,
  () => {
    if (!props.selectedBlockId || !articleRef.value) {
      blockEl.value = null
      return
    }
    blockEl.value = articleRef.value.querySelector<HTMLElement>(
      `[data-block-id="${CSS.escape(props.selectedBlockId)}"]`,
    )
  },
  { flush: 'post' },
)

// 仅当前可视页响应撤销/重做与删除快捷键，避免多页 SlidePage 抢同一快捷键
watch(
  [() => props.active, editable, isFlex],
  (_next, _previous, onCleanup) => {
    if (!props.active || !editable.value) return

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const editingText =
        target?.isContentEditable ||
        target?.closest('[contenteditable="true"]') != null ||
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA'

      if (
        isFlex.value &&
        props.selectedBlockId &&
        !editingText &&
        (event.key === 'Delete' || event.key === 'Backspace') &&
        !event.metaKey &&
        !event.ctrlKey &&
        !event.altKey
      ) {
        event.preventDefault()
        commitDeleteBlock(props.selectedBlockId)
        emit('selectBlock', null)
        return
      }

      const mod = event.metaKey || event.ctrlKey
      if (!mod) return
      const key = event.key.toLowerCase()
      const isUndo = key === 'z' && !event.shiftKey
      const isRedo = (key === 'z' && event.shiftKey) || key === 'y'
      if (!isUndo && !isRedo) return

      // 系统输入框（若有）不拦截；画布 contenteditable 的未提交草稿由 EditableText 处理
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') &&
        !target.closest('[data-slide-id]')
      ) {
        return
      }

      if (isUndo) {
        if (!canUndo.value) return
        event.preventDefault()
        undo()
        return
      }
      if (!canRedo.value) return
      event.preventDefault()
      redo()
    }

    window.addEventListener('keydown', onKeyDown)
    onCleanup(() => window.removeEventListener('keydown', onKeyDown))
  },
  // immediate 必须补：监听要在挂载时就注册。首屏页的依赖之后不再变化，
  // 而 watch 默认只在变化时执行——漏了 immediate，撤销/重做与删除键会静默失效（无报错）。
  { flush: 'post', immediate: true },
)

const flexPreset = computed<GroupPreset | null>(() => {
  const tree = props.slide.layout_tree
  if (!isFlex.value || tree == null || props.selectedBlockId == null) return null
  return findLeafParent(tree as FlexContainer, props.selectedBlockId)?.parent.preset ?? null
})

const onStyleChange = (style: BlockStyle | null) => {
  const block = selectedBlock.value
  if (!block) return
  commitStyle(block.id, style)
}

const onCommitContent = (change: EditableBlockCommit) => {
  const block = selectedBlock.value
  if (!block) return
  commit(block.id, change)
}

const onFlexPresetChange = (preset: GroupPreset | null) => {
  const tree = props.slide.layout_tree
  if (!isFlex.value || tree == null || props.selectedBlockId == null) return
  const found = findLeafParent(tree as FlexContainer, props.selectedBlockId)
  if (!found) return
  const next = setContainerPreset(tree as FlexContainer, found.parent.id, preset)
  if (!next) return
  commitFlex(next)
}

const onDeleteBlock = () => {
  if (props.selectedBlockId == null) return
  commitDeleteBlock(props.selectedBlockId)
  emit('selectBlock', null)
}

const onPreviewTree = (next: FlexContainer | null) => {
  flexPreview.value = next
}
</script>

<template>
  <article
    :ref="setArticleRef"
    :data-slide-id="props.slide.id"
    :aria-current="props.active ? 'true' : undefined"
    class="relative flex w-full flex-col items-center gap-2"
  >
    <div class="flex w-full max-w-[76rem] items-center gap-2 px-1">
      <span
        :class="
          cn(
            'text-[11px] font-medium tabular-nums',
            props.active ? 'text-accent' : 'text-ink-muted',
          )
        "
      >
        {{ props.index + 1 }} / {{ props.total }}
      </span>
      <span class="truncate text-[11px] text-ink-muted">{{ props.slide.title }}</span>

      <span v-if="status === 'saving'" class="ml-auto text-xs text-ink-muted">保存中…</span>
      <span v-else-if="status === 'saved'" class="ml-auto text-xs text-positive">已保存</span>
      <span
        v-else-if="status === 'conflict'"
        class="ml-auto flex items-center gap-2 text-xs text-negative"
      >
        {{ error ?? '页面已被其他操作更新' }}
        <button
          type="button"
          class="text-ink-muted underline-offset-2 hover:text-accent hover:underline"
          @click="refresh"
        >
          刷新
        </button>
      </span>
      <span v-else-if="status === 'error'" role="alert" class="ml-auto text-xs text-negative">
        {{ error ?? '保存失败' }}
      </span>

      <button
        v-if="props.active && isFlex && editable"
        type="button"
        class="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink"
        @click="emit('openRelayout')"
      >
        <RefreshCw class="size-3" />
        换排布
      </button>
    </div>

    <div
      v-if="props.slide.status === 'ready'"
      :style="{ width: `${props.zoom * 100}%`, maxWidth: props.zoom <= 1 ? '76rem' : 'none' }"
      :class="
        cn(
          'relative shrink-0 shadow-slide transition-[box-shadow,outline-color]',
          props.active ? 'outline-2 outline-accent/35 outline-offset-4' : 'outline-none',
        )
      "
    >
      <div :class="cn('relative', editable ? 'overflow-visible' : 'overflow-hidden')">
        <SlideView
          :slide="renderSlide"
          :theme="props.theme"
          :slide-index="props.index"
          :editable="editable"
          :selected-block-id="props.selectedBlockId"
          :overflow-mode="editable ? 'reveal' : 'clip'"
          :overflow-slot-ids="overflowSlotIds"
          @select-block="(blockId) => emit('selectBlock', blockId)"
          @commit="commit"
        />
        <FlexEditLayer
          v-if="isFlex && editable"
          :project-id="props.projectId"
          :slide="props.slide"
          :tree="props.slide.layout_tree as FlexContainer"
          :selected-block-id="props.selectedBlockId"
          :busy="status === 'saving'"
          @preview-tree="onPreviewTree"
          @commit-tree="commitFlex"
          @select-block="(blockId) => emit('selectBlock', blockId)"
          @dragging-change="(dragging) => (flexDragging = dragging)"
        />
      </div>
    </div>

    <div
      v-else
      :style="{ width: `${props.zoom * 100}%`, maxWidth: props.zoom <= 1 ? '76rem' : 'none' }"
      class="grid min-h-56 place-items-center"
    >
      <div
        v-if="props.slide.status === 'failed'"
        class="max-w-sm rounded-3xl border border-line bg-surface px-8 py-10 text-center shadow-card"
      >
        <AlertTriangle class="mx-auto mb-3 size-5 text-negative" />
        <p class="text-sm font-medium">这一页没有生成成功</p>
        <p class="mt-1.5 text-[13px] leading-relaxed text-ink-muted">
          {{ props.slide.error ?? '可以直接重试，其他页面不受影响。' }}
        </p>
        <Button
          class="mt-5"
          size="sm"
          :disabled="props.locked || retry.isPending.value"
          @click="retry.mutate(props.slide.id)"
        >
          <RotateCw class="size-3.5" />
          重试这一页
        </Button>
      </div>
      <div v-else class="flex flex-col items-center gap-3 text-ink-muted">
        <Loader2 class="size-5 animate-spin" />
        <p class="text-[13px]">正在生成这一页…</p>
      </div>
    </div>

    <ElementToolbar
      v-if="editable && selectedBlock && selectedBlock.type !== 'chart' && !flexDragging"
      :article-el="articleRef"
      :block-el="blockEl"
      :block="selectedBlock"
      :theme="props.theme"
      :disabled="status === 'saving'"
      :preset-enabled="isFlex && props.slide.layout_tree != null"
      :delete-enabled="isFlex"
      :content-enabled="true"
      :flex-preset="flexPreset"
      @change="onStyleChange"
      @commit-content="onCommitContent"
      @flex-preset-change="onFlexPresetChange"
      @delete="onDeleteBlock"
      @dismiss="emit('selectBlock', null)"
    />
    <ChartDataEditor
      v-if="editable && selectedBlock?.type === 'chart' && !flexDragging"
      :article-el="articleRef"
      :block-el="blockEl"
      :block="selectedBlock"
      :disabled="status === 'saving'"
      @commit="onCommitContent"
      @dismiss="emit('selectBlock', null)"
    />
  </article>
</template>
