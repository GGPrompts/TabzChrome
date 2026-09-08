export type ClaudePromptKind = 'permission_prompt' | 'ask_user_question'

export interface ClaudePromptStatus {
  status?: string
  current_tool?: string | null
  last_updated?: string | null
  details?: {
    event?: unknown
    [key: string]: unknown
  } | null
}

export interface ClaudePromptTrackerState {
  activeKey: string | null
  lastUpdated?: string | null
}

export type ClaudePromptTransition =
  | { type: 'notify'; promptKind: ClaudePromptKind; dedupeKey: string }
  | { type: 'clear' }
  | null

export interface TerminalViewSnapshot {
  terminalId: string | null
  visible: boolean
  windowId: number
  isPopout: boolean
}

export interface PromptTerminalIdentity {
  id?: unknown
  sessionName?: unknown
  secret?: unknown
}

export const PROTECTED_TERMINAL_SESSION_PREFIX = 'ctt-secret-'

export function isProtectedPromptTerminal(terminal: PromptTerminalIdentity): boolean {
  if (terminal.secret === true) return true
  return [terminal.id, terminal.sessionName].some(value =>
    typeof value === 'string' && value.startsWith(PROTECTED_TERMINAL_SESSION_PREFIX)
  )
}

export function getClaudePromptKind(status: ClaudePromptStatus): ClaudePromptKind | null {
  if (status.details?.event === 'permission_prompt') return 'permission_prompt'

  if (
    status.current_tool === 'AskUserQuestion'
    && status.status === 'tool_use'
    && status.details?.event !== 'tool_completed'
  ) {
    return 'ask_user_question'
  }

  return null
}

export function detectClaudePromptTransition(
  previous: ClaudePromptTrackerState,
  status: ClaudePromptStatus
): { state: ClaudePromptTrackerState; transition: ClaudePromptTransition } {
  const promptKind = getClaudePromptKind(status)
  const lastUpdated = status.last_updated || null

  if (!lastUpdated) return { state: previous, transition: null }
  if (previous.lastUpdated && lastUpdated < previous.lastUpdated) {
    return { state: previous, transition: null }
  }

  if (promptKind) {
    const dedupeKey = lastUpdated
    if (previous.activeKey === dedupeKey) return { state: previous, transition: null }
    return {
      state: { activeKey: dedupeKey, lastUpdated },
      transition: { type: 'notify', promptKind, dedupeKey }
    }
  }

  if (previous.activeKey) {
    return {
      state: { activeKey: null, lastUpdated },
      transition: { type: 'clear' }
    }
  }

  return { state: { activeKey: null, lastUpdated }, transition: null }
}

export function isTerminalFocused(
  terminalId: string,
  focusedWindowId: number | undefined,
  views: Iterable<TerminalViewSnapshot>
): boolean {
  if (focusedWindowId === undefined) return false
  for (const view of views) {
    if (view.terminalId === terminalId && view.visible && view.windowId === focusedWindowId) {
      return true
    }
  }
  return false
}
