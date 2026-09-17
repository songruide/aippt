<script setup lang="ts">
import {
  AlertTriangle,
  Copy,
  Loader2,
  Lock,
  MoreVertical,
  Plus,
  RotateCw,
  Trash2,
} from 'lucide-vue-next'
import { computed } from 'vue'
import MenuItem from '@/components/ui/MenuItem.vue'
import MenuPopover from '@/components/ui/MenuPopover.vue'
import { useRetrySlide } from '@/features/deck/api'
import { slideDisplayTitle, toRenderSlide, type DeckSlide } from '@/features/deck/types'
import { cn } from '@/lib/utils'
import SlideView from '@/render/SlideView.vue'
import { CANVAS_HEIGHT_PT, CANVAS_WIDTH_PT, type Theme } from '@/render/types'

const props = defineProps<{
  projectId: string
  slide: DeckSlide
  theme: Theme
  index: number
  active: boolean
  dragProps: Record<string, unknown>
  dragOver: boolean
  dragging: boolean
  locked: boolean
  canDelete: boolean
  pending: boolean
}>()

const emit = defineEmits<{
  select: []
  insert: []
  duplicate: []
  delete: []
}>()

const retry = useRetrySlide(props.projectId)
const warnings = computed(
  () => props.slide.issues.filter((issue) => issue.severity === 'warning').length,
)
const edited = computed(() => props.slide.blocks.some((block) => block.locked))
const pulsing = computed(() => props.slide.status === 'generating')
</script>

<template>
  <div v-bind="props.dragProps" :class="cn('group relative', props.dragging && 'opacity-50')">
    <button
      type="button"
      :aria-current="props.active"
      :class="
        cn(
          'block w-full overflow-hidden rounded-lg border bg-surface text-left transition-all',
          props.active
            ? 'border-accent ring-1 ring-accent'
            : props.dragOver
              ? 'border-accent'
              : 'border-line hover:border-line-strong',
        )
      "
      @click="emit('select')"
    >
      <div :style="{ aspectRatio: `${CANVAS_WIDTH_PT} / ${CANVAS_HEIGHT_PT}` }">
        <SlideView
          v-if="props.slide.status === 'ready'"
          :slide="toRenderSlide(props.slide)"
          :theme="props.theme"
          :slide-index="props.index"
        />
        <div
          v-else-if="props.slide.status === 'failed'"
          class="grid h-full place-items-center bg-negative/[0.05]"
        >
          <AlertTriangle class="size-4 text-negative/70" />
        </div>
        <div v-else class="flex h-full flex-col justify-end gap-1.5 bg-surface-soft p-3">
          <span
            :class="cn('h-1.5 w-1/2 rounded-full', pulsing ? 'animate-pulse bg-accent/40' : 'bg-line-strong')"
          />
          <span :class="cn('h-1 w-4/5 rounded-full bg-line', pulsing && 'animate-pulse')" />
          <span :class="cn('h-1 w-3/5 rounded-full bg-line', pulsing && 'animate-pulse')" />
        </div>
      </div>
    </button>

    <!-- 缩略图右上角的页面操作入口：悬浮或菜单展开时才现身，免得盖住画面 -->
    <div v-if="!props.locked" data-no-drag class="absolute top-1 right-1 z-10">
      <MenuPopover label="页面操作" panel-class="w-40">
        <template #trigger="{ open, toggle }">
          <button
            type="button"
            aria-label="页面操作"
            :aria-expanded="open"
            :class="
              cn(
                'grid size-6 place-items-center rounded-md bg-surface/90 text-ink-muted ring-1 ring-line transition-opacity hover:text-ink',
                open ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
              )
            "
            @click="toggle"
          >
            <MoreVertical class="size-3.5" />
          </button>
        </template>
        <template #default="{ close }">
          <MenuItem
            :icon="Plus"
            :disabled="props.pending"
            @select="
              () => {
                close()
                emit('insert')
              }
            "
          >
            在此后插入空白页
          </MenuItem>
          <MenuItem
            :icon="Copy"
            :disabled="props.pending"
            @select="
              () => {
                close()
                emit('duplicate')
              }
            "
          >
            复制本页
          </MenuItem>
          <MenuItem
            :icon="Trash2"
            danger
            :disabled="props.pending || !props.canDelete"
            @select="
              () => {
                close()
                emit('delete')
              }
            "
          >
            删除本页
          </MenuItem>
        </template>
      </MenuPopover>
    </div>

    <div class="mt-1 flex items-center gap-1.5 px-0.5">
      <span class="w-4 text-[11px] text-ink-muted tabular-nums">{{ props.index + 1 }}</span>
      <span class="min-w-0 flex-1 truncate text-[11px] text-ink-soft">
        {{ slideDisplayTitle(props.slide) }}
      </span>
      <Loader2 v-if="pulsing" class="size-3 animate-spin text-accent" />
      <span v-if="edited" title="已人工修改，AI 不会覆盖" class="text-ink-muted">
        <Lock class="size-3" />
      </span>
      <span
        v-if="props.slide.status === 'ready' && warnings > 0"
        :title="`${warnings} 处内容偏长`"
        class="text-warning"
      >
        <AlertTriangle class="size-3" />
      </span>
    </div>

    <button
      v-if="props.slide.status === 'failed'"
      type="button"
      data-no-drag
      :disabled="props.locked || retry.isPending.value"
      class="mt-1 flex w-full items-center justify-center gap-1 rounded-md bg-negative/8 py-1 text-[11px] text-negative transition-colors hover:bg-negative/15 disabled:opacity-50"
      @click="retry.mutate(props.slide.id)"
    >
      <RotateCw :class="cn('size-3', retry.isPending.value && 'animate-spin')" />
      {{ retry.isPending.value ? '重试中…' : '重试这一页' }}
    </button>
  </div>
</template>
