import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../extension/background/websocket', () => ({
  sendToWebSocket: vi.fn()
}))

import {
  handleBrowserEmulateClear,
  handleBrowserEmulateGeolocation
} from '../../../extension/background/browserMcp/emulation'
import { sendToWebSocket } from '../../../extension/background/websocket'

type DebuggerMock = {
  attach: ReturnType<typeof vi.fn>
  detach: ReturnType<typeof vi.fn>
  sendCommand: ReturnType<typeof vi.fn>
}

function debuggerMock(): DebuggerMock {
  return chrome.debugger as unknown as DebuggerMock
}

function mockPermissionState(state: string | null, asException = false): void {
  debuggerMock().sendCommand.mockImplementation(
    (_target: unknown, method: string, _params: unknown, callback?: (result: unknown) => void) => {
      if (method !== 'Runtime.evaluate') {
        callback?.({})
        return
      }
      if (state === null) {
        Object.defineProperty(chrome.runtime, 'lastError', {
          configurable: true,
          value: { message: 'Target closed' }
        })
        callback?.(undefined)
        Object.defineProperty(chrome.runtime, 'lastError', { configurable: true, value: undefined })
        return
      }
      callback?.(asException
        ? { exceptionDetails: { text: 'Permissions API unavailable' } }
        : { result: { type: 'string', value: state } })
    }
  )
}

function lastResult(): Record<string, unknown> {
  return vi.mocked(sendToWebSocket).mock.calls.at(-1)![0] as Record<string, unknown>
}

function callsFor(method: string): unknown[][] {
  return debuggerMock().sendCommand.mock.calls.filter(call => call[1] === method)
}

async function clear(tabId: number): Promise<void> {
  await handleBrowserEmulateClear({ requestId: `clear-${tabId}`, tabId })
}

describe('geolocation permission observation', () => {
  beforeEach(() => {
    Object.assign(chrome, {
      debugger: {
        attach: vi.fn().mockResolvedValue(undefined),
        detach: vi.fn().mockResolvedValue(undefined),
        sendCommand: vi.fn(),
        onDetach: { addListener: vi.fn(), removeListener: vi.fn() }
      }
    })
    vi.mocked(chrome.tabs.get).mockImplementation(async tabId => ({
      id: tabId,
      groupId: -1,
      url: 'https://maps.example.test/private/path?token=not-returned'
    } as chrome.tabs.Tab))
    vi.mocked(sendToWebSocket).mockClear()
  })

  afterEach(() => {
    Object.defineProperty(chrome.runtime, 'lastError', { configurable: true, value: undefined })
    delete (chrome as unknown as { contentSettings?: unknown }).contentSettings
  })

  it.each([
    ['granted', true],
    ['prompt', false],
    ['denied', false]
  ] as const)('reports the observed %s site permission', async (state, granted) => {
    const tabId = state === 'granted' ? 901 : state === 'prompt' ? 902 : 903
    mockPermissionState(state)

    await handleBrowserEmulateGeolocation({
      requestId: `geo-${state}`,
      tabId,
      latitude: 39.7392,
      longitude: -104.9903,
      accuracy: 0
    })

    expect(lastResult()).toMatchObject({
      type: 'browser-emulate-geolocation-result',
      success: true,
      permissionState: state,
      permissionGranted: granted,
      accuracy: 0
    })
    expect(lastResult().permissionNote).toContain('https://maps.example.test')
    expect(lastResult().permissionNote).not.toContain('/private/path')
    await clear(tabId)
  })

  it('reports unknown when the Permissions API read fails or returns an exception', async () => {
    mockPermissionState(null)
    await handleBrowserEmulateGeolocation({
      requestId: 'geo-read-failure',
      tabId: 904,
      latitude: 1,
      longitude: 2
    })
    expect(lastResult()).toMatchObject({
      success: true,
      permissionState: 'unknown',
      permissionGranted: false
    })
    expect(lastResult().permissionNote).toContain('could not be read')
    await clear(904)

    mockPermissionState('granted', true)
    await handleBrowserEmulateGeolocation({
      requestId: 'geo-exception',
      tabId: 905,
      latitude: 1,
      longitude: 2
    })
    expect(lastResult()).toMatchObject({
      success: true,
      permissionState: 'unknown',
      permissionGranted: false
    })
    await clear(905)
  })

  it('never attempts to grant permission through Browser or contentSettings APIs', async () => {
    const contentSettingsSet = vi.fn()
    ;(chrome as unknown as { contentSettings: unknown }).contentSettings = {
      location: { set: contentSettingsSet }
    }
    mockPermissionState('prompt')

    await handleBrowserEmulateGeolocation({
      requestId: 'geo-no-grant',
      tabId: 906,
      latitude: 1,
      longitude: 2
    })

    expect(contentSettingsSet).not.toHaveBeenCalled()
    expect(callsFor('Browser.grantPermissions')).toHaveLength(0)
    expect(callsFor('Browser.setPermission')).toHaveLength(0)
    expect(callsFor('Emulation.setGeolocationOverride')).toHaveLength(1)
    await clear(906)
  })

  it('clear forwards only a clear outcome and does not probe permission', async () => {
    mockPermissionState('granted')

    await handleBrowserEmulateGeolocation({
      requestId: 'geo-clear',
      tabId: 907,
      clear: true
    })

    expect(lastResult()).toEqual({
      type: 'browser-emulate-geolocation-result',
      requestId: 'geo-clear',
      success: true,
      message: 'Geolocation override cleared'
    })
    expect(callsFor('Runtime.evaluate')).toHaveLength(0)
    await clear(907)
  })
})
