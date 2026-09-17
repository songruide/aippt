# Vue 前端备份项目说明

本项目是 `D:\aippt\ai-ppt-generator` 的备份副本，**前端换成 Vue 3 实现**，后端与共享数据完全不动。

## 目录结构

```
D:\aippt_vue\
├── backend/            FastAPI 后端（原样复制，未改一行）
├── java_backend/       Spring Boot 参考实现（原样复制）
├── shared/             前后端物理共享的布局/主题/ fixtures（原样复制）
├── frontend-vue/       ★ Vue 3 + TS + Vite 前端（本项目核心产出）
├── docker-compose*.yml / nginx.conf / Makefile
└── VUE_MIGRATION.md    本文件
```

> 迁移对照用的原 React 19 前端已移出本仓库，备份在 `D:\aippt_react_frontend_backup\frontend`，
> 需要跑双版本对照时再从那里启动（端口 39173）。

## frontend-vue 技术栈映射

| 原 React | 现 Vue | 说明 |
| --- | --- | --- |
| React 19 + JSX | Vue 3.5 `<script setup lang="ts">` | SFC，无 `<style>` 块，样式全部走全局 Tailwind |
| react-router 8 | vue-router 5 | 路由表 1:1；登录守卫改为 RequireAuth.vue 内 watchEffect |
| @tanstack/react-query | **@tanstack/vue-query** | 同一套 API：queryKey、setQueryData、invalidateQueries 全部原样平移 |
| zustand（仅 auth） | pinia | action/state 一一对应 |
| lucide-react | lucide-vue-next | 图标同名 |
| recharts | **ECharts 6** | ChartView / ChartDataEditor 重写，保留「pt 坐标系 + scale 缩放」方案 |
| @vitejs/plugin-react | @vitejs/plugin-vue | Vite 8；代理、端口、fs.allow 配置照抄 |

**原样复用的纯逻辑（与 React 版逐字节一致）**：`api/client.ts`（fetch 封装 + 401 清理）、
`api/schema.d.ts`（OpenAPI 类型）、`lib/`（SSE 流解析、下载、错误）、`render/` 纯模块
（flexLayout solver、blockStyle、design、ambient、flexSkin、themeOverrides）、
`features/deck/flex/`（拖拽/缩放几何算法）、`blockSnapshot`、`mergeBlockCommit`、
`flexNormalize`、`flexTree`、`exportErrors` 等。

**重写为 Vue 的关键状态层**（语义逐行对照 React 版）：
`useSlideSaveQueue`（按页串行保存 + revision 乐观锁 + 撤销/重做）、`useFlexPointerSession`
（指针拖拽会话）、`useEventStream`（SSE 自动重连）、`useSlideVisibility`、`useDragSort`。

## 运行

```bash
# 1. 基础设施
docker compose up -d          # postgres + redis

# 2. 后端（与 React 版共用，端口 39800）
cd backend && uv run uvicorn app.main:app --port 39800   # 或按原项目说明启动

# 3. Vue 前端（端口 39174，/api 代理到 39800）
cd frontend-vue && npm install && npm run dev

# 双版本对照：React 版已移出仓库，需从 D:\aippt_react_frontend_backup\frontend 启动（39173）
```

## 构建与验证

```bash
cd frontend-vue
npm run build        # vue-tsc 类型检查 + vite build
npm run test         # vitest 单测（SSE 解析 / 快照 / 合并提交）
# 纯逻辑 parity 校验（golden fixtures，与后端同源验证）
npx tsx --tsconfig tsconfig.app.json scripts/flex-parity.mts
npx tsx --tsconfig tsconfig.app.json scripts/flex-normalize-parity.mts
npx tsx --tsconfig tsconfig.app.json scripts/ambient-parity.mts
npx tsx --tsconfig tsconfig.app.json scripts/bullets-edit-check.mts
npx tsx --tsconfig tsconfig.app.json scripts/flex-edit-check.mts
```

移植规范与组件契约见 `frontend-vue/PORTING.md`。

## 功能验证清单（对照 React 版逐项过）

**主链路**
- [ ] 注册 / 登录 / 退出；刷新页面恢复登录态（不闪登录页）
- [ ] 新建 PPT：主题输入 / 长文本 / 上传文档三种入口；页数、排版、文字量、语气、受众、主题选择
- [ ] 大纲生成 SSE 进度；断线重连；失败重试
- [ ] 大纲编辑：改标题/要点、增删页、拖拽排序、确认大纲 → 并发生成页面
- [ ] 生成中：已完成页即时预览、单页重试、软取消剩余任务

**在线编辑（风险最高的四项）**
- [ ] contenteditable 打字：光标稳定不跳、停 800ms 自动保存、失焦立即保存
- [ ] 列表编辑：Enter 增项（光标跳新项开头）、空项 Backspace 删项（光标落上一项末尾）
- [ ] 灵活排版：拖动块重排 / 拖分隔线改比例 / 边缘与四角手柄缩放 / Alt+拖动像素级微调 / 方向键微调（1pt，Shift 10pt）
- [ ] 撤销/重做（⌘Z/⌘⇧Z 页内草稿自愈 + 页面级历史栈）；409 冲突提示「页面已被其他操作更新」

**面板与导出**
- [ ] AI 修改面板：指令 → 提案 → 应用；人工修改块有锁定标记
- [ ] 主题 / 版式 / 重排 / 图片面板；字号与主题切换 Web 预览同源生效
- [ ] 质量检查报告随编辑刷新；导出前 error/warning 分级门禁；PPTX 下载
- [ ] 演示模式、缩放控件、页码导航

**双版本对照（需先启动备份目录里的 React 版）**
- [ ] 同一项目分别用 39173（React）与 39174（Vue）打开，flex 布局页与主题渲染截图比对
