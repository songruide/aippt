<script setup lang="ts">
import { getCurrentInstance, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import { cn } from '@/lib/utils'

const SAVE_IDLE_MS = 800

const props = withDefaults(
  defineProps<{
    value: string
    ariaLabel: string
    /** false 时 Enter 提交并失焦，不插入换行 */
    multiline?: boolean
    style?: CSSProperties
    /** 变化时强制聚焦；用于插入/删除后跳到目标项 */
    focusToken?: number | null
    /** 配合 focusToken：落在开头或末尾 */
    focusCaret?: 'start' | 'end'
  }>(),
  { multiline: false, style: undefined, focusToken: null, focusCaret: 'start' },
)

const emit = defineEmits<{
  commit: [next: string]
  focus: []
  /** 有监听时 Enter 先提交再触发，不再失焦（列表增项） */
  enter: []
  /** 内容为空时按 Backspace（列表删项） */
  backspaceWhenEmpty: []
}>()

// 父组件没监听 enter / backspaceWhenEmpty 时走不同分支（失焦 / 忽略），
// 因此要在运行时探测监听器是否存在。
const instance = getCurrentInstance()
const hasEnterListener = () => instance?.vnode.props?.onEnter != null
const hasBackspaceListener = () => instance?.vnode.props?.onBackspaceWhenEmpty != null

/** 两串公共前缀长度：撤销删除 / 重做插入时把光标落在变化处 */
function caretAtChange(from: string, to: string): number {
  const limit = Math.min(from.length, to.length)
  let i = 0
  while (i < limit && from[i] === to[i]) i += 1
  return i
}

function placeCaret(el: HTMLElement, offset: number) {
  const selection = window.getSelection()
  if (!selection) return

  if (document.activeElement !== el) {
    el.focus()
  }

  const range = document.createRange()
  const textNode = el.firstChild
  if (textNode && textNode.nodeType === Node.TEXT_NODE) {
    const length = textNode.textContent?.length ?? 0
    const next = Math.max(0, Math.min(offset, length))
    range.setStart(textNode, next)
    range.collapse(true)
  } else if (offset <= 0) {
    range.setStart(el, 0)
    range.collapse(true)
  } else {
    range.selectNodeContents(el)
    range.collapse(false)
  }

  selection.removeAllRanges()
  selection.addRange(range)
}

const elRef = ref<HTMLSpanElement | null>(null)
let focused = false
let valueCurrent = props.value
let draft = props.value
/** 刚用 ⌘Z 丢掉的未提交草稿，供 ⌘⇧Z 就地重做 */
let pendingRedo: string | null = null
let timer: number | null = null
let lastFocusToken: number | null = null

const clearTimer = () => {
  if (timer != null) {
    window.clearTimeout(timer)
    timer = null
  }
}

const commitIfChanged = () => {
  const next = draft
  if (next === valueCurrent) return
  pendingRedo = null
  emit('commit', next)
}

const scheduleCommit = () => {
  clearTimer()
  timer = window.setTimeout(() => {
    timer = null
    commitIfChanged()
  }, SAVE_IDLE_MS)
}

const syncDom = (next: string, caretFrom?: string) => {
  const el = elRef.value
  if (!el) return
  const from = caretFrom ?? el.textContent ?? draft
  if (el.textContent !== next) {
    el.textContent = next
  }
  draft = next

  // native focus / 重渲染后 focused 可能短暂不同步，以 activeElement 为准
  const alive = focused || document.activeElement === el
  if (!alive) return

  focused = true
  const caret = caretAtChange(from, next)
  placeCaret(el, caret)
  // 部分浏览器会在 keydown 收尾把光标打回开头，下一帧再钉一次
  requestAnimationFrame(() => {
    if (elRef.value !== el) return
    if (!focused && document.activeElement !== el) return
    placeCaret(el, caret)
  })
}

// 外部更新（撤销/AI 写回）时，即便仍聚焦也要同步 DOM，并尽量保住光标落点。
// 文本节点刻意不由模板插值驱动（那会冲掉光标与草稿），只在这里命令式写入。
const syncFromValue = (value: string, previous: string) => {
  valueCurrent = value
  const el = elRef.value
  if (!el) return
  if (el.textContent === value) {
    draft = value
    return
  }
  if (!focused || previous !== value) {
    syncDom(value, previous)
  }
}

watch(
  () => props.value,
  (value, previous) => syncFromValue(value, previous),
)

onMounted(() => syncFromValue(props.value, props.value))

watch(
  () => [props.focusToken, props.focusCaret] as const,
  ([focusToken, focusCaret]) => {
    if (focusToken == null || focusToken === lastFocusToken) return
    lastFocusToken = focusToken
    const el = elRef.value
    if (!el) return
    focused = true
    el.focus()
    const offset = focusCaret === 'end' ? (el.textContent?.length ?? 0) : 0
    placeCaret(el, offset)
    requestAnimationFrame(() => {
      if (elRef.value !== el) return
      placeCaret(el, offset)
    })
  },
)

onBeforeUnmount(clearTimer)

const onPaste = (event: ClipboardEvent) => {
  event.preventDefault()
  const text = event.clipboardData?.getData('text/plain') ?? ''
  const normalized = props.multiline ? text : text.replace(/[\r\n]+/g, ' ')
  document.execCommand('insertText', false, normalized)
}

const onKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    clearTimer()
    pendingRedo = null
    syncDom(valueCurrent)
    elRef.value?.blur()
    return
  }

  const mod = event.metaKey || event.ctrlKey
  if (mod && event.key.toLowerCase() === 'z') {
    // 未提交草稿：⌘Z 就地还原，并缓存以便 ⌘⇧Z 重做
    if (!event.shiftKey && draft !== valueCurrent) {
      event.preventDefault()
      event.stopPropagation()
      clearTimer()
      const discarded = draft
      pendingRedo = discarded
      syncDom(valueCurrent, discarded)
      return
    }

    // 刚丢掉的未提交草稿：⌘⇧Z / ⌘Y 就地重做，不落到页面历史栈
    if (event.shiftKey && pendingRedo != null && draft === valueCurrent) {
      event.preventDefault()
      event.stopPropagation()
      const redoText = pendingRedo
      pendingRedo = null
      syncDom(redoText, valueCurrent)
      scheduleCommit()
      return
    }

    // 已提交：挡住浏览器自带撤销，放行到页面级历史栈
    event.preventDefault()
    return
  }

  if (mod && event.key.toLowerCase() === 'y') {
    if (pendingRedo != null && draft === valueCurrent) {
      event.preventDefault()
      event.stopPropagation()
      const redoText = pendingRedo
      pendingRedo = null
      syncDom(redoText, valueCurrent)
      scheduleCommit()
      return
    }
    event.preventDefault()
    return
  }

  if (!props.multiline && event.key === 'Enter') {
    event.preventDefault()
    clearTimer()
    commitIfChanged()
    if (hasEnterListener()) {
      emit('enter')
      return
    }
    elRef.value?.blur()
    return
  }

  if (
    !props.multiline &&
    event.key === 'Backspace' &&
    draft.length === 0 &&
    hasBackspaceListener()
  ) {
    event.preventDefault()
    clearTimer()
    emit('backspaceWhenEmpty')
  }
}

const onFocus = () => {
  focused = true
  emit('focus')
}

const onBlur = () => {
  focused = false
  pendingRedo = null
  clearTimer()
  commitIfChanged()
}

const onInput = () => {
  draft = elRef.value?.textContent ?? ''
  pendingRedo = null
  scheduleCommit()
}
</script>

<template>
  <!--
    受约束的 contenteditable：纯文本、主题样式原样继承，
    停止输入后自动提交，失焦立即提交，无变化不回调。
  -->
  <span
    ref="elRef"
    role="textbox"
    :aria-label="ariaLabel"
    :aria-multiline="multiline || undefined"
    contenteditable="plaintext-only"
    :class="
      cn(
        // 透明描边占位，避免 focus 时布局跳动；颜色跟当前文字走，不引入额外主题色块
        'shadow-[inset_0_0_0_1px_transparent]',
        'hover:shadow-[inset_0_0_0_1px_color-mix(in_oklab,currentColor_22%,transparent)]',
        'focus:shadow-[inset_0_0_0_1px_color-mix(in_oklab,currentColor_40%,transparent)]',
      )
    "
    :style="
      {
        ...style,
        outline: 'none',
        cursor: 'text',
        borderRadius: 0,
        minWidth: '0.5em',
        // 单行用 inline，避免表格单元格 / KPI 数值被 inline-block 撑成独立块导致跳动
        display: multiline ? 'block' : 'inline',
        whiteSpace: multiline ? 'pre-wrap' : undefined,
        wordBreak: multiline ? 'break-word' : undefined,
      }
    "
    @focus="onFocus"
    @blur="onBlur"
    @input="onInput"
    @paste="onPaste"
    @keydown="onKeyDown"
  />
</template>
