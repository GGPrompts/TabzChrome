# Resize & Output Coordination Patterns

This document provides detailed patterns for handling terminal resizing in xterm.js applications, especially when integrated with tmux.

## The Core Problem

Terminal resizing involves multiple systems that can interfere with each other:

1. **xterm.js** - Renders the terminal UI, calculates dimensions
2. **FitAddon** - Calculates optimal cols/rows for container size
3. **WebSocket** - Sends dimensions to backend
4. **PTY** - Receives resize signal (SIGWINCH)
5. **Tmux** - Receives SIGWINCH and redraws ALL panes

When any of these steps happen during active output, you get corruption:
- Same content appears multiple times ("redraw storms")
- Lines wrap incorrectly
- Escape sequences get misinterpreted
- Terminal enters copy mode (tmux)

## Pattern 1: Output Quiet Period

**Never resize during active output.** Track when output last occurred and wait for a quiet period.

```typescript
// Constants
const OUTPUT_QUIET_PERIOD = 500  // 500ms after last output
const MAX_RESIZE_DEFERRALS = 10  // Max retry attempts (5 seconds total)

// Refs
const lastOutputTimeRef = useRef(0)
const resizeDeferCountRef = useRef(0)

// Update on every output
const handleOutput = (data: string) => {
  lastOutputTimeRef.current = Date.now()
  xterm.write(data)
}

// Check before resize
const fitTerminal = () => {
  const timeSinceOutput = Date.now() - lastOutputTimeRef.current

  if (timeSinceOutput < OUTPUT_QUIET_PERIOD) {
    if (resizeDeferCountRef.current < MAX_RESIZE_DEFERRALS) {
      resizeDeferCountRef.current++
      console.log(`[fitTerminal] Deferred (${resizeDeferCountRef.current}/${MAX_RESIZE_DEFERRALS})`)
      setTimeout(() => fitTerminal(), OUTPUT_QUIET_PERIOD)
      return
    } else {
      // ABORT entirely - don't force during continuous output
      console.log(`[fitTerminal] ABORTED (max deferrals - continuous output)`)
      resizeDeferCountRef.current = 0
      return
    }
  }

  // Safe to resize
  resizeDeferCountRef.current = 0
  fitAddon.fit()
  // ... send dimensions to backend
}
```

**Key Insight:** After max deferrals, ABORT instead of forcing. Forcing resize during continuous Claude streaming causes massive corruption.

## Pattern 2: Two-Step Resize Trick

Tmux sometimes doesn't properly rewrap text after dimension changes. The "resize trick" sends two SIGWINCHs in quick succession, forcing a full redraw.

```typescript
const triggerResizeTrick = (force = false) => {
  if (!xtermRef.current) return

  const currentCols = xtermRef.current.cols
  const currentRows = xtermRef.current.rows

  // Check output quiet period (unless forced)
  const timeSinceOutput = Date.now() - lastOutputTimeRef.current
  if (!force && timeSinceOutput < OUTPUT_QUIET_PERIOD) {
    // Defer logic (see Pattern 1)
    return
  }

  // Debounce (unless forced)
  const timeSinceLast = Date.now() - lastResizeTrickTimeRef.current
  if (!force && timeSinceLast < RESIZE_TRICK_DEBOUNCE_MS) {
    return
  }
  lastResizeTrickTimeRef.current = Date.now()

  console.log(`[triggerResizeTrick] ${currentCols}x${currentRows}`)

  // Step 1: Resize down by 1 column
  xtermRef.current.resize(currentCols - 1, currentRows)
  sendResize(currentCols - 1, currentRows)

  // Step 2: Resize back (100ms later)
  setTimeout(() => {
    if (!xtermRef.current) return
    xtermRef.current.resize(currentCols, currentRows)
    sendResize(currentCols, currentRows)

    // Update tracking to prevent redundant sends
    prevDimensionsRef.current = { cols: currentCols, rows: currentRows }
  }, 100)
}
```

**When to use:**
- After sidebar resize settles
- After reconnection/page refresh
- When terminal content looks corrupted

**When to use `force=true`:**
- Post-initialization recovery (after output guard lifts)
- User-triggered "fix terminal" action

## Pattern 3: Write Queue Management

During resize operations, output may arrive that shouldn't be written immediately. Use a write queue, but handle it carefully.

```typescript
const writeQueueRef = useRef<string[]>([])
const isResizingRef = useRef(false)

const handleOutput = (data: string) => {
  lastOutputTimeRef.current = Date.now()

  if (isResizingRef.current) {
    writeQueueRef.current.push(data)
    return
  }

  xterm.write(data)
}

const triggerResizeTrick = () => {
  isResizingRef.current = true

  // ... do two-step resize ...

  setTimeout(() => {
    isResizingRef.current = false

    // CRITICAL: Clear queue instead of flushing!
    // The resize trick causes TWO tmux redraws.
    // Both get queued, and flushing writes duplicate content.
    // Since resize trick is purely for visual refresh,
    // discard the queued redraw data.
    writeQueueRef.current = []
  }, 150)
}
```

**Why clear instead of flush:**
- Two-step resize = two SIGWINCHs = two full screen redraws
- Queue contains BOTH redraws concatenated
- Flushing writes both = duplicate content on screen
- Clearing is safe because the final redraw shows correct content

## Pattern 4: Output Guard on Reconnection

When the page refreshes while output is streaming, the new xterm instance connects mid-stream. Partial escape sequences get misinterpreted.

```typescript
const isOutputGuardedRef = useRef(true)
const outputGuardBufferRef = useRef<string[]>([])

const handleOutput = (data: string) => {
  lastOutputTimeRef.current = Date.now()

  if (isOutputGuardedRef.current) {
    outputGuardBufferRef.current.push(data)
    return
  }

  xterm.write(data)
}

// Lift guard after terminal stabilizes
useEffect(() => {
  const timer = setTimeout(() => {
    isOutputGuardedRef.current = false

    // Flush buffered output
    if (outputGuardBufferRef.current.length > 0) {
      const buffered = outputGuardBufferRef.current.join('')
      outputGuardBufferRef.current = []
      xtermRef.current?.write(buffered)
    }

    // Force resize trick to fix any tmux state (copy mode, scroll regions)
    setTimeout(() => triggerResizeTrick(true), 100)
  }, 1000)  // 1000ms guard period

  return () => clearTimeout(timer)
}, [terminalId])
```

**Why 1000ms:**
- 300ms wasn't enough - corruption still occurred
- 500ms (same as OUTPUT_QUIET_PERIOD) had race conditions
- 1000ms gives time for:
  - xterm.js to fully initialize
  - Initial output flood to be captured
  - Resize trick to run and fix tmux state

## Pattern 5: Deferred Timeout Tracking

Multiple resize events create multiple deferred timeouts. Without tracking, orphaned timeouts fire unexpectedly.

```typescript
const deferredResizeTrickRef = useRef<NodeJS.Timeout | null>(null)
const deferredFitTerminalRef = useRef<NodeJS.Timeout | null>(null)

// In ResizeObserver callback
const handleContainerResize = () => {
  // Cancel any pending deferred operations
  if (deferredResizeTrickRef.current) {
    clearTimeout(deferredResizeTrickRef.current)
    deferredResizeTrickRef.current = null
  }
  if (deferredFitTerminalRef.current) {
    clearTimeout(deferredFitTerminalRef.current)
    deferredFitTerminalRef.current = null
  }

  // Reset deferral counter (fresh resize sequence)
  resizeDeferCountRef.current = 0

  // Schedule new fit
  deferredFitTerminalRef.current = setTimeout(() => {
    deferredFitTerminalRef.current = null
    fitTerminal()
  }, 150)
}
```

**Key Insight:** When a new resize event comes in, the previous deferred operations are obsolete. Cancel them and start fresh.

## Pattern 6: Post-Resize Cleanup

After sidebar/container resize settles, trigger the resize trick to fix text wrapping:

```typescript
const preResizeDims = useRef({ width: 0, height: 0 })
const postResizeCleanupRef = useRef<NodeJS.Timeout | null>(null)

const resizeObserver = new ResizeObserver((entries) => {
  // Cancel pending cleanups
  if (postResizeCleanupRef.current) {
    clearTimeout(postResizeCleanupRef.current)
  }

  const entry = entries[0]
  const newWidth = entry.contentRect.width
  const newHeight = entry.contentRect.height

  // Debounced fit
  setTimeout(() => fitTerminal(), 150)

  // Post-resize cleanup (300ms after fit)
  postResizeCleanupRef.current = setTimeout(() => {
    const widthChange = Math.abs(newWidth - preResizeDims.current.width)
    const heightChange = Math.abs(newHeight - preResizeDims.current.height)
    const significantChange = widthChange > 10 || heightChange > 10

    if (significantChange && newWidth > 0 && newHeight > 0) {
      preResizeDims.current = { width: newWidth, height: newHeight }
      triggerResizeTrick()
    }
  }, 450)  // 150ms (fit) + 300ms (settle)
})
```

## Debugging Checklist

When terminal content is corrupted:

1. **Same line repeated many times?**
   - Check if resize happening during output
   - Check if write queue is being flushed instead of cleared

2. **Text wrapping incorrectly?**
   - Check if resize trick ran after container resize
   - Check xterm vs tmux dimension sync

3. **Escape sequences as raw text?**
   - Check if output guard is active during reconnection
   - Check if tmux hooks are firing during attach

4. **Terminal in copy mode after refresh?**
   - Check if forced resize trick runs after output guard lifts
   - Check for tmux `refresh-client` hooks (should be disabled)

## Quick Reference

| Scenario | Action |
|----------|--------|
| Output streaming | DON'T resize, defer until quiet |
| Max deferrals reached | ABORT, don't force |
| Sidebar resized | fitTerminal + delayed triggerResizeTrick |
| Page refreshed | 1000ms output guard + forced resize trick |
| Resize trick done | CLEAR write queue (don't flush) |
| New resize event | CANCEL pending deferred operations |
