import React, { useEffect, useRef, useCallback, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { Terminal } from './Terminal'
import { connectToBackground, sendMessage } from '../shared/messaging'
import { useProfiles } from '../hooks/useProfiles'
import { useTerminalSessions, type TerminalSession } from '../hooks/useTerminalSessions'
import { useClaudeStatus, getContextColor, getRobotEmojis, getStatusText } from '../hooks/useClaudeStatus'

interface PopoutTerminalViewProps {
  terminalId: string
}

/**
 * PopoutTerminalView - Minimal single-terminal view for popup windows
 *
 * This component renders a single terminal in a popup window with:
 * - Minimal header (terminal name + close button)
 * - No tab bar, no + button, no chat bar
 * - Full terminal area
 *
 * When the window is closed (or user clicks close), the terminal is detached
 * and appears as a ghost icon in the main sidebar.
 */
export function PopoutTerminalView({ terminalId }: PopoutTerminalViewProps) {
  const [wsConnected, setWsConnected] = useState(false)
  const [isDark, setIsDark] = useState(true)
  const portRef = useRef<chrome.runtime.Port | null>(null)
  const [targetSession, setTargetSession] = useState<TerminalSession | null>(null)
  const skipDetachOnCloseRef = useRef(false)  // Flag to skip detach when using "Return to sidebar"

  // Profiles hook for appearance settings
  const { profiles } = useProfiles({})

  // Terminal sessions hook - we'll filter to just the one we need
  const {
    sessions,
    handleWebSocketMessage,
    increaseFontSize,
    decreaseFontSize,
    resetFontSize,
  } = useTerminalSessions({
    wsConnected,
    profiles,
    getNextAvailableVoice: () => 'en-US-AndrewMultilingualNeural',
  })

  // Find our target session from the sessions list
  useEffect(() => {
    const session = sessions.find(s => s.id === terminalId || s.sessionName === terminalId)
    if (session) {
      setTargetSession(session)
    }
  }, [sessions, terminalId])

  // Claude status tracking for this terminal only
  const { statuses: claudeStatuses } = useClaudeStatus(
    targetSession ? [{
      id: targetSession.id,
      sessionName: targetSession.sessionName,
      workingDir: targetSession.workingDir,
      profileCommand: targetSession.profile?.command || targetSession.command,
    }] : []
  )

  // Connect to background worker
  useEffect(() => {
    const port = connectToBackground('popout', (message) => {
      if (message.type === 'INITIAL_STATE') {
        setWsConnected(message.wsConnected)
      } else if (message.type === 'WS_CONNECTED') {
        setWsConnected(true)
      } else if (message.type === 'WS_DISCONNECTED') {
        setWsConnected(false)
      } else if (message.type === 'WS_MESSAGE') {
        handleWebSocketMessage(message.data)
      }
    })

    portRef.current = port

    return () => {
      port.disconnect()
      portRef.current = null
    }
  }, [handleWebSocketMessage])

  // Load dark mode preference and listen for changes
  useEffect(() => {
    chrome.storage.local.get(['isDark'], (result) => {
      if (typeof result.isDark === 'boolean') {
        setIsDark(result.isDark)
      }
    })

    // Listen for dark mode changes from sidebar
    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.isDark && typeof changes.isDark.newValue === 'boolean') {
        setIsDark(changes.isDark.newValue)
      }
    }
    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [])

  // Handle window close - detach the terminal (make it a ghost)
  const handleDetachAndClose = useCallback(async () => {
    if (!targetSession) {
      window.close()
      return
    }

    try {
      // Use DELETE /api/agents/:id?force=false to detach (keeps tmux session alive)
      await fetch(`http://localhost:8129/api/agents/${targetSession.id}?force=false`, {
        method: 'DELETE'
      })
    } catch (error) {
      console.error('[PopoutTerminalView] Failed to detach:', error)
    }

    window.close()
  }, [targetSession])

  // Set up beforeunload handler to detach on window close (OS X button or explicit X click)
  // Skip detach if using "Return to sidebar" button (sets skipDetachOnCloseRef)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (targetSession && !skipDetachOnCloseRef.current) {
        // Use sendBeacon for reliable delivery on page unload
        // POST /api/agents/:id/detach endpoint exists specifically for this use case
        const url = `http://localhost:8129/api/agents/${targetSession.id}/detach`
        navigator.sendBeacon(url, '')
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [targetSession])

  // Get effective profile for appearance
  const getEffectiveProfile = () => {
    if (!targetSession) return null
    const sessionProfileId = targetSession.profile?.id
    const currentProfile = sessionProfileId ? profiles.find(p => p.id === sessionProfileId) : null
    const defaultProfile = profiles.find(p => p.id === 'default') || profiles[0]
    return currentProfile || defaultProfile
  }

  const effectiveProfile = getEffectiveProfile()
  const claudeStatus = targetSession ? claudeStatuses.get(targetSession.id) : undefined

  // Show loading state while waiting for session
  if (!targetSession) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-[#0a0a0a] text-gray-400">
        <div className="text-xl mb-2">Loading terminal...</div>
        <div className="text-sm text-gray-500 font-mono">{terminalId}</div>
        {!wsConnected && (
          <div className="text-sm text-red-400 mt-4">Waiting for backend connection...</div>
        )}
      </div>
    )
  }

  // Get effective panel color for container background
  const effectivePanelColor = targetSession.appearanceOverrides?.panelColor ?? effectiveProfile?.panelColor ?? '#0a0a0a'

  return (
    <div className="h-screen flex flex-col text-foreground" style={{ backgroundColor: effectivePanelColor }}>
      {/* Minimal Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b bg-gradient-to-r from-[#0f0f0f] to-[#1a1a1a]">
        {/* Left: Terminal info */}
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {claudeStatus && (
            <span className="flex-shrink-0">{getRobotEmojis(claudeStatus)}</span>
          )}
          <span className="text-sm font-medium text-white truncate">
            {targetSession.profile?.name || targetSession.name}
          </span>
          {claudeStatus && (
            <span className="text-xs text-gray-400 truncate">
              {getStatusText(claudeStatus)}
            </span>
          )}
          {claudeStatus?.context_pct != null && (
            <span
              className="text-xs font-medium flex-shrink-0"
              style={{ color: getContextColor(claudeStatus.context_pct) }}
            >
              {claudeStatus.context_pct}%
            </span>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Return to sidebar (keep attached) */}
          <button
            onClick={() => {
              // Skip detach on close - we want to keep the terminal attached
              skipDetachOnCloseRef.current = true
              // Notify sidebar to clear poppedOut state
              chrome.runtime.sendMessage({
                type: 'TERMINAL_RETURNED_FROM_POPOUT',
                terminalId: targetSession.id,
              })
              // Focus the main Chrome window and close this popup
              chrome.windows.getAll({ populate: false }, (windows) => {
                const mainWindow = windows.find(w => w.type === 'normal')
                if (mainWindow?.id) {
                  chrome.windows.update(mainWindow.id, { focused: true })
                }
              })
              window.close()
            }}
            className="p-1.5 hover:bg-[#00ff88]/10 rounded-md transition-colors text-gray-400 hover:text-[#00ff88]"
            title="Return to sidebar (keep attached)"
          >
            <ExternalLink className="h-4 w-4" />
          </button>

          {/* Detach and close */}
          <button
            onClick={handleDetachAndClose}
            className="p-1.5 hover:bg-gray-500/20 rounded-md transition-colors text-gray-400 hover:text-white"
            title="Detach terminal (keeps running as ghost)"
          >
            <span className="text-sm">👻</span>
          </button>
        </div>
      </div>

      {/* Terminal - full remaining space */}
      <div className="flex-1 relative min-h-0">
        <Terminal
          terminalId={targetSession.id}
          sessionName={targetSession.name}
          terminalType={targetSession.type}
          workingDir={targetSession.workingDir || effectiveProfile?.workingDir}
          tmuxSession={targetSession.sessionName}
          fontSize={effectiveProfile?.fontSize || 16}
          fontFamily={targetSession.appearanceOverrides?.fontFamily || effectiveProfile?.fontFamily || 'monospace'}
          themeName={targetSession.appearanceOverrides?.themeName || effectiveProfile?.themeName || 'high-contrast'}
          isDark={isDark}
          isActive={true}
          pasteCommand={null}
          fontSizeOffset={targetSession.fontSizeOffset}
          onIncreaseFontSize={() => increaseFontSize(targetSession.id)}
          onDecreaseFontSize={() => decreaseFontSize(targetSession.id)}
          onResetFontSize={() => resetFontSize(targetSession.id)}
          backgroundGradient={targetSession.appearanceOverrides?.backgroundGradient ?? effectiveProfile?.backgroundGradient}
          panelColor={targetSession.appearanceOverrides?.panelColor ?? effectiveProfile?.panelColor ?? '#000000'}
          transparency={targetSession.appearanceOverrides?.transparency ?? effectiveProfile?.transparency ?? 100}
          onClose={handleDetachAndClose}
        />
      </div>
    </div>
  )
}
