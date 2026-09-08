import { describe, expect, it, beforeEach, vi } from 'vitest'

vi.mock('../../../extension/background/websocket', () => ({ sendToWebSocket: vi.fn() }))

import {
  attachWithBusyRetry,
  debuggerAttachError,
  enterprisePolicyDebuggerMessage,
  isEnterprisePolicyDebuggerError,
  withDebugger
} from '../../../extension/background/browserMcp/debugger'

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
})

// ExtensionSettings runtime_blocked_hosts and DisableScreenshots / DLP make
// chrome.debugger.attach() fail on every target, so on a managed laptop each
// debugger-backed tool degrades at once. The mapping below is what turns that
// into one explanation instead of a bare Chrome string per tool.

const HOST_POLICY_MESSAGE = 'Host access is restricted by policy.'
const SCREENSHOT_POLICY_MESSAGE = 'Screenshot capture is restricted by policy.'

function getDebuggerMock() {
  return (globalThis as any).chrome.debugger as {
    attach: ReturnType<typeof vi.fn>
    detach: ReturnType<typeof vi.fn>
    sendCommand: ReturnType<typeof vi.fn>
  }
}

describe('enterprise policy debugger attach failures', () => {
  beforeEach(() => {
    const dbg = getDebuggerMock()
    dbg.attach.mockReset()
    dbg.detach.mockReset()
    dbg.attach.mockResolvedValue(undefined)
    dbg.detach.mockResolvedValue(undefined)
  })

  it('recognises both documented policy strings, case-insensitively', () => {
    expect(isEnterprisePolicyDebuggerError(new Error(HOST_POLICY_MESSAGE))).toBe(true)
    expect(isEnterprisePolicyDebuggerError(new Error(SCREENSHOT_POLICY_MESSAGE))).toBe(true)
    expect(isEnterprisePolicyDebuggerError('host access is restricted by policy')).toBe(true)
    expect(
      isEnterprisePolicyDebuggerError(new Error('SCREENSHOT CAPTURE IS RESTRICTED BY POLICY.'))
    ).toBe(true)
  })

  it('leaves unrelated attach failures alone', () => {
    expect(isEnterprisePolicyDebuggerError(new Error('Another debugger is already attached'))).toBe(false)
    expect(isEnterprisePolicyDebuggerError(new Error('Cannot access a chrome:// URL'))).toBe(false)
  })

  it('maps a policy failure to the stable message and keeps Chrome own words', () => {
    const mapped = debuggerAttachError(7, new Error(HOST_POLICY_MESSAGE))
    expect(mapped.name).toBe('DebuggerAttachError')
    expect(mapped.message).toBe(enterprisePolicyDebuggerMessage(HOST_POLICY_MESSAGE))
    expect(mapped.message).toContain(HOST_POLICY_MESSAGE)
    expect(mapped.message).toContain('blocked by enterprise policy')
    expect(mapped.message).toContain('ExtensionSettings runtime_blocked_hosts')
    expect(mapped.message).toContain('DisableScreenshots')
    expect(mapped.message).not.toContain('retry')
  })

  it('names likely debugger holders and asks the person to release them', () => {
    expect(debuggerAttachError(7, new Error('Another debugger is already attached')).message)
      .toBe('Debugger busy on tab 7; ask the user to close/disable DevTools, a password manager/inline-autofill extension, or an earlier deep-capture session, not retry.')
  })

  it('keeps busy guidance under 200 characters even for a large tab id', () => {
    expect(debuggerAttachError(2147483647, new Error('Another debugger is already attached')).message.length)
      .toBeLessThan(200)
  })

  it('surfaces the policy message without retrying the attach', async () => {
    const dbg = getDebuggerMock()
    dbg.attach.mockRejectedValue(new Error(SCREENSHOT_POLICY_MESSAGE))

    await expect(attachWithBusyRetry({ tabId: 401 }, 401)).rejects.toThrow(
      enterprisePolicyDebuggerMessage(SCREENSHOT_POLICY_MESSAGE)
    )
    expect(dbg.attach).toHaveBeenCalledTimes(1)
    expect(dbg.detach).not.toHaveBeenCalled()
  })

  it('reaches every debugger-backed tool through withDebugger', async () => {
    const dbg = getDebuggerMock()
    dbg.attach.mockRejectedValue(new Error(HOST_POLICY_MESSAGE))
    const body = vi.fn()

    await expect(withDebugger(402, async () => body())).rejects.toThrow(
      enterprisePolicyDebuggerMessage(HOST_POLICY_MESSAGE)
    )
    expect(body).not.toHaveBeenCalled()
  })
})
