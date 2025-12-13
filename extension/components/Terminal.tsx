import React, { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import '@xterm/xterm/css/xterm.css'
import { sendMessage, connectToBackground } from '../shared/messaging'
import { getThemeColors, getBackgroundGradient } from '../styles/themes'

/**
 * Props for the Terminal component
 */
interface TerminalProps {
  terminalId: string
  sessionName?: string
  terminalType?: string
  workingDir?: string      // Passed to backend for terminal working directory
  tmuxSession?: string     // Tmux session name
  fontSize?: number
  fontFamily?: string
  themeName?: string       // Theme family name (high-contrast, dracula, ocean, etc.)
  isDark?: boolean         // Dark or light mode
  isActive?: boolean       // Whether this terminal is currently visible/active
  pasteCommand?: string | null  // Command to paste into terminal input
  onClose?: () => void
}
// NOTE: ClaudeStatus interface removed - status polling handled by sidepanel's useClaudeStatus hook

/**
 * Terminal - xterm.js terminal emulator component
 *
 * Renders a fully-featured terminal using xterm.js with:
 * - WebSocket communication to backend PTY via Chrome extension messaging
 * - Automatic resizing via ResizeObserver and FitAddon
 * - Theme support with dark/light mode toggle
 * - Copy/paste support (Ctrl+Shift+C/V)
 * - Tmux session persistence (terminals survive sidebar close)
 * - Protection against buffer corruption during resize operations
 *
 * The component handles complex scenarios like:
 * - Resize during active output (defers to prevent corruption)
 * - Tab switching with deferred resize tricks
 * - Backend reconnection with terminal state recovery
 *
 * @param props - Terminal configuration and callbacks
 * @param props.terminalId - Unique identifier for this terminal (ctt-* format)
 * @param props.sessionName - Display name for the terminal tab
 * @param props.terminalType - Shell type (default: 'bash')
 * @param props.workingDir - Starting directory for the terminal
 * @param props.tmuxSession - Tmux session name for persistence
 * @param props.fontSize - Font size in pixels (default: 16)
 * @param props.fontFamily - Font family name (default: 'JetBrains Mono NF')
 * @param props.themeName - Theme family name (default: 'high-contrast')
 * @param props.isDark - Dark mode toggle (default: true)
 * @param props.isActive - Whether this terminal is the active tab
 * @param props.pasteCommand - Command to paste from context menu
 * @param props.onClose - Callback when terminal is closed
 * @returns Terminal container with xterm.js instance
 */
export function Terminal({ terminalId, sessionName, terminalType = 'bash', workingDir, tmuxSession, fontSize = 16, fontFamily = 'JetBrains Mono NF', themeName = 'high-contrast', isDark = true, isActive = true, pasteCommand = null, onClose }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)  // Track if xterm has been opened
  // NOTE: Claude status polling removed - sidepanel handles it via useClaudeStatus hook

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

  // Debounce for triggerResizeTrick - prevents "redraw storms" from multiple rapid calls
  // Each call causes 2 resize events (cols-1, cols), and tmux redraws the entire screen each time
  const lastResizeTrickTimeRef = useRef(0)
  const RESIZE_TRICK_DEBOUNCE_MS = 500 // Minimum time between resize tricks

  // Write queue - buffers data during resize to prevent isWrapped buffer corruption
  // xterm.js write() is async - data is queued and parsed later, so try/catch doesn't help
  // When resize happens during queued write, buffer structure changes and parser crashes
  const writeQueueRef = useRef<string[]>([])
  const isFlushingRef = useRef(false)

  // Output tracking - delay resize during active output to prevent tmux status bar corruption
  // When tmux is outputting content, resizing can corrupt scroll regions and cause the status bar to disappear
  // NOTE: 500ms quiet period is important - Claude outputs continuously, so shorter periods cause
  // resize during output which triggers tmux redraw storms (same line repeated many times)
  const lastOutputTimeRef = useRef(0)
  const OUTPUT_QUIET_PERIOD = 500 // ms to wait after output before allowing resize
  const resizeDeferCountRef = useRef(0) // Track deferrals to prevent infinite loop
  const MAX_RESIZE_DEFERRALS = 10 // Max times to defer before forcing resize (5 seconds with 500ms period)

  // Track if sidebar was resized while this terminal was inactive
  // If true, we need to trigger resize trick when tab becomes active
  const needsResizeTrickOnActivateRef = useRef(false)

  // Track current active state via ref so ResizeObserver callback can access it
  // (callbacks capture props at creation time, refs give us current value)
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive

  // Track deferred resize timeouts so they can be cleared on new resize events
  // Without this, orphaned deferred timeouts can fire after new resize events,
  // causing multiple resize operations at different times
  const deferredFitTerminalRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const deferredResizeTrickRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Safe write function that queues data during resize operations
  // CRITICAL: xterm.js write() is async - data gets queued internally and parsed later
  // If resize happens while data is queued, the parser crashes with "Cannot set isWrapped"
  // This function queues data during resize and flushes after resize completes
  const safeWrite = (data: string) => {
    if (!xtermRef.current) return

    // If resize is in progress, queue the data instead of writing
    if (isResizingRef.current) {
      writeQueueRef.current.push(data)
      return
    }

    // Write directly if not resizing
    try {
      xtermRef.current.write(data)
    } catch (e) {
      // Buffer may be in inconsistent state - queue for later
      console.warn('[Terminal] Write failed, queueing:', e)
      writeQueueRef.current.push(data)
    }
  }

  // Flush queued writes after resize completes
  // Uses requestAnimationFrame to ensure buffer is stable before writing
  const flushWriteQueue = () => {
    if (isFlushingRef.current || writeQueueRef.current.length === 0) return
    if (!xtermRef.current) return

    // Don't flush if still resizing
    if (isResizingRef.current) {
      // Try again after resize lock is released
      setTimeout(flushWriteQueue, 100)
      return
    }

    isFlushingRef.current = true

    // Use requestAnimationFrame to ensure we're in a stable state
    requestAnimationFrame(() => {
      if (!xtermRef.current || isResizingRef.current) {
        isFlushingRef.current = false
        // Retry if conditions changed
        if (writeQueueRef.current.length > 0) {
          setTimeout(flushWriteQueue, 50)
        }
        return
      }

      // Flush all queued data
      const data = writeQueueRef.current.join('')
      writeQueueRef.current = []

      try {
        xtermRef.current.write(data)
      } catch (e) {
        // If write still fails, the buffer is corrupted - log but don't re-queue
        console.error('[Terminal] Flush write failed (buffer may be corrupted):', e)
      }

      isFlushingRef.current = false
    })
  }

  // Resize trick to force complete redraw (used for theme/font changes and manual refresh)
  // CRITICAL: Uses resize lock and try/catch to prevent buffer corruption
  // Also uses time-based debounce to prevent "redraw storms" from multiple rapid calls
  const triggerResizeTrick = () => {
    if (!xtermRef.current || !fitAddonRef.current) return

    // Skip if already resizing
    if (isResizingRef.current) {
      return
    }

    const now = Date.now()

    // Skip if there's active output (prevents corruption during Claude output)
    // Resize during output causes tmux to redraw while content is streaming,
    // resulting in duplicated/interleaved lines
    const timeSinceOutput = now - lastOutputTimeRef.current
    if (timeSinceOutput < OUTPUT_QUIET_PERIOD) {
      // Defer the resize trick - schedule retry after quiet period
      if (resizeDeferCountRef.current < MAX_RESIZE_DEFERRALS) {
        resizeDeferCountRef.current++
        console.log(`[Terminal] ${terminalId.slice(-8)} triggerResizeTrick DEFERRED (active output, ${timeSinceOutput}ms ago, attempt ${resizeDeferCountRef.current})`)
        // Clear any existing deferred timeout to prevent orphaned timeouts
        if (deferredResizeTrickRef.current) clearTimeout(deferredResizeTrickRef.current)
        deferredResizeTrickRef.current = setTimeout(() => {
          deferredResizeTrickRef.current = null
          triggerResizeTrick()
        }, OUTPUT_QUIET_PERIOD)
        return
      } else {
        // CRITICAL: Abort entirely instead of forcing resize during continuous output
        // Forcing resize during active Claude streaming causes massive corruption
        // (same line repeated dozens of times). Terminal dimensions are likely fine.
        console.log(`[Terminal] ${terminalId.slice(-8)} triggerResizeTrick ABORTED (max deferrals ${MAX_RESIZE_DEFERRALS} reached - continuous output)`)
        resizeDeferCountRef.current = 0
        return
      }
    } else {
      resizeDeferCountRef.current = 0
    }

    // Debounce: skip if we ran recently (prevents redraw storms)
    const timeSinceLast = now - lastResizeTrickTimeRef.current
    if (timeSinceLast < RESIZE_TRICK_DEBOUNCE_MS) {
      console.log(`[Terminal] ${terminalId.slice(-8)} triggerResizeTrick DEBOUNCED (${timeSinceLast}ms since last)`)
      return
    }
    console.log(`[Terminal] ${terminalId.slice(-8)} triggerResizeTrick RUNNING (${timeSinceLast}ms since last, ${timeSinceOutput}ms since output)`)
    lastResizeTrickTimeRef.current = now

    const currentCols = xtermRef.current.cols
    const currentRows = xtermRef.current.rows

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
            // CRITICAL: Update prevDimensionsRef so debouncedSendResize skips redundant send
            // Without this, debouncedSendResize fires later and sends the same dimensions again,
            // triggering another SIGWINCH → tmux redraw → potential corruption
            prevDimensionsRef.current = { cols: currentCols, rows: currentRows }
          } catch (e) {
            console.warn('[Terminal] Resize trick step 2 failed:', e)
          }
        }
        isResizingRef.current = false
        // CRITICAL: Clear write queue instead of flushing after resize trick
        // The two-step resize triggers TWO tmux redraws (one per SIGWINCH).
        // Both redraws get queued, and flushing them causes duplicate content
        // (same lines appear twice - the corruption bug).
        // Since resize trick is purely for visual refresh, discard the queued
        // redraw data - it is just tmux redrawing what's already on screen.
        writeQueueRef.current = []
      }, 100)
    } catch (e) {
      console.warn('[Terminal] Resize trick step 1 failed:', e)
      isResizingRef.current = false
      // Also clear queue on error - don't flush partial redraw data
      writeQueueRef.current = []
    }
  }

  // Initialize xterm.js on mount (not deferred - all terminals init immediately)
  // Using visibility:hidden preserves dimensions, so hidden terminals can still init properly
  useEffect(() => {
    // Skip if already initialized, no ref, or xterm already exists
    console.log(`[Terminal] ${terminalId.slice(-8)} init check: isInitialized=${isInitialized}, hasRef=${!!terminalRef.current}, hasXterm=${!!xtermRef.current}`)
    if (isInitialized || !terminalRef.current || xtermRef.current) return

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
    // CRITICAL: First resize is sent immediately (or with short delay) for reattached terminals
    // Subsequent resizes use longer debounce to avoid interrupting tmux split drag
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null
    const debouncedSendResize = () => {
      if (resizeTimeout) clearTimeout(resizeTimeout)

      // Check if this is first resize (dimensions were at initial 0,0)
      const isFirstResize = prevDimensionsRef.current.cols === 0 && prevDimensionsRef.current.rows === 0

      // First resize uses shorter delay for fast init; subsequent resizes use moderate debounce
      // NOTE: 1000ms was too long - during that time xterm shows new dimensions but tmux uses old ones
      // Any output during that window is formatted for wrong width = corruption
      // 150ms is enough to batch rapid resize events while keeping xterm/tmux in sync
      const debounceMs = isFirstResize ? 100 : 150

      resizeTimeout = setTimeout(() => {
        if (xtermRef.current) {
          const cols = xtermRef.current.cols
          const rows = xtermRef.current.rows

          // CRITICAL: Only send if dimensions actually changed (from terminal-tabs pattern)
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
        }
      }, debounceMs)
    }

    // Fit terminal to container with dimension verification and resize lock
    // CRITICAL: Wraps fit() in try/catch and uses resize lock to prevent buffer corruption
    // The isWrapped error occurs when resize() is called during active write operations
    const fitTerminal = (retryCount = 0) => {
      if (!fitAddonRef.current || !terminalRef.current || !xtermRef.current) return

      const containerWidth = terminalRef.current.offsetWidth
      const containerHeight = terminalRef.current.offsetHeight

      if (containerWidth <= 0 || containerHeight <= 0) {
        // Retry up to 5 times with increasing delay for 0-dimension cases (sidebar animating)
        if (retryCount < 5) {
          setTimeout(() => fitTerminal(retryCount + 1), 50 * (retryCount + 1))
        }
        return
      }

      // Skip if already resizing (prevents buffer corruption)
      if (isResizingRef.current) {
        return
      }

      // Skip if output happened recently - prevents tmux status bar corruption
      // But limit deferrals to prevent infinite loop (Claude outputs constantly)
      const timeSinceOutput = Date.now() - lastOutputTimeRef.current
      if (timeSinceOutput < OUTPUT_QUIET_PERIOD && resizeDeferCountRef.current < MAX_RESIZE_DEFERRALS) {
        resizeDeferCountRef.current++
        // Clear any existing deferred timeout to prevent orphaned timeouts
        if (deferredFitTerminalRef.current) clearTimeout(deferredFitTerminalRef.current)
        deferredFitTerminalRef.current = setTimeout(() => {
          deferredFitTerminalRef.current = null
          fitTerminal(retryCount)
        }, OUTPUT_QUIET_PERIOD - timeSinceOutput + 10)
        return
      }

      // Reset deferral counter on successful resize attempt
      resizeDeferCountRef.current = 0

      try {
        isResizingRef.current = true

        // Clear any pending resize lock timeout
        if (resizeLockTimeoutRef.current) {
          clearTimeout(resizeLockTimeoutRef.current)
        }

        fitAddonRef.current.fit()

        // Debounced send to backend - wait for dimensions to stabilize
        debouncedSendResize()

        // Force refresh to ensure canvas redraws after fit
        // This prevents blank terminal until user interaction
        xtermRef.current.refresh(0, xtermRef.current.rows - 1)

        // Release lock after a short delay to allow buffer to stabilize
        resizeLockTimeoutRef.current = setTimeout(() => {
          isResizingRef.current = false
          flushWriteQueue()  // Flush any data queued during resize
        }, 50)
      } catch (e) {
        console.warn('[Terminal] Fit failed (buffer may be mid-update):', e)
        isResizingRef.current = false
        flushWriteQueue()  // Flush any data queued during resize
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
          // For tmux sessions, clear any stale scrollback that might cause phantom lines
          if (sessionName) {
            xtermRef.current.clear()
          }
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
    // Track dimensions before resize to detect actual size changes (not just observer noise)
    const preResizeDims = { current: { width: 0, height: 0 } }
    // Post-resize cleanup timeout - triggers resize trick AFTER resize settles
    const postResizeCleanupRef = { current: null as ReturnType<typeof setTimeout> | null }

    const resizeObserver = new ResizeObserver((entries) => {
      if (resizeObserverTimeoutRef.current) clearTimeout(resizeObserverTimeoutRef.current)
      if (postResizeCleanupRef.current) clearTimeout(postResizeCleanupRef.current)
      // Clear deferred timeouts from previous resize events to prevent orphaned operations
      if (deferredFitTerminalRef.current) clearTimeout(deferredFitTerminalRef.current)
      if (deferredResizeTrickRef.current) clearTimeout(deferredResizeTrickRef.current)
      // Reset deferral counter since we're starting a fresh resize sequence
      resizeDeferCountRef.current = 0

      // Capture dimensions before this resize event for comparison
      const entry = entries[0]
      const newWidth = entry?.contentRect?.width ?? 0
      const newHeight = entry?.contentRect?.height ?? 0

      resizeObserverTimeoutRef.current = setTimeout(() => {
        fitTerminal()

        // Schedule post-resize cleanup AFTER resize settles
        // This triggers the resize trick to fix text corruption from sidebar resize
        // The 300ms delay ensures we're past the resize events, not during them
        // CRITICAL: Only trigger if dimensions actually changed (sidebar drag, not scroll/focus)
        if (postResizeCleanupRef.current) clearTimeout(postResizeCleanupRef.current)

        postResizeCleanupRef.current = setTimeout(() => {
          // Skip if this is the first observation (initial render, not a resize)
          // Just record the initial dimensions without triggering resize trick
          if (preResizeDims.current.width === 0 && preResizeDims.current.height === 0) {
            preResizeDims.current = { width: newWidth, height: newHeight }
            console.log(`[Terminal] ${terminalId.slice(-8)} initial dimensions recorded: ${newWidth}x${newHeight}`)
            return
          }

          // Check if this was a real resize (dimensions changed significantly)
          const widthChange = Math.abs(newWidth - preResizeDims.current.width)
          const heightChange = Math.abs(newHeight - preResizeDims.current.height)
          const significantChange = widthChange > 10 || heightChange > 10

          if (significantChange && newWidth > 0 && newHeight > 0) {
            // Update stored dimensions
            preResizeDims.current = { width: newWidth, height: newHeight }

            // If terminal is not active, defer resize trick until activation
            // Inactive terminals can't properly redraw, so mark for later
            // NOTE: Use isActiveRef.current to get current value (not stale closure)
            if (!isActiveRef.current) {
              console.log(`[Terminal] ${terminalId.slice(-8)} sidebar resize complete (${widthChange}x${heightChange} change), DEFERRING resize trick (inactive)`)
              needsResizeTrickOnActivateRef.current = true
            } else {
              console.log(`[Terminal] ${terminalId.slice(-8)} sidebar resize complete (${widthChange}x${heightChange} change), triggering resize trick`)
              // Trigger resize trick to fix text corruption
              // The existing debounce/output-quiet-period logic will prevent issues during active output
              triggerResizeTrick()
            }
          }
        }, 300)  // 300ms after resize settles - enough time for fitTerminal to complete
      }, 150)  // 150ms debounce - prevents buffer corruption on rapid resize
    })

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current)
    }

    // Cleanup
    // Store refs for cleanup
    const currentResizeObserver = resizeObserver
    const currentTimeoutRef = resizeObserverTimeoutRef
    const currentPostResizeRef = postResizeCleanupRef

    // Cleanup resize observer when effect re-runs (but NOT xterm - that's handled separately)
    return () => {
      currentResizeObserver.disconnect()
      if (currentTimeoutRef.current) clearTimeout(currentTimeoutRef.current)
      if (currentPostResizeRef.current) clearTimeout(currentPostResizeRef.current)
      // Clear deferred timeouts to prevent orphaned operations after unmount
      if (deferredFitTerminalRef.current) clearTimeout(deferredFitTerminalRef.current)
      if (deferredResizeTrickRef.current) clearTimeout(deferredResizeTrickRef.current)
    }
  }, [terminalId, isInitialized]) // Init on mount, re-run if terminalId changes

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
        setIsConnected(message.wsConnected)
      } else if (message.type === 'TERMINAL_OUTPUT' && message.terminalId === terminalId) {
        if (xtermRef.current && message.data) {
          // Track output timing to prevent resize during active output
          // This prevents tmux status bar corruption when scroll regions are being updated
          lastOutputTimeRef.current = Date.now()

          // Strip VS16 (variation selector, U+FE0F) to prevent tmux width calculation issues
          // VS16 makes emojis render in emoji presentation, but tmux miscalculates width
          // when it sees emoji+VS16, corrupting scroll regions and hiding status bar
          // The emoji still renders correctly without VS16, just uses default presentation
          const sanitizedData = message.data.replace(/\uFE0F/g, '')

          // Use safeWrite to queue data during resize operations
          // Direct write() is async - xterm queues data and parses later
          // If resize happens while data is queued, parser crashes with "isWrapped" error
          safeWrite(sanitizedData)
        } else {
          console.warn('[Terminal] ⚠️ Cannot write - xterm:', !!xtermRef.current, 'data:', !!message.data)
        }
      } else if (message.type === 'WS_CONNECTED') {
        setIsConnected(true)
      } else if (message.type === 'WS_DISCONNECTED') {
        setIsConnected(false)
      } else if (message.type === 'REFRESH_TERMINALS') {
        // Skip entirely if there's been very recent output (indicates active Claude session)
        // This prevents even scheduling the refresh during active streaming
        const timeSinceOutput = Date.now() - lastOutputTimeRef.current
        if (timeSinceOutput < 100) {
          console.log(`[Terminal] ${terminalId.slice(-8)} skipping REFRESH_TERMINALS (output ${timeSinceOutput}ms ago)`)
          return
        }

        // Stagger refresh per-terminal with random delay to prevent "redraw storm"
        // When all terminals resize simultaneously, tmux sends many redraws that interleave
        // with active Claude output, causing corruption (same line repeated many times)
        // Random delay 50-550ms spreads out the resize events
        const staggerDelay = 50 + Math.random() * 500
        console.log(`[Terminal] ${terminalId.slice(-8)} received REFRESH_TERMINALS, staggering ${Math.round(staggerDelay)}ms`)
        setTimeout(() => {
          // CRITICAL: Re-check output time AFTER stagger delay
          // More output may have arrived during the delay - if so, abort entirely
          // The terminal dimensions are probably fine; corruption risk isn't worth it
          const timeSinceOutputNow = Date.now() - lastOutputTimeRef.current
          if (timeSinceOutputNow < OUTPUT_QUIET_PERIOD) {
            console.log(`[Terminal] ${terminalId.slice(-8)} ABORTING REFRESH_TERMINALS (output arrived during stagger, ${timeSinceOutputNow}ms ago)`)
            return
          }
          triggerResizeTrick()
        }, staggerDelay)
      } else if (message.type === 'TERMINAL_RECONNECTED' && message.terminalId === terminalId) {
        // Terminal reconnected after backend restart - clear old content and resize
        // This prevents "two sessions in one" appearance where old content remains
        console.log(`[Terminal] ${terminalId.slice(-8)} RECONNECTED - clearing and resizing`)
        if (xtermRef.current) {
          // Clear terminal content - tmux will send fresh scrollback
          xtermRef.current.clear()
          xtermRef.current.reset()
          // Trigger resize after a short delay to let things settle
          setTimeout(() => {
            if (fitAddonRef.current && xtermRef.current) {
              try {
                fitAddonRef.current.fit()
                xtermRef.current.refresh(0, xtermRef.current.rows - 1)
              } catch (e) {
                console.warn('[Terminal] Fit after reconnect failed:', e)
              }
            }
          }, 100)
        }
      }
    })

    // Fit terminal after port connects to ensure proper dimensions
    // This is a fallback in case REFRESH_TERMINALS arrives too early
    setTimeout(() => {
      if (fitAddonRef.current && xtermRef.current && terminalRef.current) {
        const containerWidth = terminalRef.current.offsetWidth
        const containerHeight = terminalRef.current.offsetHeight
        if (containerWidth > 0 && containerHeight > 0 && !isResizingRef.current) {
          try {
            fitAddonRef.current.fit()
            xtermRef.current.refresh(0, xtermRef.current.rows - 1)
          } catch (e) {
            // Ignore fit errors
          }
        }
      }
    }, 200)

    // Focus terminal after initialization completes
    setTimeout(() => {
      if (xtermRef.current) {
        xtermRef.current.focus()
      }
    }, 1200)  // Wait 1000ms (initialization guard) + 200ms buffer

    // Cleanup
    return () => {
      port.disconnect()
    }
  }, [terminalId, isInitialized])

  // Update terminal settings when props change
  useEffect(() => {
    const xterm = xtermRef.current
    const fitAddon = fitAddonRef.current
    if (!xterm || !fitAddon) return

    // Track if we need a full redraw (font changes require clearing renderer cache)
    const fontChanged = xterm.options.fontFamily !== fontFamily
    const fontSizeChanged = xterm.options.fontSize !== fontSize

    // Store current scroll position before changes
    const currentScrollPos = xterm.buffer.active.viewportY

    // Update font size
    if (fontSizeChanged) {
      xterm.options.fontSize = fontSize
    }

    // Update font family
    if (fontChanged) {
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

        // Release resize lock after buffer stabilizes
        setTimeout(() => {
          isResizingRef.current = false
          flushWriteQueue()  // Flush any data queued during resize
        }, 50)
      } catch (e) {
        console.warn('[Terminal] Settings redraw failed:', e)
        isResizingRef.current = false
        flushWriteQueue()  // Flush any data queued during resize
      }
    }, 100)
  }, [fontSize, fontFamily, themeName, isDark, terminalId])

  // Handle window resize - debounced to prevent buffer corruption during rapid resize
  // CRITICAL: Chrome sidebar resize triggers many events rapidly - must debounce!
  useEffect(() => {
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null
    let windowResizeDeferCount = 0

    const handleResize = (retryCount = 0) => {
      // Debounce the resize to prevent isWrapped buffer corruption
      if (resizeTimeout) clearTimeout(resizeTimeout)

      resizeTimeout = setTimeout(() => {
        if (!fitAddonRef.current || !xtermRef.current || !terminalRef.current) return

        const containerWidth = terminalRef.current.offsetWidth
        const containerHeight = terminalRef.current.offsetHeight

        // Retry with increasing delay for 0-dimension cases (sidebar animating)
        if (containerWidth <= 0 || containerHeight <= 0) {
          if (retryCount < 5) {
            setTimeout(() => handleResize(retryCount + 1), 50 * (retryCount + 1))
          }
          return
        }

        // Skip if already resizing
        if (isResizingRef.current) {
          return
        }

        // Skip if output happened recently - but limit deferrals to prevent infinite loop
        const timeSinceOutput = Date.now() - lastOutputTimeRef.current
        if (timeSinceOutput < OUTPUT_QUIET_PERIOD && windowResizeDeferCount < MAX_RESIZE_DEFERRALS) {
          windowResizeDeferCount++
          if (resizeTimeout) clearTimeout(resizeTimeout)
          resizeTimeout = setTimeout(() => handleResize(retryCount), OUTPUT_QUIET_PERIOD - timeSinceOutput + 10)
          return
        }

        // Reset deferral counter on successful resize
        windowResizeDeferCount = 0

        try {
          isResizingRef.current = true
          fitAddonRef.current.fit()

          // Force refresh to ensure canvas redraws after fit
          xtermRef.current.refresh(0, xtermRef.current.rows - 1)

          const cols = xtermRef.current.cols
          const rows = xtermRef.current.rows

          // Release resize lock after buffer stabilizes
          setTimeout(() => {
            isResizingRef.current = false
            flushWriteQueue()  // Flush any data queued during resize
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
          flushWriteQueue()  // Flush any data queued during resize
        }
      }, 150) // 150ms debounce - matches ResizeObserver debounce
    }

    const onWindowResize = () => handleResize(0)
    window.addEventListener('resize', onWindowResize)
    return () => {
      window.removeEventListener('resize', onWindowResize)
      if (resizeTimeout) clearTimeout(resizeTimeout)
    }
  }, [terminalId])

  // Handle tab switching - refresh terminal when it becomes visible (from Tabz pattern)
  // Simple approach: fit, refresh, focus - no complex first-activation logic needed
  // since all terminals are now initialized on mount
  useEffect(() => {
    if (!isActive || !isInitialized) return
    if (!xtermRef.current || !fitAddonRef.current) return

    // Check if we need resize trick (sidebar was resized while inactive)
    const needsResizeTrick = needsResizeTrickOnActivateRef.current
    if (needsResizeTrick) {
      console.log(`[Terminal] ${terminalId.slice(-8)} tab activated, needs deferred resize trick`)
      needsResizeTrickOnActivateRef.current = false
    } else {
      console.log(`[Terminal] ${terminalId.slice(-8)} tab activated, refreshing`)
    }

    // Small delay to ensure visibility:visible has taken effect
    const timeoutId = setTimeout(() => {
      try {
        if (!xtermRef.current || !fitAddonRef.current) return

        // Fit the terminal to container
        fitAddonRef.current.fit()

        // Refresh the xterm display
        xtermRef.current.refresh(0, xtermRef.current.rows - 1)

        // Restore focus
        xtermRef.current.focus()

        // Send resize to backend to trigger tmux redraw
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

        // If sidebar was resized while inactive, trigger resize trick now
        // This fixes text wrapping issues that couldn't be fixed while hidden
        if (needsResizeTrick) {
          // Small delay to let the fit/refresh complete first
          setTimeout(() => {
            console.log(`[Terminal] ${terminalId.slice(-8)} executing deferred resize trick`)
            triggerResizeTrick()
          }, 100)
        }
      } catch (error) {
        console.warn('[Terminal] Failed to refresh on tab switch:', error)
      }
    }, 50)

    return () => clearTimeout(timeoutId)
  }, [isActive, isInitialized, terminalId])

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

  // NOTE: Claude status polling removed from Terminal component
  // The sidepanel handles all status polling via useClaudeStatus hook
  // This eliminates duplicate network requests (was 2x requests per terminal)

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
      <div
        className="flex-1 relative overflow-hidden"
        onContextMenu={(e) => e.preventDefault()}  // Disable browser context menu so TUI apps/tmux can use right-click
      >
        <div
          ref={terminalRef}
          className={`absolute terminal-wrapper ${sessionName ? 'hide-xterm-scrollbar' : ''}`}
          style={{
            // Use inset instead of padding to avoid FitAddon miscalculating rows
            // Padding is included in offsetHeight which FitAddon uses for row calculation
            top: '4px',
            left: '8px',  // Extra left margin for Chrome sidebar resize handle
            right: '0px',
            bottom: '0px', // No bottom margin - ensure tmux status bar is fully visible
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
