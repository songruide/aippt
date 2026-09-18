import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    // 固定端口，避免端口漂移后代理与后端 CORS 配置对不上
    host: '127.0.0.1',
    port: 39174,
    strictPort: true,
    // 布局与主题定义位于仓库根的 shared/，在 frontend-vue 之外，需显式放行
    fs: { allow: ['..'] },
    // 走代理而非直连，前端代码里所有请求都用同源相对路径，避免 CORS 与环境变量分叉
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:39800',
        changeOrigin: true,
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
})
