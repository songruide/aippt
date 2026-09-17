import { beforeAll, describe, expect, it, vi } from 'vitest'
import { consumeEventStream } from '@/lib/sse'

// tokenStore 直连 localStorage；node 环境用内存实现打桩
const storage = new Map<string, string>()
beforeAll(() => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => void storage.set(key, value),
    removeItem: (key: string) => void storage.delete(key),
  })
  storage.set('aippt.token', 'test-token')
})

/** 把字符串编成一条 SSE 字节流 */
function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
}

function mockFetchWith(body: ReadableStream<Uint8Array>) {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

describe('consumeEventStream', () => {
  it('解析连续的 data: 帧', async () => {
    mockFetchWith(
      streamOf([
        'data: {"type":"started"}\n\n',
        'data: {"type":"completed"}\n\n',
      ]),
    )
    const events: unknown[] = []
    await consumeEventStream('/test', new AbortController().signal, (event) => {
      events.push(event)
    })
    expect(events).toEqual([{ type: 'started' }, { type: 'completed' }])
  })

  it('跨 chunk 切开的帧要等边界凑齐再解析', async () => {
    mockFetchWith(
      streamOf(['data: {"type":"par', 'tial"}\n', '\ndata: {"type":"next"}\n\n']),
    )
    const events: unknown[] = []
    await consumeEventStream('/test', new AbortController().signal, (event) => {
      events.push(event)
    })
    expect(events).toEqual([{ type: 'partial' }, { type: 'next' }])
  })

  it('忽略注释行并归并多行 data；CRLF 归一为 LF', async () => {
    mockFetchWith(
      streamOf([
        ': keep-alive\r\n',
        'data: {"type":"multi",\r\ndata:  "n":1}\r\n\r\n',
      ]),
    )
    const events: Array<{ type: string; n?: number }> = []
    await consumeEventStream('/test', new AbortController().signal, (event) => {
      events.push(event as { type: string; n?: number })
    })
    expect(events).toEqual([{ type: 'multi', n: 1 }])
  })

  it('带上 Authorization 头；帧中间被 abort 就停止读取', async () => {
    const fetchMock = mockFetchWith(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const encoder = new TextEncoder()
          controller.enqueue(encoder.encode('data: {"type":"one"}\n\n'))
          // 不 close：模拟服务端持续推送
        },
      }),
    )
    const controller = new AbortController()
    const events: unknown[] = []
    const done = consumeEventStream('/test', controller.signal, (event) => {
      events.push(event)
      controller.abort()
    })
    await done
    expect(events).toEqual([{ type: 'one' }])
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const headers = init.headers as Record<string, string>
    expect(headers.Authorization).toBe('Bearer test-token')
  })

  it('非 2xx 抛错', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('no', { status: 401 })),
    )
    await expect(
      consumeEventStream('/test', new AbortController().signal, () => {}),
    ).rejects.toThrow('SSE connection failed: 401')
  })
})
