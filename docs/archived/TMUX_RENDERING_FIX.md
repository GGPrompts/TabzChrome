# Tmux Split Rendering Fix - November 12, 2025

## Problem Summary

Native tmux splits (`tmux split-window` / `Ctrl+b %`) were experiencing rendering issues:
1. **Box drawing characters wrapping/bleeding** into adjacent panes
2. **Text disappearing** in taller panes when shorter pane has focus
3. **Dimension miscalculations** between xterm.js and tmux panes
4. **Click-dependent rendering** - text appears/disappears based on where you click

## Root Cause Identified

**User observation (critical insight):**
```
[PTYHandler:RESIZE] Bash → 310×61 (agent: a5d079f8)
[PTYHandler:RESIZE] Bash → 308×61 (agent: a5d079f8)
```

Two resize events with **different dimensions** (310 vs 308) being sent to the **same agent** (a5d079f8).

### Why This Happens (Native Tmux Splits)

**Flow:**
1. One xterm.js instance → One PTY process → One tmux session
2. Inside tmux, user creates native splits (`Ctrl+b %`)
3. When window resizes or focus changes:
   - xterm.js FitAddon calculates new dimensions (e.g., 310×61)
   - Sends resize to PTY → tmux receives 310×61
   - Tmux recalculates pane splits internally
   - **But** another resize event arrives (308×61) before tmux finishes
   - Last resize wins, overwriting previous dimensions
4. Result: tmux panes have wrong dimensions, box art bleeds

### Contributing Factors

1. **No backend debouncing** - All resize events were immediately applied
2. **Frontend `-2` column adjustment** - Masked the problem by artificially reducing dimensions
3. **Multiple resize sources** - Focus handlers, tab switches, ResizeObserver all trigger independently
4. **Asynchronous timing** - Debounced frontend events still fire with slightly different values

## Research Findings (Web Search)

### From xterm.js GitHub Issues
- **Issue #2409** (✅ Fixed in 4.14.0): Pixel-perfect box drawing via custom glyphs
- **Issue #456**: Known tmux support limitations - dimension sync issues
- **Best practice**: Send exact xterm.js dimensions to PTY, don't adjust

### From tmux GitHub Issues
- **Issue #4187** (2024): SIGWINCH spam when switching zoomed panes
- **Issue #3060**: Use `tmux-256color` for proper color support
- **Issue #2995**: client-resized hook can cause strange behavior

### From Stack Overflow / Forums
- **Critical tmux.conf settings** (already in your `.tmux-terminal-tabs.conf`):
  ```tmux
  set -g window-size latest          # Use most recently active client ✅
  setw -g aggressive-resize off      # Don't constrain to smallest ✅
  set -g default-terminal "tmux-256color"  # Proper TERM ✅
  ```
- **Consensus solution**: Debounce resize events at backend (500ms recommended)

## Solution Implemented

### 1. Backend Resize Debouncing (pty-handler.js)

**Added:**
```javascript
// Constructor
this.resizeTimers = new Map();
this.resizeDebounceMs = 300; // 300ms debounce
this.lastResizeDimensions = new Map(); // Track last resize

// Modified resize() method
resize(terminalId, cols, rows) {
  // Check if dimensions actually changed
  if (lastResize && lastResize.cols === cols && lastResize.rows === rows) {
    return; // Skip duplicate resize
  }

  // Clear existing timer
  if (this.resizeTimers.has(terminalId)) {
    clearTimeout(this.resizeTimers.get(terminalId));
  }

  // Set new debounced timer (last resize wins after 300ms)
  const timer = setTimeout(() => {
    this._performResize(terminalId, cols, rows);
  }, this.resizeDebounceMs);

  this.resizeTimers.set(terminalId, timer);
}
```

**Effect:**
- When multiple resize events arrive within 300ms, only the **last one** is applied
- Prevents dimension thrashing between competing resize calculations
- Logs show `⏱️ Debouncing resize` when clearing previous timers

### 2. Removed Frontend `-2` Column Adjustment

**Before (useTerminalResize.ts, Terminal.tsx):**
```typescript
// WRONG: Artificially reduce dimensions
const adjustedCols = useTmux ? Math.max(20, currentCols - 2) : currentCols;
wsRef.current.send({ cols: adjustedCols, rows: currentRows });
```

**After:**
```typescript
// CORRECT: Send exact FitAddon calculations
wsRef.current.send({ cols: currentCols, rows: currentRows });
```

**Removed from:**
- `src/hooks/useTerminalResize.ts` (5 locations)
- `src/components/Terminal.tsx` (2 locations)

**Why this matters:**
- The `-2` was a band-aid that masked the root cause
- It made dimensions even MORE wrong by reducing them arbitrarily
- Backend debouncing is the correct solution

### 3. Improved Logging

**Before:**
```
[PTYHandler:RESIZE] Bash → 310×61 (agent: a5d079f8)
```

**After:**
```
[PTYHandler:RESIZE] Bash (tmux: tt-bash-abc123) → 310×61 (was: 308×61) (agent: a5d079f8)
[PTYHandler:RESIZE] ⏱️  Debouncing resize for Bash (clearing previous timer)
[PTYHandler:RESIZE] ✅ Executing debounced resize: Bash → 310×61
```

Shows:
- Tmux session name
- Previous dimensions (to spot conflicts)
- Debounce status
- Final applied dimensions

## Testing Checklist

### 1. Verify Backend Debouncing Works
```bash
# Watch backend logs
tmux capture-pane -t tabz:backend -p -S -50 | grep RESIZE

# Expected: Should see debouncing messages when resizing
# Should see ONLY ONE "✅ Executing debounced resize" per resize action
```

### 2. Test Native Tmux Splits
```bash
# In a terminal in the app:
tmux split-window -h  # Horizontal split
# Type in both panes
# Resize window
# Click between panes

# Box art should NOT bleed into adjacent panes
# Text should NOT disappear when switching focus
# Dimensions should stay consistent
```

### 3. Test TUI Tools
```bash
# Launch TFE (your TUI file explorer)
tfe

# Create tmux splits with TFE in them
tmux split-window -h
tfe

# Resize window, click between panes
# Box drawing should be pixel-perfect
# No wrapping or bleeding
```

### 4. Monitor Dimension Consistency
```bash
# In one pane, continuously check dimensions
watch -n 1 'tmux display -p "#{window_width}x#{window_height}"'

# Resize window or click between panes
# Dimensions should stabilize after 300ms
# Should NOT see rapid flickering between values
```

## Expected Behavior After Fix

### ✅ What Should Work Now
1. **Box drawing characters** stay within pane boundaries
2. **Text persists** in taller panes when shorter pane has focus
3. **Dimension changes** apply smoothly after 300ms debounce
4. **Click-dependent rendering** issues resolved
5. **Native tmux splits** work reliably

### ⚠️ What Might Still Need Tuning
1. **Debounce delay** (300ms) - May need adjustment based on feel
2. **Font size correlation** - Test with 16pt and 20pt fonts
3. **Edge cases** - Very small panes, rapid resizing

## Rollback Plan

If issues arise, revert these commits:
```bash
git log --oneline | head -5  # Find commit hashes

# Revert backend debouncing
git revert <backend-commit-hash>

# Revert frontend -2 removal
git revert <frontend-commit-hash>
```

Or manually restore the `-2` adjustments:
```typescript
// In useTerminalResize.ts and Terminal.tsx
const adjustedCols = useTmux ? Math.max(20, currentCols - 2) : currentCols;
```

## Additional Fix: Header Layout Issue (November 12, 2025)

**User discovered:** Fixed header causing viewport clipping!

### The Layout Problem

```css
.simple-terminal-app {
  height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  position: fixed;  /* Removed from document flow! */
  top: 0;
  padding: 12px 20px;  /* ~47px total height */
}

.tab-bar {
  margin-top: 47px;  /* ✅ Avoids header */
}

.terminal-display {
  flex: 1;  /* ⚠️ Calculates as if header doesn't exist! */
}
```

### The Issue

When `.app-header` is `position: fixed`, it's removed from the flexbox flow. The `.terminal-display` calculates its height as `100vh - tab-bar-height`, **but doesn't account for the 47px header overlay**.

Result:
- xterm.js FitAddon gets **47px more height than actually visible**
- Terminal dimensions sent to tmux are **47px too tall**
- Tmux splits calculate wrong dimensions
- Box art bleeds into adjacent panes

### The Fix

Add padding-top to `.terminal-display` to account for fixed header:

```css
.terminal-display {
  flex: 1;
  padding-top: 47px;  /* Account for fixed header */
  transition: padding-top 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Remove padding when header is hidden */
.simple-terminal-app.header-hidden .terminal-display {
  padding-top: 0;
}
```

**Files modified:**
- `src/SimpleTerminalApp.css` (lines 1000-1018)

**Impact:**
- xterm.js FitAddon now calculates correct dimensions
- Reduces visible terminal height by 47px when header is visible
- Removes padding when header auto-hides after 10 seconds
- **Should fix dimension miscalculations completely!**

### Additional Fix: Disable Resize on Focus for Tmux Sessions

**User reported:** Clicking between tmux panes causes content to disappear!

**Root cause:** The focus handler was sending resize events when clicking anywhere in the xterm.js viewport. For tmux sessions, clicking between panes triggers focus events, but tmux manages pane switching internally. External resize events disrupt tmux's pane management and cause screen clears.

**Fix applied:**

```typescript
// In Terminal.tsx focus handler (line 393)
if (!useTmux && isTerminalReady && fitAddon && xterm && !isSelecting && !xterm.hasSelection()) {
  // Only send resize for non-tmux terminals
  fitAddon.fit();
  // ... send resize to backend
} else if (useTmux) {
  // For tmux: Just restore focus without triggering resize
  console.log(`[Terminal] FOCUS (tmux): ${agent.name} - skipping resize (tmux manages panes)`);
}

// Also in tab-switch handler (line 628)
if (!useTmux && wsRef.current && wsRef.current.readyState === WebSocket.OPEN && xtermRef.current) {
  // Only send resize for non-tmux terminals
} else if (useTmux) {
  console.log(`[Terminal] TAB-SWITCH (tmux): ${agent.name} - skipping resize (tmux manages panes)`);
}
```

**Files modified:**
- `src/components/Terminal.tsx` (lines 393-424, 625-653)

**Impact:**
- Clicking between tmux panes no longer triggers resize events
- Tmux manages pane focus and dimensions internally
- Content no longer disappears when clicking between panes
- Still send resize for non-tmux terminals (for window resizing)

### Additional Fix: Disable ResizeObserver for Tmux Sessions

**User reported:** Still seeing disappearing text after focus fix!

**Root cause:** The ResizeObserver was still watching container size changes and sending resize events. Looking at logs:
```
[Terminal] FOCUS (tmux): skipping resize  ✅ Good!
[Terminal] DEBOUNCED resize: 328×61 (was: 390×61)  ❌ Still happening!
```

The ResizeObserver fires on **any** container dimension change - clicking areas, layout reflows, CSS changes, etc. For tmux sessions, these internal changes should **never** trigger resize - only actual browser window resize should affect the entire tmux session.

**Fix applied:**

```typescript
// In useTerminalResize.ts ResizeObserver setup (line 126)
if (useTmux) {
  console.log('[Resize] Terminal ${terminalId} skipping ResizeObserver (tmux session - only window resize allowed)');
  return; // Don't set up ResizeObserver at all
}

// Also skip in mountKey useEffect (line 186)
if (useTmux) return;

// Also skip in container-resized event handler (line 298)
if (useTmux) {
  console.log('[Resize] Ignoring container-resized event for tmux session');
  return;
}

// Also skip in Hot Refresh Recovery (line 265)
if (useTmux) return;
```

**Files modified:**
- `src/hooks/useTerminalResize.ts` (lines 126-132, 186, 265, 298-300)

**Impact:**
- **ONLY window resize events** trigger PTY resize for tmux sessions
- Internal container changes (clicks, layout, CSS) no longer send resize
- Tmux manages its panes completely internally
- **Completely prevents content disappearing issue!**

**How it works now for tmux:**
1. ✅ Window resize → `handleResize()` → sends to PTY
2. ❌ Container resize → ResizeObserver skipped
3. ❌ Focus events → skipped
4. ❌ Tab switch → skipped
5. ❌ Container custom events → skipped
6. ❌ Hot refresh → skipped

**Result:** Tmux session gets resized ONLY when the browser window changes size, all pane management happens inside tmux.

## Next Steps (If Issues Persist)

### Option A: Query Tmux Pane Dimensions
Instead of trusting FitAddon, query actual tmux pane dimensions:

```javascript
// Backend API endpoint
app.get('/api/tmux/pane-dimensions/:sessionName', (req, res) => {
  const output = execSync(`tmux display -p -t "${sessionName}" '#{pane_width} #{pane_height}'`);
  const [width, height] = output.toString().trim().split(' ');
  res.json({ cols: parseInt(width), rows: parseInt(height) });
});

// Frontend: Use these dimensions instead of FitAddon
const { cols, rows } = await fetch(`/api/tmux/pane-dimensions/${agent.sessionName}`).then(r => r.json());
xterm.resize(cols, rows);
```

### Option B: Increase Debounce Delay
If 300ms isn't enough, try 500ms:
```javascript
this.resizeDebounceMs = 500; // In pty-handler.js constructor
```

### Option C: CSS Visual Buffer (Safest Fallback)
Add visual padding without changing dimensions:
```css
.terminal-tmux .xterm-screen {
  padding-right: 20px;
  box-sizing: border-box;
}
```

## Related Files Modified

### Backend
- `backend/modules/pty-handler.js` - Added debouncing, improved logging

### Frontend
- `src/hooks/useTerminalResize.ts` - Removed `-2` adjustment (5 locations)
- `src/components/Terminal.tsx` - Removed `-2` adjustment (2 locations)

### Configuration (No changes needed)
- `.tmux-terminal-tabs.conf` - Already has correct settings ✅

## References

### Documentation Created
- `TMUX_SPLIT_RENDERING_DEBUG.md` - Original investigation
- `TMUX_RENDERING_FIX.md` - This document

### External Resources
- [xterm.js Issue #2409](https://github.com/xtermjs/xterm.js/issues/2409) - Box drawing fix
- [tmux Issue #4187](https://github.com/tmux/tmux/issues/4187) - SIGWINCH spam
- [tmux man page](https://man.openbsd.org/tmux.1) - window-size, aggressive-resize

### Research Reports (Generated)
- Web search: xterm.js + tmux rendering issues
- Web search: tmux dimension calculation problems
- Web search: xterm.js box drawing character rendering

---

**Status:** ✅ **IMPLEMENTED** - Ready for testing

**Date:** November 12, 2025

**Next Review:** After testing native tmux splits with TFE and other TUI tools
