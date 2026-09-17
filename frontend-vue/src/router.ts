import { createRouter, createWebHistory } from 'vue-router'
import RequireAuth from '@/routes/RequireAuth.vue'
import AuthPage from '@/pages/AuthPage.vue'
import CreatePage from '@/pages/CreatePage.vue'
import ProjectDetailPage from '@/pages/ProjectDetailPage.vue'
import ProjectsPage from '@/pages/ProjectsPage.vue'
import AppShell from '@/components/AppShell.vue'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', component: AuthPage },
    {
      path: '/',
      component: RequireAuth,
      children: [
        {
          // 工作区外壳：仅用于列表与创作页；编辑工作台自带全屏 chrome，不套这层
          path: '',
          component: AppShell,
          children: [
            { path: 'projects', component: ProjectsPage },
            { path: 'create', component: CreatePage },
          ],
        },
        { path: 'projects/:projectId', component: ProjectDetailPage },
      ],
    },
    { path: '/:pathMatch(.*)*', redirect: '/projects' },
  ],
})
