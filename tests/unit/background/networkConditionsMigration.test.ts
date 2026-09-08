import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  applyNetworkConditions,
  clearNetworkConditions
} from '../../../extension/background/browserMcp/emulation'

interface SentCommand {
  method: string
  params: unknown
}

function getDebuggerMock() {
  return chrome.debugger as unknown as { sendCommand: ReturnType<typeof vi.fn> }
}

function recordCommands(
  responses: Record<string, string> = {}
): SentCommand[] {
  const sent: SentCommand[] = []
  getDebuggerMock().sendCommand.mockImplementation((...args: unknown[]) => {
    const method = args[1] as string
    const params = args[2]
    const callback = args.at(-1) as (result: unknown) => void
    sent.push({ method, params })
    const error = responses[method]
    if (error) {
      Object.defineProperty(chrome.runtime, 'lastError', {
        configurable: true,
        value: { message: error }
      })
      callback({})
      Object.defineProperty(chrome.runtime, 'lastError', { configurable: true, value: undefined })
      return
    }
    callback({})
  })
  return sent
}

const FAST_3G = {
  offline: false,
  downloadThroughput: 180000,
  uploadThroughput: 84375,
  latency: 562
}

const NO_THROTTLING = {
  offline: false,
  latency: 0,
  downloadThroughput: -1,
  uploadThroughput: -1
}

beforeEach(() => {
  Object.assign(chrome, {
    debugger: {
      sendCommand: vi.fn(),
      onDetach: { addListener: vi.fn(), removeListener: vi.fn() }
    }
  })
})

describe('applyNetworkConditions', () => {
  it('uses the by-rule pair with the required top-level offline state', async () => {
    const sent = recordCommands()

    await expect(applyNetworkConditions({ tabId: 501 }, FAST_3G)).resolves.toBe('by-rule')

    expect(sent).toEqual([
      {
        method: 'Network.emulateNetworkConditionsByRule',
        params: {
          offline: false,
          matchedNetworkConditions: [{
            urlPattern: '',
            latency: 562,
            downloadThroughput: 180000,
            uploadThroughput: 84375
          }]
        }
      },
      { method: 'Network.overrideNetworkState', params: FAST_3G }
    ])
  })

  it('sets top-level offline for the offline preset', async () => {
    const sent = recordCommands()
    const offline = {
      offline: true,
      downloadThroughput: 0,
      uploadThroughput: 0,
      latency: 0
    }

    await expect(applyNetworkConditions({ tabId: 508 }, offline)).resolves.toBe('by-rule')
    expect(sent[0].params).toMatchObject({
      offline: true,
      matchedNetworkConditions: [{ urlPattern: '' }]
    })
    expect(sent[1]).toEqual({
      method: 'Network.overrideNetworkState',
      params: offline
    })
  })

  it('falls back only when the by-rule command is unsupported', async () => {
    const sent = recordCommands({
      'Network.emulateNetworkConditionsByRule': "'Network.emulateNetworkConditionsByRule' wasn't found"
    })

    await expect(applyNetworkConditions({ tabId: 502 }, FAST_3G)).resolves.toBe('legacy')
    expect(sent.map(entry => entry.method)).toEqual([
      'Network.emulateNetworkConditionsByRule',
      'Network.emulateNetworkConditions'
    ])
    expect(sent[1].params).toEqual(FAST_3G)
  })

  it('removes a partial rule before the unsupported-state fallback', async () => {
    const sent = recordCommands({
      'Network.overrideNetworkState': "'Network.overrideNetworkState' wasn't found"
    })

    await expect(applyNetworkConditions({ tabId: 503 }, FAST_3G)).resolves.toBe('legacy')
    expect(sent.map(entry => entry.method)).toEqual([
      'Network.emulateNetworkConditionsByRule',
      'Network.overrideNetworkState',
      'Network.emulateNetworkConditionsByRule',
      'Network.emulateNetworkConditions'
    ])
    expect(sent[2].params).toEqual({ offline: false, matchedNetworkConditions: [] })
  })

  it('reports policy failure and does not fall back to the deprecated command', async () => {
    const sent = recordCommands({
      'Network.overrideNetworkState': 'Host access is restricted by policy.'
    })

    await expect(applyNetworkConditions({ tabId: 504 }, FAST_3G))
      .rejects.toThrow('Host access is restricted by policy.')
    expect(sent.map(entry => entry.method)).toEqual([
      'Network.emulateNetworkConditionsByRule',
      'Network.overrideNetworkState',
      'Network.emulateNetworkConditionsByRule'
    ])
  })
})

describe('clearNetworkConditions', () => {
  it('drops all rules with offline false and resets navigator state', async () => {
    const sent = recordCommands()

    await expect(clearNetworkConditions({ tabId: 505 })).resolves.toBe('by-rule')
    expect(sent).toEqual([
      {
        method: 'Network.emulateNetworkConditionsByRule',
        params: { offline: false, matchedNetworkConditions: [] }
      },
      { method: 'Network.overrideNetworkState', params: NO_THROTTLING }
    ])
  })

  it('uses the deprecated reset only when the rule command is unsupported', async () => {
    const sent = recordCommands({
      'Network.emulateNetworkConditionsByRule': 'Method not found'
    })

    await expect(clearNetworkConditions({ tabId: 506 })).resolves.toBe('legacy')
    expect(sent.map(entry => entry.method)).toEqual([
      'Network.emulateNetworkConditionsByRule',
      'Network.emulateNetworkConditions'
    ])
    expect(sent[1].params).toEqual(NO_THROTTLING)
  })

  it('does not hide a policy failure behind the legacy fallback', async () => {
    const sent = recordCommands({
      'Network.emulateNetworkConditionsByRule': 'Host access is restricted by policy.'
    })

    await expect(clearNetworkConditions({ tabId: 507 }))
      .rejects.toThrow('Host access is restricted by policy.')
    expect(sent.map(entry => entry.method)).toEqual([
      'Network.emulateNetworkConditionsByRule'
    ])
  })
})
