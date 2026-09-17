<script setup lang="ts">
import { watchEffect } from 'vue'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/features/auth/store'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

// 刷新页面时本地有 token 但用户信息还没换回来，
// 此时不能判定为未登录，否则会闪一下登录页再跳回来。
watchEffect(() => {
  if (!auth.restoring && !auth.user) {
    void router.replace({ path: '/login', state: { from: route.fullPath } })
  }
})
</script>

<template>
  <div
    v-if="auth.restoring"
    class="flex min-h-screen items-center justify-center text-sm text-ink-muted"
  >
    正在恢复登录状态…
  </div>
  <RouterView v-else-if="auth.user" />
</template>
