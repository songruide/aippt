<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import BrandMark from '@/components/BrandMark.vue'
import Button from '@/components/ui/Button.vue'
import TextField from '@/components/ui/TextField.vue'
import { login, register } from '@/features/auth/api'
import { useAuthStore } from '@/features/auth/store'
import { errorMessage } from '@/lib/errors'

type Mode = 'login' | 'register'

const COPY: Record<Mode, { title: string; submit: string; switchHint: string; switchTo: string }> =
  {
    login: {
      title: '欢迎回来',
      submit: '登录',
      switchHint: '还没有账号？',
      switchTo: '注册一个',
    },
    register: {
      title: '创建账号',
      submit: '注册并开始',
      switchHint: '已经有账号了？',
      switchTo: '去登录',
    },
  }

const mode = ref<Mode>('login')
const email = ref('')
const password = ref('')
const error = ref<string | null>(null)
const submitting = ref(false)

const auth = useAuthStore()
const router = useRouter()
const copy = computed(() => COPY[mode.value])

async function handleSubmit() {
  submitting.value = true
  error.value = null
  try {
    const session = await (mode.value === 'login' ? login : register)({
      email: email.value,
      password: password.value,
    })
    auth.applySession(session)
    const from = (history.state as { from?: string } | null)?.from ?? '/projects'
    await router.replace(from)
  } catch (cause) {
    error.value = errorMessage(cause instanceof Error ? cause : null, '网络异常，请稍后重试')
  } finally {
    submitting.value = false
  }
}

function switchMode() {
  mode.value = mode.value === 'login' ? 'register' : 'login'
  error.value = null
}
</script>

<template>
  <!-- 有本地 token 时先等 restore，避免已登录用户闪一下登录表单 -->
  <div
    v-if="auth.restoring"
    class="grid min-h-screen place-items-center text-sm text-ink-muted"
  >
    正在恢复登录状态…
  </div>
  <RouterLink v-else-if="auth.user" to="/projects" replace />

  <div v-else class="bg-aurora flex min-h-screen items-center justify-center px-6 py-16">
    <div class="w-full max-w-sm">
      <div class="mb-8 text-center">
        <BrandMark class="mx-auto mb-5 size-11 shadow-card" />
        <h1 class="text-2xl font-semibold tracking-tight">{{ copy.title }}</h1>
        <p class="mt-2 text-sm text-ink-muted">把一段想法变成可以直接编辑的 16:9 PPT</p>
      </div>

      <div class="rounded-3xl border border-line bg-surface p-6 shadow-card">
        <form class="flex flex-col gap-4" novalidate @submit.prevent="handleSubmit">
          <TextField
            v-model="email"
            label="邮箱"
            type="email"
            placeholder="you@example.com"
            autocomplete="email"
            required
          />
          <TextField
            v-model="password"
            label="密码"
            type="password"
            placeholder="至少 8 位"
            :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"
            minlength="8"
            required
          />

          <p
            v-if="error"
            role="alert"
            class="rounded-xl bg-negative/8 px-3.5 py-2.5 text-[13px] text-negative"
          >
            {{ error }}
          </p>

          <Button type="submit" size="lg" :disabled="submitting" class="mt-1 w-full">
            {{ submitting ? '处理中…' : copy.submit }}
          </Button>
        </form>
      </div>

      <p class="mt-6 text-center text-sm text-ink-muted">
        <!-- 提示语与按钮之间不能有换行：模板编译器会把换行保留成一个空格，
             多出的空格会让「还没有账号？注册一个」中间多一道缝 -->
        {{ copy.switchHint }}<button
          type="button"
          class="ml-1 font-medium text-accent underline-offset-4 transition-colors hover:underline"
          @click="switchMode"
        >{{ copy.switchTo }}</button>
      </p>
    </div>
  </div>
</template>
