import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/background/websocket', () => ({ sendToWebSocket: vi.fn() }))

import { sendToWebSocket } from '@/background/websocket'
import { handleBrowserCloseTab } from '@/background/browserMcp/tabs'
import { bindAgentGroup, resetAgentGroupStateForTests } from '@/background/browserMcp/tabGroups'

describe('owned tab close cleanup', () => {
  const tabs = new Map<number, chrome.tabs.Tab>()

  beforeEach(() => {
    resetAgentGroupStateForTests()
    tabs.clear()
    ;(chrome as typeof chrome & { tabGroups: Partial<typeof chrome.tabGroups> }).tabGroups = {
      TAB_GROUP_ID_NONE: -1,
      get: vi.fn(async (id: number) => ({ id, title: '', color: 'purple', collapsed: false, windowId: 1, shared: false }))
    }
    chrome.tabs.get = vi.fn(async id => {
      const tab = tabs.get(id)
      if (!tab) throw new Error('missing')
      return { ...tab }
    })
    chrome.tabs.query = vi.fn(async ({ groupId }) => [...tabs.values()].filter(tab => tab.groupId === groupId))
    chrome.tabs.ungroup = vi.fn(async ids => {
      for (const id of Array.isArray(ids) ? ids : [ids]) if (tabs.has(id)) tabs.get(id)!.groupId = -1
    })
    chrome.tabs.remove = vi.fn(async id => {
      for (const tabId of Array.isArray(id) ? id : [id]) tabs.delete(tabId)
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
    resetAgentGroupStateForTests()
  })

  it('ungroups the complete owned group before closing it', async () => {
    tabs.set(11, { id: 11, groupId: 10 } as chrome.tabs.Tab)
    tabs.set(12, { id: 12, groupId: 10 } as chrome.tabs.Tab)
    await bindAgentGroup('alpha', 10)

    await handleBrowserCloseTab({ requestId: 'close', tabIds: [11, 12], agent: 'alpha' })

    expect(chrome.tabs.ungroup).toHaveBeenCalledWith([11, 12])
    expect(vi.mocked(chrome.tabs.ungroup).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(chrome.tabs.remove).mock.invocationCallOrder[0])
  })

  it('does not dissolve the group when an owned tab remains', async () => {
    tabs.set(11, { id: 11, groupId: 10 } as chrome.tabs.Tab)
    tabs.set(12, { id: 12, groupId: 10 } as chrome.tabs.Tab)
    await bindAgentGroup('alpha', 10)

    await handleBrowserCloseTab({ requestId: 'close-one', tabIds: [11], agent: 'alpha' })

    expect(chrome.tabs.ungroup).not.toHaveBeenCalled()
    expect(chrome.tabs.remove).toHaveBeenCalledWith(11)
  })

  it('never lets named force close another agent or user tab', async () => {
    tabs.set(11, { id: 11, groupId: 10 } as chrome.tabs.Tab)
    tabs.set(20, { id: 20, groupId: 20 } as chrome.tabs.Tab)
    tabs.set(30, { id: 30, groupId: -1 } as chrome.tabs.Tab)
    await bindAgentGroup('alpha', 10)
    await bindAgentGroup('beta', 20)

    await handleBrowserCloseTab({ requestId: 'force', tabIds: [20, 30], force: true, agent: 'alpha' })

    expect(chrome.tabs.remove).not.toHaveBeenCalled()
    expect(sendToWebSocket).toHaveBeenCalledWith(expect.objectContaining({
      type: 'browser-close-tab-result', success: true,
      refused: [expect.objectContaining({ tabId: 20 }), expect.objectContaining({ tabId: 30 })]
    }))
  })
})
