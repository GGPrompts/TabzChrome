import { describe, expect, it, vi } from 'vitest'
import { MAX_BUFFERED_ENTRIES, installMainWorldConsoleCapture } from '@/content/consoleMainWorld'
import { createConsoleReadyMessage } from '@/shared/consoleBridge'

type Listener = (event: unknown) => void

function createFakeWindow() {
  const listeners = new Map<string, Listener[]>()
  const posted: unknown[] = []
  const originals = Object.fromEntries(['log', 'info', 'warn', 'error', 'debug'].map(level => [level, vi.fn()]))
  const fake = {
    console: { ...originals },
    setTimeout(callback: (...args: unknown[]) => unknown, _delay: number, ...args: unknown[]) {
      callback(...args)
    },
    addEventListener(type: string, listener: Listener) {
      listeners.set(type, [...(listeners.get(type) ?? []), listener])
    },
    postMessage(message: unknown) { posted.push(message) },
    dispatch(type: string, event: unknown) {
      for (const listener of listeners.get(type) ?? []) listener(event)
    },
    posted,
    originals,
  }
  return fake
}

describe('MAIN-world console capture', () => {
  it('buffers early entries, accepts readiness only from the same window, and flushes in order', () => {
    const fake = createFakeWindow()
    installMainWorldConsoleCapture(fake as unknown as Window)
    fake.console.error('first')
    fake.dispatch('error', { message: 'Uncaught boom', error: new Error('boom') })
    expect(fake.posted).toHaveLength(0)
    fake.dispatch('message', { source: {}, data: createConsoleReadyMessage() })
    expect(fake.posted).toHaveLength(0)
    fake.dispatch('message', { source: fake, data: createConsoleReadyMessage() })
    expect(fake.posted).toHaveLength(2)
    expect((fake.posted[0] as { entry: { message: string } }).entry.message).toBe('first')
    expect((fake.posted[1] as { entry: { message: string } }).entry.message).toBe('Uncaught boom')
  })

  it('keeps a bounded early buffer and installs only once', () => {
    const fake = createFakeWindow()
    installMainWorldConsoleCapture(fake as unknown as Window)
    installMainWorldConsoleCapture(fake as unknown as Window)
    for (let index = 0; index < MAX_BUFFERED_ENTRIES + 5; index++) fake.console.log(`entry ${index}`)
    fake.dispatch('message', { source: fake, data: createConsoleReadyMessage() })
    expect(fake.posted).toHaveLength(MAX_BUFFERED_ENTRIES)
    expect((fake.posted[0] as { entry: { message: string } }).entry.message).toBe('entry 5')
  })

  it('calls every original console method exactly once and captures errors and rejections', () => {
    const fake = createFakeWindow()
    installMainWorldConsoleCapture(fake as unknown as Window)
    fake.dispatch('message', { source: fake, data: createConsoleReadyMessage() })
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      fake.console[level](level)
      expect(fake.originals[level]).toHaveBeenCalledExactlyOnceWith(level)
    }
    fake.dispatch('error', { message: '', error: new Error('uncaught') })
    fake.dispatch('unhandledrejection', { reason: new Error('rejected') })
    expect(fake.posted).toHaveLength(7)
    expect((fake.posted[5] as { entry: { message: string } }).entry.message).toContain('uncaught')
    expect((fake.posted[6] as { entry: { message: string } }).entry.message).toContain('Unhandled promise rejection')
  })
})
