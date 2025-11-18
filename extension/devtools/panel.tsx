import React, { useEffect, useState } from 'react'
import ReactDOM from 'react-dom/client'
import { Terminal, Copy, Network, Trash2 } from 'lucide-react'
import { Badge } from '../components/ui/badge'
import { Separator } from '../components/ui/separator'
import { onMessage, sendMessage } from '../shared/messaging'
import { generateCurlCommand } from '../shared/utils'
import '../styles/globals.css'

interface TerminalSession {
  id: string
  name: string
  type: string
}

interface NetworkRequest {
  url: string
  method: string
  timestamp: Date
  curlCommand: string
}

function DevToolsPanel() {
  const [sessions, setSessions] = useState<TerminalSession[]>([])
  const [currentSession, setCurrentSession] = useState<string | null>(null)
  const [networkRequests, setNetworkRequests] = useState<NetworkRequest[]>([])
  const [showNetworkPanel, setShowNetworkPanel] = useState(false)
  const [wsConnected, setWsConnected] = useState(false)

  useEffect(() => {
    // Listen for messages
    onMessage((message) => {
      if (message.type === 'WS_CONNECTED') {
        setWsConnected(true)
      } else if (message.type === 'WS_DISCONNECTED') {
        setWsConnected(false)
      } else if (message.type === 'WS_MESSAGE') {
        handleWebSocketMessage(message.data)
      }
    })

    // Listen for network requests from devtools.ts
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'NETWORK_REQUEST_FINISHED') {
        const curlCommand = generateCurlCommand(message.request)
        setNetworkRequests(prev => [{
          url: message.request.url,
          method: message.request.method,
          timestamp: new Date(),
          curlCommand,
        }, ...prev].slice(0, 50)) // Keep last 50 requests
      }
    })

    // Request initial session list
    sendMessage({ type: 'WS_MESSAGE', data: { type: 'list-sessions' } })
  }, [])

  const handleWebSocketMessage = (data: any) => {
    switch (data.type) {
      case 'session-list':
        setSessions(data.sessions || [])
        break
      case 'terminal-spawned':
        setSessions(prev => [...prev, {
          id: data.terminalId,
          name: data.sessionName || data.terminalId,
          type: data.spawnOption || 'bash',
        }])
        setCurrentSession(data.terminalId)
        break
      case 'terminal-closed':
        setSessions(prev => prev.filter(s => s.id !== data.terminalId))
        if (currentSession === data.terminalId) {
          setCurrentSession(sessions[0]?.id || null)
        }
        break
    }
  }

  const handleSpawnTerminal = () => {
    sendMessage({
      type: 'SPAWN_TERMINAL',
      spawnOption: 'bash',
    })
  }

  const handleCopyCurl = (curlCommand: string) => {
    navigator.clipboard.writeText(curlCommand)
    // TODO: Show toast notification
    console.log('cURL command copied!')
  }

  const handlePasteToCurrent = (curlCommand: string) => {
    if (currentSession) {
      sendMessage({
        type: 'WS_MESSAGE',
        data: {
          type: 'terminal-input',
          terminalId: currentSession,
          data: curlCommand + '\n',
        },
      })
    }
  }

  const handleClearRequests = () => {
    setNetworkRequests([])
  }

  return (
    <div className="h-screen flex bg-background text-foreground">
      {/* Main Terminal Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b bg-card">
          <div className="flex items-center gap-2">
            <Terminal className="h-5 w-5" />
            <h1 className="text-sm font-semibold">Terminal Tabs - DevTools</h1>
            {wsConnected ? (
              <Badge variant="secondary" className="text-xs">Connected</Badge>
            ) : (
              <Badge variant="destructive" className="text-xs">Disconnected</Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowNetworkPanel(!showNetworkPanel)}
              className={`
                px-3 py-1.5 rounded-md text-sm font-medium transition-colors
                ${showNetworkPanel ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'}
              `}
            >
              <Network className="inline-block h-4 w-4 mr-1" />
              Network ({networkRequests.length})
            </button>

            <button
              onClick={handleSpawnTerminal}
              className="px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 text-sm font-medium"
            >
              New Terminal
            </button>
          </div>
        </div>

        {/* Session Tabs */}
        {sessions.length > 0 && (
          <div className="flex gap-1 p-2 border-b bg-muted/30 overflow-x-auto">
            {sessions.map(session => (
              <button
                key={session.id}
                onClick={() => setCurrentSession(session.id)}
                className={`
                  px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors
                  ${currentSession === session.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card hover:bg-accent text-foreground'
                  }
                `}
              >
                {session.name}
              </button>
            ))}
          </div>
        )}

        {/* Terminal View */}
        <div className="flex-1 relative overflow-hidden">
          {sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Terminal className="h-20 w-20 mb-4 opacity-20" />
              <p className="text-lg font-medium mb-2">No active terminals</p>
              <p className="text-sm mb-4">Spawn a terminal to get started</p>
              <button
                onClick={handleSpawnTerminal}
                className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
              >
                New Terminal
              </button>
            </div>
          ) : (
            <div className="h-full">
              {/* TODO: Integrate actual xterm.js terminal component */}
              <div className="flex items-center justify-center h-full">
                <div className="text-center text-muted-foreground">
                  <Terminal className="h-16 w-16 mx-auto mb-2 opacity-50" />
                  <p className="text-sm">Terminal view coming soon...</p>
                  <p className="text-xs mt-1">Session: {currentSession}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Network Panel (Resizable) */}
      {showNetworkPanel && (
        <>
          <Separator orientation="vertical" />
          <div className="w-96 flex flex-col border-l bg-card">
            <div className="flex items-center justify-between p-3 border-b">
              <h2 className="text-sm font-semibold">Network Requests</h2>
              <button
                onClick={handleClearRequests}
                className="p-1.5 hover:bg-accent rounded-md transition-colors"
                title="Clear requests"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {networkRequests.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
                  <Network className="h-12 w-12 mb-2 opacity-20" />
                  <p className="text-sm text-center">No network requests yet</p>
                  <p className="text-xs text-center mt-1">Requests will appear here as you browse</p>
                </div>
              ) : (
                <div className="divide-y">
                  {networkRequests.map((request, index) => (
                    <div key={index} className="p-3 hover:bg-accent/50 transition-colors">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs">
                              {request.method}
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {request.timestamp.toLocaleTimeString()}
                            </span>
                          </div>
                          <p className="text-xs font-mono truncate" title={request.url}>
                            {request.url}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-1">
                        <button
                          onClick={() => handleCopyCurl(request.curlCommand)}
                          className="flex-1 px-2 py-1 text-xs bg-secondary hover:bg-secondary/80 rounded-md transition-colors"
                        >
                          <Copy className="inline-block h-3 w-3 mr-1" />
                          Copy cURL
                        </button>
                        <button
                          onClick={() => handlePasteToCurrent(request.curlCommand)}
                          className="flex-1 px-2 py-1 text-xs bg-primary hover:bg-primary/90 text-primary-foreground rounded-md transition-colors"
                          disabled={!currentSession}
                        >
                          <Terminal className="inline-block h-3 w-3 mr-1" />
                          Run
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// Mount the panel
ReactDOM.createRoot(document.getElementById('devtools-root')!).render(
  <React.StrictMode>
    <DevToolsPanel />
  </React.StrictMode>
)
