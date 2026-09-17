<script setup lang="ts">
import { Loader2, Sparkles } from 'lucide-vue-next'
import Button from '@/components/ui/Button.vue'

defineProps<{ pending: boolean }>()
const emit = defineEmits<{ generate: [] }>()
</script>

<template>
  <main class="bg-stage grid flex-1 place-items-center p-8">
    <div class="max-w-sm rounded-3xl border border-line bg-surface px-8 py-10 text-center shadow-card">
      <Sparkles class="mx-auto mb-3 size-5 text-accent" />
      <p class="text-sm font-medium">大纲已确认，还没有生成页面</p>
      <p class="mt-1.5 text-[13px] leading-relaxed text-ink-muted">生成过程中就能编辑，完成一页显示一页。</p>
      <Button class="mt-5" :disabled="pending" @click="emit('generate')">
        <Loader2 v-if="pending" class="size-4 animate-spin" />
        <Sparkles v-else class="size-4" />
        生成 PPT
      </Button>
    </div>
  </main>
</template>
