import { describe, expect, it, vi } from 'vitest'
import { installIsolatedConsoleBridge } from '@/content/consoleIsolated'
import { MAX_BRIDGE_EVENTS_PER_WINDOW, createConsoleBridgeMessage } from '@/shared/consoleBridge'

type Listener = (event: { source: unknown; data: unknown }) => void

function fixture() {
  const listeners: Listener[] = []
  const posted: unknown[] = []
  const target = {
    location: { href: 'https://frame.example.test/path' },
    addEventListener(type: string, listener: Listener) { if (type === 'message') listeners.push(listener) },
    postMessage(message: unknown) { posted.push(message) },
  }
  const runtime = { id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', sendMessage: vi.fn(async () => undefined) }
  installIsolatedConsoleBridge(target as unknown as Window, runtime)
  return { target, runtime, posted, dispatch: (source: unknown, data: unknown) => listeners[0]({ source, data }) }
}

describe('isolated console bridge', () => {
  it('announces readiness and forwards only same-window marked messages', () => {
    const { target, runtime, posted, dispatch } = fixture()
    expect(posted).toEqual([{ __tabzConsoleReady: true }])
    const message = createConsoleBridgeMessage('warn', ['page warning'], 10)
    dispatch({}, message)
    dispatch(target, { entry: message.entry })
    expect(runtime.sendMessage).not.toHaveBeenCalled()
    dispatch(target, message)
    expect(runtime.sendMessage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      type: 'CONSOLE_LOG',
      entry: expect.objectContaining({ url: 'https://frame.example.test/path', source: 'page' }),
    }))
  })

  it('drops a same-frame flood before extension IPC', () => {
    const { target, runtime, dispatch } = fixture()
    const message = createConsoleBridgeMessage('log', ['burst'], 10)
    for (let index = 0; index < MAX_BRIDGE_EVENTS_PER_WINDOW + 25; index++) dispatch(target, message)
    expect(runtime.sendMessage).toHaveBeenCalledTimes(MAX_BRIDGE_EVENTS_PER_WINDOW)
  })

  it('does not let unrelated page messages consume the console quota', () => {
    const { target, runtime, dispatch } = fixture()
    for (let index = 0; index < MAX_BRIDGE_EVENTS_PER_WINDOW + 25; index++) {
      dispatch(target, { unrelated: true })
    }
    dispatch(target, createConsoleBridgeMessage('log', ['still forwarded'], 10))
    expect(runtime.sendMessage).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: 'CONSOLE_LOG' }))
  })
})
