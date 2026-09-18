import { ref, shallowRef, toValue, watch, onScopeDispose } from 'vue'
import type { MaybeRefOrGetter } from 'vue'
import { consumeEventStream, delay } from '@/lib/sse'

const RECONNECT_DELAY_MS = 1_000

interface Options<T> {
  path: string
  active: MaybeRefOrGetter<boolean>
  /** 收到这些事件类型后停止重连：任务已经有终态，再连只会空转 */
  terminalTypes: readonly string[]
  /** setup 只执行一次，闭包引用稳定，无需额外用 ref 中转 */
  onEvent?: (event: T) => void
}

/**
 * 订阅一条服务端事件流，断线后自动重连。
 *
 * 服务端每条事件都带完整状态，因此重连不需要补发历史：
 * 拿到的第一帧就是当前快照。
 */
export function useEventStream<T extends { type: string }>({
  path,
  active,
  terminalTypes,
  onEvent,
}: Options<T>) {
  const event = shallowRef<T | null>(null)
  const connectionError = ref(false)
  let controller: AbortController | null = null

  const stop = () => {
    controller?.abort()
    controller = null
  }

  const connect = async () => {
    const current = controller
    if (!current) return
    while (!current.signal.aborted) {
      let finished = false
      try {
        await consumeEventStream<T>(path, current.signal, (next) => {
          event.value = next
          connectionError.value = false
          onEvent?.(next)
          if (terminalTypes.includes(next.type)) finished = true
        })
      } catch {
        if (current.signal.aborted) return
        connectionError.value = true
      }
      if (finished || current.signal.aborted) return
      await delay(RECONNECT_DELAY_MS, current.signal)
    }
  }

  watch(
    () => toValue(active),
    (isActive) => {
      stop()
      if (!isActive) {
        connectionError.value = false
        return
      }
      controller = new AbortController()
      void connect()
    },
    { immediate: true },
  )

  onScopeDispose(stop)

  return { event, connectionError }
}
