import React, { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import '@xterm/xterm/css/xterm.css'
import { sendMessage, connectToBackground } from '../shared/messaging'
import { getThemeColors, getBackgroundGradient } from '../styles/themes'

interface TerminalProps {
  terminalId: string
  sessionName?: string
  terminalType?: string
  workingDir?: string      // For Claude status polling
  tmuxSession?: string     // Tmux session name for precise status matching
  fontSize?: number
  fontFamily?: string
  themeName?: string       // Theme family name (high-contrast, dracula, ocean, etc.)
  isDark?: boolean         // Dark or light mode
  isActive?: boolean       // Whether this terminal is currently visible/active
  pasteCommand?: string | null  // Command to paste into terminal input
  onClose?: () => void
}

interface ClaudeStatus {
  status: 'idle' | 'awaiting_input' | 'processing' | 'tool_use' | 'working' | 'unknown'
  current_tool?: string
}

export function Terminal({ terminalId, sessionName, terminalType = 'bash', workingDir, tmuxSession, fontSize = 14, fontFamily = 'monospace', themeName = 'high-contrast', isDark = true, isActive = true, pasteCommand = null, onClose }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [claudeStatus, setClaudeStatus] = useState<ClaudeStatus | null>(null)
  const [isInitialized, setIsInitialized] = useState(false)  // Track if xterm has been opened

  // Track previous dimensions to avoid unnecessary resize events (from terminal-tabs pattern)
  const prevDimensionsRef = useRef({ cols: 0, rows: 0 })

  // NOTE: lastRefreshedDimensionsRef was removed - post-resize refresh disabled
  // because it broke tmux splits (SIGWINCH affects all panes)

  // Initialization guard - filter device queries during first 1000ms (from terminal-tabs pattern)
  const isInitializingRef = useRef(true)

  // Resize lock - prevents concurrent resize operations that can corrupt xterm.js buffer
  // The isWrapped error occurs when resize() is called while data is being written
  const isResizingRef = useRef(false)
  const resizeLockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Output tracking - delay resize during active output to prevent tmux status bar corruption
  // When tmux is outputting content, resizing can corrupt scroll regions and cause the status bar to disappear
  const lastOutputTimeRef = useRef(0)
  const OUTPUT_QUIET_PERIOD = 200 // ms to wait after output before allowing resize

  // Resize trick to force complete redraw (used for theme/font changes and manual refresh)
  // CRITICAL: Uses resize lock and try/catch to prevent buffer corruption
  const triggerResizeTrick = () => {
    if (!xtermRef.current || !fitAddonRef.current) return

    // Skip if already resizing
    if (isResizingRef.current) {
      console.log('[Terminal] Skipping resize trick - resize already in progress')
      return
    }

    const currentCols = xtermRef.current.cols
    const currentRows = xtermRef.current.rows
    console.log('[Terminal] Triggering resize trick for:', terminalId)

    try {
      isResizingRef.current = true

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
          try {
            xtermRef.current.resize(currentCols, currentRows)
            sendMessage({
              type: 'TERMINAL_RESIZE',
              terminalId,
              cols: currentCols,
              rows: currentRows,
            })
            console.log('[Terminal] Resize trick completed')
          } catch (e) {
            console.warn('[Terminal] Resize trick step 2 failed:', e)
          }
        }
        isResizingRef.current = false
      }, 100)
    } catch (e) {
      console.warn('[Terminal] Resize trick step 1 failed:', e)
      isResizingRef.current = false
    }
  }

  // Initialize xterm.js - only when terminal becomes active (visible)
  // This prevents issues with hidden terminals having 0 dimensions
  useEffect(() => {
    // Skip if not active, already initialized, no ref, or xterm already exists
    if (!isActive || isInitialized || !terminalRef.current || xtermRef.current) return

    console.log('[Terminal] Initializing xterm for terminal:', terminalId, '(now active)')

    // Get theme colors from the new theme system
    const themeColors = getThemeColors(themeName, isDark)

    const xterm = new XTerm({
      cursorBlink: true,
      fontSize,
      fontFamily,
      theme: themeColors,
      scrollback: sessionName ? 0 : 10000, // No scrollback for tmux (tmux handles scrolling)
      convertEol: false,
      allowProposedApi: true,
      // CRITICAL: Ensure minimum contrast for readability
      // Fixes white/light text on bright green/red backgrounds in diffs
      // 4.5 = WCAG AA standard, 7 = AAA (we use 4.5 as good balance)
      minimumContrastRatio: 4.5,
    })

    const fitAddon = new FitAddon()
    const webLinksAddon = new WebLinksAddon()
    const unicode11Addon = new Unicode11Addon()

    xterm.loadAddon(fitAddon)
    xterm.loadAddon(webLinksAddon)
    xterm.loadAddon(unicode11Addon)
    xterm.unicode.activeVersion = '11'

    // Store refs early so fit functions can use them
    xtermRef.current = xterm
    fitAddonRef.current = fitAddon

    // Debounced resize - only send to backend after dimensions stabilize AND actually changed
    // Pattern from terminal-tabs: track previous dimensions to avoid unnecessary resize events
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null
    const debouncedSendResize = () => {
      if (resizeTimeout) clearTimeout(resizeTimeout)
      resizeTimeout = setTimeout(() => {
        if (xtermRef.current) {
          const cols = xtermRef.current.cols
          const rows = xtermRef.current.rows

          // CRITICAL: Only send if dimensions actually changed (from terminal-tabs pattern)
          if (cols === prevDimensionsRef.current.cols && rows === prevDimensionsRef.current.rows) {
            console.log('[Terminal] Skipping resize - dimensions unchanged:', cols, 'x', rows)
            return
          }

          prevDimensionsRef.current = { cols, rows }
          console.log('[Terminal] Sending debounced resize:', cols, 'x', rows)
          sendMessage({
            type: 'TERMINAL_RESIZE',
            terminalId,
            cols,
            rows,
          })
        }
      }, 1000)  // 1000ms debounce - longer to avoid interrupting tmux split drag
    }

    // Fit terminal to container with dimension verification and resize lock
    // CRITICAL: Wraps fit() in try/catch and uses resize lock to prevent buffer corruption
    // The isWrapped error occurs when resize() is called during active write operations
    const fitTerminal = () => {
      if (!fitAddonRef.current || !terminalRef.current || !xtermRef.current) return

      const containerWidth = terminalRef.current.offsetWidth
      const containerHeight = terminalRef.current.offsetHeight

      if (containerWidth <= 0 || containerHeight <= 0) {
        console.log('[Terminal] Skipping fit - container has 0 dimensions')
        return
      }

      // Skip if already resizing (prevents buffer corruption)
      if (isResizingRef.current) {
        console.log('[Terminal] Skipping fit - resize already in progress')
        return
      }

      // Skip if output happened recently - prevents tmux status bar corruption
      // Resizing during active output can corrupt scroll regions
      const timeSinceOutput = Date.now() - lastOutputTimeRef.current
      if (timeSinceOutput < OUTPUT_QUIET_PERIOD) {
        console.log('[Terminal] Deferring fit - output in progress, will retry')
        // Schedule retry after quiet period
        setTimeout(fitTerminal, OUTPUT_QUIET_PERIOD - timeSinceOutput + 10)
        return
      }

      try {
        isResizingRef.current = true

        // Clear any pending resize lock timeout
        if (resizeLockTimeoutRef.current) {
          clearTimeout(resizeLockTimeoutRef.current)
        }

        fitAddonRef.current.fit()

        // Debounced send to backend - wait for dimensions to stabilize
        debouncedSendResize()

        // Release lock after a short delay to allow buffer to stabilize
        resizeLockTimeoutRef.current = setTimeout(() => {
          isResizingRef.current = false
        }, 50)
      } catch (e) {
        console.warn('[Terminal] Fit failed (buffer may be mid-update):', e)
        isResizingRef.current = false
      }
    }

    // Initial fit sequence after xterm.open()
    const initialFit = () => {
      // Immediate fit (local only, resize will be debounced)
      fitTerminal()

      // Second fit after short delay (catch layout shifts)
      setTimeout(fitTerminal, 100)

      // Third fit after longer delay (ensure everything settled)
      setTimeout(fitTerminal, 300)

      // Force a refresh to ensure content is rendered
      setTimeout(() => {
        if (xtermRef.current) {
          xtermRef.current.refresh(0, xtermRef.current.rows - 1)
        }
      }, 350)
    }

    // Open terminal with retry mechanism
    // Wait until container has valid dimensions before opening
    const MAX_RETRIES = 20
    const RETRY_DELAY = 50
    let retryCount = 0

    const attemptOpen = () => {
      if (terminalRef.current && terminalRef.current.offsetWidth > 0 && terminalRef.current.offsetHeight > 0) {
        xterm.open(terminalRef.current)
        setIsInitialized(true)
        console.log('[Terminal] xterm opened successfully', {
          terminalId,
          attempt: retryCount + 1,
          containerSize: `${terminalRef.current.offsetWidth}x${terminalRef.current.offsetHeight}`,
          requestedFontSize: fontSize,
          requestedFontFamily: fontFamily,
        })
        // Now that it's open, do the initial fit
        initialFit()
      } else if (retryCount < MAX_RETRIES) {
        retryCount++
        console.log(`[Terminal] Container not ready (0x0), retrying... (${retryCount}/${MAX_RETRIES})`)
        setTimeout(attemptOpen, RETRY_DELAY)
      } else {
        console.error('[Terminal] Failed to open - container never got valid dimensions after', MAX_RETRIES, 'attempts')
        // Try opening anyway as last resort
        if (terminalRef.current) {
          xterm.open(terminalRef.current)
          setIsInitialized(true)
          initialFit()
        }
      }
    }

    attemptOpen()

    // Handle terminal input - send to background worker
    // Use initialization guard to filter device queries (from terminal-tabs pattern)
    xterm.onData((data) => {
      // Filter device queries during initialization (xterm.js sends ?1;2c, >0;276;0c)
      if (isInitializingRef.current) {
        console.debug('[Terminal] Ignoring input during initialization:', data.split('').map(c => c.charCodeAt(0).toString(16)).join(' '))
        return
      }
      sendMessage({
        type: 'TERMINAL_INPUT',
        terminalId,
        data,
      })
    })

    // Allow input after initialization completes (1000ms guard from terminal-tabs pattern)
    setTimeout(() => {
      isInitializingRef.current = false
      console.log('[Terminal] Initialization guard lifted for:', terminalId)
    }, 1000)

    // Enable Shift+Ctrl+C/V for copy/paste
    // Important: Return true to allow all other keys (including tmux Ctrl+B) to pass through
    xterm.attachCustomKeyEventHandler((event) => {
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

    // Focus terminal
    setTimeout(() => {
      xterm.focus()
    }, 150)

    // ResizeObserver to fit when container size changes
    // CRITICAL: Debounce to prevent xterm.js buffer corruption during rapid resizes
    // (e.g., moving browser to vertical monitor triggers many resize events)
    const resizeObserverTimeoutRef = { current: null as ReturnType<typeof setTimeout> | null }
    const resizeObserver = new ResizeObserver(() => {
      if (resizeObserverTimeoutRef.current) clearTimeout(resizeObserverTimeoutRef.current)

      resizeObserverTimeoutRef.current = setTimeout(() => {
        fitTerminal()

        // DISABLED: Post-resize refresh for tmux sessions
        // The resize trick sends SIGWINCH to tmux, which affects ALL panes in a split.
        // This causes TUI apps (tfe, lazygit, etc.) in other panes to re-render incorrectly.
        // Text wrapping issues are less severe than broken split rendering.
        //
        // Original purpose: Force tmux to rewrap text that went off-screen during sidebar resize.
        // If text wrapping becomes a problem, consider:
        //   1. Tmux refresh-client command via WebSocket (doesn't send SIGWINCH)
        //   2. Only refresh after user explicitly requests it
        //   3. Detect if splits exist and skip refresh in that case
      }, 150)  // 150ms debounce - prevents buffer corruption on rapid resize
    })

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current)
    }

    // Cleanup
    // Store refs for cleanup
    const currentResizeObserver = resizeObserver
    const currentTimeoutRef = resizeObserverTimeoutRef

    // Cleanup resize observer when effect re-runs (but NOT xterm - that's handled separately)
    return () => {
      currentResizeObserver.disconnect()
      if (currentTimeoutRef.current) clearTimeout(currentTimeoutRef.current)
    }
  }, [terminalId, isActive, isInitialized]) // Re-run when isActive changes to allow deferred init

  // Separate cleanup effect - only dispose xterm on true unmount
  useEffect(() => {
    return () => {
      console.log('[Terminal] Disposing xterm for terminal:', terminalId)
      if (xtermRef.current) {
        xtermRef.current.dispose()
        xtermRef.current = null
      }
      fitAddonRef.current = null
    }
  }, [terminalId])

  // Listen for terminal output from background worker via port
  // Only connect after xterm is initialized to avoid race condition
  useEffect(() => {
    if (!isInitialized) {
      // Don't connect until xterm is ready to receive output
      return
    }

    console.log('[Terminal] Connecting to background for terminal:', terminalId)

    const port = connectToBackground(`terminal-${terminalId}`, (message) => {
      // ✅ Handle initial state sent immediately on connection
      if (message.type === 'INITIAL_STATE') {
        console.log('[Terminal] 📥 Received initial state - WebSocket:', message.wsConnected ? 'connected' : 'disconnected')
        setIsConnected(message.wsConnected)
      } else if (message.type === 'TERMINAL_OUTPUT' && message.terminalId === terminalId) {
        if (xtermRef.current && message.data) {
          // Track output timing to prevent resize during active output
          // This prevents tmux status bar corruption when scroll regions are being updated
          lastOutputTimeRef.current = Date.now()

          // Wrap write in try/catch - buffer corruption can cause isWrapped errors during resize
          try {
            xtermRef.current.write(message.data)
          } catch (e) {
            // Buffer may be in inconsistent state during resize - log but don't crash
            console.warn('[Terminal] Write failed (likely resize in progress):', e)
          }
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

    // Post-reconnection refresh sequence (from terminal-tabs pattern)
    // Wait for initialization guard (1000ms) + buffer before forcing redraw
    // Uses triggerResizeTrick which has proper resize lock and try/catch protection
    setTimeout(() => {
      if (xtermRef.current && fitAddonRef.current && !isResizingRef.current) {
        console.log('[Terminal] Post-reconnection refresh for:', terminalId)
        triggerResizeTrick()

        // Focus terminal after resize trick completes
        setTimeout(() => {
          if (xtermRef.current) {
            xtermRef.current.focus()
          }
        }, 150)
      }
    }, 1200)  // Wait 1000ms (initialization guard) + 200ms buffer

    // Cleanup
    return () => {
      console.log('[Terminal] Disconnecting from background')
      port.disconnect()
    }
  }, [terminalId, isInitialized])

  // Update terminal settings when props change
  useEffect(() => {
    const xterm = xtermRef.current
    const fitAddon = fitAddonRef.current
    if (!xterm || !fitAddon) return

    console.log('[Terminal] Updating settings:', { fontSize, fontFamily, themeName, isDark })

    // Track if we need a full redraw (font changes require clearing renderer cache)
    const fontChanged = xterm.options.fontFamily !== fontFamily
    const fontSizeChanged = xterm.options.fontSize !== fontSize

    // Store current scroll position before changes
    const currentScrollPos = xterm.buffer.active.viewportY

    // Update font size
    if (fontSizeChanged) {
      console.log('[Terminal] Changing font size from', xterm.options.fontSize, 'to', fontSize)
      xterm.options.fontSize = fontSize
    }

    // Update font family
    if (fontChanged) {
      console.log('[Terminal] Changing font family from', xterm.options.fontFamily, 'to', fontFamily)
      xterm.options.fontFamily = fontFamily
    }

    // Update theme colors from the new theme system
    const themeColors = getThemeColors(themeName, isDark)
    xterm.options.theme = themeColors

    // Force complete redraw after font/theme changes
    // Font changes require clearing renderer cache (canvas caches glyphs)
    // Uses resize lock and try/catch to prevent buffer corruption
    setTimeout(() => {
      if (!xtermRef.current || !fitAddonRef.current) return

      // Skip if already resizing
      if (isResizingRef.current) {
        console.log('[Terminal] Skipping settings redraw - resize in progress')
        return
      }

      try {
        isResizingRef.current = true

        if (fontChanged) {
          // Clear screen to force renderer to redraw with new font
          xtermRef.current.clear()
          // Restore scroll position
          xtermRef.current.scrollToLine(currentScrollPos)
        }

        // Full refresh
        xtermRef.current.refresh(0, xtermRef.current.rows - 1)

        // Refit terminal
        fitAddonRef.current.fit()

        // Send new dimensions to backend PTY (only if changed)
        const cols = xtermRef.current.cols
        const rows = xtermRef.current.rows
        if (cols !== prevDimensionsRef.current.cols || rows !== prevDimensionsRef.current.rows) {
          prevDimensionsRef.current = { cols, rows }
          sendMessage({
            type: 'TERMINAL_RESIZE',
            terminalId,
            cols,
            rows,
          })
        }

        console.log('[Terminal] Settings updated - fontSize:', fontSize, 'fontFamily:', fontFamily, 'theme:', themeName, 'isDark:', isDark)

        // Release resize lock after buffer stabilizes
        setTimeout(() => {
          isResizingRef.current = false
        }, 50)
      } catch (e) {
        console.warn('[Terminal] Settings redraw failed:', e)
        isResizingRef.current = false
      }
    }, 100)
  }, [fontSize, fontFamily, themeName, isDark, terminalId])

  // Handle window resize - debounced to prevent buffer corruption during rapid resize
  // CRITICAL: Chrome sidebar resize triggers many events rapidly - must debounce!
  useEffect(() => {
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null

    const handleResize = () => {
      // Debounce the resize to prevent isWrapped buffer corruption
      if (resizeTimeout) clearTimeout(resizeTimeout)

      resizeTimeout = setTimeout(() => {
        if (!fitAddonRef.current || !xtermRef.current || !terminalRef.current) return

        const containerWidth = terminalRef.current.offsetWidth
        const containerHeight = terminalRef.current.offsetHeight

        // Skip if container has 0 dimensions (can happen during Chrome sidebar animations)
        if (containerWidth <= 0 || containerHeight <= 0) {
          console.log('[Terminal] Skipping window resize - container has 0 dimensions')
          return
        }

        // Skip if already resizing
        if (isResizingRef.current) {
          console.log('[Terminal] Skipping window resize - resize already in progress')
          return
        }

        // Skip if output happened recently - prevents tmux status bar corruption
        const timeSinceOutput = Date.now() - lastOutputTimeRef.current
        if (timeSinceOutput < OUTPUT_QUIET_PERIOD) {
          console.log('[Terminal] Deferring window resize - output in progress')
          // Retry after quiet period
          if (resizeTimeout) clearTimeout(resizeTimeout)
          resizeTimeout = setTimeout(handleResize, OUTPUT_QUIET_PERIOD - timeSinceOutput + 10)
          return
        }

        try {
          isResizingRef.current = true
          fitAddonRef.current.fit()

          const cols = xtermRef.current.cols
          const rows = xtermRef.current.rows

          // Release resize lock after buffer stabilizes
          setTimeout(() => {
            isResizingRef.current = false
          }, 50)

          // Only send if dimensions actually changed
          if (cols === prevDimensionsRef.current.cols && rows === prevDimensionsRef.current.rows) {
            return
          }

          prevDimensionsRef.current = { cols, rows }
          sendMessage({
            type: 'TERMINAL_RESIZE',
            terminalId,
            cols,
            rows,
          })
        } catch (e) {
          console.warn('[Terminal] Window resize fit failed:', e)
          isResizingRef.current = false
        }
      }, 150) // 150ms debounce - matches ResizeObserver debounce
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      if (resizeTimeout) clearTimeout(resizeTimeout)
    }
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

    // Pass the path as-is - backend handles ~ expansion
    const expandedDir = workingDir

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

  // Get the background gradient for this theme
  const backgroundGradient = getBackgroundGradient(themeName, isDark)

  return (
    <div
      ref={containerRef}
      className="h-full flex flex-col terminal-container"
      style={{
        background: backgroundGradient,
      }}
    >
      {/* Terminal body - full height, status shown in tmux status bar */}
      <div className="flex-1 relative overflow-hidden">
        <div
          ref={terminalRef}
          className={`absolute inset-0 terminal-wrapper ${sessionName ? 'hide-xterm-scrollbar' : ''}`}
          style={{
            padding: '4px',
            paddingLeft: '8px', // Extra left padding for Chrome sidebar resize handle
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
