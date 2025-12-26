import React, { useEffect, useRef, useState } from 'react'
import { Terminal } from './Terminal'
import { connectToBackground } from '../shared/messaging'
import { useProfiles } from '../hooks/useProfiles'
import { useTerminalSessions, type TerminalSession } from '../hooks/useTerminalSessions'

interface PopoutTerminalViewProps {
  terminalId: string
}

/**
 * PopoutTerminalView - Minimal single-terminal view for popup windows
 *
 * This component renders a single terminal in a popup window with:
 * - No header (window chrome handles close, sidebar shows info)
 * - No tab bar, no + button, no chat bar
 * - Full terminal area
 *
 * When the window is closed, the terminal is detached and appears as a ghost in the sidebar.
 */
export function PopoutTerminalView({ terminalId }: PopoutTerminalViewProps) {
  const [wsConnected, setWsConnected] = useState(false)
  const [isDark, setIsDark] = useState(true)
  const portRef = useRef<chrome.runtime.Port | null>(null)
  const [targetSession, setTargetSession] = useState<TerminalSession | null>(null)

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

  // Set up beforeunload handler to detach on window close
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (targetSession) {
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
    <div className="h-screen" style={{ backgroundColor: effectivePanelColor }}>
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
      />
    </div>
  )
}
