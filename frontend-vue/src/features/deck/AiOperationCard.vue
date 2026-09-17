<script setup lang="ts">
import { computed } from 'vue'
import AiPatchSide from '@/features/deck/AiPatchSide.vue'
import { OP_LABEL, TYPE_LABEL, asSnapshot } from '@/features/deck/aiEditShared'
import type { ActiveSide } from '@/features/deck/aiEditShared'
import type { AiEditOperation } from '@/features/deck/types'

const props = withDefaults(
  defineProps<{
    operation: AiEditOperation
    side: ActiveSide | null
    applying: boolean
    disabled?: boolean
  }>(),
  { disabled: false },
)

const emit = defineEmits<{ selectSide: [side: ActiveSide] }>()

const typeLabel = computed(() => TYPE_LABEL[props.operation.type] ?? props.operation.type)
const opLabel = computed(
  () => OP_LABEL[props.operation.op ?? 'replace'] ?? props.operation.op,
)
const beforePatch = computed(() => asSnapshot(props.operation.before))
const afterPatch = computed(() => asSnapshot(props.operation.after))
</script>

<template>
  <li class="overflow-hidden rounded-xl border border-line">
    <div class="flex items-center gap-3 border-b border-line bg-surface-soft px-3 py-2">
      <div class="min-w-0 flex-1">
        <span class="text-[10px] tracking-[0.16em] text-accent uppercase">{{ typeLabel }}</span>
        <span class="ml-2 text-[11px] text-ink-soft">{{ opLabel }}</span>
        <span class="ml-2 text-[11px] text-ink-soft">{{ props.operation.slot_id }}</span>
      </div>
      <span v-if="props.applying" class="text-[11px] text-ink-muted">应用中…</span>
    </div>
    <div class="grid gap-0 sm:grid-cols-2">
      <AiPatchSide
        label="改动前"
        tone="before"
        :patch="beforePatch"
        :type="props.operation.type"
        :empty-hint="props.operation.op === 'add' ? '（将新增）' : '（空）'"
        :active="props.side === 'before'"
        :disabled="props.disabled"
        @select="emit('selectSide', 'before')"
      />
      <AiPatchSide
        label="改动后"
        tone="after"
        :patch="afterPatch"
        :type="props.operation.type"
        :empty-hint="props.operation.op === 'delete' ? '（将删除）' : '（空）'"
        :active="props.side === 'after'"
        :disabled="props.disabled"
        @select="emit('selectSide', 'after')"
      />
    </div>
  </li>
</template>
