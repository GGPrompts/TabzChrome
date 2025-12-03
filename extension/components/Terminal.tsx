import React, { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import '@xterm/xterm/css/xterm.css'
import { sendMessage, connectToBackground } from '../shared/messaging'

interface TerminalProps {
  terminalId: string
  sessionName?: string
  terminalType?: string
  workingDir?: string      // For Claude status polling
  tmuxSession?: string     // Tmux session name for precise status matching
  fontSize?: number
  fontFamily?: string
  theme?: 'dark' | 'light'
  pasteCommand?: string | null  // Command to paste into terminal input
  onClose?: () => void
}

interface ClaudeStatus {
  status: 'idle' | 'awaiting_input' | 'processing' | 'tool_use' | 'working' | 'unknown'
  current_tool?: string
}

export function Terminal({ terminalId, sessionName, terminalType = 'bash', workingDir, tmuxSession, fontSize = 14, fontFamily = 'monospace', theme = 'dark', pasteCommand = null, onClose }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [claudeStatus, setClaudeStatus] = useState<ClaudeStatus | null>(null)

  // Resize trick to force complete redraw (used for theme/font changes and manual refresh)
  const triggerResizeTrick = () => {
    if (xtermRef.current && fitAddonRef.current) {
      const currentCols = xtermRef.current.cols
      const currentRows = xtermRef.current.rows
      console.log('[Terminal] Triggering resize trick for:', terminalId)

      // Step 1: Resize down by 1 column
      xtermRef.current.resize(currentCols - 1, currentRows)
      sendMessage({
        type: 'TERMINAL_RESIZE',
        terminalId,
        cols: currentCols - 1,
        rows: currentRows,
      })

      // Step 2: Wait then resize back to original size
      setTimeout(() => {
        if (xtermRef.current) {
          xtermRef.current.resize(currentCols, currentRows)
          sendMessage({
            type: 'TERMINAL_RESIZE',
            terminalId,
            cols: currentCols,
            rows: currentRows,
          })
          console.log('[Terminal] Resize trick completed')
        }
      }, 100)
    }
  }

  // Initialize xterm.js
  useEffect(() => {
    if (!terminalRef.current || xtermRef.current) return

    console.log('[Terminal] Initializing xterm for terminal:', terminalId)

    // Theme definitions
    const darkTheme = {
      background: '#0a0a0a',
      foreground: '#00ff88',
      cursor: '#00ff88',
      black: '#000000',
      red: '#ff5555',
      green: '#00ff88',
      yellow: '#ffff55',
      blue: '#5555ff',
      magenta: '#ff55ff',
      cyan: '#00c8ff',
      white: '#bbbbbb',
      brightBlack: '#555555',
      brightRed: '#ff5555',
      brightGreen: '#00ff88',
      brightYellow: '#ffff55',
      brightBlue: '#5555ff',
      brightMagenta: '#ff55ff',
      brightCyan: '#00c8ff',
      brightWhite: '#ffffff',
    }

    // Light theme with inverted ANSI colors for TUI app compatibility
    // black/white are swapped so TUI apps using "black" backgrounds get light colors
    const lightTheme = {
      background: '#f5f5f5',
      foreground: '#24292e',
      cursor: '#24292e',
      black: '#f5f5f5',       // Light (was dark) - TUI "black" backgrounds become light
      red: '#c41a16',
      green: '#007400',
      yellow: '#826b28',
      blue: '#0451a5',
      magenta: '#bc05bc',
      cyan: '#0598bc',
      white: '#24292e',       // Dark (was light) - TUI "white" text becomes dark
      brightBlack: '#d4d4d4', // Light gray
      brightRed: '#cd3131',
      brightGreen: '#14ce14',
      brightYellow: '#b5ba00',
      brightBlue: '#0451a5',
      brightMagenta: '#bc05bc',
      brightCyan: '#0598bc',
      brightWhite: '#1f1f1f', // Dark
    }

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize,
      fontFamily,
      theme: theme === 'dark' ? darkTheme : lightTheme,
      scrollback: sessionName ? 0 : 10000, // No scrollback for tmux (tmux handles scrolling)
      convertEol: false,
      allowProposedApi: true,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    const unicode11Addon = new Unicode11Addon()

    xterm.loadAddon(fitAddon)
    xterm.loadAddon(webLinksAddon)
    xterm.loadAddon(unicode11Addon)
    xterm.unicode.activeVersion = '11'

    // Open terminal
    xterm.open(terminalRef.current)
    console.log('[Terminal] xterm opened successfully', {
      terminalId,
      requestedFontSize: fontSize,
      requestedFontFamily: fontFamily,
      actualFontSize: xterm.options.fontSize,
      actualFontFamily: xterm.options.fontFamily,
    })

    // Handle terminal input - send to background worker
    xterm.onData((data) => {
      sendMessage({
        type: 'TERMINAL_INPUT',
        terminalId,
        data,
      })
    })

    // Enable Shift+Ctrl+C/V for copy/paste
    // Important: Return true to allow all other keys (including tmux Ctrl+B) to pass through
    xterm.attachCustomKeyEventHandler((event) => {
      // Debug logging for Ctrl keys (can be removed after testing)
      if (event.ctrlKey) {
        console.log('[Terminal] Ctrl key event:', {
          key: event.key,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          code: event.code,
          type: event.type
        })
      }

      // Handle Ctrl+Shift+C (copy) - case insensitive
      if (event.ctrlKey && event.shiftKey && (event.key === 'C' || event.key === 'c') && xterm.hasSelection()) {
        event.preventDefault()
        document.execCommand('copy')
        return false
      }
      // Handle Ctrl+Shift+V (paste) - case insensitive
      if (event.ctrlKey && event.shiftKey && (event.key === 'V' || event.key === 'v')) {
        event.preventDefault()
        navigator.clipboard.readText().then((text) => {
          xterm.paste(text)
        })
        return false
      }
      // Allow all other keys to pass through to terminal (including Ctrl+B for tmux)
      return true
    })

    xtermRef.current = xterm
    fitAddonRef.current = fitAddon

    // Fit terminal to container (with longer timeout for initial render)
    const fitTerminal = () => {
      if (fitAddonRef.current && terminalRef.current?.offsetWidth) {
        fitAddonRef.current.fit()
        console.log('[Terminal] Fit:', xterm.cols, 'x', xterm.rows)

        // Send resize to backend
        sendMessage({
          type: 'TERMINAL_RESIZE',
          terminalId,
          cols: xterm.cols,
          rows: xterm.rows,
        })
      }
    }

    // Initial fit with timeout
    setTimeout(fitTerminal, 100)

    // Second fit to catch cases where container wasn't ready
    setTimeout(fitTerminal, 300)

    // Request output buffering for restored terminals (in case we're reconnecting)
    // This triggers the backend to start sending output again
    setTimeout(() => {
      console.log('[Terminal] Requesting terminal reattachment for:', terminalId)
      sendMessage({
        type: 'TERMINAL_RESIZE', // Resize acts as a "wake up" signal
        terminalId,
        cols: xterm.cols,
        rows: xterm.rows,
      })
    }, 400)

    // Focus terminal
    setTimeout(() => {
      xterm.focus()
    }, 150)

    // ResizeObserver to fit when container size changes
    const resizeObserver = new ResizeObserver(() => {
      fitTerminal()
    })

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current)
    }

    // Cleanup
    return () => {
      console.log('[Terminal] Cleaning up xterm for terminal:', terminalId)
      resizeObserver.disconnect()
      xterm.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
    }
  }, [terminalId])

  // Listen for terminal output from background worker via port
  useEffect(() => {
    console.log('[Terminal] Connecting to background for terminal:', terminalId)

    const port = connectToBackground(`terminal-${terminalId}`, (message) => {
      // ✅ Handle initial state sent immediately on connection
      if (message.type === 'INITIAL_STATE') {
        console.log('[Terminal] 📥 Received initial state - WebSocket:', message.wsConnected ? 'connected' : 'disconnected')
        setIsConnected(message.wsConnected)
      } else if (message.type === 'TERMINAL_OUTPUT' && message.terminalId === terminalId) {
        console.log('[Terminal] 📟 TERMINAL_OUTPUT received:', {
          terminalId: message.terminalId,
          dataLength: message.data?.length,
          hasXterm: !!xtermRef.current,
          data: message.data?.slice(0, 50)
        })
        if (xtermRef.current && message.data) {
          xtermRef.current.write(message.data)
          console.log('[Terminal] ✍️ Wrote to xterm:', message.data.length, 'bytes')
        } else {
          console.warn('[Terminal] ⚠️ Cannot write - xterm:', !!xtermRef.current, 'data:', !!message.data)
        }
      } else if (message.type === 'WS_CONNECTED') {
        console.log('[Terminal] WebSocket connected')
        setIsConnected(true)
      } else if (message.type === 'WS_DISCONNECTED') {
        console.log('[Terminal] WebSocket disconnected')
        setIsConnected(false)
      } else if (message.type === 'REFRESH_TERMINALS') {
        console.log('[Terminal] 🔄 Refresh requested for:', terminalId)
        // Use timeout to ensure xterm is fully ready
        setTimeout(() => {
          triggerResizeTrick()
        }, 50)
      }
    })

    // Cleanup
    return () => {
      console.log('[Terminal] Disconnecting from background')
      port.disconnect()
    }
  }, [terminalId])

  // Update terminal settings when props change
  useEffect(() => {
    const xterm = xtermRef.current
    if (!xterm) return

    console.log('[Terminal] Updating settings:', { fontSize, fontFamily, theme })

    // Theme definitions (same as initialization)
    const darkTheme = {
      background: '#0a0a0a',
      foreground: '#00ff88',
      cursor: '#00ff88',
      black: '#000000',
      red: '#ff5555',
      green: '#00ff88',
      yellow: '#ffff55',
      blue: '#5555ff',
      magenta: '#ff55ff',
      cyan: '#00c8ff',
      white: '#bbbbbb',
      brightBlack: '#555555',
      brightRed: '#ff5555',
      brightGreen: '#00ff88',
      brightYellow: '#ffff55',
      brightBlue: '#5555ff',
      brightMagenta: '#ff55ff',
      brightCyan: '#00c8ff',
      brightWhite: '#ffffff',
    }

    // Light theme with inverted ANSI colors for TUI app compatibility
    const lightTheme = {
      background: '#f5f5f5',
      foreground: '#24292e',
      cursor: '#24292e',
      black: '#f5f5f5',
      red: '#c41a16',
      green: '#007400',
      yellow: '#826b28',
      blue: '#0451a5',
      magenta: '#bc05bc',
      cyan: '#0598bc',
      white: '#24292e',
      brightBlack: '#d4d4d4',
      brightRed: '#cd3131',
      brightGreen: '#14ce14',
      brightYellow: '#b5ba00',
      brightBlue: '#0451a5',
      brightMagenta: '#bc05bc',
      brightCyan: '#0598bc',
      brightWhite: '#1f1f1f',
    }

    // Update font size
    if (xterm.options.fontSize !== fontSize) {
      console.log('[Terminal] Changing font size from', xterm.options.fontSize, 'to', fontSize)
      xterm.options.fontSize = fontSize
    }

    // Update font family
    if (xterm.options.fontFamily !== fontFamily) {
      console.log('[Terminal] Changing font family from', xterm.options.fontFamily, 'to', fontFamily)
      xterm.options.fontFamily = fontFamily
    }

    // Update theme
    const currentTheme = theme === 'dark' ? darkTheme : lightTheme
    xterm.options.theme = currentTheme

    // Force refresh the terminal content
    xterm.refresh(0, xterm.rows - 1)
    console.log('[Terminal] Settings updated - fontSize:', fontSize, 'fontFamily:', fontFamily, 'theme:', theme)

    // Use resize trick to force complete redraw (prevents visual artifacts)
    setTimeout(() => {
      triggerResizeTrick()
    }, 50)
  }, [fontSize, fontFamily, theme, terminalId])

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      if (fitAddonRef.current && xtermRef.current) {
        fitAddonRef.current.fit()
        sendMessage({
          type: 'TERMINAL_RESIZE',
          terminalId,
          cols: xtermRef.current.cols,
          rows: xtermRef.current.rows,
        })
      }
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [terminalId])

  // Handle paste command (from context menu)
  useEffect(() => {
    if (pasteCommand && xtermRef.current) {
      console.log('[Terminal] 📋 Pasting command to terminal:', pasteCommand)

      // Write the text to the terminal (simulating user typing)
      // This appears in the terminal but doesn't execute until user presses Enter
      xtermRef.current.paste(pasteCommand)

      // Focus the terminal so user can see the pasted text
      xtermRef.current.focus()
    }
  }, [pasteCommand, terminalId])

  // Poll Claude status if we have a working directory
  useEffect(() => {
    if (!workingDir) {
      setClaudeStatus(null)
      return
    }

    // Expand ~ to /home/<user> (backend runs in Linux)
    const expandedDir = workingDir.startsWith('~')
      ? workingDir.replace('~', '/home/matt')  // TODO: Could make this configurable
      : workingDir

    const checkStatus = async () => {
      try {
        const encodedDir = encodeURIComponent(expandedDir)
        // Include tmux session name for precise pane matching when available
        const sessionParam = tmuxSession ? `&sessionName=${encodeURIComponent(tmuxSession)}` : ''
        const response = await fetch(`http://localhost:8129/api/claude-status?dir=${encodedDir}${sessionParam}`)
        const result = await response.json()

        if (result.success && result.status !== 'unknown') {
          setClaudeStatus({
            status: result.status,
            current_tool: result.current_tool
          })
        } else {
          setClaudeStatus(null)
        }
      } catch {
        // Backend not available or no status - silently ignore
        setClaudeStatus(null)
      }
    }

    // Initial check
    checkStatus()

    // Poll every 2 seconds
    const interval = setInterval(checkStatus, 2000)

    return () => clearInterval(interval)
  }, [workingDir])

  // Helper to format Claude status for display
  const formatClaudeStatus = () => {
    if (!claudeStatus) return null

    switch (claudeStatus.status) {
      case 'idle':
        return { emoji: '🟢', text: 'Ready' }
      case 'awaiting_input':
        return { emoji: '⏸️', text: 'Awaiting' }
      case 'processing':
        return { emoji: '🟡', text: 'Thinking' }
      case 'tool_use':
        return { emoji: '🔧', text: claudeStatus.current_tool?.slice(0, 10) || 'Tool' }
      case 'working':
        return { emoji: '⚙️', text: claudeStatus.current_tool?.slice(0, 10) || 'Working' }
      default:
        return null
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Terminal body - full height, status shown in tmux status bar */}
      <div className="flex-1 relative overflow-hidden">
        <div
          ref={terminalRef}
          className={`absolute inset-0 ${sessionName ? 'hide-xterm-scrollbar' : ''}`}
          style={{
            padding: '4px',
            paddingBottom: '0px', // No bottom padding - ensure tmux status bar is fully visible
          }}
        />
      </div>

      {/* Connection status indicator */}
      {!isConnected && (
        <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="text-center">
            <div className="text-sm text-muted-foreground mb-2">Connecting...</div>
            <div className="animate-pulse">⚡</div>
          </div>
        </div>
      )}
    </div>
  )
}
