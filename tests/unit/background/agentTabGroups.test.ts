import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/background/websocket', () => ({ sendToWebSocket: vi.fn() }))
vi.mock('@/background/browserMcp/documentProtection', () => ({
  subscribeToDocumentProtection: vi.fn(() => () => undefined),
  runWithDocumentAdmission: vi.fn(async (_tabId: number, fn: () => Promise<unknown>) => fn()),
  assertDocumentCaptureAllowed: vi.fn(async (tabId: number) => ({ tabId, documentId: 'doc-test', generation: 0 })),
  assertDocumentReadCurrent: vi.fn(async () => undefined),
  assertProtectedDocumentCurrent: vi.fn(async () => undefined),
  canCaptureDocumentSync: vi.fn(() => true)
}))

import { sendToWebSocket } from '@/background/websocket'
import {
  addTabToClaudeGroupInternal,
  assertTabInAgentGroup,
  bindAgentGroup,
  getAgentForGroup,
  getClaudeActiveGroupId,
  releaseAgentGroupInternal,
  subscribeToTabOwnershipChanges,
  resetAgentGroupStateForTests,
  resolveAgentTab,
  handleBrowserAddToTabGroup,
  handleBrowserCreateTabGroup
} from '@/background/browserMcp/tabGroups'
import { handleBrowserOpenUrl } from '@/background/browserMcp/tabs'
import { handleBrowserCreateWindow } from '@/background/browserMcp/windows'
import { captureConsoleLog, getConsoleLogs } from '@/background/consoleCapture'

describe('per-agent tab groups', () => {
  const tabs = new Map<number, chrome.tabs.Tab>()
  const groups = new Map<number, chrome.tabGroups.TabGroup>()
  const session: Record<string, unknown> = {}
  let nextGroupId = 100

  beforeEach(() => {
    resetAgentGroupStateForTests()
    tabs.clear()
    groups.clear()
    nextGroupId = 100
    for (const key of Object.keys(session)) delete session[key]
    Object.defineProperty(chrome.runtime, 'id', { configurable: true, value: 'test-extension-id' })
    ;(chrome.storage as typeof chrome.storage & { session: Partial<typeof chrome.storage.session> }).session = {
      get: vi.fn(async (key: string) => key in session ? { [key]: session[key] } : {}),
      set: vi.fn(async (items: Record<string, unknown>) => { Object.assign(session, items) })
    }
    ;(chrome as typeof chrome & { tabGroups: Partial<typeof chrome.tabGroups> }).tabGroups = {
      TAB_GROUP_ID_NONE: -1,
      get: vi.fn(async (groupId: number) => {
        const group = groups.get(groupId)
        if (!group) throw new Error(`Group ${groupId} not found`)
        return group
      }),
      update: vi.fn(async (groupId: number, props: chrome.tabGroups.UpdateProperties) => {
        const group = groups.get(groupId)
        if (!group) throw new Error(`Group ${groupId} not found`)
        Object.assign(group, props)
        return group
      }),
      query: vi.fn(async () => [...groups.values()])
    }
    chrome.tabs.get = vi.fn(async (tabId: number) => {
      const tab = tabs.get(tabId)
      if (!tab) throw new Error(`Tab ${tabId} not found`)
      return { ...tab }
    })
    chrome.tabs.query = vi.fn(async (query: chrome.tabs.QueryInfo) => {
      const values = [...tabs.values()]
      if (query.groupId !== undefined) return values.filter(tab => tab.groupId === query.groupId).map(tab => ({ ...tab }))
      if (query.active) return values.filter(tab => tab.active).map(tab => ({ ...tab }))
      return values.map(tab => ({ ...tab }))
    })
    chrome.tabs.group = vi.fn(async ({ tabIds, groupId }: chrome.tabs.GroupOptions) => {
      const ids = Array.isArray(tabIds) ? tabIds : [tabIds]
      const assigned = groupId ?? nextGroupId++
      if (!groups.has(assigned)) groups.set(assigned, {
        id: assigned, title: '', color: 'purple', collapsed: false, windowId: 1, shared: false
      })
      for (const id of ids) {
        const tab = tabs.get(id)
        if (!tab) throw new Error(`Tab ${id} not found`)
        tab.groupId = assigned
      }
      return assigned
    })
    chrome.tabs.ungroup = vi.fn(async (tabIds: number | number[]) => {
      for (const id of Array.isArray(tabIds) ? tabIds : [tabIds]) {
        const tab = tabs.get(id)
        if (tab) tab.groupId = -1
      }
    })
    chrome.tabs.create = vi.fn(async ({ url, active }) => {
      const tab = { id: 900 + tabs.size, url: url as string, active, groupId: -1, windowId: 1 } as chrome.tabs.Tab
      tabs.set(tab.id!, tab)
      return { ...tab }
    })
    chrome.tabs.update = vi.fn(async (tabId: number, props: chrome.tabs.UpdateProperties) => {
      const tab = tabs.get(tabId)
      if (!tab) throw new Error(`Tab ${tabId} not found`)
      Object.assign(tab, props)
      return { ...tab }
    })
    chrome.tabs.remove = vi.fn(async (tabId: number | number[]) => {
      for (const id of Array.isArray(tabId) ? tabId : [tabId]) tabs.delete(id)
    })
    chrome.windows.update = vi.fn(async () => ({} as chrome.windows.Window))
    chrome.windows.create = vi.fn(async () => {
      const id = 50 + tabs.size
      const tab = { id, url: `https://window.test/${id}`, groupId: -1, windowId: id, active: true } as chrome.tabs.Tab
      tabs.set(id, tab)
      return { id, focused: true, type: 'normal', state: 'normal', tabs: [{ ...tab }] } as chrome.windows.Window
    })
    chrome.windows.remove = vi.fn(async () => undefined)
  })

  afterEach(() => {
    vi.clearAllMocks()
    resetAgentGroupStateForTests()
  })

  function addTab(id: number, groupId = -1, url = `https://example.test/${id}`): void {
    tabs.set(id, { id, groupId, url, windowId: 1, active: false } as chrome.tabs.Tab)
    if (groupId !== -1 && !groups.has(groupId)) groups.set(groupId, {
      id: groupId, title: '', color: 'purple', collapsed: false, windowId: 1, shared: false
    })
  }

  it('invalidates capture ownership before group release and re-adoption mutations', async () => {
    tabs.set(41, { id: 41, groupId: -1, windowId: 1, url: 'https://example.test/' } as chrome.tabs.Tab)
    const seen: Array<{ tabId: number; groupId: number | undefined }> = []
    const unsubscribe = subscribeToTabOwnershipChanges(tabId => seen.push({ tabId, groupId: tabs.get(tabId)?.groupId }))
    try {
      await addTabToClaudeGroupInternal(41, 'alpha')
      const assigned = tabs.get(41)!.groupId
      await releaseAgentGroupInternal('alpha')
      await addTabToClaudeGroupInternal(41, 'alpha')
      expect(seen).toEqual([{ tabId: 41, groupId: -1 }, { tabId: 41, groupId: assigned }, { tabId: 41, groupId: -1 }])
    } finally { unsubscribe() }
  })

  it('keeps independent bindings and capture-time group owners', async () => {
    addTab(1, 10)
    addTab(2, 20)
    await bindAgentGroup('alpha', 10)
    await bindAgentGroup('beta', 20)

    await expect(getClaudeActiveGroupId('alpha')).resolves.toBe(10)
    await expect(getClaudeActiveGroupId('beta')).resolves.toBe(20)
    await expect(getAgentForGroup(10)).resolves.toBe('alpha')
  })

  it('keeps a console row bound to its capture-time owner after later group changes', async () => {
    addTab(7, 10)
    await bindAgentGroup('alpha', 10)
    const marker = `owned-${Date.now()}-${Math.random()}`
    const stamped = await captureConsoleLog({
      level: 'error', message: marker, timestamp: Date.now(), url: 'https://example.test', tabId: 7
    }, tabs.get(7), 'doc-test')

    await releaseAgentGroupInternal('alpha')
    addTab(8, 10)
    await bindAgentGroup('beta', 10)

    expect(stamped).toMatchObject({ groupId: 10, agent: 'alpha' })
    expect(getConsoleLogs({ level: 'all', limit: 1000 }).find(row => row.message === marker))
      .toMatchObject({ groupId: 10, agent: 'alpha' })
  })

  it('does not give a fresh named caller the browser-wide active tab or another agent tab', async () => {
    addTab(7, 10)
    tabs.get(7)!.active = true
    await bindAgentGroup('alpha', 10)

    await expect(resolveAgentTab('beta')).rejects.toThrow('has no tab group')
    await expect(assertTabInAgentGroup('beta', 7)).rejects.toThrow('has no tab group')
    expect(chrome.tabs.query).not.toHaveBeenCalledWith({ active: true, lastFocusedWindow: true })
  })

  it('serializes two same-agent creations into one group', async () => {
    addTab(7)
    addTab(8)

    const [first, second] = await Promise.all([
      addTabToClaudeGroupInternal(7, 'alpha', 'Alpha'),
      addTabToClaudeGroupInternal(8, 'alpha', 'Alpha')
    ])

    expect(first.groupId).toBe(second.groupId)
    expect(chrome.tabs.group).toHaveBeenNthCalledWith(1, { tabIds: [7] })
    expect(chrome.tabs.group).toHaveBeenNthCalledWith(2, { tabIds: [8], groupId: first.groupId })
  })

  it('serializes cross-agent adoption and rejects the loser after revalidation', async () => {
    addTab(7)
    const outcomes = await Promise.allSettled([
      addTabToClaudeGroupInternal(7, 'alpha'),
      addTabToClaudeGroupInternal(7, 'beta')
    ])

    expect(outcomes.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(outcomes.filter(result => result.status === 'rejected')).toHaveLength(1)
    expect((outcomes.find(result => result.status === 'rejected') as PromiseRejectedResult).reason.message)
      .toContain('another browser agent')
  })

  it('revalidates generic add-to-group adoption inside the shared mutation queue', async () => {
    addTab(1, 10)
    addTab(2, 20)
    addTab(7)
    await bindAgentGroup('alpha', 10)
    await bindAgentGroup('beta', 20)
    vi.mocked(sendToWebSocket).mockClear()

    await Promise.all([
      handleBrowserAddToTabGroup({ requestId: 'add-a', groupId: 10, tabIds: [7], agent: 'alpha' }),
      handleBrowserAddToTabGroup({ requestId: 'add-b', groupId: 20, tabIds: [7], agent: 'beta' })
    ])

    const results = vi.mocked(sendToWebSocket).mock.calls.map(([message]) => message as { success: boolean })
    expect(results.filter(result => result.success)).toHaveLength(1)
    expect(results.filter(result => !result.success)).toHaveLength(1)
  })

  it('does not let two fresh agents create groups from the same tab concurrently', async () => {
    addTab(7)
    vi.mocked(sendToWebSocket).mockClear()

    await Promise.all([
      handleBrowserCreateTabGroup({ requestId: 'create-a', tabIds: [7], agent: 'alpha' }),
      handleBrowserCreateTabGroup({ requestId: 'create-b', tabIds: [7], agent: 'beta' })
    ])

    const results = vi.mocked(sendToWebSocket).mock.calls.map(([message]) => message as { success: boolean })
    expect(results.filter(result => result.success)).toHaveLength(1)
    expect(results.filter(result => !result.success)).toHaveLength(1)
  })

  it('invalidates an in-flight create and compensates only its late group', async () => {
    addTab(7)
    let finish!: () => void
    const pending = new Promise<void>(resolve => { finish = resolve })
    vi.mocked(chrome.tabs.group).mockImplementationOnce(async ({ tabIds }) => {
      await pending
      const id = Array.isArray(tabIds) ? tabIds[0] : tabIds
      tabs.get(id)!.groupId = 99
      groups.set(99, { id: 99, title: '', color: 'purple', collapsed: false, windowId: 1, shared: false })
      return 99
    })

    const adding = addTabToClaudeGroupInternal(7, 'alpha')
    while (!vi.mocked(chrome.tabs.group).mock.calls.length) await Promise.resolve()
    const releasing = releaseAgentGroupInternal('alpha')
    finish()

    await expect(adding).rejects.toThrow('reservation expired')
    await expect(releasing).resolves.toEqual({ groupId: null, ungroupedCount: 0 })
    expect(chrome.tabs.ungroup).toHaveBeenCalledWith([7])
    await expect(getClaudeActiveGroupId('alpha')).resolves.toBeNull()
  })

  it('does not compensate over a tab moved elsewhere while Chrome was pending', async () => {
    addTab(7)
    let finish!: () => void
    const pending = new Promise<void>(resolve => { finish = resolve })
    vi.mocked(chrome.tabs.group).mockImplementationOnce(async () => {
      await pending
      groups.set(99, { id: 99, title: '', color: 'purple', collapsed: false, windowId: 1, shared: false })
      return 99
    })
    const adding = addTabToClaudeGroupInternal(7, 'alpha')
    while (!vi.mocked(chrome.tabs.group).mock.calls.length) await Promise.resolve()
    const releasing = releaseAgentGroupInternal('alpha')
    tabs.get(7)!.groupId = 77
    finish()

    await expect(adding).rejects.toThrow('reservation expired')
    await releasing
    expect(chrome.tabs.ungroup).not.toHaveBeenCalled()
    expect(tabs.get(7)?.groupId).toBe(77)
  })

  it('counts pending capacity and never mutates Chrome for the refused agent', async () => {
    for (let index = 0; index < 64; index += 1) {
      addTab(index, 1000 + index)
      await bindAgentGroup(`agent-${index}`, 1000 + index)
    }
    addTab(999)
    vi.mocked(chrome.tabs.group).mockClear()

    await expect(addTabToClaudeGroupInternal(999, 'overflow')).rejects.toThrow('capacity reached')
    expect(chrome.tabs.group).not.toHaveBeenCalled()
    expect(tabs.get(999)?.groupId).toBe(-1)
  })

  it('rejects both owners from corrupt persisted duplicate bindings after restart', async () => {
    session.browserMcpAgentGroupState = {
      groupIds: { alpha: 10, beta: 10 }, colors: { alpha: 'purple', beta: 'blue' }, nextColor: 2
    }
    addTab(7, 10)
    vi.resetModules()
    const restarted = await import('@/background/browserMcp/tabGroups')

    await expect(restarted.getClaudeActiveGroupId('alpha')).resolves.toBeNull()
    await expect(restarted.getClaudeActiveGroupId('beta')).resolves.toBeNull()
    await expect(restarted.getAgentForGroup(10)).resolves.toBeNull()
  })

  it('reuses the owned same-URL tab even when an earlier match belongs elsewhere', async () => {
    addTab(1, 20, 'https://same.test/')
    addTab(2, 10, 'https://same.test/')
    await bindAgentGroup('alpha', 10)

    await handleBrowserOpenUrl({
      requestId: 'reuse', url: 'https://same.test/', newTab: true,
      background: false, reuseExisting: true, agent: 'alpha'
    })

    expect(chrome.tabs.update).toHaveBeenCalledWith(2, { active: true })
    expect(sendToWebSocket).toHaveBeenCalledWith(expect.objectContaining({
      type: 'browser-open-url-result', requestId: 'reuse', success: true, tabId: 2, reused: true
    }))
  })

  it('never returns a protected stale target URL when navigation returns no tab', async () => {
    const sentinel = 'SYNTHETIC-SAVED-VALUE'
    addTab(1, 10, `https://example.test/private/${sentinel}?value=${sentinel}`)
    await bindAgentGroup('alpha', 10)
    vi.mocked(chrome.tabs.update).mockResolvedValueOnce(undefined as unknown as chrome.tabs.Tab)

    await handleBrowserOpenUrl({
      requestId: 'navigate-no-tab', url: 'https://example.test/safe', tabId: 1,
      newTab: false, background: false, reuseExisting: false, agent: 'alpha'
    })

    const response = vi.mocked(sendToWebSocket).mock.calls.at(-1)?.[0]
    expect(response).toMatchObject({
      type: 'browser-open-url-result', requestId: 'navigate-no-tab', success: true,
      tabId: 1, url: 'https://example.test/safe'
    })
    expect(JSON.stringify(response)).not.toContain(sentinel)
  })

  it('removes a newly created named tab when grouping fails', async () => {
    addTab(1, 10)
    await bindAgentGroup('alpha', 10)
    vi.mocked(chrome.tabs.group).mockRejectedValueOnce(new Error('grouping failed'))

    await handleBrowserOpenUrl({
      requestId: 'failed-open', url: 'https://new.test/', newTab: true,
      background: false, reuseExisting: false, groupId: 10, agent: 'alpha'
    })

    expect(chrome.tabs.remove).toHaveBeenCalledWith(901)
    expect(sendToWebSocket).toHaveBeenCalledWith(expect.objectContaining({
      type: 'browser-open-url-result', success: false, error: 'grouping failed'
    }))
  })

  it('serializes same-agent grouped windows and dissolves the superseded owned group', async () => {
    await Promise.all([
      handleBrowserCreateWindow({ requestId: 'window-a', url: 'https://a.test', agent: 'alpha' }),
      handleBrowserCreateWindow({ requestId: 'window-b', url: 'https://b.test', agent: 'alpha' })
    ])

    await expect(getClaudeActiveGroupId('alpha')).resolves.toBe(101)
    expect(tabs.get(50)?.groupId).toBe(-1)
    expect(tabs.get(51)?.groupId).toBe(101)
  })

  it('cleans only positively created window tabs after grouping failure', async () => {
    const userTab = { id: 70, url: 'https://user.test', groupId: -1, windowId: 50 } as chrome.tabs.Tab
    tabs.set(70, userTab)
    vi.mocked(chrome.tabs.group).mockRejectedValueOnce(new Error('group failed'))

    await handleBrowserCreateWindow({ requestId: 'window-fail', url: 'https://agent.test', agent: 'alpha' })

    expect(chrome.windows.remove).not.toHaveBeenCalled()
    expect(chrome.tabs.remove).toHaveBeenCalledWith([51])
    expect(tabs.has(70)).toBe(true)
  })
})
