<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, ClipboardType, FileUp, Loader2, Sparkles, Type, X } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'
import PillSelect from '@/components/ui/PillSelect.vue'
import { type DraftMode, useCreateDraft } from '@/features/projects/api'
import {
  DEFAULT_THEME_ID,
  PAGE_COUNT_OPTIONS,
  TONE_OPTIONS,
} from '@/features/projects/options'
import { ACCEPTED_UPLOAD, type Tone } from '@/features/projects/types'
import { errorMessage } from '@/lib/errors'

const MODES: Array<{
  mode: DraftMode
  label: string
  icon: typeof Type
  hint: string
}> = [
  { mode: 'topic', label: '从主题生成', icon: Sparkles, hint: '一句话说清要讲什么' },
  { mode: 'text', label: '粘贴文字', icon: ClipboardType, hint: '已有内容，自动提炼成要点' },
  { mode: 'document', label: '上传文档', icon: FileUp, hint: '支持 PDF、Word、Markdown、TXT' },
]

const PLACEHOLDER: Record<DraftMode, string> = {
  topic: '例如：2026 上半年增长复盘，讲清三条增长曲线与下半年打法',
  text: '把已有的文字粘进来，会自动提炼成每页要点',
  document: '',
}

const TITLE_MAX = 60

/** 标题由输入内容推出来，用户不必先给文件起名；生成大纲期间可再改 */
function deriveTitle(mode: DraftMode, content: string, files: File[]): string {
  if (mode === 'document') {
    const first = files[0]?.name ?? ''
    return first.replace(/\.[^.]+$/, '').slice(0, TITLE_MAX) || '未命名 PPT'
  }
  const line = content
    .split('\n')
    .map((item) => item.trim())
    .find((item) => item.length > 0)
  return (line ?? '').slice(0, TITLE_MAX) || '未命名 PPT'
}

const router = useRouter()
const mode = ref<DraftMode>('topic')
const content = ref('')
const files = ref<File[]>([])
const audience = ref('')
const tone = ref<NonNullable<Tone>>('professional')
const pageCount = ref(10)
const layoutMode = ref<'fixed' | 'flex'>('flex')
const contentDensity = ref<'concise' | 'medium' | 'detailed'>('medium')
const step = ref<string | null>(null)
const create = useCreateDraft()

const ready = computed(() =>
  mode.value === 'document' ? files.value.length > 0 : content.value.trim().length > 0,
)
const busy = computed(() => create.isPending.value)

const submit = () => {
  if (!ready.value || busy.value) return
  create.mutate(
    {
      mode: mode.value,
      content: content.value.trim(),
      files: files.value,
      title: deriveTitle(mode.value, content.value, files.value),
      audience: audience.value.trim() || null,
      tone: tone.value,
      pageCount: pageCount.value,
      themeId: DEFAULT_THEME_ID,
      layoutMode: layoutMode.value,
      contentDensity: contentDensity.value,
      onStep: (next) => {
        step.value = next
      },
    },
    {
      onSuccess: (project) => router.push(`/projects/${project.id}`),
      onSettled: () => {
        step.value = null
      },
    },
  )
}

const onContentKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) submit()
}

// ---- 文件拖放 ----
const inputRef = ref<HTMLInputElement | null>(null)
const dragging = ref(false)

function appendFiles(incoming: FileList | null) {
  if (!incoming?.length) return
  const next = [...files.value]
  for (const file of Array.from(incoming)) {
    if (!next.some((item) => item.name === file.name && item.size === file.size)) {
      next.push(file)
    }
  }
  files.value = next
}

const onDrop = (event: DragEvent) => {
  event.preventDefault()
  dragging.value = false
  if (!busy.value) appendFiles(event.dataTransfer?.files ?? null)
}

const onDragOver = (event: DragEvent) => {
  event.preventDefault()
  dragging.value = true
}

const onPick = (event: Event) => {
  const target = event.target as HTMLInputElement
  appendFiles(target.files)
  target.value = ''
}
</script>

<template>
  <div class="bg-aurora min-h-[calc(100vh-3.5rem)] px-6 py-14">
    <div class="mx-auto max-w-3xl">
      <h1 class="text-center text-[clamp(1.75rem,4vw,2.5rem)] font-semibold tracking-tight">
        想做一份什么 PPT？
      </h1>
      <p class="mt-3 text-center text-sm text-ink-muted">
        先确认大纲，再生成 16:9 页面，导出为可编辑的 PPTX
      </p>

      <div class="mt-8 grid gap-2.5 sm:grid-cols-3">
        <button
          v-for="{ mode: value, label, icon: Icon, hint } in MODES"
          :key="value"
          type="button"
          :disabled="busy"
          class="flex flex-col items-start gap-1 rounded-2xl border px-4 py-3.5 text-left transition-all disabled:cursor-not-allowed"
          :class="
            value === mode
              ? 'border-accent bg-surface shadow-card'
              : 'border-line bg-surface/70 hover:border-line-strong hover:bg-surface'
          "
          @click="mode = value"
        >
          <span
            class="flex items-center gap-2 text-sm font-semibold"
            :class="value === mode ? 'text-accent' : 'text-ink'"
          >
            <component :is="Icon" class="size-4" />
            {{ label }}
          </span>
          <span class="text-xs leading-relaxed text-ink-muted">{{ hint }}</span>
        </button>
      </div>

      <div class="mt-4 rounded-3xl border border-line bg-surface p-4 shadow-card">
        <template v-if="mode === 'document'">
          <div class="flex flex-col gap-3">
            <div
              class="rounded-2xl border border-dashed px-6 py-10 text-center transition-colors"
              :class="dragging ? 'border-accent bg-accent-soft' : 'border-line-strong bg-surface-soft'"
              @dragover="onDragOver"
              @dragleave="dragging = false"
              @drop="onDrop"
            >
              <FileUp class="mx-auto mb-3 size-5 text-ink-muted" />
              <p class="text-sm text-ink-soft">
                拖到这里，或
                <button
                  type="button"
                  :disabled="busy"
                  class="mx-1 font-medium text-accent underline-offset-2 hover:underline disabled:opacity-50"
                  @click="inputRef?.click()"
                >
                  选择文件
                </button>
                （可多选）
              </p>
              <p class="mt-1.5 text-xs text-ink-muted">支持 PDF、Word、Markdown、TXT</p>
              <input
                ref="inputRef"
                type="file"
                multiple
                hidden
                :accept="ACCEPTED_UPLOAD"
                @change="onPick"
              />
            </div>

            <ul v-if="files.length > 0" class="flex flex-wrap gap-2">
              <li
                v-for="file in files"
                :key="`${file.name}-${file.size}`"
                class="flex items-center gap-2 rounded-full bg-surface-soft py-1.5 pr-2 pl-3.5 text-[13px] text-ink-soft"
              >
                <span class="max-w-56 truncate">{{ file.name }}</span>
                <button
                  type="button"
                  :disabled="busy"
                  :aria-label="`移除 ${file.name}`"
                  class="grid size-5 place-items-center rounded-full text-ink-muted transition-colors hover:bg-line hover:text-ink disabled:opacity-50"
                  @click="files = files.filter((item) => item !== file)"
                >
                  <X class="size-3" />
                </button>
              </li>
            </ul>
          </div>
        </template>
        <textarea
          v-else
          v-model="content"
          :disabled="busy"
          :rows="mode === 'text' ? 9 : 3"
          :maxlength="mode === 'text' ? 20000 : 500"
          :placeholder="PLACEHOLDER[mode]"
          class="w-full resize-none bg-transparent px-2 py-1.5 text-[15px] leading-relaxed text-ink placeholder:text-ink-muted/70 focus:outline-none"
          @keydown="onContentKeyDown"
        />

        <div class="mt-3 flex flex-wrap items-center gap-1.5 border-t border-line/80 pt-3">
          <PillSelect
            label="页数"
            :disabled="busy"
            :value="pageCount"
            :options="PAGE_COUNT_OPTIONS"
            @change="(next) => (pageCount = Number(next))"
          />
          <PillSelect
            label="排版"
            :disabled="busy"
            :value="layoutMode"
            :options="[
              { value: 'flex', label: '灵活排版', description: '块数量与排布随内容变化' },
              { value: 'fixed', label: '固定版式', description: '槽位稳定，适合可控版面' },
            ]"
            @change="(next) => (layoutMode = next as 'fixed' | 'flex')"
          />
          <PillSelect
            label="文字量"
            :disabled="busy"
            :value="contentDensity"
            :options="[
              { value: 'concise', label: '简洁', description: '少而精，一页抓一个重点' },
              { value: 'medium', label: '中等', description: '结论 + 适量支撑细节' },
              { value: 'detailed', label: '详细', description: '信息更满，可含表图' },
            ]"
            @change="(next) => (contentDensity = next as 'concise' | 'medium' | 'detailed')"
          />
          <PillSelect
            label="语气"
            :disabled="busy"
            :value="tone"
            :options="TONE_OPTIONS"
            @change="(next) => (tone = next as NonNullable<Tone>)"
          />
          <input
            v-model="audience"
            :disabled="busy"
            maxlength="80"
            placeholder="受众（可选）"
            aria-label="受众"
            class="h-9 w-40 rounded-full bg-surface-soft/90 px-3.5 text-[13px] text-ink-soft ring-1 ring-transparent transition-all placeholder:text-ink-muted hover:bg-white hover:ring-line hover:shadow-sm focus:bg-white focus:ring-line focus:outline-none disabled:opacity-45"
          />
          <span
            class="inline-flex h-9 items-center rounded-full bg-surface-soft/90 px-3 text-[13px] font-medium text-ink-muted"
          >
            16:9
          </span>

          <Button size="md" :disabled="!ready || busy" class="ml-auto" @click="submit">
            <Loader2 v-if="busy" class="size-4 animate-spin" />
            {{ busy ? '生成中…' : '生成大纲' }}
            <ArrowRight v-if="!busy" class="size-4" />
          </Button>
        </div>
      </div>

      <div class="mt-4 min-h-6 text-center">
        <p v-if="busy && step" aria-live="polite" class="text-[13px] text-ink-muted">
          {{ step }}
        </p>
        <p v-if="create.isError.value" role="alert" class="text-[13px] text-negative">
          {{ errorMessage(create.error.value, '创建失败，请检查输入后重试') }}
        </p>
      </div>
    </div>
  </div>
</template>
