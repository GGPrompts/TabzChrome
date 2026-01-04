import { useState, useRef, useCallback, useMemo } from 'react'
import { sendMessage } from '../shared/messaging'
import { useOutsideClick } from './useOutsideClick'
import { filterMcpTools, type McpTool } from '../shared/mcpTools'
import type { TerminalSession } from './useTerminalSessions'

interface ClaudeStatus {
  tmuxPane?: string
  [key: string]: any
}

interface CommandHistoryHook {
  history: string[]
  addToHistory: (cmd: string) => void
  navigateHistory: (direction: 'up' | 'down', currentInput: string) => string | null
  resetNavigation: () => void
}

interface UseChatInputParams {
  sessions: TerminalSession[]
  currentSession: string | null
  claudeStatuses: Map<string, ClaudeStatus>
  commandHistory: CommandHistoryHook
}

export interface UseChatInputReturn {
  chatInputText: string
  setChatInputText: (text: string) => void
  chatInputMode: 'execute' | 'send'
  setChatInputMode: (mode: 'execute' | 'send') => void
  chatInputRef: React.RefObject<HTMLInputElement>
  targetTabs: Set<string>
  setTargetTabs: React.Dispatch<React.SetStateAction<Set<string>>>
  showTargetDropdown: boolean
  setShowTargetDropdown: (show: boolean) => void
  showHistoryDropdown: boolean
  setShowHistoryDropdown: (show: boolean) => void
  handleChatInputSend: () => void
  handleChatInputKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void
  handleChatInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  toggleTargetTab: (tabId: string) => void
  selectAllTargetTabs: () => void
  getTargetLabel: () => string
  // Autocomplete
  suggestions: McpTool[]
  selectedSuggestionIndex: number
  showSuggestions: boolean
  setShowSuggestions: (show: boolean) => void
  selectSuggestion: (tool: McpTool) => void
}

export function useChatInput({
  sessions,
  currentSession,
  claudeStatuses,
  commandHistory,
}: UseChatInputParams): UseChatInputReturn {
  const [chatInputText, setChatInputText] = useState('')
  const [chatInputMode, setChatInputMode] = useState<'execute' | 'send'>('execute')
  const [targetTabs, setTargetTabs] = useState<Set<string>>(new Set())
  const [showTargetDropdown, setShowTargetDropdown] = useState(false)
  const [showHistoryDropdown, setShowHistoryDropdown] = useState(false)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
  const chatInputRef = useRef<HTMLInputElement>(null)

  // Compute filtered MCP tool suggestions based on input
  const suggestions = useMemo(() => {
    if (!chatInputText.trim()) return []
    return filterMcpTools(chatInputText).slice(0, 8) // Limit to 8 suggestions
  }, [chatInputText])

  const { addToHistory, navigateHistory, resetNavigation } = commandHistory

  // Close dropdowns when clicking outside (using shared hook)
  useOutsideClick(showTargetDropdown, useCallback(() => setShowTargetDropdown(false), []))
  useOutsideClick(showHistoryDropdown, useCallback(() => setShowHistoryDropdown(false), []))
  useOutsideClick(showSuggestions, useCallback(() => setShowSuggestions(false), []))

  // Select an MCP tool suggestion
  const selectSuggestion = useCallback((tool: McpTool) => {
    setChatInputText(tool.id)
    setShowSuggestions(false)
    setSelectedSuggestionIndex(0)
    chatInputRef.current?.focus()
  }, [])

  // Chat input send handler
  const handleChatInputSend = useCallback(() => {
    if (!chatInputText.trim()) return

    // Add to command history
    addToHistory(chatInputText.trim())

    // Determine target terminals: selected tabs or current tab
    const targets = targetTabs.size > 0
      ? Array.from(targetTabs)
      : currentSession ? [currentSession] : []

    if (targets.length === 0) return

    // Send to each target with slight stagger for multi-send
    targets.forEach((terminalId, index) => {
      const delay = index * 50 // 50ms stagger between sends

      setTimeout(() => {
        // Check if this terminal has Claude status with a pane ID
        // If so, use targeted pane send to avoid corrupting TUI tools in split layouts
        const claudeStatus = claudeStatuses.get(terminalId)
        const tmuxPane = claudeStatus?.tmuxPane

        // Get session info for tmux fallback
        const session = sessions.find(s => s.id === terminalId)
        const tmuxSessionName = session?.sessionName

        if (tmuxPane) {
          // Use targeted pane send - goes directly to Claude's pane
          // This prevents sending to TUI tools (like TFE) in other panes
          sendMessage({
            type: 'TARGETED_PANE_SEND',
            tmuxPane,
            text: chatInputText,
            sendEnter: chatInputMode === 'execute',
          })
        } else if (tmuxSessionName) {
          // Fallback: Use tmux session name when pane ID isn't available
          // This is safer than PTY for Claude terminals - sends to first pane of session
          // Avoids the bug where content gets executed by bash instead of going to Claude
          sendMessage({
            type: 'TMUX_SESSION_SEND',
            sessionName: tmuxSessionName,
            text: chatInputText,
            sendEnter: chatInputMode === 'execute',
          })
        } else {
          // Last resort: PTY send (only for non-tmux terminals)
          // This path is less reliable for "execute" mode - two separate messages instead of atomic tmux send
          console.warn(`[ChatSend] Using PTY fallback for terminal ${terminalId} - sessionName missing. Session:`, session)
          sendMessage({
            type: 'TERMINAL_INPUT',
            terminalId,
            data: chatInputText,
          })

          // If execute mode, send Enter after 300ms delay
          // CRITICAL: Delay prevents submit before text loads (especially for Claude Code)
          if (chatInputMode === 'execute') {
            setTimeout(() => {
              sendMessage({
                type: 'TERMINAL_INPUT',
                terminalId,
                data: '\r',
              })
            }, 300)
          }
        }
      }, delay)
    })

    // Clear input after sending
    setChatInputText('')

    // Keep focus on input for next message
    chatInputRef.current?.focus()
  }, [chatInputText, chatInputMode, targetTabs, currentSession, sessions, claudeStatuses, addToHistory])

  // Toggle a tab in the target selection
  const toggleTargetTab = useCallback((tabId: string) => {
    setTargetTabs(prev => {
      const next = new Set(prev)
      if (next.has(tabId)) {
        next.delete(tabId)
      } else {
        next.add(tabId)
      }
      return next
    })
  }, [])

  // Select/deselect all tabs
  const selectAllTargetTabs = useCallback(() => {
    if (targetTabs.size === sessions.length) {
      setTargetTabs(new Set())
    } else {
      setTargetTabs(new Set(sessions.map(s => s.id)))
    }
  }, [sessions, targetTabs.size])

  // Get display label for target dropdown
  const getTargetLabel = useCallback(() => {
    if (targetTabs.size === 0) return 'Current'
    if (targetTabs.size === 1) {
      const id = Array.from(targetTabs)[0]
      const session = sessions.find(s => s.id === id)
      return session?.name || 'Tab'
    }
    return `${targetTabs.size} tabs`
  }, [sessions, targetTabs])

  // Keyboard handler for chat input
  const handleChatInputKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    // Handle autocomplete navigation when suggestions are shown
    if (showSuggestions && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedSuggestionIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        )
        return
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedSuggestionIndex(prev =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        )
        return
      } else if (e.key === 'Tab' || (e.key === 'Enter' && selectedSuggestionIndex >= 0)) {
        e.preventDefault()
        selectSuggestion(suggestions[selectedSuggestionIndex])
        return
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setShowSuggestions(false)
        setSelectedSuggestionIndex(0)
        return
      }
    }

    // Normal keyboard handling
    if (e.key === 'Enter') {
      e.preventDefault()
      handleChatInputSend()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setChatInputText('')
      resetNavigation()
      setShowSuggestions(false)
      chatInputRef.current?.blur()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const historyCommand = navigateHistory('up', chatInputText)
      if (historyCommand !== null) {
        setChatInputText(historyCommand)
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      const historyCommand = navigateHistory('down', chatInputText)
      if (historyCommand !== null) {
        setChatInputText(historyCommand)
      }
    }
  }, [handleChatInputSend, navigateHistory, resetNavigation, chatInputText, showSuggestions, suggestions, selectedSuggestionIndex, selectSuggestion])

  // Reset history navigation when user types manually, show suggestions
  const handleChatInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setChatInputText(value)
    resetNavigation()
    // Show suggestions if there's text and it looks like an MCP command
    setShowSuggestions(value.trim().length > 0)
    setSelectedSuggestionIndex(0)
  }, [resetNavigation])

  return {
    chatInputText,
    setChatInputText,
    chatInputMode,
    setChatInputMode,
    chatInputRef,
    targetTabs,
    setTargetTabs,
    showTargetDropdown,
    setShowTargetDropdown,
    showHistoryDropdown,
    setShowHistoryDropdown,
    handleChatInputSend,
    handleChatInputKeyDown,
    handleChatInputChange,
    toggleTargetTab,
    selectAllTargetTabs,
    getTargetLabel,
    // Autocomplete
    suggestions,
    selectedSuggestionIndex,
    showSuggestions,
    setShowSuggestions,
    selectSuggestion,
  }
}
