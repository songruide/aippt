import { toRaw } from 'vue'

/**
 * 拆掉响应式代理后的纯数据深拷贝。
 *
 * Vue 的 query 缓存 / 组件 props 里拿到的是响应式代理（Proxy），而 structuredClone
 * 的结构化克隆算法不认 Proxy，会直接抛 DataCloneError。React 版的同款 structuredClone
 * 能跑，是因为 react-query 缓存里存的是普通对象——这属于 Vue 侧必须补的一层。
 *
 * 这里先递归 toRaw 还原成普通对象/数组，再做一次结构化克隆，语义与 structuredClone 一致。
 */
function unwrap(value: unknown): unknown {
  const raw = toRaw(value)
  if (Array.isArray(raw)) return raw.map(unwrap)
  if (raw !== null && typeof raw === 'object') {
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(raw)) out[key] = unwrap(item)
    return out
  }
  return raw
}

export function cloneData<T>(value: T): T {
  return structuredClone(unwrap(value)) as T
}
