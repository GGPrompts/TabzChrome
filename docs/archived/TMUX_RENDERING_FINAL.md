# Tmux Split Rendering - FINAL FIX

**Date:** November 12, 2025
**Status:** ✅ **COMPLETE**

## The Complete Solution (5 Fixes)

After extensive debugging and iteration, here are all the fixes required for perfect native tmux split rendering:

---

## Fix #1: Backend Resize Debouncing (300ms)

**Problem:** Multiple resize events with slightly different dimensions (310 vs 308) hitting the same PTY.

**Solution:** Added debouncing in `backend/modules/pty-handler.js`:
```javascript
this.resizeTimers = new Map();
this.resizeDebounceMs = 300;
```

**Impact:** Last resize wins after 300ms, preventing dimension thrashing.

---

## Fix #2: Header Layout (47px padding)

**Problem:** Fixed header not accounted for in xterm.js FitAddon calculations → terminal 47px too tall.

**Solution:** Added padding to `src/SimpleTerminalApp.css`:
```css
.terminal-display {
  padding-top: 47px;  /* Account for fixed header */
}
```

**Impact:** xterm.js now calculates correct visible dimensions.

---

## Fix #3: Disable Focus Resize for Tmux

**Problem:** Clicking between tmux panes triggers focus events → resize sent → content disappears.

**Solution:** Skip resize in focus handler (`src/components/Terminal.tsx` line 393):
```typescript
if (!useTmux && isTerminalReady && fitAddon && xterm) {
  // Only send resize for non-tmux terminals
} else if (useTmux) {
  console.log('[Terminal] FOCUS (tmux): skipping resize');
}
```

**Impact:** Focus changes no longer interfere with tmux pane management.

---

## Fix #4: Disable ResizeObserver for Tmux

**Problem:** ResizeObserver fires on ANY container change (clicks, layout, CSS) → sends resize → content disappears.

**Solution:** Skip ResizeObserver setup for tmux (`src/hooks/useTerminalResize.ts` line 129):
```typescript
if (useTmux) {
  console.log('[Resize] Skipping ResizeObserver (tmux session - only window resize)');
  return;  // Don't set up observer at all
}
```

**Impact:** Internal container changes no longer trigger resize events.

---

## Fix #5: Initial Resize ONCE per Session

**Problem:**
- Without initial resize: Terminal stuck at 800x600, doesn't use viewport dimensions
- With initial resize on every mount: Repeated resizes on tab switch → content disappears

**Solution:** Send initial resize ONLY ONCE using ref tracking (`src/components/Terminal.tsx` line 499):
```typescript
const initialResizeSentRef = useRef(false);

// Send initial resize only if haven't sent it yet for this tmux session
const shouldSendInitialResize = !useTmux || !initialResizeSentRef.current;

if (shouldSendInitialResize) {
  sendResize();
  if (useTmux) {
    initialResizeSentRef.current = true;  // Mark as sent
  }
}
```

**Impact:**
- ✅ Tmux gets correct viewport dimensions on first connection
- ✅ Subsequent tab switches/remounts don't send resize
- ✅ Terminal uses full page dimensions
- ✅ Content stays visible when clicking between panes

---

## Complete Tmux Resize Policy

**For tmux sessions, resize happens:**
- ✅ **ONCE** on initial connection (sets viewport dimensions)
- ✅ **Only** on actual browser window resize (via handleResize)

**Completely SKIPPED for tmux:**
- ❌ Repeated initial resizes (ref prevents)
- ❌ ResizeObserver (not set up)
- ❌ Focus events
- ❌ Tab switching
- ❌ Container custom events
- ❌ Hot refresh recovery

---

## How It Works Now

### First Connection Flow
```
1. Terminal component mounts
2. xterm.js initializes and fits to container
3. Send ONE resize with viewport dimensions to tmux
4. Mark initialResizeSentRef.current = true
5. Done - no more resizes unless window resizes
```

### Subsequent Interactions
```
- Click between panes → Focus handler → Skip (tmux handles internally)
- Switch tabs → Tab switch handler → Skip (already have dimensions)
- Container changes → ResizeObserver → Not even set up
- Window resize → handleResize → ✅ Send to tmux (legit resize)
```

---

## Files Modified

### Backend
- `backend/modules/pty-handler.js` - Added debouncing (lines 38-46, 487-564)

### Frontend
- `src/SimpleTerminalApp.css` - Added header padding (lines 1001-1018)
- `src/components/Terminal.tsx` - Added initialResizeSentRef + skip logic (lines 75, 393-424, 499-533, 625-653)
- `src/hooks/useTerminalResize.ts` - Skip ResizeObserver for tmux (lines 129-131, 186, 265, 298-300)

---

## Testing Checklist

```bash
# 1. Refresh page to reset initialResizeSentRef
# 2. Spawn Bash terminal with tmux enabled
# 3. Create native tmux splits:
tmux split-window -h  # Left and right
tmux split-window -v  # Add bottom

# 4. Expected behavior:
✅ Terminal uses full page dimensions (not 800x600)
✅ All panes visible at correct size
✅ Clicking between panes preserves all content
✅ Box drawing characters stay within boundaries
✅ No screen clears or content disappearing

# 5. Expected logs:
[Terminal] Sending initial resize to backend: 391x61 (tmux: true, first: true)
[Terminal] FOCUS (tmux): Bash - skipping resize
[Resize] Terminal xxx skipping ResizeObserver (tmux session)
[PTYHandler:RESIZE] ⏱️  Debouncing resize
[PTYHandler:RESIZE] ✅ Executing debounced resize: Bash → 391×61

# 6. Tab switch test:
# Switch to another tab and back
[Terminal] TAB-SWITCH (tmux): Bash - skipping resize
[Terminal] Skipping initial resize for tmux session Bash - already sent once

# 7. Window resize test (should work):
# Resize browser window
[PTYHandler:RESIZE] Bash → 450×70 (was: 391×61)
```

---

## Why All 5 Fixes Were Needed

Each fix addressed a different piece of the puzzle:

1. **Backend debouncing** - Handles race conditions when multiple sources send resize
2. **Header padding** - Ensures dimensions are calculated correctly in the first place
3. **Focus skip** - Prevents interference when clicking between tmux panes
4. **ResizeObserver skip** - Prevents triggers from ANY container change
5. **Initial resize once** - Balances "needs dimensions" vs "stop spamming resize"

**Without #5:** Terminal stuck at 800x600, unusable
**With only initial resize, without #3 and #4:** Content disappears on interaction
**With all 5 fixes:** Perfect native tmux split support! ✅

---

## The Key Insight

**Native tmux splits require a completely different resize strategy than React-based splits:**

- **React splits:** Each pane is a separate terminal component → resize independently
- **Tmux splits:** Single xterm.js viewport showing entire tmux session → resize ONLY the session, tmux manages panes internally

**Our final strategy:** Tell tmux the viewport size ONCE, then let tmux do all pane management. Only resize again if the actual browser window changes.

---

**Status:** ✅ **PRODUCTION READY**

Native tmux splits now work perfectly. You can simplify your codebase by removing React-based SplitLayout and using native tmux splits for everything!
