import { describe, expect, it, beforeEach, vi } from 'vitest'

vi.mock('../../../extension/background/websocket', () => ({ sendToWebSocket: vi.fn() }))

import { markEmulatedTabDetached, withDebugger } from '../../../extension/background/browserMcp/debugger'
import {
  isEmulatedTabAttached,
  handleBrowserEmulateDevice,
  handleBrowserEmulateClear
} from '../../../extension/background/browserMcp/emulation'

beforeEach(() => {
  Object.assign(chrome, {
    debugger: {
      attach: vi.fn().mockResolvedValue(undefined),
      detach: vi.fn().mockResolvedValue(undefined),
      sendCommand: vi.fn((_target, _method, _params, callback) => callback?.({})),
      onEvent: { addListener: vi.fn(), removeListener: vi.fn() },
      onDetach: { addListener: vi.fn(), removeListener: vi.fn() }
    }
  })
  vi.mocked(chrome.tabs.get).mockImplementation(async tabId => ({ id: tabId, groupId: -1, url: 'https://example.test/' } as chrome.tabs.Tab))
})

// These tests verify the fix for: emulation.ts keeps a persistent
// chrome.debugger attachment on an emulated tab, and withDebugger() in
// debugger.ts must reuse that attachment (skip attach and skip detach)
// instead of racing a second chrome.debugger.attach() call, which used to
// fail with "Another debugger is already attached" and made execute_script
// silently fall back to the whitelist path.

function getDebuggerMock() {
  return (globalThis as any).chrome.debugger as {
    attach: ReturnType<typeof vi.fn>
    detach: ReturnType<typeof vi.fn>
    sendCommand: ReturnType<typeof vi.fn>
  }
}

describe('withDebugger reuse under active emulation', () => {
  beforeEach(() => {
    const dbg = getDebuggerMock()
    dbg.attach.mockClear()
    dbg.detach.mockClear()
    dbg.sendCommand.mockClear()
  })

  it('attaches and detaches normally when the tab has no emulation attachment', async () => {
    const tabId = 101
    expect(isEmulatedTabAttached(tabId)).toBe(false)

    const dbg = getDebuggerMock()
    await withDebugger(tabId, async () => 'ok')

    expect(dbg.attach).toHaveBeenCalledTimes(1)
    expect(dbg.detach).toHaveBeenCalledTimes(1)
  })

  it('reuses the emulation attachment: no second attach, no detach on completion', async () => {
    const tabId = 202
    const dbg = getDebuggerMock()

    // Simulate emulation.ts holding a persistent attachment on this tab.
    await handleBrowserEmulateDevice({
      requestId: 'req-1',
      tabId,
      device: 'iPhone_14'
    })
    expect(isEmulatedTabAttached(tabId)).toBe(true)

    dbg.attach.mockClear()
    dbg.detach.mockClear()

    const result = await withDebugger(tabId, async () => 'reused')

    expect(result).toBe('reused')
    // withDebugger must not race a second attach or detach the shared
    // attachment; emulation.ts owns its lifecycle.
    expect(dbg.attach).not.toHaveBeenCalled()
    expect(dbg.detach).not.toHaveBeenCalled()
    expect(isEmulatedTabAttached(tabId)).toBe(true)

    // Clean up: clearing emulation should detach and drop the tracked tab.
    await handleBrowserEmulateClear({ requestId: 'req-2', tabId })
    expect(isEmulatedTabAttached(tabId)).toBe(false)
  })

  it('rolls back only a newly acquired emulation owner when the first command fails', async () => {
    const tabId = 303
    const dbg = getDebuggerMock()
    dbg.sendCommand.mockImplementation((_target, method, _params, callback) => {
      if (method === 'Emulation.setDeviceMetricsOverride') {
        throw new Error('first command failed')
      }
      callback?.({})
    })

    await handleBrowserEmulateDevice({ requestId: 'failed-first', tabId, device: 'iPhone_14' })

    expect(isEmulatedTabAttached(tabId)).toBe(false)
    expect(dbg.attach).toHaveBeenCalledTimes(1)
    expect(dbg.detach).toHaveBeenCalledTimes(1)
  })

  it('preserves an existing emulation owner when a later command fails', async () => {
    const tabId = 304
    const dbg = getDebuggerMock()
    await handleBrowserEmulateDevice({ requestId: 'first-success', tabId, device: 'iPhone_14' })
    expect(isEmulatedTabAttached(tabId)).toBe(true)

    dbg.attach.mockClear()
    dbg.detach.mockClear()
    dbg.sendCommand.mockImplementation(() => { throw new Error('later command failed') })
    await handleBrowserEmulateDevice({ requestId: 'later-failure', tabId, device: 'Pixel_7' })

    expect(isEmulatedTabAttached(tabId)).toBe(true)
    expect(dbg.attach).not.toHaveBeenCalled()
    expect(dbg.detach).not.toHaveBeenCalled()
    markEmulatedTabDetached(tabId)
  })
})
