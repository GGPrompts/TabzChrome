import React from 'react'
import { History, X, ChevronDown } from 'lucide-react'
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
    // Autocomplete
    suggestions,
    selectedSuggestionIndex,
    showSuggestions,
    selectSuggestion,
  } = chatInput

  const { history, removeFromHistory } = commandHistory

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

      {/* Input with MCP autocomplete dropdown */}
      <div className="relative flex-1">
        <input
          ref={chatInputRef}
          type="text"
          className="w-full h-7 px-3 bg-black border border-gray-600 rounded text-sm text-white font-mono focus:border-[#00ff88]/50 focus:outline-none placeholder-gray-500"
          value={chatInputText}
          onChange={handleChatInputChange}
          onKeyDown={handleChatInputKeyDown}
          placeholder={chatInputMode === 'execute' ? "↑↓ history • Tab MCP • Enter" : "↑↓ history • Tab MCP • Enter"}
        />

        {/* MCP tool autocomplete dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-1 bg-[#1a1a1a] border border-gray-700 rounded-md shadow-2xl z-50 overflow-hidden">
            <div className="px-3 py-1.5 border-b border-gray-800 text-xs text-gray-500 flex items-center justify-between">
              <span>MCP Tools</span>
              <span className="text-gray-600">↑↓ Tab to select</span>
            </div>
            <div className="max-h-[200px] overflow-y-auto">
              {suggestions.map((tool, index) => (
                <button
                  key={tool.id}
                  onClick={(e) => {
                    e.stopPropagation()
                    selectSuggestion(tool)
                  }}
                  className={`w-full px-3 py-2 text-left transition-colors border-b border-gray-800 last:border-b-0 ${
                    index === selectedSuggestionIndex
                      ? 'bg-[#00ff88]/10 text-[#00ff88]'
                      : 'text-gray-300 hover:bg-white/5'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono truncate">{tool.id}</span>
                    <span className="text-[10px] text-gray-500 ml-2 flex-shrink-0">{tool.category}</span>
                  </div>
                  <div className="text-[10px] text-gray-500 truncate mt-0.5">{tool.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

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
