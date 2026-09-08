import { describe, expect, it } from 'vitest'
import {
  detectClaudePromptTransition,
  isProtectedPromptTerminal,
  isTerminalFocused,
} from '../../../extension/shared/claudePromptNotifications'

describe('prompt transition ordering', () => {
  const waiting = {
    status: 'awaiting_input', details: { event: 'permission_prompt' },
    last_updated: '2026-09-07T20:00:00.000Z',
  }

  it('notifies once, rejects stale completion, and clears on newer idle state', () => {
    const first = detectClaudePromptTransition({ activeKey: null }, waiting)
    expect(first.transition?.type).toBe('notify')
    expect(detectClaudePromptTransition(first.state, waiting).transition).toBeNull()
    const stale = detectClaudePromptTransition(first.state, {
      status: 'idle', last_updated: '2026-09-07T19:59:59.000Z',
    })
    expect(stale.state).toEqual(first.state)
    expect(stale.transition).toBeNull()
    const complete = detectClaudePromptTransition(first.state, {
      status: 'idle', last_updated: '2026-09-07T20:00:01.000Z',
    })
    expect(complete.transition).toEqual({ type: 'clear' })
    expect(detectClaudePromptTransition(complete.state, waiting).transition).toBeNull()
  })

  it('ignores unstamped status and completed question tools', () => {
    const prior = { activeKey: 'existing', lastUpdated: waiting.last_updated }
    expect(detectClaudePromptTransition(prior, { status: 'idle' }).state).toEqual(prior)
    expect(detectClaudePromptTransition({ activeKey: null }, {
      status: 'tool_use', current_tool: 'AskUserQuestion', details: { event: 'tool_completed' },
      last_updated: waiting.last_updated,
    }).transition).toBeNull()
  })
})

describe('prompt polling and focus boundaries', () => {
  it('excludes protected editors from metadata and recovered session identities', () => {
    for (const terminal of [
      { id: 'ordinary', secret: true },
      { id: 'ctt-secret-fixture', secret: false },
      { id: 'ordinary', sessionName: 'ctt-secret-recovered' },
    ]) expect(isProtectedPromptTerminal(terminal)).toBe(true)
    expect(isProtectedPromptTerminal({ id: 'ctt-public', secret: false })).toBe(false)
  })

  it('suppresses only the same terminal visible in the focused window', () => {
    const views = [{ terminalId: 'fixture', windowId: 12, visible: true, isPopout: false }]
    expect(isTerminalFocused('fixture', 12, views)).toBe(true)
    expect(isTerminalFocused('other', 12, views)).toBe(false)
    expect(isTerminalFocused('fixture', 13, views)).toBe(false)
    expect(isTerminalFocused('fixture', undefined, views)).toBe(false)
    expect(isTerminalFocused('fixture', 12, [{ ...views[0], visible: false }])).toBe(false)
  })
})
