# frontend-vue

演示文稿编辑器的前端：Vue 3 + TypeScript + Vite。通过 REST + SSE 与 `../backend` 通信，
布局、主题等定义来自仓库根的 `shared/`（由 Vite 的 `fs.allow` 显式放行）。

## 技术栈

| 用途 | 选型 |
| --- | --- |
| 框架 | Vue 3.5，`<script setup lang="ts">` 单文件组件，不写 `<style>` 块 |
| 构建 | Vite 8 + vue-tsc（类型检查） |
| 样式 | Tailwind CSS v4（全局样式，见 `src/index.css`） |
| 路由 | vue-router 5 |
| 服务端状态 | @tanstack/vue-query 5 |
| 客户端状态 | pinia（仅 auth） |
| 图表 | ECharts 6 |
| 图标 | lucide-vue-next |
| 测试 | vitest |
| Lint | oxlint |

## 目录结构

```
src/
├── main.ts / App.vue / router.ts
├── api/            fetch 封装（401 清理）、OpenAPI 生成的类型 schema.d.ts
├── pages/          列表页、创作页、项目详情、登录注册
├── routes/         路由守卫（RequireAuth）
├── features/
│   ├── auth/       pinia store、token 存取
│   ├── projects/   项目列表 / 创建 / 删除
│   ├── outline/    大纲生成与编辑（SSE 进度、确认后并发建页）
│   └── deck/       编辑器主体：保存队列、指针拖拽会话、各面板、导出
│       └── flex/   灵活排版的几何算法（纯函数）
├── render/         页面渲染：BlockView / SlideView / ChartView / EditableText 等
├── hooks/          useEventStream（SSE 自动重连）、useDragSort
└── lib/            SSE 流解析、下载、错误文案、响应式安全深拷贝
```

## 关键状态层

编辑器里最容易出问题的几处状态，各自封装在一个 composable 里：

- **`useSlideSaveQueue(projectId, slideId)`** —— 同一页的块保存必须串行（每次成功 revision +1，
  并发必然 409）。内容、样式、灵活布局结构共用一条队列，同时维护本页的撤销 / 重做栈。
  队列与撤销栈刻意用普通可变对象、不进响应式系统，变化通过 `historyTick` / `status` 反映到视图。
- **`useFlexPointerSession(...)`** —— 指针拖拽会话：块重排、分隔线比例、边缘与四角缩放。
  几何计算全在 `features/deck/flex/` 的纯函数里，便于单测与后端同源校验。
- **`useEventStream(...)`** —— 订阅服务端事件流，断线自动重连，收到终态事件后停止重连。
- **`useSlideVisibility(...)`** —— 缩略图列表的可见性追踪，只渲染进入视口的页面。
- **`useDragSort(...)`** —— 列表拖拽排序，模板里 `v-bind="itemProps(index)"`。

## 运行

```bash
# 基础设施（在仓库根执行）
docker compose up -d          # postgres + redis

# 后端（端口 39800）
cd ../backend && uv run uvicorn app.main:app --port 39800

# 前端（端口 39174，/api 代理到 127.0.0.1:39800）
npm install && npm run dev
```

前端代码里所有请求都走同源相对路径（`/api/...`），由 Vite 代理转发，避免 CORS 与环境变量分叉。

## 构建与验证

```bash
npm run build        # vue-tsc 类型检查 + vite build
npm run test         # vitest 单测（SSE 解析 / 块快照 / 合并提交）
npm run lint         # oxlint

# 纯逻辑 parity 校验：前端求解器与后端共享同一批 golden fixtures
npx tsx --tsconfig tsconfig.app.json scripts/flex-parity.mts
npx tsx --tsconfig tsconfig.app.json scripts/flex-normalize-parity.mts
npx tsx --tsconfig tsconfig.app.json scripts/ambient-parity.mts
npx tsx --tsconfig tsconfig.app.json scripts/bullets-edit-check.mts
npx tsx --tsconfig tsconfig.app.json scripts/flex-edit-check.mts
```

组件契约与写法规范见 [`CONVENTIONS.md`](./CONVENTIONS.md)。

## 功能验证清单

**主链路**
- [ ] 注册 / 登录 / 退出；刷新页面恢复登录态（不闪登录页）
- [ ] 新建 PPT：主题输入 / 长文本 / 上传文档三种入口；页数、排版、文字量、语气、受众、主题选择
- [ ] 大纲生成 SSE 进度；断线重连；失败重试
- [ ] 大纲编辑：改标题 / 要点、增删页、拖拽排序、确认大纲 → 并发生成页面
- [ ] 生成中：已完成页即时预览、单页重试、软取消剩余任务

**在线编辑（风险最高的四项）**
- [ ] contenteditable 打字：光标稳定不跳、停 800ms 自动保存、失焦立即保存
- [ ] 列表编辑：Enter 增项（光标跳新项开头）、空项 Backspace 删项（光标落上一项末尾）
- [ ] 灵活排版：拖动块重排 / 拖分隔线改比例 / 边缘与四角手柄缩放 / Alt+拖动像素级微调 /
      方向键微调（1pt，Shift 10pt）
- [ ] 撤销 / 重做（⌘Z / ⌘⇧Z 页内草稿自愈 + 页面级历史栈）；409 冲突提示「页面已被其他操作更新」

**面板与导出**
- [ ] AI 修改面板：指令 → 提案 → 应用；人工修改块有锁定标记
- [ ] 主题 / 版式 / 重排 / 图片面板；字号与主题切换在 Web 预览中同源生效
- [ ] 质量检查报告随编辑刷新；导出前 error / warning 分级门禁；PPTX 下载
- [ ] 演示模式、缩放控件、页码导航
