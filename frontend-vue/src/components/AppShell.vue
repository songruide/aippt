<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { LogOut, Plus } from 'lucide-vue-next'
import BrandMark from '@/components/BrandMark.vue'
import Button from '@/components/ui/Button.vue'
import { useAuthStore } from '@/features/auth/store'

/** 工作区外壳：仅用于列表与创作页；编辑工作台自带全屏 chrome，不套这层。 */
const router = useRouter()
const route = useRoute()
const onCreate = computed(() => route.path === '/create')

const auth = useAuthStore()
const menuOpen = ref(false)
const menuRootRef = ref<HTMLDivElement | null>(null)

watch(menuOpen, (isOpen, _prev, onCleanup) => {
  if (!isOpen) return
  const onPointer = (event: MouseEvent) => {
    if (!menuRootRef.value?.contains(event.target as Node)) menuOpen.value = false
  }
  document.addEventListener('mousedown', onPointer)
  onCleanup(() => document.removeEventListener('mousedown', onPointer))
})

const initial = computed(() => auth.user?.email?.[0]?.toUpperCase() ?? '?')
</script>

<template>
  <div class="flex min-h-screen flex-col">
    <header class="sticky top-0 z-30 border-b border-line bg-surface/80 backdrop-blur-md">
      <div class="mx-auto flex h-14 max-w-6xl items-center justify-between gap-4 px-6">
        <RouterLink to="/projects" class="flex items-center gap-2.5">
          <BrandMark class="size-7" />
          <span class="text-[15px] font-semibold tracking-tight">AI PPT</span>
        </RouterLink>

        <div class="flex items-center gap-2">
          <Button v-if="!onCreate" size="sm" @click="router.push('/create')">
            <Plus class="size-4" />
            新建 PPT
          </Button>

          <div ref="menuRootRef" class="relative">
            <button
              type="button"
              aria-haspopup="menu"
              :aria-expanded="menuOpen"
              aria-label="账号菜单"
              class="grid size-8 place-items-center rounded-full bg-surface-soft text-[13px] font-semibold text-ink-soft ring-1 ring-line transition-colors hover:ring-line-strong"
              @click="menuOpen = !menuOpen"
              @keydown.escape="menuOpen = false"
            >
              {{ initial }}
            </button>

            <div
              v-if="menuOpen"
              role="menu"
              class="absolute top-full right-0 z-40 mt-2 w-56 overflow-hidden rounded-2xl border border-line bg-surface shadow-pop"
            >
              <p class="truncate border-b border-line px-4 py-3 text-xs text-ink-muted">
                {{ auth.user?.email }}
              </p>
              <button
                type="button"
                role="menuitem"
                class="flex w-full items-center gap-2 px-4 py-3 text-sm text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink"
                @click="auth.logout()"
              >
                <LogOut class="size-4" />
                退出登录
              </button>
            </div>
          </div>
        </div>
      </div>
    </header>

    <main class="flex-1">
      <RouterView />
    </main>
  </div>
</template>
