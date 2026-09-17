<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Loader2 } from 'lucide-vue-next'
import EditorWorkspace from '@/features/deck/EditorWorkspace.vue'
import { useOutline } from '@/features/outline/api'
import OutlineWorkspace from '@/features/outline/OutlineWorkspace.vue'
import { useProject } from '@/features/projects/api'

/**
 * 一个 PPT 只有两个阶段：确认大纲，或在画布上编辑。
 * 阶段以大纲状态为准而不是项目状态：页面开始生成后项目状态会变，
 * 但用户该待的地方始终是编辑工作台。
 */
const route = useRoute()
const projectId = computed(() => String(route.params.projectId ?? ''))
const project = useProject(projectId.value)
const outline = useOutline(projectId.value)
</script>

<template>
  <div v-if="project.isPending.value || outline.isPending.value" class="grid min-h-screen place-items-center">
    <Loader2 class="size-5 animate-spin text-ink-muted" />
  </div>

  <div v-else-if="project.isError.value || !project.data.value" class="grid min-h-screen place-items-center px-6">
    <div class="rounded-3xl border border-line bg-surface px-8 py-10 text-center shadow-card">
      <p class="text-sm text-ink-soft">这个 PPT 不存在，或你没有访问权限。</p>
      <RouterLink
        to="/projects"
        class="mt-4 inline-block text-sm font-medium text-accent underline-offset-2 hover:underline"
      >
        返回我的 PPT
      </RouterLink>
    </div>
  </div>

  <EditorWorkspace
    v-else-if="outline.data.value?.status === 'confirmed'"
    :project="project.data.value"
  />
  <OutlineWorkspace v-else :project="project.data.value" />
</template>
