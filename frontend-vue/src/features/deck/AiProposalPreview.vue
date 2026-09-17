<script setup lang="ts">
import { computed, useId } from 'vue'
import AiOperationCard from '@/features/deck/AiOperationCard.vue'
import type { ActiveSide } from '@/features/deck/aiEditShared'
import type { AiEditOperation, AiEditProposal } from '@/features/deck/types'
import Button from '@/components/ui/Button.vue'

const props = defineProps<{
  proposal: AiEditProposal
  activeSide: Record<string, ActiveSide>
  applyingBlockId: string | null
  applyError: string | null
  applyConflict: boolean
  canRegenerate: boolean
}>()

const emit = defineEmits<{
  applySide: [operation: AiEditOperation, side: ActiveSide]
  discard: []
  regenerate: []
}>()

const listId = useId()
const empty = computed(() => props.proposal.operations.length === 0)
</script>

<template>
  <section
    :aria-labelledby="listId"
    class="rounded-2xl rounded-tl-md border border-line bg-surface px-3 py-3"
  >
    <div class="mb-3 flex items-center justify-between gap-2">
      <h4 :id="listId" class="text-xs font-semibold text-ink-soft">变更预览</h4>
      <Button
        variant="ghost"
        size="sm"
        :disabled="props.applyingBlockId != null"
        @click="emit('discard')"
      >
        放弃
      </Button>
    </div>

    <p
      v-if="empty"
      class="rounded-xl border border-dashed border-line px-3 py-4 text-xs leading-relaxed text-ink-muted"
    >
      模型没有提出需要修改的内容
      {{ props.proposal.discarded.length > 0 ? '（部分块因已人工修改等原因被跳过）' : '。可调整指令后重试。' }}
    </p>
    <ul v-else class="flex flex-col gap-3">
      <AiOperationCard
        v-for="op in props.proposal.operations"
        :key="op.block_id"
        :operation="op"
        :side="props.activeSide[op.block_id] ?? null"
        :applying="props.applyingBlockId === op.block_id"
        :disabled="props.applyingBlockId != null"
        @select-side="(side) => emit('applySide', op, side)"
      />
    </ul>

    <div v-if="props.proposal.warnings.length > 0" class="mt-3 rounded-xl bg-warning/8 px-3 py-2.5">
      <p class="mb-1 text-xs font-medium text-warning">应用后可能出现</p>
      <ul class="flex flex-col gap-1">
        <li
          v-for="(issue, index) in props.proposal.warnings"
          :key="`${issue.slot_id ?? 'page'}-${index}`"
          class="text-xs text-warning"
        >
          {{ issue.message }}
        </li>
      </ul>
    </div>

    <div v-if="props.proposal.discarded.length > 0" class="mt-3 rounded-xl bg-surface-soft px-3 py-2.5">
      <p class="mb-1 text-xs font-medium text-ink-soft">未改动的内容</p>
      <ul class="flex flex-col gap-1.5">
        <li
          v-for="item in props.proposal.discarded"
          :key="item.block_id"
          class="text-xs leading-relaxed text-ink-muted"
        >
          {{ item.reason }}
        </li>
      </ul>
    </div>

    <p v-if="!empty" class="mt-3 text-xs text-ink-muted">
      点击「改动前 / 改动后」即可应用到画布，可来回切换
    </p>

    <div v-if="props.applyError" role="alert" class="mt-3 rounded-xl bg-negative/8 px-3 py-2.5">
      <p class="text-xs text-negative">{{ props.applyError }}</p>
      <button
        v-if="props.applyConflict"
        type="button"
        :disabled="!props.canRegenerate"
        class="mt-2 text-xs text-ink-muted underline-offset-2 hover:text-accent hover:underline disabled:opacity-40"
        @click="emit('regenerate')"
      >
        刷新提案
      </button>
    </div>
  </section>
</template>
