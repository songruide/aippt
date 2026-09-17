<script setup lang="ts">
import { ref, watch } from 'vue'
import { MoreHorizontal, Trash2 } from 'lucide-vue-next'

defineProps<{ deleting: boolean }>()
const emit = defineEmits<{ delete: [] }>()

const open = ref(false)
const rootRef = ref<HTMLDivElement | null>(null)

watch(open, (isOpen, _prev, onCleanup) => {
  if (!isOpen) return
  const onPointer = (event: MouseEvent) => {
    if (!rootRef.value?.contains(event.target as Node)) open.value = false
  }
  document.addEventListener('mousedown', onPointer)
  onCleanup(() => document.removeEventListener('mousedown', onPointer))
})

function onDelete() {
  open.value = false
  emit('delete')
}
</script>

<template>
  <div ref="rootRef" class="absolute right-3 bottom-3">
    <button
      type="button"
      aria-label="更多操作"
      :aria-expanded="open"
      class="grid size-7 place-items-center rounded-lg bg-surface/90 text-ink-muted shadow-sm ring-1 ring-line transition-all hover:bg-surface-soft hover:text-ink"
      @click="open = !open"
    >
      <MoreHorizontal class="size-4" />
    </button>

    <div
      v-if="open"
      role="menu"
      class="absolute right-0 bottom-full z-20 mb-1 w-40 overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
    >
      <button
        type="button"
        role="menuitem"
        :disabled="deleting"
        class="flex w-full items-center gap-2 px-3.5 py-2.5 text-[13px] text-negative transition-colors hover:bg-negative/8 disabled:opacity-50"
        @click="onDelete"
      >
        <Trash2 class="size-3.5" />
        {{ deleting ? '删除中…' : '删除' }}
      </button>
    </div>
  </div>
</template>
