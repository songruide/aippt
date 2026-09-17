<script setup lang="ts">
import { RouterLink, useRouter } from 'vue-router'
import { Plus, Sparkles } from 'lucide-vue-next'
import StatusPill from '@/components/StatusPill.vue'
import Button from '@/components/ui/Button.vue'
import CardMenu from '@/pages/CardMenu.vue'
import { useDeleteProject, useProjects } from '@/features/projects/api'
import { relativeTime } from '@/lib/datetime'
import { errorMessage } from '@/lib/errors'
import ThemeCover from '@/render/ThemeCover.vue'
import { resolveTheme, type ThemeOverrides } from '@/render/themeOverrides'

const router = useRouter()
const projects = useProjects()
const remove = useDeleteProject()
</script>

<template>
  <div class="mx-auto max-w-6xl px-6 py-10">
    <div class="mb-8">
      <h1 class="text-2xl font-semibold tracking-tight">我的 PPT</h1>
      <p class="mt-1.5 text-sm text-ink-muted">固定 16:9 画幅，导出为原生可编辑 PPTX</p>
    </div>

    <!-- 加载骨架 -->
    <div v-if="projects.isPending.value" class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      <div
        v-for="key in [0, 1, 2]"
        :key="key"
        class="overflow-hidden rounded-2xl border border-line bg-surface"
      >
        <div class="aspect-video animate-pulse bg-surface-soft" />
        <div class="flex flex-col gap-2.5 px-4 py-3.5">
          <div class="h-4 w-2/3 animate-pulse rounded bg-surface-soft" />
          <div class="h-3 w-1/3 animate-pulse rounded bg-surface-soft" />
        </div>
      </div>
    </div>

    <p
      v-if="projects.isError.value"
      role="alert"
      class="rounded-2xl bg-negative/8 px-5 py-4 text-sm text-negative"
    >
      {{ errorMessage(projects.error.value, 'PPT 列表加载失败，请稍后重试') }}
    </p>

    <!-- 空态 -->
    <div
      v-if="projects.data.value?.length === 0"
      class="rounded-3xl border border-dashed border-line-strong bg-aurora px-8 py-20 text-center"
    >
      <span
        class="mx-auto mb-5 grid size-12 place-items-center rounded-2xl bg-surface text-accent shadow-card"
      >
        <Sparkles class="size-5" />
      </span>
      <h2 class="text-xl font-semibold tracking-tight">还没有 PPT</h2>
      <p class="mx-auto mt-2 max-w-md text-sm leading-relaxed text-ink-muted">
        给一个主题，或者把已有的文字、文档交给它，先看大纲，再生成可编辑的 16:9 页面。
      </p>
      <Button size="lg" class="mt-7" @click="router.push('/create')">
        <Plus class="size-4" />
        新建 PPT
      </Button>
    </div>

    <ul
      v-if="projects.data.value && projects.data.value.length > 0"
      class="grid gap-5 sm:grid-cols-2 lg:grid-cols-3"
    >
      <li v-for="project in projects.data.value" :key="project.id" class="group relative">
        <RouterLink
          :to="`/projects/${project.id}`"
          class="block overflow-hidden rounded-2xl border border-line bg-surface transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card"
        >
          <div class="border-b border-line">
            <ThemeCover
              :theme="resolveTheme(project.theme_id, (project.theme_overrides ?? {}) as ThemeOverrides)"
              :title="project.title"
            />
          </div>
          <div class="flex flex-col gap-2.5 px-4 py-3.5">
            <p class="truncate pr-8 text-[15px] font-semibold tracking-tight">{{ project.title }}</p>
            <div class="flex items-center gap-2 text-xs text-ink-muted">
              <StatusPill :status="project.status" />
              <span>{{ project.page_count }} 页</span>
              <span aria-hidden>·</span>
              <span>{{ relativeTime(project.updated_at) }}</span>
            </div>
          </div>
        </RouterLink>

        <CardMenu
          :deleting="remove.isPending.value && remove.variables.value === project.id"
          @delete="remove.mutate(project.id)"
        />
      </li>
    </ul>

    <p v-if="remove.isError.value" role="alert" class="mt-5 text-sm text-negative">
      {{ errorMessage(remove.error.value, '删除失败，请稍后重试') }}
    </p>
  </div>
</template>
