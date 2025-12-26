import React, { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { CanvasAddon } from '@xterm/addon-canvas'
import '@xterm/xterm/css/xterm.css'
import { sendMessage, connectToBackground } from '../shared/messaging'
import { getThemeColors, getBackgroundGradient as getThemeBackgroundGradient, ThemeColors } from '../styles/themes'
import { getGradientCSS, getPanelColor } from '../styles/terminal-backgrounds'

import type { BackgroundMediaType } from './settings/types'

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
  // Per-instance font size offset (temporary zoom, not persisted)
  fontSizeOffset?: number
  onIncreaseFontSize?: () => void
  onDecreaseFontSize?: () => void
  onResetFontSize?: () => void
  // Background customization
  backgroundGradient?: string  // Override gradient key (undefined = use theme default)
  panelColor?: string          // Base panel color (default: #000000)
  transparency?: number        // Gradient opacity 0-100 (default: 100)
  // Background media (video/image)
  backgroundMedia?: string            // Path to media file
  backgroundMediaType?: BackgroundMediaType  // 'none' | 'image' | 'video'
  backgroundMediaOpacity?: number     // 0-100, controls media visibility
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
 * @param props.fontFamily - Font family name (default: 'monospace')
 * @param props.themeName - Theme family name (default: 'high-contrast')
 * @param props.isDark - Dark mode toggle (default: true)
 * @param props.isActive - Whether this terminal is the active tab
 * @param props.pasteCommand - Command to paste from context menu
 * @param props.onClose - Callback when terminal is closed
 * @returns Terminal container with xterm.js instance
 */
export function Terminal({ terminalId, sessionName, terminalType = 'bash', workingDir, tmuxSession, fontSize = 16, fontFamily = 'monospace', themeName = 'high-contrast', isDark = true, isActive = true, pasteCommand = null, onClose, fontSizeOffset = 0, onIncreaseFontSize, onDecreaseFontSize, onResetFontSize, backgroundGradient, panelColor = '#000000', transparency = 100, backgroundMedia, backgroundMediaType = 'none', backgroundMediaOpacity = 50 }: TerminalProps) {
  // Compute effective font size (base + offset)
  const effectiveFontSize = fontSize + (fontSizeOffset || 0)
  const terminalRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const canvasAddonRef = useRef<CanvasAddon | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isInitialized, setIsInitialized] = useState(false)  // Track if xterm has been opened
  const [mediaError, setMediaError] = useState(false)  // Track if background media failed to load
  const wasDisconnectedRef = useRef(false)  // Track if we were disconnected (for resync on reconnect)
  // NOTE: Claude status polling removed - sidepanel handles it via useClaudeStatus hook

  // Determine if this is a tmux session - all ctt-* terminals are tmux-backed
  // CRITICAL: For tmux sessions, we should NOT send resize on container changes (ResizeObserver, tab switch)
  // Only send resize on actual window resize. Tmux manages its own dimensions.
  // See Tabz lessons-learned: sending container dimensions to tmux causes corruption.
  const isTmuxSession = !!sessionName || !!tmuxSession || terminalId.startsWith('ctt-')

  // Track previous dimensions to avoid unnecessary resize events (from terminal-tabs pattern)
  const prevDimensionsRef = useRef({ cols: 0, rows: 0 })

  // NOTE: lastRefreshedDimensionsRef was removed - post-resize refresh disabled
  // because it broke tmux splits (SIGWINCH affects all panes)

  // Initialization guard - filter device queries during first 1000ms (from terminal-tabs pattern)
  const isInitializingRef = useRef(true)

  // Output guard - buffer output during first 300ms to prevent escape sequence corruption on reconnect
  // When page refreshes while tmux is outputting, partial escape sequences can cause:
  // - Copy mode entry (escape sequences misinterpreted as prefix+key)
  // - Display corruption (partial CSI sequences)
  // We buffer output briefly and flush after terminal is stable
  const isOutputGuardedRef = useRef(true)
  const outputGuardBufferRef = useRef<string[]>([])

  // Resize lock - prevents concurrent resize operations that can corrupt xterm.js buffer
  // The isWrapped error occurs when resize() is called while data is being written
  const isResizingRef = useRef(false)
  const resizeLockTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce for triggerResizeTrick - prevents "redraw storms" from multiple rapid calls
  // Each call causes 2 resize events (rows-1, then fit), and tmux redraws the entire screen each time
  const lastResizeTrickTimeRef = useRef(0)
  const RESIZE_TRICK_DEBOUNCE_MS = 500 // Minimum time between resize tricks

  // Write queue - buffers data during resize to prevent isWrapped buffer corruption
  // xterm.js write() is async - data is queued and parsed later, so try/catch doesn't help
  // When resize happens during queued write, buffer structure changes and parser crashes
  const writeQueueRef = useRef<string[]>([])
  const isFlushingRef = useRef(false)

  // Output tracking - used for logging only now, not for deferring resize
  // SIMPLIFIED: Tabz taught us that for tmux sessions, we should NOT try to time around output.
  // Instead, just don't send resize on container changes for tmux - only on window resize.
  const lastOutputTimeRef = useRef(0)

  // Track current active state via ref so ResizeObserver callback can access it
  // (callbacks capture props at creation time, refs give us current value)
  const isActiveRef = useRef(isActive)
  isActiveRef.current = isActive

  // Font size callback refs - needed for keyboard shortcuts since attachCustomKeyEventHandler captures closure
  const onIncreaseFontSizeRef = useRef(onIncreaseFontSize)
  const onDecreaseFontSizeRef = useRef(onDecreaseFontSize)
  const onResetFontSizeRef = useRef(onResetFontSize)
  onIncreaseFontSizeRef.current = onIncreaseFontSize
  onDecreaseFontSizeRef.current = onDecreaseFontSize
  onResetFontSizeRef.current = onResetFontSize

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

  // Resize trick to force complete redraw (used for theme/font changes and reconnection)
  // SIMPLIFIED: No more output deferral logic - Tabz taught us that for tmux sessions,
  // we shouldn't try to time around output. Just do the resize trick with basic debounce.
  const triggerResizeTrick = () => {
    if (!xtermRef.current || !fitAddonRef.current) return

    // Skip if already resizing
    if (isResizingRef.current) {
      return
    }

    const now = Date.now()

    // Simple debounce: skip if we ran recently (prevents redraw storms)
    const timeSinceLast = now - lastResizeTrickTimeRef.current
    if (timeSinceLast < RESIZE_TRICK_DEBOUNCE_MS) {
      console.log(`[Terminal] ${terminalId.slice(-8)} triggerResizeTrick DEBOUNCED (${timeSinceLast}ms since last)`)
      return
    }
    console.log(`[Terminal] ${terminalId.slice(-8)} triggerResizeTrick RUNNING`)
    lastResizeTrickTimeRef.current = now

    const currentCols = xtermRef.current.cols
    const currentRows = xtermRef.current.rows

    try {
      isResizingRef.current = true

      // ALTERNATIVE APPROACH: Start small, then fit to container
      // Instead of shrinking from current size (which could be larger than container
      // if container just shrunk), start from a minimal size and let fit() grow it.
      // This ensures we never send dimensions larger than the container can handle.
      //
      // Step 1: Resize to minimal size (1 row less than current, keeping cols same)
      // This triggers SIGWINCH to force tmux to recalculate
      const minRows = Math.max(1, currentRows - 1)
      xtermRef.current.resize(currentCols, minRows)
      sendMessage({
        type: 'TERMINAL_RESIZE',
        terminalId,
        cols: currentCols,
        rows: minRows,
      })

      // Step 2: Wait then fit to container and send final dimensions
      // Using 200ms delay to give tmux time to process the first SIGWINCH
      setTimeout(() => {
        if (xtermRef.current && fitAddonRef.current) {
          try {
            // Fit to get the correct container dimensions
            fitAddonRef.current.fit()
            const finalCols = xtermRef.current.cols
            const finalRows = xtermRef.current.rows

            // Send final dimensions to backend (this triggers second SIGWINCH)
            sendMessage({
              type: 'TERMINAL_RESIZE',
              terminalId,
              cols: finalCols,
              rows: finalRows,
            })
            // Update prevDimensionsRef so debouncedSendResize skips redundant send
            prevDimensionsRef.current = { cols: finalCols, rows: finalRows }
          } catch (e) {
            console.warn('[Terminal] Resize trick step 2 failed:', e)
          }
        }
        isResizingRef.current = false
        // Clear write queue - resize trick redraws are just visual refresh
        writeQueueRef.current = []
      }, 200)
    } catch (e) {
      console.warn('[Terminal] Resize trick step 1 failed:', e)
      isResizingRef.current = false
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
      fontSize: effectiveFontSize,
      fontFamily,
      theme: themeColors,
      allowTransparency: true, // Required for transparent backgrounds (CSS gradient shows through)
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
    // Pattern from Tabz: track previous dimensions to avoid unnecessary resize events
    // CRITICAL FOR TMUX: This function is ONLY called from window resize handler.
    // Container resize (ResizeObserver) should NOT call this for tmux sessions.
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null
    const debouncedSendResize = (forceImmediate = false) => {
      if (resizeTimeout) clearTimeout(resizeTimeout)

      // Check if this is first resize (dimensions were at initial 0,0)
      const isFirstResize = prevDimensionsRef.current.cols === 0 && prevDimensionsRef.current.rows === 0

      // First resize uses shorter delay for fast init
      // Subsequent resizes use 1000ms debounce (matches Tabz - prevents issues during drag)
      const debounceMs = forceImmediate ? 0 : (isFirstResize ? 100 : 1000)

      resizeTimeout = setTimeout(() => {
        if (xtermRef.current) {
          const cols = xtermRef.current.cols
          const rows = xtermRef.current.rows

          // CRITICAL: Only send if dimensions actually changed
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
    // SIMPLIFIED: No more output deferral logic - Tabz taught us this causes more problems than it solves.
    // For tmux sessions, we only do LOCAL fit (xterm) - we do NOT send resize to backend.
    // Backend resize is only sent on actual window resize events.
    const fitTerminal = (retryCount = 0, sendToBackend = false) => {
      if (!fitAddonRef.current || !terminalRef.current || !xtermRef.current) return

      const containerWidth = terminalRef.current.offsetWidth
      const containerHeight = terminalRef.current.offsetHeight

      if (containerWidth <= 0 || containerHeight <= 0) {
        // Retry up to 5 times with increasing delay for 0-dimension cases (sidebar animating)
        if (retryCount < 5) {
          setTimeout(() => fitTerminal(retryCount + 1, sendToBackend), 50 * (retryCount + 1))
        }
        return
      }

      // Skip if already resizing (prevents buffer corruption)
      if (isResizingRef.current) {
        return
      }

      try {
        isResizingRef.current = true

        // Clear any pending resize lock timeout
        if (resizeLockTimeoutRef.current) {
          clearTimeout(resizeLockTimeoutRef.current)
        }

        fitAddonRef.current.fit()

        // Only send resize to backend when explicitly requested (window resize events)
        // ResizeObserver and tab switch should NOT send to backend for tmux sessions
        // The caller decides whether to send based on the event type
        if (sendToBackend) {
          debouncedSendResize()
        }

        // Force refresh to ensure canvas redraws after fit
        xtermRef.current.refresh(0, xtermRef.current.rows - 1)

        // Release lock after a short delay to allow buffer to stabilize
        resizeLockTimeoutRef.current = setTimeout(() => {
          isResizingRef.current = false
          flushWriteQueue()
        }, 50)
      } catch (e) {
        console.warn('[Terminal] Fit failed (buffer may be mid-update):', e)
        isResizingRef.current = false
        flushWriteQueue()
      }
    }

    // Initial fit sequence after xterm.open()
    const initialFit = () => {
      // Immediate fit (local only)
      fitTerminal()

      // Second fit after short delay (catch layout shifts)
      setTimeout(() => fitTerminal(), 100)

      // Third fit after longer delay - THIS ONE sends to backend (initial dimensions)
      setTimeout(() => fitTerminal(0, true), 300)

      // Force a refresh to ensure content is rendered
      setTimeout(() => {
        if (xtermRef.current) {
          // For tmux sessions, clear any stale scrollback that might cause phantom lines
          if (sessionName) {
            // Lock during clear to prevent isWrapped error from concurrent writes
            isResizingRef.current = true
            xtermRef.current.clear()
            isResizingRef.current = false
            writeQueueRef.current = []
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

        // Load Canvas renderer for GPU-accelerated rendering (must be after open())
        let rendererUsed = 'dom'
        try {
          const canvasAddon = new CanvasAddon()
          xterm.loadAddon(canvasAddon)
          canvasAddonRef.current = canvasAddon
          rendererUsed = 'canvas'
        } catch (e) {
          console.warn('[Terminal] Canvas not available, using DOM renderer:', e)
        }

        console.log('[Terminal] xterm opened successfully', {
          terminalId,
          attempt: retryCount + 1,
          containerSize: `${terminalRef.current.offsetWidth}x${terminalRef.current.offsetHeight}`,
          requestedFontSize: fontSize,
          requestedFontFamily: fontFamily,
          renderer: rendererUsed,
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

          // Load Canvas renderer (same as main path)
          try {
            const canvasAddon = new CanvasAddon()
            xterm.loadAddon(canvasAddon)
            canvasAddonRef.current = canvasAddon
          } catch (e) {
            console.warn('[Terminal] Canvas not available (fallback path), using DOM renderer:', e)
          }

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

    // Lift output guard after 1000ms and flush buffered output
    // This prevents escape sequence corruption when reconnecting while tmux is actively outputting
    setTimeout(() => {
      isOutputGuardedRef.current = false
      console.log('[Terminal] Output guard lifted for:', terminalId, 'buffered:', outputGuardBufferRef.current.length, 'chunks')
      // Flush buffered output if any
      if (outputGuardBufferRef.current.length > 0 && xtermRef.current) {
        const buffered = outputGuardBufferRef.current.join('')
        outputGuardBufferRef.current = []
        try {
          xtermRef.current.write(buffered)
        } catch (e) {
          console.warn('[Terminal] Failed to flush output guard buffer:', e)
        }
      }
      // Use resize trick after initial connection to ensure tmux content is drawn
      // This handles: new spawn, reattach from ghost badge, and reconnect scenarios
      // The 500ms debounce prevents conflicts with other resize operations
      setTimeout(() => {
        console.log('[Terminal] Post-init resize trick for:', terminalId)
        triggerResizeTrick()
      }, 200)
    }, 1000)

    // Enable Shift+Ctrl+C/V for copy/paste and Ctrl/Cmd+=/- for font size
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

      // Font size shortcuts - Ctrl/Cmd + =, +, -, 0
      // Use metaKey for macOS Command key, ctrlKey for Windows/Linux
      const modifierKey = event.metaKey || event.ctrlKey
      if (modifierKey && event.type === 'keydown') {
        // Increase font size: Ctrl/Cmd + = or Ctrl/Cmd + +
        if (event.key === '=' || event.key === '+') {
          event.preventDefault()
          onIncreaseFontSizeRef.current?.()
          return false
        }
        // Decrease font size: Ctrl/Cmd + -
        if (event.key === '-') {
          event.preventDefault()
          onDecreaseFontSizeRef.current?.()
          return false
        }
        // Reset font size: Ctrl/Cmd + 0
        if (event.key === '0') {
          event.preventDefault()
          onResetFontSizeRef.current?.()
          return false
        }
      }

      // Allow all other keys to pass through to terminal (including Ctrl+B for tmux)
      return true
    })

    // Focus terminal
    setTimeout(() => {
      xterm.focus()
    }, 150)

    // ResizeObserver to fit when container size changes
    // SIMPLIFIED: Following Tabz pattern - for tmux sessions, only do local fit, don't send resize to backend
    // Backend resize is only sent on actual window resize events (handled separately)
    const resizeObserverTimeoutRef = { current: null as ReturnType<typeof setTimeout> | null }

    const resizeObserver = new ResizeObserver((entries) => {
      if (resizeObserverTimeoutRef.current) clearTimeout(resizeObserverTimeoutRef.current)

      const entry = entries[0]
      if (!entry || entry.contentRect.width <= 0 || entry.contentRect.height <= 0) {
        return
      }

      // Only log occasionally to reduce spam
      // console.log(`[Terminal] ${terminalId.slice(-8)} RESIZE_OBSERVER fired: ${Math.round(entry.contentRect.width)}x${Math.round(entry.contentRect.height)}`)

      // Debounce the fit operation
      resizeObserverTimeoutRef.current = setTimeout(() => {
        if (!xtermRef.current || !fitAddonRef.current || !terminalRef.current) return

        // For tmux sessions, just fit and trigger resize trick - don't clear
        // The resize trick sends SIGWINCH which makes tmux redraw everything fresh
        // Clearing causes isWrapped errors when data is mid-flight
        if (isTmuxSession) {
          const beforeCols = xtermRef.current.cols
          const beforeRows = xtermRef.current.rows

          fitTerminal(0, false)

          const afterCols = xtermRef.current.cols
          const afterRows = xtermRef.current.rows

          // Only trigger resize trick if dimensions actually changed
          if (afterCols !== beforeCols || afterRows !== beforeRows) {
            const isNarrowing = afterCols < beforeCols
            const rowDelta = Math.abs(afterRows - beforeRows)

            // CRITICAL FIX: Clear xterm buffer for ANY narrowing or large row changes
            // xterm's reflow algorithm corrupts content with complex ANSI sequences
            // Row delta >2 catches bookmarks bar appearing/disappearing (~2-3 rows)
            if (isNarrowing || rowDelta > 2) {
              isResizingRef.current = true
              xtermRef.current.clear()
              isResizingRef.current = false
              writeQueueRef.current = [] // Discard stale data from reflow
            }

            triggerResizeTrick()
          }
          return
        }

        // Non-tmux sessions: just fit
        fitTerminal(0, false)
      }, 150)
    })

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current)
    }

    // Cleanup
    const currentResizeObserver = resizeObserver
    const currentTimeoutRef = resizeObserverTimeoutRef

    return () => {
      currentResizeObserver.disconnect()
      if (currentTimeoutRef.current) clearTimeout(currentTimeoutRef.current)
    }
  }, [terminalId, isInitialized])

  // Separate cleanup effect - only dispose xterm on true unmount
  useEffect(() => {
    return () => {
      console.log('[Terminal] Disposing xterm for terminal:', terminalId)
      // Dispose Canvas addon first (before xterm)
      if (canvasAddonRef.current) {
        canvasAddonRef.current.dispose()
        canvasAddonRef.current = null
      }
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

          const sanitizedData = message.data

          // Output guard - buffer output during first 300ms after init to prevent
          // escape sequence corruption on reconnect (copy mode, display corruption)
          if (isOutputGuardedRef.current) {
            outputGuardBufferRef.current.push(sanitizedData)
            return
          }

          // Use safeWrite to queue data during resize operations
          // Direct write() is async - xterm queues data and parses later
          // If resize happens while data is queued, parser crashes with "isWrapped" error
          safeWrite(sanitizedData)
        } else {
          console.warn('[Terminal] ⚠️ Cannot write - xterm:', !!xtermRef.current, 'data:', !!message.data)
        }
      } else if (message.type === 'WS_CONNECTED') {
        setIsConnected(true)
        // If we were disconnected, force tmux to redraw
        // CRITICAL: Plain resize with same dimensions is IGNORED by tmux.
        // We need triggerResizeTrick to force SIGWINCH redraw.
        if (wasDisconnectedRef.current) {
          wasDisconnectedRef.current = false
          console.log(`[Terminal] ${terminalId.slice(-8)} reconnected after disconnect, forcing redraw`)
          setTimeout(() => {
            if (xtermRef.current && fitAddonRef.current) {
              fitAddonRef.current.fit()
              xtermRef.current.refresh(0, xtermRef.current.rows - 1)
              // Use resize trick to force tmux to redraw
              triggerResizeTrick()
            }
          }, 500)
        }
      } else if (message.type === 'WS_DISCONNECTED') {
        setIsConnected(false)
        wasDisconnectedRef.current = true
        console.log(`[Terminal] ${terminalId.slice(-8)} disconnected, will refresh on reconnect`)
      } else if (message.type === 'REFRESH_TERMINALS') {
        // Force tmux to redraw - xterm is new/empty after sidebar refresh
        // CRITICAL: Plain resize with same dimensions is IGNORED by tmux.
        // We need triggerResizeTrick (rows-1, then fit) to force SIGWINCH redraw.
        console.log(`[Terminal] ${terminalId.slice(-8)} received REFRESH_TERMINALS, forcing redraw`)
        if (xtermRef.current && fitAddonRef.current) {
          fitAddonRef.current.fit()
          xtermRef.current.refresh(0, xtermRef.current.rows - 1)
          // Use resize trick to force tmux to redraw content to new xterm instance
          triggerResizeTrick()
        }
      } else if (message.type === 'TERMINAL_RECONNECTED' && message.terminalId === terminalId) {
        // Terminal reconnected after backend restart - clear old content and force redraw
        // CRITICAL: Plain resize with same dimensions is IGNORED by tmux.
        console.log(`[Terminal] ${terminalId.slice(-8)} RECONNECTED - clearing and forcing redraw`)
        if (xtermRef.current && fitAddonRef.current) {
          // Lock before clear to prevent isWrapped error from concurrent writes
          isResizingRef.current = true
          // Clear terminal content - tmux will send fresh scrollback
          xtermRef.current.clear()
          xtermRef.current.reset()
          // Release lock and clear queue after buffer stabilizes
          isResizingRef.current = false
          writeQueueRef.current = [] // Discard stale data queued during clear
          // Use resize trick after a short delay to force tmux redraw
          setTimeout(() => {
            if (fitAddonRef.current && xtermRef.current) {
              try {
                fitAddonRef.current.fit()
                xtermRef.current.refresh(0, xtermRef.current.rows - 1)
                // Use resize trick to force tmux to redraw
                triggerResizeTrick()
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
    const fontSizeChanged = xterm.options.fontSize !== effectiveFontSize

    // Store current scroll position before changes
    const currentScrollPos = xterm.buffer.active.viewportY

    // Update font size (uses effectiveFontSize = base + offset)
    if (fontSizeChanged) {
      xterm.options.fontSize = effectiveFontSize
    }

    // Update font family
    if (fontChanged) {
      xterm.options.fontFamily = fontFamily
    }

    // Update theme colors from the new theme system
    const themeColors = getThemeColors(themeName, isDark)
    xterm.options.theme = themeColors

    // Clear texture atlas after theme change (cached glyphs have old colors)
    // Note: CanvasAddon doesn't have clearTextureAtlas, but xterm.js handles theme changes

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
  }, [effectiveFontSize, fontFamily, themeName, isDark, terminalId])

  // Handle window resize - use triggerResizeTrick to force tmux to fully recalculate
  // EXPERIMENT: Like the EOL fix for tmux splits, we need CONSISTENT handling.
  // Simple resize can leave xterm and tmux out of sync. The resize trick (rows-1, then fit)
  // forces tmux to do a complete redraw, ensuring dimensions are fully in sync.
  useEffect(() => {
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null

    const handleResize = () => {
      // Reduce spam - only log when dimensions actually change or first few times
      // console.log(`[Terminal] ${terminalId.slice(-8)} WINDOW_RESIZE fired`)
      if (resizeTimeout) clearTimeout(resizeTimeout)

      // Debounce, then use resize trick for consistent tmux handling
      resizeTimeout = setTimeout(() => {
        if (!fitAddonRef.current || !xtermRef.current || !terminalRef.current) return

        const containerWidth = terminalRef.current.offsetWidth
        const containerHeight = terminalRef.current.offsetHeight

        if (containerWidth <= 0 || containerHeight <= 0) {
          return
        }

        const beforeCols = xtermRef.current.cols
        const beforeRows = xtermRef.current.rows

        // First do local fit
        try {
          fitAddonRef.current.fit()
        } catch (e) {
          console.warn('[Terminal] Window resize fit failed:', e)
        }

        const afterCols = xtermRef.current.cols
        const afterRows = xtermRef.current.rows
        const isNarrowing = afterCols < beforeCols

        // CRITICAL FIX: Clear xterm buffer for ANY narrowing operation
        // xterm's reflow algorithm corrupts content with complex ANSI sequences
        // Clearing ensures tmux's redraw starts fresh, avoiding corrupted reflow
        // NOTE: Must set resize lock BEFORE clear() to prevent isWrapped error from concurrent writes
        if (isTmuxSession && isNarrowing) {
          isResizingRef.current = true
          xtermRef.current.clear()
          // Release lock and clear queue so triggerResizeTrick can proceed
          isResizingRef.current = false
          writeQueueRef.current = [] // Discard stale data from reflow
        }

        // Then use resize trick to force tmux to fully recalculate
        // This is like the EOL fix - ensures consistent handling instead of racing
        triggerResizeTrick()
      }, 300) // 300ms debounce - wait for resize to settle, then do trick
    }

    window.addEventListener('resize', handleResize)
    return () => {
      window.removeEventListener('resize', handleResize)
      if (resizeTimeout) clearTimeout(resizeTimeout)
    }
  }, [terminalId])

  // Handle tab switching - refresh terminal when it becomes visible (from Tabz pattern)
  // SIMPLIFIED: For tmux sessions, only do local fit and refresh - do NOT send resize to backend
  // This is critical - sending resize on tab switch causes the same corruption as ResizeObserver
  useEffect(() => {
    if (!isActive || !isInitialized) return
    if (!xtermRef.current || !fitAddonRef.current) return

    console.log(`[Terminal] ${terminalId.slice(-8)} tab activated, refreshing`)

    // Small delay to ensure visibility:visible has taken effect
    const timeoutId = setTimeout(() => {
      try {
        if (!xtermRef.current || !fitAddonRef.current) return

        // Fit the terminal to container (local only)
        fitAddonRef.current.fit()

        // Refresh the xterm display
        xtermRef.current.refresh(0, xtermRef.current.rows - 1)

        // Restore focus
        xtermRef.current.focus()

        // CRITICAL: Do NOT send resize to backend on tab switch for tmux sessions
        // This is the same lesson as ResizeObserver - tmux manages its own dimensions
        // Only send resize on actual window resize events
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

  // Reset media error when path changes
  useEffect(() => {
    setMediaError(false)
  }, [backgroundMedia])

  // NOTE: Claude status polling removed from Terminal component
  // The sidepanel handles all status polling via useClaudeStatus hook
  // This eliminates duplicate network requests (was 2x requests per terminal)

  // Compute the effective background:
  // Layer order (bottom to top):
  // 1. Panel color (solid background color)
  // 2. Video/image media (if configured)
  // 3. Gradient overlay with transparency control
  // 4. Terminal (xterm.js)
  // If a custom gradient is specified, use it; otherwise use theme default
  const effectiveGradientCSS = backgroundGradient
    ? getGradientCSS(backgroundGradient, isDark)
    : getThemeBackgroundGradient(themeName, isDark)

  // Apply transparency to gradient (0 = solid panel color, 100 = full gradient)
  const gradientOpacity = transparency / 100

  // Get appropriate panel color for current mode (dark colors -> light equivalents)
  const effectivePanelColor = getPanelColor(panelColor, isDark)

  // Compute media URL - resolve ~ to home directory via backend
  // Supports: http/https URLs, file:// URLs, or paths served via backend
  const getMediaUrl = (path: string | undefined): string | null => {
    if (!path) return null
    // If it's already a URL, use it directly
    if (path.startsWith('http://') || path.startsWith('https://') || path.startsWith('file://')) {
      return path
    }
    // For local paths, serve via backend endpoint
    // Backend will resolve ~ and serve the file
    return `http://localhost:8129/api/media?path=${encodeURIComponent(path)}`
  }

  const mediaUrl = getMediaUrl(backgroundMedia)
  const mediaOpacity = backgroundMediaOpacity / 100
  const showMedia = backgroundMediaType !== 'none' && mediaUrl && !mediaError

  return (
    <div
      ref={containerRef}
      className="h-full flex flex-col terminal-container relative"
      style={{
        backgroundColor: effectivePanelColor,
      }}
    >
      {/* Background media layer (video or image) */}
      {showMedia && backgroundMediaType === 'video' && (
        <video
          key={mediaUrl}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ opacity: mediaOpacity, zIndex: 0 }}
          src={mediaUrl}
          autoPlay
          loop
          muted
          playsInline
          onError={() => {
            console.warn('[Terminal] Failed to load background video:', mediaUrl)
            setMediaError(true)
          }}
        />
      )}
      {showMedia && backgroundMediaType === 'image' && (
        <img
          key={mediaUrl}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          style={{ opacity: mediaOpacity, zIndex: 0 }}
          src={mediaUrl}
          alt=""
          onError={() => {
            console.warn('[Terminal] Failed to load background image:', mediaUrl)
            setMediaError(true)
          }}
        />
      )}
      {/* Gradient overlay with transparency */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: effectiveGradientCSS,
          opacity: gradientOpacity,
          zIndex: 1,
        }}
      />
      {/* Terminal body - full height, status shown in tmux status bar */}
      <div
        className="flex-1 relative overflow-hidden"
        style={{ zIndex: 2 }}
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
