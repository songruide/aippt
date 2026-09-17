<script setup lang="ts">
import { RefreshCw } from 'lucide-vue-next'

withDefaults(defineProps<{ disabled?: boolean }>(), { disabled: false })

const emit = defineEmits<{ open: [] }>()
</script>

<template>
  <!-- 版式面板内的轻量入口：打开 dock -->
  <button
    type="button"
    :disabled="disabled"
    class="flex w-full items-center gap-2 rounded-xl border border-line px-3.5 py-3 text-left transition-colors hover:border-line-strong hover:bg-surface-soft disabled:opacity-50"
    @click="emit('open')"
  >
    <RefreshCw class="size-3.5 shrink-0 text-accent" />
    <span>
      <span class="block text-[13px] font-medium">换一种排布</span>
      <span class="mt-0.5 block text-xs leading-relaxed text-ink-muted">
        内容不变，挑选更合适的版面
      </span>
    </span>
  </button>
</template>
