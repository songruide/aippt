import { defineStore } from 'pinia'
import { fetchCurrentUser, type TokenResponse, type UserPublic } from '@/features/auth/api'
import { tokenStore } from '@/features/auth/token'

interface AuthState {
  user: UserPublic | null
  /** 首屏用本地 token 换取用户信息期间为 true，用于避免受保护路由误判为未登录 */
  restoring: boolean
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    restoring: tokenStore.get() !== null,
  }),
  actions: {
    applySession(session: TokenResponse) {
      tokenStore.set(session.access_token)
      this.user = session.user
      this.restoring = false
    },

    async restore() {
      if (tokenStore.get() === null) {
        this.user = null
        this.restoring = false
        return
      }
      try {
        this.user = await fetchCurrentUser()
        this.restoring = false
      } catch {
        // token 已失效，请求层会清理它，这里只需回到未登录态
        this.user = null
        this.restoring = false
      }
    },

    logout() {
      tokenStore.clear()
      this.user = null
      this.restoring = false
    },
  },
})
