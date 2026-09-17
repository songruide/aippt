<script setup lang="ts">
import { ChevronLeft } from 'lucide-vue-next'
import { RouterLink } from 'vue-router'

/** 大纲页与编辑工作台共用的顶栏：返回、标题、右侧操作 */
defineProps<{ title: string }>()
</script>

<template>
  <header
    class="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface/85 px-4 backdrop-blur-md"
  >
    <RouterLink
      to="/projects"
      aria-label="返回我的 PPT"
      class="grid size-8 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink"
    >
      <ChevronLeft class="size-4.5" />
    </RouterLink>

    <div class="flex min-w-0 items-center gap-3">
      <h1 class="truncate text-sm font-semibold tracking-tight">{{ title }}</h1>
      <slot name="meta" />
    </div>

    <div class="ml-auto flex items-center gap-2">
      <slot />
    </div>
  </header>
</template>
