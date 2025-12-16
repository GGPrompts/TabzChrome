# Terminal Rendering Lessons

Lessons related to xterm.js, tmux, resize handling, and terminal display issues.

> **See Also:** The `skills/xterm-js/` skill contains generalized patterns extracted from these lessons.

---

## Only Send Resize on Window Resize for Tmux Sessions

### Lesson: The Tabz Pattern for Tmux Resize (Dec 15, 2025)

**Problem:** Terminal text corruption when narrowing Chrome sidebar after Claude finishes outputting.

**What Happened:**
1. Claude outputs continuously for a while
2. Resize events get deferred (OUTPUT_QUIET_PERIOD) then aborted (MAX_RESIZE_DEFERRALS)
3. xterm.js thinks it's one size, tmux thinks it's another
4. When you later narrow the sidebar, text wraps incorrectly → corruption

**Root Cause:** TabzChrome tried to be "smart" about resize timing:
- Deferred resize during active output (OUTPUT_QUIET_PERIOD = 500ms)
- Aborted resize after 10 deferrals during continuous output
- This left xterm and tmux dimensions permanently out of sync

**Comparison with Tabz (which worked correctly):**

| Aspect | TabzChrome (broken) | Tabz (working) |
|--------|---------------------|----------------|
| ResizeObserver | Sends resize to backend | **Local fit only - no backend** |
| Tab activation | Sends resize to backend | **Local fit only - no backend** |
| Output deferral | 500ms quiet period + abort | **None** |
| Window resize | Sends resize (with deferral) | Sends resize (simple debounce) |
| Debounce | 150ms | **1000ms** |

**Key Insight from Tabz (useTerminalResize.ts line 99-106):**
```typescript
// For tmux sessions, skip sending resize on container changes
if (!isTmuxSession) {
  debouncedResize(agentId, cols, rows);
}
// Only send on actual window resize events
```

**Solution Applied:**
1. **Added `isTmuxSession` detection** - All `ctt-*` terminals are tmux-backed
2. **ResizeObserver**: Only does local `fitTerminal()`, never sends to backend
3. **Tab activation**: Only does local fit + refresh, never sends to backend
4. **Window resize**: Still sends resize (this is the ONE place it's allowed)
5. **Removed OUTPUT_QUIET_PERIOD and deferral logic** - Not needed with this approach
6. **Increased debounce to 1000ms** - Matches Tabz pattern

**The Rule:** For tmux sessions, tmux manages its own dimensions. Don't fight it.
- Container resize (ResizeObserver) → local fit only
- Tab switch → local fit only
- Window resize → send to backend (tmux needs to know the viewport changed)

**Files:**
- `extension/components/Terminal.tsx` - All resize logic simplified

---

## Clear Buffer Before Large Resize Changes

### Lesson: xterm.js Reflow Corrupts Complex ANSI Content (Dec 16, 2025)

**Problem:** First sidebar narrow after heavy Claude Code output caused text wrapping corruption.

**What Happened:**
1. Claude Code outputs complex content (statusline, diffs with ANSI colors)
2. User narrows sidebar significantly (e.g., 107 cols → 78 cols)
3. xterm.js reflow algorithm tries to rewrap existing content
4. Complex ANSI sequences get corrupted during reflow
5. Display shows garbled/duplicated lines

**Root Cause:** xterm.js has a reflow algorithm that rewraps content when dimensions change. This works well for simple text, but corrupts content with:
- Cursor positioning escape sequences
- Claude Code's dynamic statusline
- Colored diffs with many ANSI codes
- Scroll region boundaries

**Solution:** Clear xterm buffer before large dimension changes, then let tmux redraw fresh:

```typescript
const colDelta = Math.abs(afterCols - beforeCols)

// For large dimension changes (>5 cols), clear xterm before tmux redraws
// xterm's reflow algorithm corrupts content with complex ANSI sequences
if (isTmuxSession && colDelta > 5) {
  xtermRef.current.clear()
}

// Then trigger resize trick to force tmux to redraw
triggerResizeTrick()
```

**Why This Works:**
1. `clear()` wipes xterm's buffer - no content to reflow
2. `triggerResizeTrick()` sends SIGWINCH to tmux
3. Tmux redraws everything formatted for new dimensions
4. Fresh content renders correctly in empty xterm

**Why >5 Columns Threshold:**
- Small changes (≤5 cols) rarely cause visible corruption
- Large changes (>5 cols) trigger significant reflow that can corrupt
- The threshold avoids unnecessary clears during minor adjustments

**Files:**
- `extension/components/Terminal.tsx:802-807` - Clear buffer on large resize

---

## Tmux Status Bar Position

### Lesson: Put Tmux Status Bar at TOP When Running Claude Code (Dec 9, 2025)

**Problem**: Tmux status bar would disappear and show terminal content from above the viewport in its place.

**What Happened:**
1. During Claude Code output (especially diffs with ANSI colors), the green tmux status bar at bottom would vanish
2. In its place, a line of terminal content that should be *above* the visible area would appear
3. The corruption also triggered during sidebar resize or extension reload
4. `Ctrl+L` didn't fix it; `Ctrl+a r` (reload tmux config) temporarily fixed it but it recurred

**Root Cause**: Scroll region conflict between tmux and Claude Code's dynamic statusline.

- Tmux uses escape codes (`\e[1;24r`) to define scroll regions, protecting the status bar
- Claude Code has its own statusline at the bottom that can **grow/shrink dynamically** (tool use, subagents, bypass mode)
- When both compete for the bottom rows, scroll region calculations get corrupted
- The row "above" the viewport bleeds into where the status bar should be

**Solution**: Move tmux status bar to the **top**:
```bash
# In .tmux-terminal-tabs.conf
set -g status-position top
```

This gives each their own space:
- Tmux status bar → top (static, 1 row)
- Claude Code statusline → bottom (dynamic, 1-2 rows)

**What Didn't Work:**
- `tmux refresh-client` - only redraws, doesn't fix scroll regions
- `tmux resize-window` trick - caused visual artifacts (dots around terminal)
- Removing dynamic `#{pane_current_path}` from status - didn't help
- Removing Claude status script from status bar - didn't help
- Debounced resize tricks in Terminal.tsx - helped but didn't fully fix

**Key Insight**:
- When two systems manage the same screen area (bottom rows), scroll region bugs are inevitable
- The fix isn't better timing or refresh logic - it's **separation of concerns**
- Put tmux status at top, let Claude Code own the bottom

**Files**:
- `.tmux-terminal-tabs.conf:60-64` - status-position top
- `extension/components/Terminal.tsx:65-84` - scheduleTmuxRefresh (still useful for resize recovery)

---

## Tmux Splits Require Disabled EOL Conversion

### Lesson: Disable EOL Conversion for Tmux Sessions (Nov 14, 2025)

**Problem:** Tmux split panes corrupted each other - text from one pane bled into the other, split divider misaligned.

**What Happened:**
1. User spawns TFE terminal → works fine
2. User splits it horizontally/vertically → creates React split with two xterm instances
3. Both xterm instances connect to same tmux session (different panes)
4. Output corruption: bash terminal's newlines corrupt TFE's rendering
5. Split divider appears 1 space to the right on first 2 rows only

**Root Cause:** xterm.js EOL (End-of-Line) conversion was enabled for all terminals:

```typescript
// WRONG - Causes tmux corruption:
const xtermOptions = {
  convertEol: true,  // Converts \n to \r\n for ALL terminals
}
```

**Why This Breaks Tmux Splits:**
- Tmux sends properly formatted terminal sequences with `\n` (line feed)
- xterm with `convertEol: true` converts `\n` → `\r\n` (carriage return + line feed)
- **Each xterm instance** in the split converts the SAME tmux output independently
- Different conversion = different cursor positioning = panes corrupt each other
- The split divider is rendered by tmux, but xterm's extra `\r` shifts it

**Solution:** Conditionally disable EOL conversion for tmux sessions:

```typescript
// CORRECT - Let tmux manage its own line endings:
const xtermOptions = {
  // Disable EOL conversion for tmux - it manages terminal sequences
  convertEol: !isTmuxSession,  // Only convert for regular shells
  // Ensure UNIX-style line endings
  windowsMode: false,
}
```

**Why This Works:**
- **Tmux sessions**: `convertEol: false` → xterm displays raw PTY output without modification
- **Regular shells**: `convertEol: true` → xterm converts for proper display (Windows compatibility)
- Both xterm instances now handle tmux output identically → no corruption

**Prevention Checklist:**
- [ ] Are you creating split terminals that share a tmux session?
- [ ] Do both xterm instances have identical EOL handling?
- [ ] Is `convertEol` conditional on `isTmuxSession`?
- [ ] Is `windowsMode: false` for tmux sessions?

**Files:**
- `src/components/Terminal.tsx:240-245` - Conditional EOL conversion
- `src/hooks/useTmuxSessionDimensions.ts` - Dimension tracking (prevents font mismatches)

---

## Tmux Sessions Need Different Resize Strategy

### Lesson: Skip ResizeObserver for Tmux Sessions (Nov 12, 2025)

**Problem:** Native tmux splits had flickering content, disappeared when clicking between panes.

**Root Cause:** Multiple resize events interfering with tmux's internal pane management:
- ResizeObserver firing on ANY container change (clicks, focus, layout)
- Focus events triggering resize
- Tab switch triggering resize
- ALL of these sent resize to PTY → tmux tried to resize → content cleared

**Solution - Tmux Resize Policy:**

**DO resize for tmux:**
- ONCE on initial connection (sets viewport dimensions)
- ONLY on actual browser window resize

**DON'T resize for tmux:**
- ResizeObserver events (don't even set it up!)
- Focus events
- Tab switching
- Container changes
- Hot refresh recovery

**Implementation:**
```typescript
// 1. Skip ResizeObserver setup entirely
if (useTmux) {
  console.log('[Resize] Skipping ResizeObserver (tmux session)')
  return  // Don't set up observer at all
}

// 2. Skip focus resize
if (!useTmux && isTerminalReady && fitAddon && xterm) {
  // Only send resize for non-tmux terminals
} else if (useTmux) {
  console.log('[Terminal] FOCUS (tmux): skipping resize')
}

// 3. Send initial resize ONLY ONCE
const initialResizeSentRef = useRef(false)
const shouldSendInitialResize = !useTmux || !initialResizeSentRef.current

if (shouldSendInitialResize) {
  sendResize()
  if (useTmux) initialResizeSentRef.current = true
}
```

**Key Insight:**
- Native tmux splits = single xterm viewport showing entire session
- React splits = separate terminals → resize independently
- Tmux manages its own panes → only tell it the viewport size, then hands off

**Files:**
- `src/hooks/useTerminalResize.ts:129-131` - Skip ResizeObserver
- `src/components/Terminal.tsx:393-424` - Skip focus resize
- `src/components/Terminal.tsx:499-533` - Initial resize once

---

## triggerResizeTrick Causes "Redraw Storms"

> **⚠️ PARTIALLY SUPERSEDED:** The Tabz pattern (see top of file) eliminates most redraw storm scenarios by not sending resize to backend on container changes. `triggerResizeTrick()` is now only used for reconnection scenarios, not container resize.

### Lesson: Multiple Resize Sources Cause Corruption (Dec 11, 2025)

**Problem:** Terminal shows same line repeated many times (e.g., 20x, 57x), corrupting display.

**Symptoms:**
- Backend log shows `Resized PTY Claudia: 104x58` and `105x58` oscillating
- Same output line appears duplicated dozens of times on screen
- Happens without physically resizing the sidebar

**Root Cause:** Multiple sources triggering `triggerResizeTrick()` in rapid succession:

1. **REFRESH_TERMINALS sent twice** (at 200ms and 700ms after reconnect)
2. **Post-connection refresh** (1200ms setTimeout in Terminal.tsx)
3. **refresh-client after each resize** (100ms delay in pty-handler.js)

Each `triggerResizeTrick()` call:
- Sends 2 resize events (cols-1, then cols)
- Each resize triggers SIGWINCH → tmux redraws entire screen
- Plus refresh-client called → another redraw

**Result:** 3 calls × 2 resizes × 2 redraws = 12+ tmux screen redraws

**Solution:**

1. **Send REFRESH_TERMINALS only once:**
```typescript
// BEFORE
setTimeout(() => sendMessage({ type: 'REFRESH_TERMINALS' }), 200)
setTimeout(() => sendMessage({ type: 'REFRESH_TERMINALS' }), 700)

// AFTER
setTimeout(() => sendMessage({ type: 'REFRESH_TERMINALS' }), 500)
```

2. **Remove redundant post-connection refresh**

3. **Remove refresh-client after resize:**
```javascript
// Removed entirely - resize itself sends SIGWINCH
```

4. **Add debounce to triggerResizeTrick:**
```typescript
const RESIZE_TRICK_DEBOUNCE_MS = 500
if (now - lastResizeTrickTimeRef.current < RESIZE_TRICK_DEBOUNCE_MS) {
  return  // Skip if too soon
}
```

**Key Insight:**
- PTY resize automatically sends SIGWINCH to the process
- refresh-client is redundant when tmux already redraws from SIGWINCH
- Multiple resize triggers multiply the problem

**Files:**
- `extension/hooks/useTerminalSessions.ts:144-145` - Single REFRESH_TERMINALS
- `extension/components/Terminal.tsx:50-52,154-168` - Debounce triggerResizeTrick
- `backend/modules/pty-handler.js:545-550` - Removed refresh-client

---

## Write Queue Causing Duplicate Content

### Lesson: Clear Write Queue After Resize Trick (Dec 11, 2025)

**Problem:** Terminal corruption even during IDLE - same content appeared twice, not just during active Claude output.

**Root Cause:** The `triggerResizeTrick()` function does a TWO-STEP resize:

```typescript
// Step 1: Resize down by 1 column → sends SIGWINCH
xtermRef.current.resize(currentCols - 1, currentRows)

// Step 2: 100ms later, resize back → sends ANOTHER SIGWINCH
setTimeout(() => {
  xtermRef.current.resize(currentCols, currentRows)
}, 100)
```

Each SIGWINCH causes tmux to redraw the ENTIRE screen. But between steps, the write queue was collecting data:

1. Step 1: `isResizingRef.current = true` (starts queueing)
2. SIGWINCH #1 → tmux redraws → output queued
3. Step 2: SIGWINCH #2 → tmux redraws AGAIN → MORE output queued
4. `isResizingRef.current = false`
5. `flushWriteQueue()` → writes BOTH redraws concatenated!

**Solution:** Clear the write queue instead of flushing after resize trick:

```typescript
// BEFORE (buggy):
isResizingRef.current = false
flushWriteQueue()  // ❌ Writes both redraws!

// AFTER (fixed):
isResizingRef.current = false
// CRITICAL: Clear instead of flush
writeQueueRef.current = []
```

**Why This is Safe:**
- `triggerResizeTrick()` is purely for visual refresh
- Any data queued during it is just tmux redrawing existing content
- Discarding it doesn't lose any user input or new output

**Files:**
- `extension/components/Terminal.tsx:157-164` - Abort after max deferrals
- `extension/components/Terminal.tsx:208-221` - Clear queue instead of flush

---

## Sidebar Narrowing Corruption

> **⚠️ SUPERSEDED:** This section describes an intermediate fix that was later replaced. See "Only Send Resize on Window Resize for Tmux Sessions" at the top of this file for the final solution. The 150ms debounce was reverted back to 1000ms.

### Lesson: Keep xterm and tmux Dimensions in Sync (Dec 11, 2025)

**Problem:** Terminal text gets corrupted specifically when making the Chrome sidebar narrower.

**Root Cause:** 1000ms debounce on dimension sync was too long:

```typescript
// OLD - 1 second gap between xterm and tmux dimensions
const debounceMs = isFirstResize ? 100 : 1000

// NEW - Keep them in sync within ~150ms
const debounceMs = isFirstResize ? 100 : 150
```

During that 1 second gap:
- xterm shows new (narrower) dimensions immediately
- tmux doesn't know about new dimensions
- Any output during that window is formatted for old (wider) width
- Displayed in narrower container = wrapping corruption

**Why Narrowing Is Worse Than Widening:**
- **Narrowing:** Long lines must wrap → requires recalculating all line breaks
- **Widening:** Wrapped lines unwrap → simpler operation

**Additional Fixes:**
1. `triggerResizeTrick()` must update `prevDimensionsRef` to prevent redundant sends
2. Track ALL deferred timeouts so they can be canceled on new resize events
3. Reset deferral counters when new resize events come in

**Files:**
- `extension/components/Terminal.tsx:281-288` - Reduced debounce from 1000ms to 150ms
- `extension/components/Terminal.tsx:213-216` - triggerResizeTrick updates prevDimensionsRef

---

## Page Refresh During Active Output

> **⚠️ SUPERSEDED:** The output guard approach was removed. See "Only Send Resize on Window Resize for Tmux Sessions" at the top of this file. The fix now uses `triggerResizeTrick()` on reconnection events instead of buffering output.

### Lesson: Output Guard on Reconnection (Dec 13, 2025)

**Problem:** Refreshing the Chrome sidebar while Claude Code is actively outputting causes:
- Terminal enters tmux copy mode
- Screen is missing content / scroll region corruption
- ANSI escape sequences printed as raw text

**Root Cause:**
1. Old xterm.js instance disconnects mid-stream
2. New xterm.js instance connects
3. Tmux continues outputting to PTY
4. Escape sequences from mid-stream output get misinterpreted

**Solution - Three Fixes:**

1. **Disable tmux hooks that send refresh-client:**
```bash
# .tmux-terminal-tabs.conf - commented out
# set-hook -g client-attached 'run-shell "tmux refresh-client -c 2>/dev/null || true"'
```

2. **Add 1000ms output guard to buffer initial output:**
```typescript
const isOutputGuardedRef = useRef(true)
const outputGuardBufferRef = useRef<string[]>([])

// Buffer output during guard period
if (isOutputGuardedRef.current) {
  outputGuardBufferRef.current.push(sanitizedData)
  return
}

// Lift guard after 1000ms
setTimeout(() => {
  isOutputGuardedRef.current = false
  // Flush buffer
  // Force resize trick
}, 1000)
```

3. **Force resize trick after guard lifts (bypass output checks):**
```typescript
const triggerResizeTrick = (force = false) => {
  // Skip output quiet period check if force=true
  if (!force && timeSinceOutput < OUTPUT_QUIET_PERIOD) {
    // defer...
  }
  // ... execute resize trick
}
```

**Why Manual Sidebar Resize Fixed It:**
- User resizing sidebar triggers resize events
- Eventually sends SIGWINCH to tmux
- SIGWINCH forces tmux to redraw and exit copy mode

**Files:**
- `.tmux-terminal-tabs.conf:170-181` - Disabled client-attached hooks
- `extension/components/Terminal.tsx:78-84` - Output guard refs
- `extension/components/Terminal.tsx:518-543` - 1000ms guard with forced resize

---

## fitTerminal vs triggerResizeTrick Abort Behavior

> **⚠️ SUPERSEDED:** The entire deferral/abort approach was removed. See "Only Send Resize on Window Resize for Tmux Sessions" at the top of this file. The new approach doesn't try to time resize around output - it simply doesn't send resize to backend on container changes.

### Lesson: Consistent Abort Behavior Across Related Functions (Dec 13, 2025)

**Problem:** Sidebar resize during continuous Claude output still caused corruption.

**Root Cause:** `fitTerminal()` and `triggerResizeTrick()` had inconsistent abort behavior:

```typescript
// triggerResizeTrick() - CORRECTLY aborts after max deferrals
if (resizeDeferCountRef.current >= MAX_RESIZE_DEFERRALS) {
  console.log(`triggerResizeTrick ABORTED`)
  return  // EXIT - don't proceed
}

// fitTerminal() - INCORRECTLY proceeded after max deferrals
if (resizeDeferCountRef.current >= MAX_RESIZE_DEFERRALS) {
  // PROCEEDS with fit - this was the bug!
}
```

**Solution:** Make `fitTerminal()` also abort after max deferrals:

```typescript
if (resizeDeferCountRef.current >= MAX_RESIZE_DEFERRALS) {
  console.log(`fitTerminal ABORTED (max deferrals reached)`)
  resizeDeferCountRef.current = 0
  return  // EXIT - don't proceed
}
```

**Key Insight:**
- When two functions share a counter, their behavior should be consistent
- After max deferrals during active output, BOTH should abort
- Terminal dimensions are "likely fine" during continuous streaming

**Files:**
- `extension/components/Terminal.tsx:396-418` - fitTerminal abort logic

---

## Backend Debouncing Prevents Dimension Thrashing

### Lesson: Debounce Resize at Backend Too (Nov 12, 2025)

**Problem:** Multiple resize events with slightly different dimensions (310 vs 308) hitting same PTY.

**Solution:**
```javascript
// Backend PTY handler
this.resizeTimers = new Map()
this.resizeDebounceMs = 300

// Debounce resize per terminal
clearTimeout(this.resizeTimers.get(terminalId))
this.resizeTimers.set(terminalId, setTimeout(() => {
  ptyProcess.resize(cols, rows)
}, this.resizeDebounceMs))
```

**Key Insight:**
- Even with frontend debouncing, multiple clients or race conditions can send rapid resizes
- Backend debouncing is last line of defense
- Last resize wins after timeout

**Files:**
- `backend/modules/pty-handler.js:38-46, 487-564` - Debouncing

---

## Account for Fixed Headers in Layout

### Lesson: Fixed Headers Affect FitAddon Calculations (Nov 12, 2025)

**Problem:** Terminal was 47px too tall, causing tmux panes to overflow.

**Root Cause:** Fixed header (47px) not accounted for in xterm.js FitAddon calculations.

**Solution:**
```css
.terminal-display {
  padding-top: 47px;  /* Match header height exactly */
}
```

**Key Insight:**
- FitAddon calculates based on container dimensions
- Fixed/absolute positioned elements reduce available space
- Add padding to terminal container = FitAddon gets correct dimensions

**Prevention:**
- When adding fixed headers/footers, add corresponding padding to terminal container
- Test with `htop` or other TUI tools that use full terminal height

**Files:**
- `src/SimpleTerminalApp.css:1001-1018` - Header padding

---

**Last Updated:** December 15, 2025
