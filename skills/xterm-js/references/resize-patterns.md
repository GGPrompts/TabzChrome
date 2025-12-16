# Resize Patterns for Tmux Sessions (The Tabz Pattern)

This document provides the simplified resize strategy for xterm.js + tmux applications, learned from debugging TabzChrome.

## The Core Insight

**Don't fight tmux. Let it manage its own dimensions.**

Previous approaches tried to coordinate resize timing with output (deferral, quiet periods, abort logic). This was complex and still caused corruption. The solution is simpler: **don't send resize to backend on container changes at all**.

## The Tabz Pattern

For tmux-backed terminals:

| Event | Action |
|-------|--------|
| ResizeObserver (container change) | Local fit only - NO backend resize |
| Tab switch | Local fit + refresh - NO backend resize |
| Window resize | Clear buffer if large change, then triggerResizeTrick() ✓ |
| Reconnection events | triggerResizeTrick() to force SIGWINCH |

## Pattern 1: Conditional Backend Resize

```typescript
// Determine if this is a tmux session
const isTmuxSession = !!sessionName || terminalId.startsWith('ctt-')

// fitTerminal with optional backend notification
const fitTerminal = (sendToBackend = false) => {
  if (!fitAddonRef.current || !xtermRef.current) return

  try {
    isResizingRef.current = true
    fitAddonRef.current.fit()
    xtermRef.current.refresh(0, xtermRef.current.rows - 1)

    // Only send resize to backend when explicitly requested
    if (sendToBackend) {
      const cols = xtermRef.current.cols
      const rows = xtermRef.current.rows

      // Skip if dimensions unchanged
      if (cols === prevDimensionsRef.current.cols &&
          rows === prevDimensionsRef.current.rows) {
        return
      }

      prevDimensionsRef.current = { cols, rows }
      debouncedSendResize(cols, rows)
    }

    setTimeout(() => {
      isResizingRef.current = false
      flushWriteQueue()
    }, 50)
  } catch (e) {
    console.warn('[Terminal] Fit failed:', e)
    isResizingRef.current = false
    flushWriteQueue()
  }
}
```

## Pattern 2: ResizeObserver (Local Only for Tmux)

```typescript
useEffect(() => {
  if (!terminalRef.current?.parentElement) return

  const resizeObserver = new ResizeObserver(() => {
    // For tmux: local fit only - NO backend resize
    // For regular shells: send to backend
    fitTerminal(!isTmuxSession)
  })

  resizeObserver.observe(terminalRef.current.parentElement)
  return () => resizeObserver.disconnect()
}, [terminalRef.current, isTmuxSession])
```

## Pattern 3: Window Resize with Clear Buffer

Window resize is the ONE place we send resize to backend for tmux sessions. **Critical:** Clear xterm buffer before large dimension changes to avoid reflow corruption:

```typescript
useEffect(() => {
  let resizeTimeout: ReturnType<typeof setTimeout> | null = null

  const handleWindowResize = () => {
    if (resizeTimeout) clearTimeout(resizeTimeout)

    // 300ms debounce - wait for resize to settle
    resizeTimeout = setTimeout(() => {
      if (!fitAddonRef.current || !xtermRef.current) return

      const beforeCols = xtermRef.current.cols

      // Do local fit
      fitAddonRef.current.fit()

      const afterCols = xtermRef.current.cols
      const colDelta = Math.abs(afterCols - beforeCols)

      // CRITICAL: Clear buffer before large resize changes
      // xterm's reflow algorithm corrupts content with complex ANSI sequences
      // (Claude Code statusline, colored diffs, cursor positioning)
      if (isTmuxSession && colDelta > 5) {
        xtermRef.current.clear()
      }

      // Use resize trick to force tmux to redraw
      triggerResizeTrick()
    }, 300)
  }

  window.addEventListener('resize', handleWindowResize)
  return () => {
    window.removeEventListener('resize', handleWindowResize)
    if (resizeTimeout) clearTimeout(resizeTimeout)
  }
}, [])
```

**Why clear buffer on large changes?**
- xterm.js has a reflow algorithm that rewraps content when dimensions change
- Works fine for simple text, but corrupts complex ANSI content
- Clearing ensures tmux's SIGWINCH redraw starts fresh
- Threshold of >5 cols avoids unnecessary clears on minor adjustments

## Pattern 4: Two-Step Resize Trick for Reconnection

**Critical Insight:** Tmux ignores resize events when dimensions haven't changed. After reconnection (page refresh, WebSocket reconnect), xterm is new/empty but tmux thinks dimensions are the same. Plain resize won't redraw.

The "resize trick" sends cols-1 then cols to force two SIGWINCHs:

```typescript
const RESIZE_TRICK_DEBOUNCE_MS = 500
const lastResizeTrickTimeRef = useRef(0)

const triggerResizeTrick = () => {
  if (!xtermRef.current || !fitAddonRef.current) return
  if (isResizingRef.current) return

  // Simple debounce - no output deferral needed
  const now = Date.now()
  const timeSinceLast = now - lastResizeTrickTimeRef.current
  if (timeSinceLast < RESIZE_TRICK_DEBOUNCE_MS) {
    console.log(`[Terminal] triggerResizeTrick DEBOUNCED`)
    return
  }
  lastResizeTrickTimeRef.current = now

  const currentCols = xtermRef.current.cols
  const currentRows = xtermRef.current.rows

  try {
    isResizingRef.current = true

    // Step 1: Resize down by 1 column (sends SIGWINCH)
    xtermRef.current.resize(currentCols - 1, currentRows)
    sendMessage({
      type: 'TERMINAL_RESIZE',
      terminalId,
      cols: currentCols - 1,
      rows: currentRows,
    })

    // Step 2: Resize back (100ms later, sends another SIGWINCH)
    setTimeout(() => {
      if (!xtermRef.current) return

      try {
        xtermRef.current.resize(currentCols, currentRows)
        sendMessage({
          type: 'TERMINAL_RESIZE',
          terminalId,
          cols: currentCols,
          rows: currentRows,
        })
        prevDimensionsRef.current = { cols: currentCols, rows: currentRows }
      } catch (e) {
        console.warn('[Terminal] Resize trick step 2 failed:', e)
      }

      isResizingRef.current = false
      // CRITICAL: Clear write queue - both redraws were queued
      writeQueueRef.current = []
    }, 100)
  } catch (e) {
    console.warn('[Terminal] Resize trick step 1 failed:', e)
    isResizingRef.current = false
    writeQueueRef.current = []
  }
}
```

## Pattern 5: Reconnection Handlers

Use triggerResizeTrick on reconnection events:

```typescript
// In WebSocket message handler
case 'REFRESH_TERMINALS':
case 'WS_CONNECTED':
  // Force tmux to redraw - xterm is new/empty after sidebar refresh
  console.log(`[Terminal] received ${message.type}, forcing redraw`)
  if (xtermRef.current && fitAddonRef.current) {
    fitAddonRef.current.fit()
    xtermRef.current.refresh(0, xtermRef.current.rows - 1)
    triggerResizeTrick()  // Force SIGWINCH
  }
  break

case 'TERMINAL_RECONNECTED':
  // Terminal reconnected after backend restart
  console.log(`[Terminal] RECONNECTED - clearing and forcing redraw`)
  if (xtermRef.current && fitAddonRef.current) {
    xtermRef.current.clear()
    xtermRef.current.reset()
    setTimeout(() => {
      fitAddonRef.current.fit()
      xtermRef.current.refresh(0, xtermRef.current.rows - 1)
      triggerResizeTrick()  // Force SIGWINCH
    }, 100)
  }
  break
```

## Pattern 6: Tab Switch (Local Only)

```typescript
useEffect(() => {
  if (!isActive || !isInitialized) return
  if (!xtermRef.current || !fitAddonRef.current) return

  const timeoutId = setTimeout(() => {
    try {
      // Fit the terminal to container (local only)
      fitAddonRef.current.fit()

      // Refresh the xterm display
      xtermRef.current.refresh(0, xtermRef.current.rows - 1)

      // Restore focus
      xtermRef.current.focus()

      // CRITICAL: Do NOT send resize to backend on tab switch
      // This is the same lesson as ResizeObserver
    } catch (error) {
      console.warn('[Terminal] Failed to refresh on tab switch:', error)
    }
  }, 100)

  return () => clearTimeout(timeoutId)
}, [isActive, isInitialized])
```

## Write Queue Management

During resize operations, buffer output to prevent corruption:

```typescript
const writeQueueRef = useRef<string[]>([])
const isResizingRef = useRef(false)

const safeWrite = (data: string) => {
  if (isResizingRef.current) {
    writeQueueRef.current.push(data)
    return
  }

  if (!xtermRef.current) {
    writeQueueRef.current.push(data)
    return
  }

  xtermRef.current.write(data)
}

const flushWriteQueue = () => {
  if (writeQueueRef.current.length === 0) return
  if (isResizingRef.current) return  // Don't flush during resize

  const queued = writeQueueRef.current.join('')
  writeQueueRef.current = []
  xtermRef.current?.write(queued)
}
```

**Note:** After triggerResizeTrick, CLEAR the queue instead of flushing. The two-step resize causes two tmux redraws, both get queued - flushing writes duplicate content.

## Debugging Checklist

When terminal content is corrupted:

1. **Same line repeated many times?**
   - Check if resize is being sent on container changes (should be local only)
   - Check if write queue is being flushed instead of cleared after resize trick

2. **Text wrapping incorrectly?**
   - Check if window resize is sending to backend
   - Check xterm vs tmux dimension sync

3. **Blank terminal after refresh?**
   - Check if triggerResizeTrick is being called on reconnection events
   - Plain resize with same dimensions is ignored by tmux

4. **Terminal in copy mode after refresh?**
   - The resize trick (cols-1/cols) should force SIGWINCH and exit copy mode
   - Check for tmux hooks that interfere (should be disabled)

## Summary

The key insight is that trying to coordinate resize timing with output was the wrong approach. The solution is simpler:

1. **For container changes:** Local fit only, no backend
2. **For window resize:** Send to backend (the one place it's needed)
3. **For reconnection:** Use resize trick to force SIGWINCH

This eliminates race conditions between resize and output entirely.
