import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { waitForTabLoadComplete } from '../../../extension/background/browserMcp/pageLoad'

describe('page load lifecycle', () => {
  let updatedListener: ((tabId: number, changeInfo: { status?: string }) => void) | undefined
  let removedListener: ((tabId: number) => void) | undefined
  let addUpdated: ReturnType<typeof vi.fn>
  let removeUpdated: ReturnType<typeof vi.fn>
  let addRemoved: ReturnType<typeof vi.fn>
  let removeRemoved: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    updatedListener = undefined
    removedListener = undefined
    addUpdated = vi.fn(listener => { updatedListener = listener })
    removeUpdated = vi.fn()
    addRemoved = vi.fn(listener => { removedListener = listener })
    removeRemoved = vi.fn()
    Object.assign(chrome.tabs, {
      get: vi.fn(async () => ({ id: 42, status: 'loading' } as chrome.tabs.Tab)),
      onUpdated: { addListener: addUpdated, removeListener: removeUpdated },
      onRemoved: { addListener: addRemoved, removeListener: removeRemoved }
    })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('subscribes before the status recheck and closes the completion race', async () => {
    const order: string[] = []
    addUpdated.mockImplementation(listener => {
      order.push('updated-listener')
      updatedListener = listener
    })
    addRemoved.mockImplementation(listener => {
      order.push('removed-listener')
      removedListener = listener
    })
    vi.mocked(chrome.tabs.get).mockImplementation(async () => {
      order.push('status-recheck')
      return { id: 42, status: 'complete' } as chrome.tabs.Tab
    })

    await waitForTabLoadComplete(42)

    expect(order).toEqual(['updated-listener', 'removed-listener', 'status-recheck'])
    expect(removeUpdated).toHaveBeenCalledWith(updatedListener)
    expect(removeRemoved).toHaveBeenCalledWith(removedListener)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('ignores unrelated updates and cleans both listeners after completion', async () => {
    const pending = waitForTabLoadComplete(42)
    updatedListener?.(41, { status: 'complete' })
    expect(removeUpdated).not.toHaveBeenCalled()

    updatedListener?.(42, { status: 'complete' })
    await pending

    expect(removeUpdated).toHaveBeenCalledOnce()
    expect(removeRemoved).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects immediately when the target closes and removes every resource', async () => {
    const pending = waitForTabLoadComplete(42)
    removedListener?.(42)

    await expect(pending).rejects.toThrow('Tab 42 was closed')
    expect(removeUpdated).toHaveBeenCalledOnce()
    expect(removeRemoved).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cleans both listeners when the status recheck fails', async () => {
    vi.mocked(chrome.tabs.get).mockRejectedValueOnce(new Error('No tab with id: 42'))

    await expect(waitForTabLoadComplete(42)).rejects.toThrow('No tab with id: 42')
    expect(removeUpdated).toHaveBeenCalledOnce()
    expect(removeRemoved).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('times out with no late listener or timer left behind', async () => {
    const pending = waitForTabLoadComplete(42, 50)
    const rejection = expect(pending).rejects.toThrow('Tab did not finish loading within 15 seconds')
    await vi.advanceTimersByTimeAsync(50)
    await rejection

    expect(removeUpdated).toHaveBeenCalledOnce()
    expect(removeRemoved).toHaveBeenCalledOnce()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not let a late failed recheck overturn a completion event', async () => {
    let rejectRecheck!: (error: Error) => void
    vi.mocked(chrome.tabs.get).mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectRecheck = reject
    }))

    const pending = waitForTabLoadComplete(42)
    updatedListener?.(42, { status: 'complete' })
    await pending
    rejectRecheck(new Error('late close'))
    await Promise.resolve()

    expect(removeUpdated).toHaveBeenCalledOnce()
    expect(removeRemoved).toHaveBeenCalledOnce()
  })
})
