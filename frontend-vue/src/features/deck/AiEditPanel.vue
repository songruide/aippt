<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { ApiError } from '@/api/client'
import Button from '@/components/ui/Button.vue'
import AiProposalPreview from '@/features/deck/AiProposalPreview.vue'
import { useApplyAiEdit, useProposeAiEdit } from '@/features/deck/api'
import { TYPE_LABEL, asSnapshot } from '@/features/deck/aiEditShared'
import type { ActiveSide } from '@/features/deck/aiEditShared'
import type { AiEditOperation, AiEditProposal, DeckSlide } from '@/features/deck/types'
import { errorMessage } from '@/lib/errors'
import { cn } from '@/lib/utils'

interface ChatTurn {
  id: string
  instruction: string
  proposal: AiEditProposal | null
  error: string | null
}

const props = defineProps<{
  projectId: string
  slide: DeckSlide
}>()

function newTurnId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

const titleId = useId()
const inputId = useId()
const listRef = ref<HTMLDivElement | null>(null)
const draft = ref('')
const turns = ref<ChatTurn[]>([])
const activeSide = ref<Record<string, ActiveSide>>({})
const workingRevision = ref(props.slide.revision)
const applyingBlockId = ref<string | null>(null)
const applyError = ref<string | null>(null)
const applyConflict = ref(false)

const propose = useProposeAiEdit(props.projectId, props.slide.id)
const apply = useApplyAiEdit(props.projectId, props.slide.id)

const generating = computed(() => props.slide.status === 'generating')
const busy = computed(() => propose.isPending.value || applyingBlockId.value != null)
const isFlex = computed(() => props.slide.layout_mode === 'flex')
const editableUnlocked = computed(() =>
  props.slide.blocks.some((block) => !block.locked && block.type in TYPE_LABEL),
)
const canPropose = computed(
  () => !generating.value && !busy.value && (editableUnlocked.value || isFlex.value),
)
const trimmedDraft = computed(() => draft.value.trim())
const canSend = computed(() => canPropose.value && trimmedDraft.value.length > 0)

const latestProposal = computed<AiEditProposal | null>(
  () => [...turns.value].reverse().find((turn) => turn.proposal != null)?.proposal ?? null,
)
const lastInstruction = computed<string | null>(
  () => [...turns.value].reverse().find((turn) => turn.instruction)?.instruction ?? null,
)

// 换页时清掉对话与提案，避免把旧页操作套到新页
watch(
  () => props.slide.id,
  () => {
    draft.value = ''
    turns.value = []
    activeSide.value = {}
    workingRevision.value = props.slide.revision
    applyingBlockId.value = null
    applyError.value = null
    applyConflict.value = false
  },
)

watch(
  [turns, () => propose.isPending.value],
  () => {
    const node = listRef.value
    if (!node) return
    node.scrollTop = node.scrollHeight
  },
  { flush: 'post' },
)

function clearProposalSegments() {
  turns.value = turns.value.map((turn) => ({ ...turn, proposal: null, error: null }))
  activeSide.value = {}
  applyError.value = null
  applyConflict.value = false
  apply.reset()
  propose.reset()
}

function sendInstruction(instruction: string) {
  if (!canPropose.value || !instruction) return
  const turnId = newTurnId()
  // 历史用发送前的对话，本轮新指令只作为当前指令提交
  const previousTurns = turns.value
  applyError.value = null
  applyConflict.value = false
  apply.reset()
  // 新一轮提案替换当前预览；用户气泡保留
  turns.value = [
    ...turns.value.map((turn) => ({ ...turn, proposal: null, error: null })),
    { id: turnId, instruction, proposal: null, error: null },
  ]
  activeSide.value = {}
  draft.value = ''
  propose.mutate(
    {
      revision: props.slide.revision,
      instruction: instruction.slice(0, 500),
      history: previousTurns
        .filter((turn) => turn.instruction.trim())
        .slice(-5)
        .map((turn) => ({
          instruction: turn.instruction.slice(0, 500),
          note: turn.proposal ? `改了 ${turn.proposal.operations.length} 处` : null,
        })),
    },
    {
      onSuccess: (data) => {
        workingRevision.value = data.revision
        turns.value = turns.value.map((turn) =>
          turn.id === turnId ? { ...turn, proposal: data, error: null } : turn,
        )
      },
      onError: (error) => {
        turns.value = turns.value.map((turn) =>
          turn.id === turnId ? { ...turn, proposal: null, error: errorMessage(error) } : turn,
        )
      },
    },
  )
}

function handleSend() {
  if (!canSend.value) return
  sendInstruction(trimmedDraft.value)
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    handleSend()
  }
}

function applySide(operation: AiEditOperation, side: ActiveSide) {
  if (applyingBlockId.value != null || generating.value) return
  if (activeSide.value[operation.block_id] === side) return

  const snapshot = asSnapshot(side === 'after' ? operation.after : operation.before)
  const op = operation.op ?? 'replace'
  applyingBlockId.value = operation.block_id
  applyError.value = null
  applyConflict.value = false
  apply.mutate(
    {
      revision: workingRevision.value,
      op,
      block_id: operation.block_id,
      after_block_id: operation.after_block_id ?? null,
      side,
      replace: op === 'replace' ? snapshot : null,
      block: op === 'replace' ? null : snapshot,
    },
    {
      onSuccess: (updated) => {
        workingRevision.value = updated.revision
        activeSide.value = { ...activeSide.value, [operation.block_id]: side }
        applyingBlockId.value = null
      },
      onError: (error) => {
        applyingBlockId.value = null
        applyError.value = errorMessage(error)
        applyConflict.value = error instanceof ApiError && error.status === 409
      },
    },
  )
}
</script>

<template>
  <section :aria-labelledby="titleId" class="flex h-full min-h-0 flex-col gap-3">
    <div>
      <h3 :id="titleId" class="text-sm font-semibold tracking-tight">AI 修改这一页</h3>
      <p class="mt-1 text-xs leading-relaxed text-ink-muted">
        用自然语言描述想改的内容；点选改动前/后即可应用到画布
      </p>
    </div>

    <p v-if="generating" class="text-xs text-ink-muted">页面生成中，暂不可发起 AI 修改</p>

    <p
      v-if="!generating && !editableUnlocked && !isFlex"
      class="rounded-xl border border-dashed border-line px-3 py-3 text-xs leading-relaxed text-ink-muted"
    >
      本页可编辑内容均已人工修改，AI 不会覆盖；如需改写请先手动调整或换一页。
    </p>

    <div ref="listRef" class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pr-0.5">
      <p
        v-if="turns.length === 0 && !propose.isPending.value"
        class="rounded-xl border border-dashed border-line px-3 py-4 text-xs leading-relaxed text-ink-muted"
      >
        例如：「标题改得更正式」「正文压缩到三条」「语气更适合管理层」
      </p>

      <div v-for="turn in turns" :key="turn.id" class="flex flex-col gap-2">
        <div class="flex justify-end">
          <p
            class="max-w-[92%] rounded-2xl rounded-br-md bg-accent-soft px-3 py-2 text-[13px] leading-relaxed text-ink"
          >
            {{ turn.instruction }}
          </p>
        </div>
        <p v-if="turn.error" role="alert" class="rounded-xl bg-negative/8 px-3 py-2 text-xs text-negative">
          {{ turn.error }}
        </p>
        <AiProposalPreview
          v-if="turn.proposal"
          :proposal="turn.proposal"
          :active-side="activeSide"
          :applying-block-id="applyingBlockId"
          :apply-error="applyError"
          :apply-conflict="applyConflict"
          :can-regenerate="canPropose && lastInstruction != null"
          @apply-side="applySide"
          @discard="clearProposalSegments"
          @regenerate="lastInstruction && sendInstruction(lastInstruction)"
        />
      </div>

      <p v-if="propose.isPending.value" class="text-xs text-ink-muted" aria-live="polite">
        正在根据指令生成提案…
      </p>
    </div>

    <div class="flex flex-col gap-2 border-t border-line pt-3">
      <label :for="inputId" class="sr-only">修改指令</label>
      <textarea
        :id="inputId"
        v-model="draft"
        :maxlength="500"
        :rows="2"
        :disabled="busy || generating || !(editableUnlocked || isFlex)"
        placeholder="输入修改指令，回车发送"
        :class="
          cn(
            'rounded-xl border border-line bg-surface px-3 py-2 text-[13px] leading-relaxed text-ink',
            'placeholder:text-ink-muted/70 focus:border-accent focus:outline-none',
            'resize-none disabled:opacity-40',
          )
        "
        @keydown="handleKeydown"
      />
      <div class="flex items-center justify-between gap-2">
        <p class="text-[11px] text-ink-muted">{{ draft.trim().length }}/500</p>
        <Button size="sm" :disabled="!canSend" @click="handleSend">
          {{ propose.isPending.value ? '发送中…' : '发送' }}
        </Button>
      </div>
    </div>

    <p v-if="latestProposal == null && applyError" role="alert" class="text-xs text-negative">
      {{ applyError }}
    </p>
  </section>
</template>
