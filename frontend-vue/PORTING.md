# React → Vue 移植规范（frontend-vue）

本目录是原 React 19 前端（已移出仓库，备份在 `D:\aippt_react_frontend_backup\frontend`）的
Vue 3 移植。纯逻辑层（api/lib/render 纯模块、flex 算法、
types、schema.d.ts）已原样复制；本文档约束 UI 层（.tsx → .vue）的移植约定。

**铁律**
1. 只新建分配给你的 `.vue` 文件，**不要修改任何已存在的文件**（包括本文件）。
2. 产物中禁止出现 `from 'react'`、`@tanstack/react-query`（要用 `@tanstack/vue-query`）、
   `lucide-react`（要用 `lucide-vue-next`）。
3. 行为 1:1：类名、文案、aria、事件语义、时序注释全部保留。原文件里的中文注释要搬过来。
4. `<script setup lang="ts">` 在前、`<template>` 在后；**不写 `<style>` 块**（全局 Tailwind）。
5. 启用了 `verbatimModuleSyntax`：类型导入必须 `import type`。

## 映射表

| React | Vue |
| --- | --- |
| `useState(x)` | `ref(x)` / `shallowRef`（大对象如 DragSession） |
| `useEffect(fn, [])` + cleanup | `onMounted` + `onUnmounted` / `onScopeDispose` |
| `useEffect(fn, [a,b])` | `watch([a, b], fn, { flush: 'post' })`，cleanup 用回调第三参 `onCleanup` |
| `useMemo(f, deps)` | `computed(f)` |
| DOM 的 `useRef` | `ref<HTMLElement \| null>(null)` + 模板 `ref="xxx"` |
| 可变值（不触发渲染）的 `useRef` | 普通闭包变量 `let` / `const`（不要 ref） |
| 回调 props（`onCommit`） | `defineEmits` + `emit('commit', ...)` |
| `children` / render-prop | 默认插槽 / 作用域插槽 |
| `className` | `class` attr（自动 fallthrough；需要合并时用 `cn()`） |
| `useNavigate` / navigate(path) | `useRouter()` + `router.push(path)` |
| `useParams` / `useLocation` | `useRoute().params` / `useRoute()`（响应式，用 computed 包一层） |
| `Link` | `RouterLink` |
| portal | `<Teleport to="body">`（Dialog.vue 已做） |

watch 回调里挂全局监听必须在第三参 `onCleanup` 里移除；**不能** `return () => ...`。

## vue-query（@tanstack/vue-query）

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'

const { data, isPending, isError, error } = useQuery({
  queryKey: ['projects', id],
  queryFn: () => request<Project>(`/projects/${id}`),
  enabled: () => toValue(enabled),        // enabled 支持getter
})
// data/isPending 是 Ref：脚本里 data.value，模板里直接 data
const qc = useQueryClient()
qc.setQueryData(key, updater)             // 与 React 版签名一致
qc.invalidateQueries({ queryKey })
mutateAsync(payload) / mutate(payload)    // onSuccess/onError/onMutate 语义同 React v5
```

query key 的常量（`deckKey`、`outlineKey`、`deckQualityKey` 等）已从 React 版原样移植，
直接 import，**不要另起 key**。

## 已就绪的基础设施（直接用，勿改）

- `@/lib/utils` `cn`；`@/lib/errors` `errorMessage`；`@/lib/datetime`；`@/lib/download`
- `@/components/ui/Button.vue`：props `variant`/`size`，默认插槽，其余属性透传
- `@/components/ui/TextField.vue`：props `label`/`hint`，`v-model`，placeholder 等透传
- `@/components/ui/Dialog.vue`：props `title`/`description`/`panelClass`，slots 默认 + `#footer`，
  `@close`；已 Teleport + Esc + 滚动锁
- `@/components/ui/MenuPopover.vue`：`#trigger="{ open, toggle }"` + 默认 `#default="{ close }"`，
  props `align`/`label`/`panelClass`
- `@/components/ui/MenuItem.vue`：props `hint`/`icon`(Component)/`disabled`/`danger`，`@select`
- `@/components/ui/PillSelect.vue`：props `label`/`value`/`options`/`disabled`，`@change(value: string)`，
  `#leading` 插槽
- `@/components/WorkbenchHeader.vue`：props `title`，slots `#meta` + 默认
- `@/components/StatusPill.vue`：props `status`
- `@/components/BrandMark.vue`：class 透传给 svg
- `@/render/EditableText.vue`：props `value`/`ariaLabel`/`multiline`/`style`/`focusToken`/`focusCaret`；
  emits `commit(next)`、`focus`、`enter`、`backspaceWhenEmpty`（模板里写 `@backspace-when-empty`）。
  **注意**：必须写 `:ariaLabel="..."`（写 `aria-label` 不会映射到该 prop）；`focusToken`/`focusCaret`
  模板里可用 `:focus-token`/`:focus-caret`。
- `@/render/SlideView.vue`：props `slide`/`theme`/`editable`/`selectedBlockId`/`overflowMode`/
  `overflowSlotIds`/`slideIndex`；emits `selectBlock(id|null)`、`commit(blockId, body)`
- `@/render/SlideThumbnail.vue`：props `slide`/`theme`/`slideIndex`
- `@/render/ThemeCover.vue`：props `theme`/`title`
- `@/render/BlockView.vue`：props `block`/`slotData`/`theme`/`editable`（slot 是保留字，改名 slotData）
- `@/render/ChartView.vue`：**ECharts** 实现；props `block`/`slotData`/`theme`
- `@/features/auth/store.ts`：pinia，`useAuthStore()` → `auth.user`/`auth.restoring`/`applySession`/`logout`/`restore`
- `@/features/deck/useSlideSaveQueue(projectId, slideId)`：返回
  `{ commit, commitStyle, commitFlex, commitCreateBlock, commitDeleteBlock, commitMutate, undo, redo,
     canUndo, canRedo, historyTick, status, error, refresh }`（canUndo/canRedo/status/error 是 Ref）
- `@/features/deck/useFlexPointerSession({ projectId, slide, tree, selectedBlockId, busy,
    onPreviewTree, onCommitTree, onSelectBlock, onDraggingChange })`：slide/tree/selectedBlockId/busy
  接受 Ref/getter；返回 `{ rootRef, drag, hoveredDividerKey, rowDividers, columnDividers, blockIds,
    placements, dragging, draggingBlockId, visibleHandleId, selectedRect, hitClass, ghostLabel,
    startReorder, startRatio, startGrow, beginBlockResize, beginCornerResize }`（全部 computed/ref，
  start* 是普通函数，绑在模板 `@pointerdown` 上，原生 PointerEvent）
- `@/features/deck/useSlideVisibility({ slides, scrollRequest, onActiveChange })`：
  返回 `{ scrollerRef, bindSlideEl }`（bindSlideEl 放 `:ref="(node) => bindSlideEl(id, node)"`）
- `@/features/deck/useDeckProgress(projectId, active: MaybeRefOrGetter<boolean>)` → `{ event, connectionError }`
- `@/features/outline/useOutlineProgress`、`useConfirmAndGenerate`、各 `features/*/api.ts` 的
  vue-query hooks 与 React 版同名同参（enabled 参数接受 getter）
- `@/features/deck/slideSaveBridge`：`registerSlideSaveHandlers` / `getSlideSaveHandlers` /
  `registerInsertDragStarter` / `requestInsertDrag`（纯模块，原样）
- `@/features/deck/insertColumns`：`insertColumnsAt` / `InsertAnchor`（从 React 版
  BlockInsertRail.tsx 抽出的纯逻辑，Vue 版 BlockInsertRail.vue 不再导出函数）
- `@/hooks/useEventStream`、`@/hooks/useDragSort`（`v-bind="itemProps(index)"`）

## SFC 写法细则

- props：`withDefaults(defineProps<{...}>(), {...})`；必填 React 默认值全部搬进 withDefaults。
- 事件：`defineEmits<{ commit: [next: string] }>()`；父层 `@commit`。
- 复杂行内事件逻辑挪进 script 函数再绑定，模板里只留函数调用（可读且可类型检查）。
- v-for 必须带 `:key`（用原 React key 同款值）。
- 原生事件对象是 DOM 类型：`PointerEvent`、`KeyboardEvent`、`DragEvent`（不再是 React 合成事件）。
- `useId()` 从 'vue' 导入（不是 react）。
- 图标：`import { Plus } from 'lucide-vue-next'`，`<Plus class="size-4" />`，名字与 React 版一致。
- SVG 模板属性用 kebab-case（`stroke-width`）。
- 字符串 style（style=""）只用于静态样式；动态样式一律 `:style`。
- 不要用 `v-html`。不要把 React 的 `dangerouslySetInnerHTML` 之类带进来。

## 验收（写完每个文件后自查）

1. `grep -n "react" <你的文件>` 无命中（注释里提到 React 的除外）。
2. 所有 import 的 `@/...` 路径真实存在（对照上文"已就绪"清单；纯逻辑模块与 React 版路径相同，
   例如 `@/features/deck/flexEditDragSession`、`@/render/types`）。
3. 组件间引用都用 `.vue` 后缀路径（`import SlideStage from '@/features/deck/SlideStage.vue'`）。
