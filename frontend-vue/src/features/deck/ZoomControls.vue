<script setup lang="ts">
import { Minus, Plus } from 'lucide-vue-next'

defineProps<{
  zoom: number
  canZoomIn: boolean
  canZoomOut: boolean
}>()

const emit = defineEmits<{ zoom: [delta: 1 | -1] }>()
</script>

<template>
  <div class="flex items-center gap-1">
    <button type="button" aria-label="缩小" :disabled="!canZoomOut" class="grid size-7 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink disabled:opacity-30" @click="emit('zoom', -1)"><Minus class="size-3.5" /></button>
    <span class="w-10 text-center text-xs text-ink-muted tabular-nums">{{ Math.round(zoom * 100) }}%</span>
    <button type="button" aria-label="放大" :disabled="!canZoomIn" class="grid size-7 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink disabled:opacity-30" @click="emit('zoom', 1)"><Plus class="size-3.5" /></button>
  </div>
</template>
