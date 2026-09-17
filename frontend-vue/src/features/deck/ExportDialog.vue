<script setup lang="ts">
import { AlertTriangle, CheckCircle2, Download, Loader2, RotateCcw, XCircle } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import type { Component } from 'vue'
import Button from '@/components/ui/Button.vue'
import Dialog from '@/components/ui/Dialog.vue'
import { useDeckQuality, useExportDeck } from '@/features/deck/api'
import { classifyExportError, type ExportFailure } from '@/features/deck/exportErrors'
import type { Deck, ExportCheckReport, StructureIssue } from '@/features/deck/types'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'

/** 导出前的检查结论。拿不到报告与「报告说有错」是两回事，必须分开表达。 */
type CheckState =
  | { kind: 'unavailable'; message: string }
  | { kind: 'incomplete' }
  | { kind: 'blocked'; errorCount: number }
  | { kind: 'ready'; warningCount: number }

function resolveCheckState({
  report,
  error,
  incomplete,
  errorCount,
  warningCount,
}: {
  report: ExportCheckReport | undefined
  error: Error | null
  incomplete: boolean
  errorCount: number
  warningCount: number
}): CheckState {
  if (incomplete) return { kind: 'incomplete' }
  if (!report) {
    return {
      kind: 'unavailable',
      message: errorMessage(error, '检查没能完成，可能是服务未启动或网络中断。'),
    }
  }
  if (!report.export_allowed || errorCount > 0) return { kind: 'blocked', errorCount }
  return { kind: 'ready', warningCount }
}

function verdictText(state: CheckState): { title: string; summary: string } {
  switch (state.kind) {
    case 'unavailable':
      return { title: '检查没有完成', summary: `${state.message}重试检查后才能判断能否导出。` }
    case 'incomplete':
      return { title: '暂时不能导出', summary: '仍有页面没有生成成功，先重试失败页再导出。' }
    case 'blocked':
      return {
        title: '暂时不能导出',
        summary:
          state.errorCount > 0
            ? `有 ${state.errorCount} 处必须修复，修好后即可导出。`
            : '检查未通过但没有给出具体问题，请重试检查。',
      }
    case 'ready':
      return {
        title: '可以导出',
        summary:
          state.warningCount > 0
            ? `可以导出，有 ${state.warningCount} 处建议关注。`
            : '检查通过，可以导出。',
      }
  }
}

/**
 * 导出面板：先给结论，再给可点击定位的问题清单。
 * 错误必须修复，告警不阻断——两者在视觉上必须能一眼分开。
 */
const props = defineProps<{
  projectId: string
  deck: Deck
}>()

const emit = defineEmits<{ close: []; locate: [slideId: string] }>()

const settled = computed(() => props.deck.status === 'ready' || props.deck.status === 'partial')
const quality = useDeckQuality(props.projectId, settled)
const exporter = useExportDeck(props.projectId, `${props.deck.title}.pptx`)
const done = ref(false)

const report = computed(() => quality.data.value)
const issues = computed(() => report.value?.issues ?? [])
const errors = computed(() => issues.value.filter((issue) => issue.severity === 'error'))
const warnings = computed(() => issues.value.filter((issue) => issue.severity === 'warning'))
const incomplete = computed(() => props.deck.slides.some((slide) => slide.status !== 'ready'))
const state = computed(() =>
  resolveCheckState({
    report: report.value,
    error: quality.error.value,
    incomplete: incomplete.value,
    errorCount: errors.value.length,
    warningCount: warnings.value.length,
  }),
)
const allowed = computed(() => state.value.kind === 'ready')
const failure = computed<ExportFailure | null>(() =>
  exporter.isError.value ? classifyExportError(exporter.error.value) : null,
)

const verdict = computed(() => {
  const current = state.value
  const ok = current.kind === 'ready'
  const icon: Component = ok
    ? CheckCircle2
    : current.kind === 'unavailable'
      ? AlertTriangle
      : XCircle
  const tone = ok ? 'text-positive' : current.kind === 'unavailable' ? 'text-warning' : 'text-negative'
  const background = ok
    ? 'bg-positive/8'
    : current.kind === 'unavailable'
      ? 'bg-warning/8'
      : 'bg-negative/8'
  const retryable =
    current.kind === 'unavailable' || (current.kind === 'blocked' && current.errorCount === 0)
  return { icon, tone, background, retryable, ...verdictText(current) }
})

const issueSections = computed(() => {
  const sections: Array<{ tone: 'error' | 'warning'; label: string; issues: StructureIssue[] }> = []
  if (errors.value.length > 0) {
    sections.push({ tone: 'error', label: '必须修复', issues: errors.value })
  }
  if (warnings.value.length > 0) {
    sections.push({ tone: 'warning', label: '建议关注，不阻断导出', issues: warnings.value })
  }
  return sections
})

function positionLabel(slideId: string): string {
  const slide = props.deck.slides.find((item) => item.id === slideId)
  return slide ? `第 ${slide.position} 页` : '整份'
}

const locate = (slideId: string) => {
  emit('locate', slideId)
  emit('close')
}

const runExport = () => {
  done.value = false
  exporter.mutate(undefined, { onSuccess: () => (done.value = true) })
}
</script>

<template>
  <Dialog
    title="导出 PPTX"
    description="导出前会检查结构与文字溢出，通过后生成原生可编辑的文件"
    @close="emit('close')"
  >
    <template #footer>
      <span
        v-if="done && !exporter.isPending.value"
        class="mr-auto flex items-center gap-1.5 text-[13px] text-positive"
      >
        <CheckCircle2 class="size-4" />
        已开始下载
      </span>
      <Button variant="ghost" @click="emit('close')">关闭</Button>
      <Button :disabled="!allowed || exporter.isPending.value" @click="runExport">
        <Loader2 v-if="exporter.isPending.value" class="size-4 animate-spin" />
        <Download v-else class="size-4" />
        {{ exporter.isPending.value ? '正在导出…' : done ? '再导出一次' : '导出 PPTX' }}
      </Button>
    </template>

    <p
      v-if="quality.isPending.value && quality.isFetching.value"
      class="py-6 text-center text-sm text-ink-muted"
      aria-live="polite"
    >
      正在检查…
    </p>

    <div v-else class="flex flex-col gap-4">
      <div
        :class="
          cn(
            'flex items-start gap-3 rounded-2xl px-4 py-3.5',
            verdict.background,
          )
        "
      >
        <component
          :is="verdict.icon"
          :class="cn('mt-0.5 size-4.5 shrink-0', verdict.tone)"
        />
        <div class="min-w-0 flex-1">
          <p :class="cn('text-sm font-semibold', verdict.tone)">{{ verdict.title }}</p>
          <p class="mt-0.5 text-[13px] text-ink-soft">{{ verdict.summary }}</p>
          <Button
            v-if="verdict.retryable"
            variant="ghost"
            size="sm"
            class="mt-2.5"
            :disabled="quality.isFetching.value"
            @click="void quality.refetch()"
          >
            <Loader2 v-if="quality.isFetching.value" class="size-3.5 animate-spin" />
            <RotateCcw v-else class="size-3.5" />
            重新检查
          </Button>
        </div>
      </div>

      <p
        v-if="report && !report.fonts_precise"
        class="rounded-xl bg-warning/8 px-4 py-3 text-[13px] leading-relaxed text-warning"
      >
        度量字体未就绪，文字溢出为估算值，并非精确结论。
      </p>

      <div v-if="failure" role="alert" class="rounded-xl bg-negative/8 px-4 py-3">
        <p class="text-[13px] font-medium text-negative">{{ failure.message }}</p>
        <p
          v-if="
            failure.kind === 'verify' || failure.kind === 'server' || failure.kind === 'incomplete'
          "
          class="mt-1 text-xs text-ink-soft"
        >
          {{
            failure.kind === 'verify'
              ? '文件没有生成，可编辑性检查未通过，可直接重试。'
              : failure.kind === 'server'
                ? '服务端出错，可直接重试。'
                : '先把未完成的页面补齐。'
          }}
        </p>
        <ul
          v-if="failure.kind === 'verify' && failure.issues.length > 0"
          class="mt-2 flex flex-col gap-1"
        >
          <li
            v-for="(issue, index) in failure.issues"
            :key="`${issue.check}-${index}`"
            class="text-xs text-negative"
          >
            {{ issue.slide_index != null ? `第 ${issue.slide_index} 页 · ` : '' }}{{ issue.message }}
          </li>
        </ul>
      </div>

      <section v-for="section in issueSections" :key="section.tone">
        <p
          :class="
            cn(
              'mb-2 flex items-center gap-1.5 text-xs font-semibold',
              section.tone === 'error' ? 'text-negative' : 'text-warning',
            )
          "
        >
          <XCircle v-if="section.tone === 'error'" class="size-3.5" />
          <AlertTriangle v-else class="size-3.5" />
          {{ section.label }}
        </p>
        <ul class="flex flex-col gap-1.5">
          <li
            v-for="(issue, index) in section.issues"
            :key="`${issue.slide_id}-${issue.slot_id ?? 'page'}-${index}`"
          >
            <button
              type="button"
              class="flex w-full items-start gap-3 rounded-xl border border-line px-3.5 py-2.5 text-left transition-colors hover:border-line-strong hover:bg-surface-soft"
              @click="locate(issue.slide_id)"
            >
              <span
                class="mt-0.5 shrink-0 rounded-md bg-surface-soft px-1.5 py-0.5 text-[11px] font-medium text-ink-muted tabular-nums"
              >
                {{ positionLabel(issue.slide_id) }}
              </span>
              <span class="min-w-0 flex-1 text-[13px] leading-relaxed text-ink-soft">
                {{ issue.message }}
              </span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  </Dialog>
</template>
