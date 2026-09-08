import { describe, expect, it, vi } from 'vitest'

vi.mock('node:child_process', () => ({
  execFileSync: vi.fn(() => 'synthetic-session\n')
}))

const {
  addAgentToBrowserRequest,
  createConnectionState,
  defaultAddToClaudeGroup,
  deriveConnectionId,
  getAgentId,
  getBackendUrl,
  getCustomTabName,
  getCurrentTabId,
  isNetworkCaptureActive,
  runWithConnectionState,
  setNetworkCaptureActive,
  setCurrentTabId,
  setCustomTabName,
  resolveConnectionIdentitySources
} = await import('../src/shared.js')

describe('MCP connection identity', () => {
  it('uses stable identity sources in precedence order', () => {
    expect(deriveConnectionId(' qa ', {
      terminalId: 'terminal-7', tmuxPane: '%2', tmuxSession: 'tabz'
    }, () => 'unused')).toBe('qa')
    expect(deriveConnectionId(undefined, {
      terminalId: ' terminal-7 ', tmuxPane: '%2', tmuxSession: 'tabz'
    }, () => 'unused')).toBe('terminal:terminal-7')
    expect(deriveConnectionId(undefined, {
      tmuxPane: ' %2 ', tmuxSession: ' tabz '
    }, () => 'unused')).toBe('tmux:tabz:%2')
    expect(deriveConnectionId(undefined, {}, () => '12345678-abcd')).toBe('12345678')
  })

  it('rejects the reserved unlabeled legacy identity', () => {
    expect(() => deriveConnectionId(' __default__ ', {}, () => 'unused'))
      .toThrow('reserved for legacy unlabeled requests')
    expect(() => createConnectionState('__default__'))
      .toThrow('reserved for legacy unlabeled requests')
  })

  it('looks up tmux only when its pane is the remaining stable source', () => {
    const lookup = vi.fn(() => 'synthetic-session')
    expect(resolveConnectionIdentitySources({ TABZ_AGENT_LABEL: 'qa', TMUX_PANE: '%2' }, lookup))
      .toEqual({ terminalId: undefined, tmuxPane: '%2' })
    expect(resolveConnectionIdentitySources({ TABZ_TERMINAL_ID: 'term-1', TMUX_PANE: '%2' }, lookup))
      .toEqual({ terminalId: 'term-1', tmuxPane: '%2' })
    expect(lookup).not.toHaveBeenCalled()

    expect(resolveConnectionIdentitySources({ TMUX_PANE: '%2' }, lookup))
      .toEqual({ terminalId: undefined, tmuxPane: '%2', tmuxSession: 'synthetic-session' })
    expect(lookup).toHaveBeenCalledWith('%2')
  })

  it('overwrites spoofed identity on browser POSTs and scopes browser reads', () => {
    const post = addAgentToBrowserRequest({
      method: 'post',
      url: 'http://localhost:8129/api/browser/close-tab',
      data: { tabIds: [7], agent: 'spoofed' }
    }, 'worker-a')
    const get = addAgentToBrowserRequest({
      method: 'get',
      url: 'http://localhost:8129/api/browser/console-logs',
      params: { level: 'error' }
    }, 'worker-a')

    expect(post.data).toEqual({ tabIds: [7], agent: 'worker-a' })
    expect(get.params).toEqual({ level: 'error', agent: 'worker-a' })
  })

  it('does not attach browser identity to other localhost APIs', () => {
    const request = addAgentToBrowserRequest({
      method: 'post',
      url: 'http://localhost:8129/api/agents',
      data: { profileId: 'default' }
    }, 'worker-a')
    expect(request.data).toEqual({ profileId: 'default' })
  })

  it('respects Axios baseURL before attaching identity to a relative path', () => {
    const foreign = addAgentToBrowserRequest({
      method: 'get',
      baseURL: 'https://example.test',
      url: '/api/browser/tabs'
    }, 'worker-a')
    const local = addAgentToBrowserRequest({
      method: 'get',
      baseURL: 'http://localhost:8129',
      url: '/api/browser/tabs'
    }, 'worker-a')

    expect(foreign.params).toBeUndefined()
    expect(local.params).toEqual({ agent: 'worker-a' })
  })

  it('rewrites compiled-backend requests to the active connection backend', async () => {
    const state = createConnectionState('worker-b', 'Worker B', 'http://127.0.0.1:41234')
    await runWithConnectionState(state, async () => {
      const browser = addAgentToBrowserRequest({ method: 'get', url: 'http://localhost:8129/api/browser/tabs' })
      const audio = addAgentToBrowserRequest({ method: 'post', url: 'http://localhost:8129/api/audio/play', data: {} })
      const foreignRelative = addAgentToBrowserRequest({
        method: 'get', baseURL: 'https://example.test', url: '/api/browser/tabs'
      })

      expect(browser.url).toBe('http://127.0.0.1:41234/api/browser/tabs')
      expect(browser.params).toEqual({ agent: 'worker-b' })
      expect(audio.url).toBe('http://127.0.0.1:41234/api/audio/play')
      expect(audio.data).toEqual({})
      expect(foreignRelative.url).toBe('/api/browser/tabs')
      expect(foreignRelative.params).toBeUndefined()
      expect(getAgentId()).toBe('worker-b')
      expect(getBackendUrl()).toBe('http://127.0.0.1:41234')
      setCurrentTabId(42)
      expect(getCurrentTabId()).toBe(42)
      setNetworkCaptureActive(true)
      expect(isNetworkCaptureActive()).toBe(true)
    })
    expect(getCurrentTabId()).toBe(1)
    expect(isNetworkCaptureActive()).toBe(false)
  })

  it('keeps concurrent tab, name, and capture state isolated', async () => {
    const one = createConnectionState('one', undefined, 'http://127.0.0.1:41001')
    const two = createConnectionState('two', undefined, 'http://127.0.0.1:41002')
    const results = await Promise.all([
      runWithConnectionState(one, async () => {
        setCurrentTabId(11)
        setCustomTabName('https://same.test', 'One', 11)
        setNetworkCaptureActive(true)
        await Promise.resolve()
        return [getAgentId(), getBackendUrl(), getCurrentTabId(), getCustomTabName('https://same.test', 11), isNetworkCaptureActive()]
      }),
      runWithConnectionState(two, async () => {
        setCurrentTabId(22)
        setCustomTabName('https://same.test', 'Two', 22)
        await Promise.resolve()
        return [getAgentId(), getBackendUrl(), getCurrentTabId(), getCustomTabName('https://same.test', 22), isNetworkCaptureActive()]
      })
    ])
    expect(results).toEqual([
      ['one', 'http://127.0.0.1:41001', 11, 'One', true],
      ['two', 'http://127.0.0.1:41002', 22, 'Two', false]
    ])
  })

  it('groups the first tab for every connection by default', () => {
    expect(defaultAddToClaudeGroup()).toBe(true)
  })
})
