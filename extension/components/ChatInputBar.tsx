import React, { useCallback } from 'react'
import { History, X, ChevronDown, ListPlus } from 'lucide-react'
import type { UseChatInputReturn } from '../hooks/useChatInput'
import type { TerminalSession } from '../hooks/useTerminalSessions'
import type { ClaudeStatus } from '../hooks/useClaudeStatus'

/**
 * Props for the ChatInputBar component
 */
interface ChatInputBarProps {
  /** Chat input state and handlers from useChatInput hook */
  chatInput: UseChatInputReturn
  /** Command history state and handlers */
  commandHistory: {
    history: string[]
    removeFromHistory: (cmd: string) => void
  }
  /** List of terminal sessions for target selection */
  sessions: TerminalSession[]
  /** Map of terminal ID to Claude Code status */
  claudeStatuses: Map<string, ClaudeStatus>
  /** Function to get status emoji for a terminal */
  getStatusEmoji: (status: ClaudeStatus | undefined) => string
  /** Function to get status text for a terminal */
  getStatusText: (status: ClaudeStatus | undefined, profileName?: string) => string
  /** Function to get full status text with details */
  getFullStatusText: (status: ClaudeStatus | undefined) => string
  /** Optional callback to add command to queue instead of sending */
  onAddToQueue?: (command: string, targetId: string | null, mode: 'execute' | 'send') => void
  /** Number of pending items in queue (for badge display) */
  queueCount?: number
}

/**
 * ChatInputBar - Multi-target command input component
 *
 * Provides a command input bar at the bottom of the sidebar for
 * sending commands or text to one or more terminal sessions.
 *
 * Features:
 * - **Command History**: Up/down arrows to navigate history, history dropdown
 * - **Target Selection**: Send to current tab, specific tabs, or all tabs
 * - **Send Modes**:
 *   - Execute: Sends command + Enter (runs immediately)
 *   - Send: Sends text only (for AI prompts, doesn't execute)
 * - **Claude Detection**: Shows robot emoji for Claude Code sessions
 *
 * This is particularly useful for:
 * - Sending the same command to multiple Claude Code instances
 * - Quick terminal commands without switching tabs
 * - Reviewing and reusing command history
 *
 * @param props - Input state, history, and session info
 * @returns Command input bar component
 */
export function ChatInputBar({
  chatInput,
  commandHistory,
  sessions,
  claudeStatuses,
  getStatusEmoji,
  getStatusText,
  getFullStatusText,
  onAddToQueue,
  queueCount = 0,
}: ChatInputBarProps) {
  const {
    chatInputText,
    setChatInputText,
    chatInputMode,
    setChatInputMode,
    chatInputRef,
    targetTabs,
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
  } = chatInput

  const { history, removeFromHistory } = commandHistory

  // Handle adding to queue (Ctrl+Q or button click)
  const handleAddToQueue = useCallback(() => {
    if (!chatInputText.trim() || !onAddToQueue) return

    // Get target - if specific tabs selected use first, otherwise null (current)
    const targetId = targetTabs.size > 0
      ? Array.from(targetTabs)[0]
      : null

    onAddToQueue(chatInputText.trim(), targetId, chatInputMode)
    setChatInputText('')
    chatInputRef.current?.focus()
  }, [chatInputText, chatInputMode, targetTabs, onAddToQueue, setChatInputText, chatInputRef])

  // Extended keyboard handler with queue support
  const handleKeyDownWithQueue = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    // Ctrl+Q to add to queue
    if (e.ctrlKey && e.key === 'q') {
      e.preventDefault()
      handleAddToQueue()
      return
    }
    // Default handler
    handleChatInputKeyDown(e)
  }, [handleAddToQueue, handleChatInputKeyDown])

  return (
    <div className="border-t border-gray-700 bg-[#1a1a1a] flex items-center gap-2 px-2 py-1.5">
      {/* History dropdown button */}
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowHistoryDropdown(!showHistoryDropdown)
          }}
          className={`h-7 w-7 flex items-center justify-center bg-black border rounded transition-colors ${
            history.length > 0
              ? 'border-gray-600 text-gray-400 hover:border-gray-500 hover:text-gray-300'
              : 'border-gray-700 text-gray-600 cursor-not-allowed'
          }`}
          title={history.length > 0 ? `Command history (${history.length})` : 'No command history'}
          disabled={history.length === 0}
        >
          <History className="h-3.5 w-3.5" />
        </button>

        {showHistoryDropdown && history.length > 0 && (
          <div className="absolute bottom-full left-0 mb-1 bg-[#1a1a1a] border border-gray-700 rounded-md shadow-2xl min-w-[280px] max-w-[400px] z-50 overflow-hidden">
            <div className="px-3 py-1.5 border-b border-gray-800 text-xs text-gray-500 flex items-center justify-between">
              <span>Command History</span>
              <span className="text-gray-600">↑↓ to navigate</span>
            </div>
            <div className="max-h-[250px] overflow-y-auto">
              {history.map((cmd, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between px-3 py-2 hover:bg-[#00ff88]/10 transition-colors text-xs font-mono border-b border-gray-800 last:border-b-0 group"
                >
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      setChatInputText(cmd)
                      setShowHistoryDropdown(false)
                      chatInputRef.current?.focus()
                    }}
                    className="flex-1 text-left text-gray-300 hover:text-white truncate pr-2"
                    title={cmd}
                  >
                    {cmd}
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeFromHistory(cmd)
                    }}
                    className="ml-2 p-0.5 rounded hover:bg-red-500/20 text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                    title="Remove from history"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <input
        ref={chatInputRef}
        type="text"
        className="flex-1 h-7 px-3 bg-black border border-gray-600 rounded text-sm text-white font-mono focus:border-[#00ff88]/50 focus:outline-none placeholder-gray-500"
        value={chatInputText}
        onChange={handleChatInputChange}
        onKeyDown={handleKeyDownWithQueue}
        placeholder={chatInputMode === 'execute' ? "↑↓ history • Enter to run • Ctrl+Q queue" : "↑↓ history • Enter to send • Ctrl+Q queue"}
      />

      {/* Target tabs dropdown */}
      <div className="relative">
        <button
          onClick={(e) => {
            e.stopPropagation()
            setShowTargetDropdown(!showTargetDropdown)
          }}
          className={`h-7 px-2 flex items-center gap-1 bg-black border rounded text-xs cursor-pointer transition-colors ${
            targetTabs.size > 0
              ? 'border-[#00ff88]/50 text-[#00ff88]'
              : 'border-gray-600 text-gray-300 hover:border-gray-500'
          }`}
          title="Target terminals"
        >
          <span className="max-w-[60px] truncate">{getTargetLabel()}</span>
          <ChevronDown className="h-3 w-3 flex-shrink-0" />
        </button>

        {showTargetDropdown && (
          <div className="absolute bottom-full left-0 mb-1 bg-[#1a1a1a] border border-gray-700 rounded-md shadow-2xl min-w-[160px] z-50 overflow-hidden">
            {/* Current tab option */}
            <button
              onClick={(e) => {
                e.stopPropagation()
                chatInput.setTargetTabs(new Set())
                setShowTargetDropdown(false)
              }}
              className={`w-full px-3 py-2 text-left text-xs border-b border-gray-800 transition-colors flex items-center gap-2 ${
                targetTabs.size === 0
                  ? 'text-[#00ff88] bg-[#00ff88]/10'
                  : 'text-gray-300 hover:bg-white/5'
              }`}
            >
              <span className="w-4">{targetTabs.size === 0 ? '●' : '○'}</span>
              <span>Current Tab</span>
            </button>

            {/* Divider */}
            <div className="border-b border-gray-700 my-1" />

            {/* Individual tabs with checkboxes */}
            <div className="max-h-[200px] overflow-y-auto">
              {sessions.map((session) => {
                const claudeStatus = claudeStatuses.get(session.id)
                const hasClaudeRunning = !!claudeStatus
                return (
                  <button
                    key={session.id}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggleTargetTab(session.id)
                    }}
                    className={`w-full px-3 py-1.5 text-left text-xs transition-colors flex items-center gap-2 ${
                      targetTabs.has(session.id)
                        ? 'text-[#00ff88] bg-[#00ff88]/5'
                        : 'text-gray-300 hover:bg-white/5'
                    }`}
                  >
                    <span className="w-4 flex-shrink-0">
                      {targetTabs.has(session.id) ? '☑' : '☐'}
                    </span>
                    <span
                      className="flex items-center gap-1 truncate"
                      title={session.name}
                    >
                      {hasClaudeRunning && <span className="flex-shrink-0">🤖</span>}
                      <span className="truncate">
                        {session.name}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Select All / None */}
            {sessions.length > 1 && (
              <>
                <div className="border-t border-gray-700 mt-1" />
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    selectAllTargetTabs()
                  }}
                  className="w-full px-3 py-2 text-left text-xs text-gray-400 hover:bg-white/5 transition-colors"
                >
                  {targetTabs.size === sessions.length ? 'Deselect All' : 'Select All'}
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <select
        value={chatInputMode}
        onChange={(e) => setChatInputMode(e.target.value as 'execute' | 'send')}
        className="h-7 px-2 bg-black border border-gray-600 rounded text-xs text-gray-300 focus:border-[#00ff88]/50 focus:outline-none cursor-pointer"
        title="Send mode"
      >
        <option value="execute">Execute</option>
        <option value="send">Send</option>
      </select>

      {/* Queue button (only if callback provided) */}
      {onAddToQueue && (
        <button
          onClick={handleAddToQueue}
          disabled={!chatInputText.trim()}
          className="relative h-7 px-2 bg-blue-500/10 border border-blue-500/20 rounded text-xs text-blue-400 font-medium hover:bg-blue-500/20 hover:border-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors group"
          title="Add to queue (Ctrl+Q)"
        >
          <ListPlus className="h-3.5 w-3.5" />
          {/* Queue count badge */}
          {queueCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] flex items-center justify-center px-1 rounded-full text-[9px] font-bold bg-[#00ff88] text-black">
              {queueCount > 99 ? '99+' : queueCount}
            </span>
          )}
        </button>
      )}

      <button
        onClick={handleChatInputSend}
        disabled={!chatInputText.trim()}
        className="h-7 px-3 bg-[#00ff88]/20 border border-[#00ff88]/30 rounded text-xs text-[#00ff88] font-medium hover:bg-[#00ff88]/30 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Send
      </button>
    </div>
  )
}
