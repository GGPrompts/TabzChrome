import React, { useEffect, useState, useRef } from 'react'
import ReactDOM from 'react-dom/client'
import { Terminal as TerminalIcon, Settings, Plus, X } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Terminal } from '../components/Terminal'
import { SettingsModal, useTerminalSettings } from '../components/SettingsModal'
import { connectToBackground, sendMessage } from '../shared/messaging'
import { getLocal, setLocal } from '../shared/storage'
import '../styles/globals.css'

interface TerminalSession {
  id: string
  name: string
  type: string
  active: boolean
  sessionName?: string  // Tmux session name (only for tmux-based terminals)
}

function SidePanelTerminal() {
  const [sessions, setSessions] = useState<TerminalSession[]>([])
  const [currentSession, setCurrentSession] = useState<string | null>(null)
  const [wsConnected, setWsConnected] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const portRef = useRef<chrome.runtime.Port | null>(null)
  const terminalSettings = useTerminalSettings()

  // Tab context menu state (for session management)
  const [contextMenu, setContextMenu] = useState<{
    show: boolean
    x: number
    y: number
    terminalId: string | null
  }>({ show: false, x: 0, y: 0, terminalId: null })

  useEffect(() => {
    // Connect to background worker via port for broadcasts
    const port = connectToBackground('sidepanel', (message) => {
      // ✅ Handle initial state sent immediately on connection
      if (message.type === 'INITIAL_STATE') {
        setWsConnected(message.wsConnected)
      } else if (message.type === 'WS_CONNECTED') {
        setWsConnected(true)
      } else if (message.type === 'WS_DISCONNECTED') {
        setWsConnected(false)
      } else if (message.type === 'WS_MESSAGE') {
        handleWebSocketMessage(message.data)
      } else if (message.type === 'TERMINAL_OUTPUT') {
        // Terminal component will handle this
      }
    })

    portRef.current = port

    // Cleanup
    return () => {
      port.disconnect()
      portRef.current = null
    }
  }, [])

  // Close tab context menu on outside click
  useEffect(() => {
    if (!contextMenu.show) return

    const handleClick = () => {
      setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
    }

    document.addEventListener('click', handleClick)
    return () => {
      document.removeEventListener('click', handleClick)
    }
  }, [contextMenu.show])

  const handleWebSocketMessage = (data: any) => {
    console.log('[Sidepanel] handleWebSocketMessage:', data.type, data.type === 'terminal-spawned' || data.type === 'terminals' ? JSON.stringify(data).slice(0, 300) : '')
    switch (data.type) {
      case 'terminals':
        // Terminal list received on connection - restore existing terminals
        const existingTerminals = data.data || []
        console.log('[Sidepanel] 🔄 Restoring terminals:', existingTerminals.length)
        if (existingTerminals.length > 0) {
          setSessions(existingTerminals.map((t: any) => ({
            id: t.id,
            name: t.name || t.id,
            type: t.terminalType || 'bash',
            active: false,
            sessionName: t.sessionName,
          })))
          // Set first terminal as active
          setCurrentSession(existingTerminals[0].id)
        }
        break
      case 'session-list':
        setSessions(data.sessions || [])
        break
      case 'terminal-spawned':
        // Backend sends: { type: 'terminal-spawned', data: terminalObject, requestId }
        // terminalObject has: { id, name, terminalType, ... }
        const terminal = data.data || data
        console.log('[Sidepanel] 📥 Terminal spawned:', {
          id: terminal.id,
          name: terminal.name,
          type: terminal.terminalType,
        })
        setSessions(prev => {
          // Check if terminal already exists (from restore)
          if (prev.find(s => s.id === terminal.id)) {
            console.log('[Sidepanel] Terminal already exists, skipping add')
            return prev
          }
          return [...prev, {
            id: terminal.id,
            name: terminal.name || terminal.id,
            type: terminal.terminalType || 'bash',
            active: false,
            sessionName: terminal.sessionName,  // Store tmux session name
          }]
        })
        setCurrentSession(terminal.id)
        break
      case 'terminal-closed':
        // Backend sends: { type: 'terminal-closed', data: { id: terminalId } }
        const closedTerminalId = data.data?.id || data.terminalId || data.id
        console.log('[Sidepanel] 🗑️ Terminal closed:', closedTerminalId)
        setSessions(prev => {
          const updated = prev.filter(s => s.id !== closedTerminalId)
          // If closed terminal was active, switch to first remaining terminal
          if (currentSession === closedTerminalId) {
            setCurrentSession(updated[0]?.id || null)
          }
          return updated
        })
        break
    }
  }

  const handleSpawnTerminal = () => {
    sendMessage({
      type: 'SPAWN_TERMINAL',
      spawnOption: 'bash',
      name: 'Bash',
    })
  }

  const handleCloseTab = (e: React.MouseEvent, terminalId: string) => {
    e.stopPropagation() // Prevent tab selection when clicking X
    sendMessage({
      type: 'CLOSE_TERMINAL',
      terminalId,
    })
    // If closing current tab, switch to another one
    if (terminalId === currentSession && sessions.length > 1) {
      const currentIndex = sessions.findIndex(s => s.id === terminalId)
      const nextSession = sessions[currentIndex === 0 ? 1 : currentIndex - 1]
      setCurrentSession(nextSession.id)
    }
  }

  // Handle right-click on tab (session-level operations)
  const handleTabContextMenu = (e: React.MouseEvent, terminalId: string) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      terminalId
    })
  }

  // Handle "Rename Tab" from tab menu
  const handleContextRename = () => {
    if (!contextMenu.terminalId) return
    const terminal = sessions.find(s => s.id === contextMenu.terminalId)
    if (!terminal) return

    // TODO: Add rename dialog (Phase 2)
    const newName = prompt('Enter new name:', terminal.name)
    if (newName) {
      // Update local session name
      setSessions(prev => prev.map(s =>
        s.id === terminal.id ? { ...s, name: newName } : s
      ))
    }

    setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
  }

  // Handle "Detach Session" from tab menu
  const handleDetachSession = async () => {
    if (!contextMenu.terminalId) return

    const terminal = sessions.find(s => s.id === contextMenu.terminalId)
    if (!terminal?.sessionName) return

    console.log(`[handleDetachSession] Detaching session: ${terminal.sessionName}`)

    try {
      const response = await fetch(`http://localhost:8127/api/tmux/detach/${terminal.sessionName}`, {
        method: 'POST'
      })

      const data = await response.json()
      if (data.success) {
        console.log('[handleDetachSession] Session detached successfully')
        // Remove from UI but session stays alive in tmux
        setSessions(prev => prev.filter(s => s.id !== terminal.id))
        if (currentSession === terminal.id) {
          setCurrentSession(sessions[0]?.id || null)
        }
      } else {
        console.error('[handleDetachSession] Failed to detach:', data.error)
      }

      setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
    } catch (error) {
      console.error('[handleDetachSession] Error:', error)
    }
  }

  // Handle "Kill Session" from tab menu
  const handleKillSession = async () => {
    if (!contextMenu.terminalId) return

    const terminal = sessions.find(s => s.id === contextMenu.terminalId)
    if (!terminal?.sessionName) return

    console.log(`[handleKillSession] Killing session: ${terminal.sessionName}`)

    try {
      const response = await fetch(`http://localhost:8127/api/tmux/sessions/${terminal.sessionName}`, {
        method: 'DELETE'
      })

      const data = await response.json()
      if (data.success) {
        console.log('[handleKillSession] Session killed successfully')
        // Remove from UI and session is destroyed
        setSessions(prev => prev.filter(s => s.id !== terminal.id))
        if (currentSession === terminal.id) {
          setCurrentSession(sessions[0]?.id || null)
        }
      } else {
        console.error('[handleKillSession] Failed to kill:', data.error)
      }

      setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
    } catch (error) {
      console.error('[handleKillSession] Error:', error)
    }
  }

  return (
    <div className="h-screen flex flex-col bg-[#0a0a0a] text-foreground">
      {/* Header - Windows Terminal style */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-gradient-to-r from-[#0f0f0f] to-[#1a1a1a]">
        {/* Left: Title */}
        <div className="flex items-center gap-2">
          <TerminalIcon className="h-5 w-5 text-[#00ff88]" />
          <h1 className="text-sm font-semibold text-white">Terminal Tabs</h1>
          {sessions.length > 0 && (
            <Badge variant="secondary" className="text-xs bg-[#00ff88]/20 text-[#00ff88] border-[#00ff88]/30">
              {sessions.length}
            </Badge>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {/* Connection Status */}
          {wsConnected ? (
            <Badge variant="secondary" className="text-xs bg-[#00ff88]/20 text-[#00ff88] border-[#00ff88]/30">
              Connected
            </Badge>
          ) : (
            <Badge variant="destructive" className="text-xs">Disconnected</Badge>
          )}

          {/* Settings Button */}
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 hover:bg-[#00ff88]/10 rounded-md transition-colors text-gray-400 hover:text-[#00ff88]"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>

          {/* New Tab Button */}
          <button
            onClick={handleSpawnTerminal}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#00ff88] hover:bg-[#00c8ff] text-black rounded-md transition-colors font-medium text-sm"
            title="New Tab (Bash)"
          >
            <Plus className="h-4 w-4" />
            <span>New Tab</span>
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 relative overflow-hidden">
        {/* Terminals Panel */}
        <div className="h-full flex flex-col">
          {/* Session Tabs */}
          {sessions.length > 0 && (
            <div className="flex gap-1 p-2 border-b bg-gradient-to-r from-[#0f0f0f]/50 to-[#1a1a1a]/50 overflow-x-auto">
              {sessions.map(session => (
                <div
                  key={session.id}
                  className={`
                    flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-all cursor-pointer group
                    ${currentSession === session.id
                      ? 'bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/30'
                      : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-gray-300 border border-transparent'
                    }
                  `}
                  onClick={() => setCurrentSession(session.id)}
                  onContextMenu={(e) => handleTabContextMenu(e, session.id)}
                >
                  <span>{session.name}</span>
                  <button
                    onClick={(e) => handleCloseTab(e, session.id)}
                    className="p-0.5 rounded hover:bg-red-500/20 transition-colors opacity-0 group-hover:opacity-100"
                    title="Close tab"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Terminal View */}
          <div className="flex-1 relative" style={{ height: sessions.length > 0 ? 'calc(100% - 50px)' : '100%' }}>
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-400">
                <TerminalIcon className="h-16 w-16 mb-4 opacity-20" />
                <p className="text-lg font-medium mb-2">No active terminals</p>
                <p className="text-sm mb-4">Spawn a terminal to get started</p>
                <button
                  onClick={handleSpawnTerminal}
                  className="px-4 py-2 bg-gradient-to-r from-[#00ff88] to-[#00c8ff] text-black rounded-md hover:opacity-90 transition-opacity font-medium"
                >
                  <Plus className="inline-block h-4 w-4 mr-2" />
                  New Terminal
                </button>
              </div>
            ) : (
              <div className="h-full">
                {sessions.map(session => (
                  <div
                    key={session.id}
                    className="h-full"
                    style={{ display: session.id === currentSession ? 'block' : 'none' }}
                  >
                    <Terminal
                      terminalId={session.id}
                      sessionName={session.name}
                      terminalType={session.type}
                      fontSize={terminalSettings.fontSize}
                      fontFamily={terminalSettings.fontFamily}
                      theme={terminalSettings.theme}
                      onClose={() => {
                        sendMessage({
                          type: 'CLOSE_TERMINAL',
                          terminalId: session.id,
                        })
                      }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />

      {/* Tab Context Menu */}
      {contextMenu.show && contextMenu.terminalId && (
        <div
          className="tab-context-menu"
          style={{
            position: 'fixed',
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
            zIndex: 10000,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {(() => {
            const terminal = sessions.find(t => t.id === contextMenu.terminalId)
            const hasSession = terminal?.sessionName  // Only tmux sessions

            return (
              <>
                <button
                  className="context-menu-item"
                  onClick={handleContextRename}
                >
                  ✏️ Rename Tab...
                </button>
                {hasSession && (
                  <>
                    <div className="context-menu-divider" />
                    <button
                      className="context-menu-item"
                      onClick={handleDetachSession}
                    >
                      📌 Detach Session
                    </button>
                    <button
                      className="context-menu-item"
                      onClick={handleKillSession}
                    >
                      ❌ Kill Session
                    </button>
                  </>
                )}
              </>
            )
          })()}
        </div>
      )}

    </div>
  )
}

// Mount the sidepanel
ReactDOM.createRoot(document.getElementById('sidepanel-root')!).render(
  <React.StrictMode>
    <SidePanelTerminal />
  </React.StrictMode>
)
