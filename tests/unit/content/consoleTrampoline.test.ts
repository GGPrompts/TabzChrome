import { describe, expect, it, vi } from 'vitest'
import { createConsoleTrampoline, createScheduledTrampoline } from '@/content/consoleTrampoline'
import { CONSOLE_TRAMPOLINE_NAME } from '@/shared/consoleBridge'

type FakeElement = { textContent: string; nonce?: string; remove: () => void }

function executingDocument(options: { nonce?: string | null } = {}) {
  const pageNonce = options.nonce === undefined ? 'page-nonce-1' : options.nonce
  const host: Record<string, unknown> = {}
  const appended: FakeElement[] = []
  const removed: FakeElement[] = []
  const mount = {
    appendChild(element: FakeElement) {
      appended.push(element)
      if (pageNonce && element.nonce !== pageNonce) throw new Error('CSP nonce mismatch')
      new Function('window', element.textContent)(host)
    },
  }
  const doc = {
    createElement: (): FakeElement => ({ textContent: '', remove() { removed.push(this as FakeElement) } }),
    querySelectorAll: () => pageNonce ? [{ nonce: '' }, { nonce: pageNonce }] : [{ nonce: '' }],
    head: mount,
    documentElement: mount,
    body: mount,
    defaultView: host,
  }
  return { doc, host, appended, removed }
}

describe('page-owned console trampoline', () => {
  it('borrows a page nonce, calls the original exactly once, and leaves no global behind', () => {
    const page = executingDocument()
    const trampoline = createConsoleTrampoline({ document: page.doc } as unknown as Window)
    const original = vi.fn()
    trampoline?.(original, ['first', 2])

    expect(trampoline?.name).toBe(CONSOLE_TRAMPOLINE_NAME)
    expect(page.appended).toHaveLength(1)
    expect(page.appended[0].nonce).toBe('page-nonce-1')
    expect(page.removed).toHaveLength(1)
    expect(Object.keys(page.host)).toHaveLength(0)
    expect(original).toHaveBeenCalledExactlyOnceWith('first', 2)
  })

  it('does not attempt inline or eval construction without a page nonce', () => {
    const page = executingDocument({ nonce: null })
    expect(createConsoleTrampoline({ document: page.doc, Function } as unknown as Window)).toBeUndefined()
    expect(page.appended).toHaveLength(0)
  })

  it('captures the page scheduler once and invokes the original exactly once', () => {
    const scheduled: Array<{ callback: (...args: unknown[]) => unknown; args: unknown[] }> = []
    const target = {
      setTimeout(callback: (...args: unknown[]) => unknown, _delay: number, ...args: unknown[]) {
        scheduled.push({ callback, args })
      },
    } as unknown as Window
    const trampoline = createScheduledTrampoline(target)
    ;(target as unknown as { setTimeout: () => void }).setTimeout = vi.fn()
    const original = vi.fn()
    trampoline(original, ['deferred', 7])
    expect(scheduled).toHaveLength(1)
    expect(original).not.toHaveBeenCalled()
    scheduled[0].callback(...scheduled[0].args)
    expect(original).toHaveBeenCalledExactlyOnceWith('deferred', 7)
  })
})
