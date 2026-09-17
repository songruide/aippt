<script setup lang="ts">
import { Check, GripVertical, Loader2, Plus, RefreshCw, Sparkles, Trash2, X } from 'lucide-vue-next'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import WorkbenchHeader from '@/components/WorkbenchHeader.vue'
import Button from '@/components/ui/Button.vue'
import { useGenerateOutline, useOutline, useUpdateOutline } from '@/features/outline/api'
import type { Outline, OutlinePage } from '@/features/outline/types'
import { useConfirmAndGenerate } from '@/features/outline/useConfirmAndGenerate'
import { useOutlineProgress } from '@/features/outline/useOutlineProgress'
import { useUpdateProject } from '@/features/projects/api'
import { PAGE_COUNT_RANGE, type ProjectDetail } from '@/features/projects/types'
import { moveItem, useDragSort } from '@/hooks/useDragSort'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'
import { themeList } from '@/render/design'
import ThemeCover from '@/render/ThemeCover.vue'

const MAX_KEY_POINTS = 5
const MIN_KEY_POINTS = 2

const props = defineProps<{ project: ProjectDetail }>()

const outlineQuery = useOutline(props.project.id)
const generate = useGenerateOutline(props.project.id)
const updateOutline = useUpdateOutline(props.project.id)
const updateProject = useUpdateProject(props.project.id)
const launch = useConfirmAndGenerate(props.project.id)

const outline = computed<Outline | null>(() => outlineQuery.data.value ?? null)
const progress = useOutlineProgress(
  props.project.id,
  computed(() => outline.value?.status === 'generating'),
)

const pages = ref<OutlinePage[]>([])
const themeId = ref(props.project.theme_id)
const saveTimer = ref<number | null>(null)
const savedOnce = ref(false)

const clonePages = (value: OutlinePage[]) => value.map((page) => ({
  ...page,
  key_points: [...page.key_points],
}))

// 服务端大纲更新后同步编辑器，但不覆盖用户尚未保存的本地改动。
watch(
  () => [outline.value?.revision, outline.value?.pages] as const,
  ([revision, nextPages]) => {
    if (!nextPages) return
    const currentRevision = outline.value?.revision
    const hasLocalChanges = currentRevision === revision &&
      JSON.stringify(pages.value) !== JSON.stringify(nextPages)
    if (!hasLocalChanges || pages.value.length === 0) {
      pages.value = clonePages(nextPages)
      savedOnce.value = false
    }
  },
  { immediate: true },
)

const dirty = computed(() =>
  Boolean(outline.value) && JSON.stringify(pages.value) !== JSON.stringify(outline.value?.pages ?? []),
)
const incomplete = computed(() => pages.value.some(pageIncomplete))
const draftingPoint = computed(() =>
  pages.value.some((page) => page.key_points.some((point) => point.trim().length === 0)),
)
const persisting = computed(() => updateOutline.isPending.value || updateProject.isPending.value)
const countValid = computed(() => pages.value.length === props.project.page_count)
const autosaveLabel = computed(() => {
  if (persisting.value) return '保存中…'
  if (dirty.value && draftingPoint.value) return '编辑中…'
  if (dirty.value) return '待保存'
  return savedOnce.value ? '已保存' : ''
})
const actionError = computed(() =>
  launch.error.value ?? updateOutline.error.value ?? updateProject.error.value ?? generate.error.value,
)

async function persist(nextPages: OutlinePage[]) {
  const current = outline.value
  if (!current || !dirty.value || incomplete.value || draftingPoint.value || launch.isPending.value) return
  try {
    if (nextPages.length !== props.project.page_count) {
      await updateProject.mutateAsync({ page_count: nextPages.length })
    }
    await updateOutline.mutateAsync({ revision: current.revision, pages: normalizePages(nextPages) })
    updateOutline.reset()
    updateProject.reset()
    launch.reset()
    savedOnce.value = true
  } catch {
    // 错误统一在页面顶部展示，保留本地内容方便重试。
  }
}

watch(
  () => [dirty.value, incomplete.value, draftingPoint.value, persisting.value, launch.isPending.value, JSON.stringify(pages.value), outline.value?.revision] as const,
  () => {
    if (saveTimer.value != null) window.clearTimeout(saveTimer.value)
    if (!dirty.value || incomplete.value || draftingPoint.value || persisting.value || launch.isPending.value) return
    saveTimer.value = window.setTimeout(() => {
      saveTimer.value = null
      void persist(clonePages(pages.value))
    }, 900)
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  if (saveTimer.value != null) window.clearTimeout(saveTimer.value)
})

const drag = useDragSort((from, to) => {
  pages.value = moveItem(pages.value, from, to)
})

function changePage(index: number, next: OutlinePage) {
  pages.value = pages.value.map((page, pageIndex) => pageIndex === index ? next : page)
}

function changePoint(index: number, pointIndex: number, value: string) {
  const page = pages.value[index]
  if (!page) return
  const keyPoints = [...page.key_points]
  keyPoints[pointIndex] = value
  changePage(index, { ...page, key_points: keyPoints })
}

function addPage() {
  pages.value = [...pages.value, blankPage(pages.value.length + 1)]
}

function removePage(index: number) {
  if (pages.value.length <= PAGE_COUNT_RANGE.min) return
  pages.value = pages.value.filter((_page, pageIndex) => pageIndex !== index)
}

async function startGeneration() {
  if (!outline.value || incomplete.value || draftingPoint.value || launch.isPending.value) return
  if (!countValid.value) {
    await updateProject.mutateAsync({ page_count: pages.value.length })
  }
  launch.mutate({
    revision: outline.value.revision,
    ...(dirty.value ? { pages: normalizePages(pages.value) } : {}),
    ...(themeId.value === props.project.theme_id ? {} : { themeId: themeId.value }),
  })
}

function regenerate() {
  launch.reset()
  updateOutline.reset()
  updateProject.reset()
  generate.reset()
  generate.mutate()
}

function normalizePages(value: OutlinePage[]): OutlinePage[] {
  return value.map((page) => ({
    ...page,
    title: page.title.trim(),
    objective: page.objective.trim(),
    key_points: page.key_points.map((point) => point.trim()).filter(Boolean),
  }))
}

function blankPage(index: number): OutlinePage {
  return {
    id: crypto.randomUUID(),
    title: `第 ${index} 页`,
    objective: '这一页要说明的结论',
    key_points: ['要点一', '要点二'],
    source_refs: [],
    layout_id: 'bullets',
    page_role: 'content',
  }
}

function pageIncomplete(page: OutlinePage): boolean {
  const points = page.key_points.filter((point) => point.trim().length > 0)
  return page.title.trim().length === 0 || page.objective.trim().length === 0 || points.length < MIN_KEY_POINTS
}
</script>

<template>
  <div v-if="outlineQuery.isPending.value" class="flex min-h-screen flex-col">
    <WorkbenchHeader :title="props.project.title" />
    <div class="bg-aurora flex flex-1 items-start justify-center px-6 py-24">
      <div class="max-w-lg rounded-3xl border border-line bg-surface px-8 py-10 text-center shadow-card">
        <Loader2 class="mx-auto size-5 animate-spin text-ink-muted" />
        <p class="mt-4 text-sm text-ink-muted">正在读取大纲…</p>
      </div>
    </div>
  </div>

  <div v-else-if="outline?.status === 'generating'" class="flex min-h-screen flex-col">
    <WorkbenchHeader :title="props.project.title" />
    <div class="bg-aurora flex flex-1 items-start justify-center px-6 py-24">
      <div class="max-w-lg rounded-3xl border border-line bg-surface px-8 py-10 text-center shadow-card">
        <p class="text-sm font-medium">{{ progress.event.value?.message ?? '正在规划每一页…' }}</p>
        <div class="mt-4 h-1.5 overflow-hidden rounded-full bg-line">
          <div class="h-full rounded-full bg-accent transition-[width] duration-500" :style="{ width: `${progress.event.value?.progress ?? 8}%` }" />
        </div>
        <p class="mt-3 text-xs text-ink-muted">{{ progress.connectionError.value ? '进度连接中断，正在重连…' : '大纲只规划目标与要点，不生成正文' }}</p>
      </div>
    </div>
  </div>

  <div v-else-if="!outline || outline.status === 'failed'" class="flex min-h-screen flex-col">
    <WorkbenchHeader :title="props.project.title" />
    <div class="bg-aurora flex flex-1 items-start justify-center px-6 py-24">
      <div class="max-w-lg rounded-3xl border border-line bg-surface px-8 py-10 text-center shadow-card">
        <p class="text-sm text-ink-soft">{{ outline?.error ?? (outline ? '大纲生成失败。' : '还没有大纲。') }}</p>
        <Button class="mt-5" :disabled="generate.isPending.value" @click="regenerate">
          <RefreshCw class="size-4" :class="generate.isPending.value && 'animate-spin'" />
          {{ generate.isPending.value ? '正在提交…' : '重新生成大纲' }}
        </Button>
        <p v-if="generate.isError.value" role="alert" class="mt-3 text-xs text-negative">{{ errorMessage(generate.error.value) }}</p>
      </div>
    </div>
  </div>

  <div v-else class="flex min-h-screen flex-col">
    <WorkbenchHeader :title="props.project.title">
      <template #meta>
        <span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums" :class="countValid ? 'bg-surface-soft text-ink-muted' : 'bg-warning/12 text-warning'">
          {{ pages.length }} / {{ props.project.page_count }} 页
        </span>
      </template>
      <span class="mr-1 text-xs text-ink-muted">{{ autosaveLabel }}</span>
      <Button variant="ghost" size="sm" :disabled="generate.isPending.value || launch.isPending.value" @click="regenerate">
        <RefreshCw class="size-3.5" :class="generate.isPending.value && 'animate-spin'" />
        重新生成
      </Button>
      <Button size="sm" :disabled="incomplete || draftingPoint || launch.isPending.value || updateProject.isPending.value" @click="startGeneration">
        <Loader2 v-if="launch.isPending.value" class="size-4 animate-spin" />
        <Sparkles v-else class="size-4" />
        {{ launch.isPending.value ? '启动中…' : '生成 PPT' }}
      </Button>
    </WorkbenchHeader>

    <div class="bg-aurora flex-1">
      <div class="mx-auto grid max-w-6xl gap-8 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div>
          <div class="mb-5">
            <h2 class="text-xl font-semibold tracking-tight">确认大纲</h2>
            <p class="mt-1.5 text-sm text-ink-muted">改标题、改要点、增删页、拖拽排序，改完自动保存。确认后开始生成 16:9 页面。</p>
          </div>

          <p v-if="actionError" role="alert" class="mb-4 rounded-xl bg-negative/8 px-4 py-3 text-sm text-negative">{{ errorMessage(actionError) }}</p>

          <ol class="flex flex-col gap-3">
            <li
              v-for="(page, index) in pages"
              :key="page.id"
              v-bind="drag.itemProps(index)"
              class="group relative rounded-2xl border bg-surface px-4 py-4 transition-all"
              :class="cn('group relative rounded-2xl border bg-surface px-4 py-4 transition-all', drag.overIndex.value === index ? 'border-accent' : 'border-line hover:shadow-card', drag.draggingIndex.value === index && 'opacity-50')"
            >
              <div class="flex items-start gap-3">
                <span class="mt-0.5 flex items-center gap-1 text-ink-muted">
                  <GripVertical class="size-4 cursor-grab opacity-0 transition-opacity group-hover:opacity-100" />
                  <span class="w-5 text-[13px] font-semibold tabular-nums">{{ index + 1 }}</span>
                </span>

                <div class="min-w-0 flex-1">
                  <input :aria-label="`第 ${index + 1} 页标题`" :value="page.title" maxlength="100" class="w-full rounded-lg bg-transparent px-1.5 py-1 text-[15px] font-semibold tracking-tight transition-colors hover:bg-surface-soft focus:bg-surface-soft focus:outline-none" @input="changePage(index, { ...page, title: ($event.target as HTMLInputElement).value })" />
                  <textarea :aria-label="`第 ${index + 1} 页目标`" :value="page.objective" rows="2" maxlength="300" placeholder="这一页要让人明白什么" class="mt-1 w-full resize-none rounded-lg bg-transparent px-1.5 py-1 text-[13px] leading-relaxed text-ink-muted transition-colors hover:bg-surface-soft focus:bg-surface-soft focus:text-ink-soft focus:outline-none" @input="changePage(index, { ...page, objective: ($event.target as HTMLTextAreaElement).value })" />

                  <ul class="mt-1.5 flex flex-col gap-0.5">
                    <li v-for="(point, pointIndex) in page.key_points" :key="pointIndex" class="flex items-center gap-2">
                      <span class="size-1.5 shrink-0 rounded-full bg-accent/70" />
                      <input :aria-label="`第 ${index + 1} 页要点 ${pointIndex + 1}`" :value="point" maxlength="200" class="min-w-0 flex-1 rounded-lg bg-transparent px-1.5 py-1 text-[13px] text-ink-soft transition-colors hover:bg-surface-soft focus:bg-surface-soft focus:outline-none" @input="changePoint(index, pointIndex, ($event.target as HTMLInputElement).value)" />
                      <button v-if="page.key_points.length > MIN_KEY_POINTS" type="button" :aria-label="`删除第 ${index + 1} 页要点 ${pointIndex + 1}`" class="grid size-5 shrink-0 place-items-center rounded-md text-ink-muted/70 transition-all hover:bg-surface-soft hover:text-negative" @click="changePage(index, { ...page, key_points: page.key_points.filter((_point, i) => i !== pointIndex) })">
                        <X class="size-3" />
                      </button>
                    </li>
                  </ul>

                  <button v-if="page.key_points.length < MAX_KEY_POINTS" type="button" class="mt-1 ml-3.5 text-xs text-ink-muted transition-colors hover:text-accent" @click="changePage(index, { ...page, key_points: [...page.key_points, ''] })">+ 要点</button>
                </div>

                <button v-if="pages.length > PAGE_COUNT_RANGE.min" type="button" :aria-label="`删除第 ${index + 1} 页`" class="grid size-7 shrink-0 place-items-center rounded-lg text-ink-muted/70 transition-all hover:bg-negative/8 hover:text-negative" @click="removePage(index)">
                  <Trash2 class="size-3.5" />
                </button>
              </div>
            </li>
          </ol>

          <button v-if="pages.length < PAGE_COUNT_RANGE.max" type="button" class="mt-3 flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-line-strong py-3.5 text-[13px] text-ink-muted transition-colors hover:border-accent hover:text-accent" @click="addPage">
            <Plus class="size-4" />添加一页
          </button>
          <p v-if="!countValid" class="mt-3 text-center text-xs text-ink-muted">页数已改为 {{ pages.length }}，保存时会同步目标页数。</p>
          <p v-if="pages.length === PAGE_COUNT_RANGE.min" class="mt-3 text-center text-xs text-ink-muted">最少 {{ PAGE_COUNT_RANGE.min }} 页。</p>
          <p v-if="incomplete" class="mt-3 text-center text-xs text-warning">每页都需要标题、目标和至少两条要点。</p>
          <p v-if="draftingPoint" class="mt-3 text-center text-xs text-ink-muted">填写或删除空要点后自动保存。</p>
        </div>

        <aside class="flex flex-col gap-3 lg:sticky lg:top-20 lg:self-start">
          <div>
            <h3 class="text-sm font-semibold tracking-tight">外观</h3>
            <p class="mt-1 text-xs text-ink-muted">决定成品的字体、配色与气质；切换后点「生成 PPT」时生效</p>
          </div>
          <button v-for="theme in themeList" :key="theme.id" type="button" :aria-pressed="theme.id === themeId" class="group overflow-hidden rounded-2xl border bg-surface text-left transition-all" :class="theme.id === themeId ? 'border-accent shadow-card ring-1 ring-accent' : 'border-line hover:border-line-strong hover:shadow-card'" @click="themeId = theme.id">
            <ThemeCover :theme="theme" :title="props.project.title" />
            <div class="flex items-center gap-2 px-3 py-2.5"><span class="flex-1 truncate text-[13px] font-medium">{{ theme.name }}</span><Check v-if="theme.id === themeId" class="size-3.5 shrink-0 text-accent" /></div>
          </button>
          <p class="mt-1 text-xs leading-relaxed text-ink-muted">配图会自动匹配；素材不可用时会退化为纯文字版式，不会留下空位。</p>
        </aside>
      </div>
    </div>
  </div>
</template>
