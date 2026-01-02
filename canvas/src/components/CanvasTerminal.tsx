import { useRef, useState, useCallback, useEffect } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import type { CanvasTerminal as CanvasTerminalType } from '../hooks/useCanvasTerminals'
import '@xterm/xterm/css/xterm.css'

// Default theme (high-contrast dark)
const defaultTheme = {
  background: '#0a0a0f',
  foreground: '#e0e0e0',
  cursor: '#00d4ff',
  cursorAccent: '#0a0a0f',
  selectionBackground: 'rgba(0, 212, 255, 0.3)',
  black: '#000000',
  red: '#ff4757',
  green: '#5af78e',
  yellow: '#ffd93d',
  blue: '#57c7ff',
  magenta: '#ff6ac1',
  cyan: '#6bcf7f',
  white: '#e0e0e0',
}

interface Props {
  terminal: CanvasTerminalType
  zoom: number
  onUpdate: (updates: Partial<CanvasTerminalType['canvas']>) => void
  onRemove: () => void
}

const API_BASE = '/api'

export function CanvasTerminal({ terminal, zoom, onUpdate, onRemove }: Props) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  const [isDragging, setIsDragging] = useState(false)
  const [isResizing, setIsResizing] = useState(false)
  const [isEditingName, setIsEditingName] = useState(false)
  const [editedName, setEditedName] = useState(terminal.name)
  const [dragStart, setDragStart] = useState({ mouseX: 0, mouseY: 0, termX: 0, termY: 0 })
  const [resizeStart, setResizeStart] = useState({ width: 0, height: 0, x: 0, y: 0 })
  const [isConnected, setIsConnected] = useState(false)

  // Get current position/size from canvas state
  const position = terminal.canvas || { x: 100, y: 100, width: 600, height: 400 }

  // Initialize xterm and connect to backend
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return

    const xterm = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
      theme: defaultTheme,
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()

    xterm.loadAddon(fitAddon)
    xterm.loadAddon(webLinksAddon)
    xterm.open(terminalRef.current)

    // Fit after a short delay to ensure container is sized
    setTimeout(() => fitAddon.fit(), 50)

    xtermRef.current = xterm
    fitAddonRef.current = fitAddon

    // Connect to existing session
    connectToBackend(xterm)

    return () => {
      wsRef.current?.close()
      xterm.dispose()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Connect to TabzChrome backend via WebSocket
  const connectToBackend = async (xterm: Terminal) => {
    try {
      // Get auth token
      const tokenRes = await fetch(`${API_BASE}/auth-token`)
      if (!tokenRes.ok) {
        xterm.writeln('\x1b[31mFailed to get auth token. Is TabzChrome backend running?\x1b[0m')
        return
      }
      const { token } = await tokenRes.json()

      // Connect to existing session via WebSocket
      const terminalId = terminal.id
      if (!terminalId) {
        xterm.writeln('\x1b[31mNo terminal ID to connect to\x1b[0m')
        return
      }

      // WebSocket connects to root path (not /tabz-ws)
      const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${wsProtocol}//${window.location.host}/?token=${token}`)
      wsRef.current = ws

      ws.onopen = () => {
        setIsConnected(true)

        // Send reconnect message to subscribe to terminal output
        ws.send(JSON.stringify({
          type: 'reconnect',
          terminalId: terminalId,
        }))

        // Request terminal dimensions after a short delay
        setTimeout(() => {
          if (fitAddonRef.current && ws.readyState === WebSocket.OPEN) {
            fitAddonRef.current.fit()
            const dims = fitAddonRef.current.proposeDimensions()
            if (dims) {
              ws.send(JSON.stringify({
                type: 'resize',
                terminalId: terminalId,
                cols: dims.cols,
                rows: dims.rows,
              }))
            }
          }
        }, 100)
      }

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        // Handle terminal output (backend sends 'terminal-output' type)
        if (data.type === 'terminal-output' && data.terminalId === terminalId) {
          xterm.write(data.data)
        } else if (data.type === 'output') {
          // Fallback for legacy format
          xterm.write(data.payload)
        }
      }

      ws.onclose = () => {
        setIsConnected(false)
        xterm.writeln('\x1b[33mDisconnected from terminal\x1b[0m')
      }

      ws.onerror = () => {
        xterm.writeln('\x1b[31mWebSocket error\x1b[0m')
      }

      // Send input to backend (must match Chrome extension format)
      // See: extension/background/messageHandlers.ts line 251-256
      xterm.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'command',
            terminalId: terminalId,
            command: data,
          }))
        }
      })
    } catch (err) {
      xterm.writeln(`\x1b[31mConnection error: ${err}\x1b[0m`)
    }
  }

  // Handle resize
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
        fitAddonRef.current.fit()
        const dims = fitAddonRef.current.proposeDimensions()
        if (dims) {
          wsRef.current.send(JSON.stringify({
            type: 'resize',
            terminalId: terminal.id,
            cols: dims.cols,
            rows: dims.rows,
          }))
        }
      }
    }

    // Debounce resize
    let timeout: ReturnType<typeof setTimeout>
    const debouncedResize = () => {
      clearTimeout(timeout)
      timeout = setTimeout(handleResize, 100)
    }

    window.addEventListener('resize', debouncedResize)
    return () => {
      window.removeEventListener('resize', debouncedResize)
      clearTimeout(timeout)
    }
  }, [])

  // Drag handlers
  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
    setDragStart({
      mouseX: e.clientX,
      mouseY: e.clientY,
      termX: position.x,
      termY: position.y,
    })
  }, [position])

  const handleDrag = useCallback((e: MouseEvent) => {
    if (!isDragging) return
    const deltaX = (e.clientX - dragStart.mouseX) / zoom
    const deltaY = (e.clientY - dragStart.mouseY) / zoom
    onUpdate({
      x: dragStart.termX + deltaX,
      y: dragStart.termY + deltaY,
    })
  }, [isDragging, dragStart, zoom, onUpdate])

  const handleDragEnd = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsResizing(true)
    setResizeStart({
      width: position.width,
      height: position.height,
      x: e.clientX,
      y: e.clientY,
    })
  }, [position])

  const handleResize = useCallback((e: MouseEvent) => {
    if (!isResizing) return
    const deltaX = (e.clientX - resizeStart.x) / zoom
    const deltaY = (e.clientY - resizeStart.y) / zoom

    onUpdate({
      width: Math.max(300, resizeStart.width + deltaX),
      height: Math.max(200, resizeStart.height + deltaY),
    })

    // Fit terminal after resize
    if (fitAddonRef.current) {
      fitAddonRef.current.fit()
    }
  }, [isResizing, resizeStart, zoom, onUpdate])

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false)
    // Final fit after resize ends
    if (fitAddonRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
      fitAddonRef.current.fit()
      const dims = fitAddonRef.current.proposeDimensions()
      if (dims) {
        wsRef.current.send(JSON.stringify({
          type: 'resize',
          terminalId: terminal.id,
          cols: dims.cols,
          rows: dims.rows,
        }))
      }
    }
  }, [terminal.id])

  // Return terminal to sidebar
  const handleReturnToSidebar = async () => {
    try {
      // Release canvas ownership on the backend before transfer
      // This prevents "2 owners" warning when sidebar reconnects
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'release-ownership',
          terminalId: terminal.id,
        }))
      }

      const response = await fetch(`${API_BASE}/canvas/terminals/${terminal.id}/transfer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ owner: 'sidebar' }),
      })
      if (response.ok) {
        // Remove from canvas - the sidebar will pick it up
        onRemove()
      } else {
        console.error('Failed to return terminal to sidebar:', response.statusText)
      }
    } catch (error) {
      console.error('Failed to return terminal to sidebar:', error)
    }
  }

  // Name editing handlers
  const handleNameDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setEditedName(terminal.name)
    setIsEditingName(true)
  }, [terminal.name])

  const handleNameSave = useCallback(() => {
    // Name changes would need a different API call - for now just close editing
    setIsEditingName(false)
  }, [])

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      handleNameSave()
    } else if (e.key === 'Escape') {
      setEditedName(terminal.name)
      setIsEditingName(false)
    }
  }, [handleNameSave, terminal.name])

  // Global mouse listeners for drag/resize
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleDrag)
      window.addEventListener('mouseup', handleDragEnd)
      return () => {
        window.removeEventListener('mousemove', handleDrag)
        window.removeEventListener('mouseup', handleDragEnd)
      }
    }
  }, [isDragging, handleDrag, handleDragEnd])

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', handleResize)
      window.addEventListener('mouseup', handleResizeEnd)
      return () => {
        window.removeEventListener('mousemove', handleResize)
        window.removeEventListener('mouseup', handleResizeEnd)
      }
    }
  }, [isResizing, handleResize, handleResizeEnd])

  // Fit terminal when size changes
  useEffect(() => {
    if (fitAddonRef.current) {
      setTimeout(() => fitAddonRef.current?.fit(), 50)
    }
  }, [position.width, position.height])

  return (
    <div
      className="absolute bg-[var(--card)] border border-[var(--border)] rounded-lg overflow-hidden shadow-xl"
      style={{
        left: position.x,
        top: position.y,
        width: position.width,
        height: position.height,
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-3 py-2 bg-[var(--muted)] border-b border-[var(--border)] cursor-move select-none"
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2">
          <div
            className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500' : 'bg-[var(--primary)]'}`}
            title={isConnected ? 'Connected' : 'Disconnected'}
          />
          {isEditingName ? (
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={handleNameKeyDown}
              onMouseDown={(e) => e.stopPropagation()}
              autoFocus
              className="text-xs font-medium bg-[var(--background)] border border-[var(--border)] rounded px-1 py-0.5 max-w-[200px] outline-none focus:ring-1 focus:ring-[var(--primary)]"
            />
          ) : (
            <span
              className="text-xs font-medium truncate max-w-[200px] cursor-text"
              onDoubleClick={handleNameDoubleClick}
            >
              {terminal.name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleReturnToSidebar}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1 hover:bg-[var(--background)] rounded transition-colors"
            title="Return to Sidebar"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 3v18M7 12h14M7 12l4-4M7 12l4 4" />
            </svg>
          </button>
          <button
            onClick={onRemove}
            className="p-1 hover:bg-[var(--background)] rounded transition-colors"
            title="Close terminal"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Terminal body */}
      <div
        ref={terminalRef}
        className="h-[calc(100%-36px)] p-1"
        style={{ background: defaultTheme.background }}
      />

      {/* Resize handle */}
      <div
        className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
        onMouseDown={handleResizeStart}
      >
        <svg
          className="w-3 h-3 absolute bottom-0.5 right-0.5 text-[var(--muted-foreground)]"
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M22 22H20V20H22V22ZM22 18H20V16H22V18ZM18 22H16V20H18V22ZM22 14H20V12H22V14ZM18 18H16V16H18V18ZM14 22H12V20H14V22Z" />
        </svg>
      </div>
    </div>
  )
}
