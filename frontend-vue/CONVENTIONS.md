# frontend-vue 组件契约与写法规范

本文档约束 `src/` 下组件的写法，以及跨组件协作时依赖的契约。
新增组件或改动已有组件前请先读一遍，避免同一件事出现两种写法。

## 铁律

1. `<script setup lang="ts">` 在前、`<template>` 在后；**不写 `<style>` 块**（样式走全局 Tailwind）。
2. 启用了 `verbatimModuleSyntax`：类型导入必须写 `import type`。
3. 组件间引用一律带 `.vue` 后缀，例如 `import SlideStage from '@/features/deck/SlideStage.vue'`。
4. 不要用 `v-html`。
5. `v-for` 必须带 `:key`。

## 状态与生命周期

| 场景 | 写法 |
| --- | --- |
| 组件内可变状态 | `ref(x)`；大对象且不需要深响应时用 `shallowRef` |
| 派生状态 | `computed(f)` |
| 挂载时初始化 / 注册监听 | `onMounted` + `onUnmounted`（或 `onScopeDispose`） |
| 依赖变化时执行 | `watch([a, b], fn, { flush: 'post' })` |
| DOM 引用 | `ref<HTMLElement \| null>(null)` + 模板 ref |
| 只做暂存、不触发渲染的值 | setup 作用域的普通 `let` / `const`，不要用 `ref` |
| 父组件传回调 | `defineEmits` + `emit('x', ...)` |
| 插槽 | 默认插槽 / 作用域插槽 |
| 弹层挂到 `body` | `<Teleport to="body">` |

`watch` 的清理函数必须写在回调**第三参** `onCleanup` 里，**不能** `return () => ...`。

**`immediate` 是最容易漏的一处**：`watch` 默认只在监听源变化时执行。
凡是「挂载时就必须算出来的状态」「挂载时就要注册的全局监听」，而监听源首帧已经确定、
之后不再变化的，都必须补 `immediate: true`——否则会**静默失效**，不报错也不告警，
只是功能不生效（本项目已在页面级键盘监听、缓存命中时的当前页选择上各踩过一次）。

## 服务端状态（@tanstack/vue-query）

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/vue-query'

const { data, isPending, isError, error } = useQuery({
  queryKey: ['projects', id],
  queryFn: () => request<Project>(`/projects/${id}`),
  enabled: () => toValue(enabled),        // enabled 支持 getter
})

// data / isPending / error 都是 Ref：脚本里用 .value，模板里直接写
const qc = useQueryClient()
qc.setQueryData(key, updater)
qc.invalidateQueries({ queryKey })
await mutateAsync(payload)                // onSuccess / onError / onMutate 均可用
```

query key 的常量统一在 `features/*/api.ts` 里定义（`deckKey`、`outlineKey`、`deckQualityKey` 等），
直接 import，**不要另起 key**。

## 已就绪的基础设施（直接用，勿重复实现）

- `@/lib/utils` 的 `cn`；`@/lib/errors` 的 `errorMessage`；`@/lib/datetime`；`@/lib/download`
- `@/components/ui/Button.vue`：props `variant` / `size`，默认插槽，其余属性透传
- `@/components/ui/TextField.vue`：props `label` / `hint`，`v-model`，placeholder 等透传
- `@/components/ui/Dialog.vue`：props `title` / `description` / `panelClass`，slots 默认 + `#footer`，
  `@close`；已 Teleport + Esc + 滚动锁
- `@/components/ui/MenuPopover.vue`：`#trigger="{ open, toggle }"` + 默认 `#default="{ close }"`，
  props `align` / `label` / `panelClass`
- `@/components/ui/MenuItem.vue`：props `hint` / `icon`(Component) / `disabled` / `danger`，`@select`
- `@/components/ui/PillSelect.vue`：props `label` / `value` / `options` / `disabled`，
  `@change(value: string)`，`#leading` 插槽
- `@/components/WorkbenchHeader.vue`：props `title`，slots `#meta` + 默认
- `@/components/StatusPill.vue`：props `status`
- `@/components/BrandMark.vue`：class 透传给 svg
- `@/render/EditableText.vue`：props `value` / `ariaLabel` / `multiline` / `style` / `focusToken` /
  `focusCaret`；emits `commit(next)`、`focus`、`enter`、`backspaceWhenEmpty`
  （模板里写 `@backspace-when-empty`）。
  **注意**：必须写 `:ariaLabel="..."`（写 `aria-label` 不会映射到该 prop）；
  `focusToken` / `focusCaret` 在模板里可用 `:focus-token` / `:focus-caret`。
- `@/render/SlideView.vue`：props `slide` / `theme` / `editable` / `selectedBlockId` / `overflowMode` /
  `overflowSlotIds` / `slideIndex`；emits `selectBlock(id|null)`、`commit(blockId, body)`
- `@/render/SlideThumbnail.vue`：props `slide` / `theme` / `slideIndex`
- `@/render/ThemeCover.vue`：props `theme` / `title`
- `@/render/BlockView.vue`：props `block` / `slotData` / `theme` / `editable`（`slot` 是保留字，故改名 `slotData`）
- `@/render/ChartView.vue`：**ECharts** 实现；props `block` / `slotData` / `theme`
- `@/features/auth/store.ts`：pinia，`useAuthStore()` → `auth.user` / `auth.restoring` /
  `applySession` / `logout` / `restore`
- `@/features/deck/useSlideSaveQueue(projectId, slideId)`：返回
  `{ commit, commitStyle, commitFlex, commitCreateBlock, commitDeleteBlock, commitMutate, undo, redo,
  canUndo, canRedo, historyTick, status, error, refresh }`（`canUndo` / `canRedo` / `status` / `error` 是 Ref）
- `@/features/deck/useFlexPointerSession({ projectId, slide, tree, selectedBlockId, busy,
  onPreviewTree, onCommitTree, onSelectBlock, onDraggingChange })`：`slide` / `tree` /
  `selectedBlockId` / `busy` 接受 Ref 或 getter；返回
  `{ rootRef, drag, hoveredDividerKey, rowDividers, columnDividers, blockIds, placements, dragging,
  draggingBlockId, visibleHandleId, selectedRect, hitClass, ghostLabel, startReorder, startRatio,
  startGrow, beginBlockResize, beginCornerResize }`（除 `start*` 外均为 computed / ref；
  `start*` 是普通函数，绑在模板 `@pointerdown` 上，事件对象是原生 `PointerEvent`）
- `@/features/deck/useSlideVisibility({ slides, scrollRequest, onActiveChange })`：
  返回 `{ scrollerRef, bindSlideEl }`（`bindSlideEl` 放 `:ref="(node) => bindSlideEl(id, node)"`）
- `@/features/deck/useDeckProgress(projectId, active: MaybeRefOrGetter<boolean>)` →
  `{ event, connectionError }`
- `@/features/outline/useOutlineProgress`、`useConfirmAndGenerate`，以及各 `features/*/api.ts`
  里的 vue-query hooks（`enabled` 参数接受 getter）
- `@/features/deck/slideSaveBridge`：`registerSlideSaveHandlers` / `getSlideSaveHandlers` /
  `registerInsertDragStarter` / `requestInsertDrag`（纯模块）
- `@/features/deck/insertColumns`：`insertColumnsAt` / `InsertAnchor`
  （纯编排逻辑，`BlockInsertRail.vue` 不再导出函数）
- `@/hooks/useEventStream`、`@/hooks/useDragSort`（模板里 `v-bind="itemProps(index)"`）

## SFC 写法细则

- props：`withDefaults(defineProps<{...}>(), {...})`；有默认值的 props 全部写进 `withDefaults`。
- 事件：`defineEmits<{ commit: [next: string] }>()`，父层 `@commit`。
- 复杂的行内事件逻辑挪进 script 里的函数再绑定，模板里只留函数调用（可读且可类型检查）。
- `v-for` 的 `:key` 用稳定的业务 id，不要用数组下标。
- 事件对象是原生 DOM 类型：`PointerEvent`、`KeyboardEvent`、`DragEvent`。
- `useId()` 从 `'vue'` 导入。
- 图标：`import { Plus } from 'lucide-vue-next'`，`<Plus class="size-4" />`。
- SVG 模板属性用 kebab-case（`stroke-width`）。
- 字符串 `style="..."` 只用于静态样式；动态样式一律 `:style`。

## 自查清单

1. 所有 `@/...` import 的路径真实存在（对照上文「已就绪的基础设施」清单）。
2. 组件间引用都带 `.vue` 后缀。
3. 新增的 `watch` 逐条确认：监听源是否「首帧确定、之后不再变」——是则必须 `immediate: true`。
4. `npm run build`（vue-tsc + vite build）与 `npm run test` 通过。
