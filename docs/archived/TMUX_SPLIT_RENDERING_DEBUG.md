# Tmux Split Rendering Issues - Debug Summary

## Problem Description

When using native tmux splits in the browser (xterm.js), content disappears or renders incorrectly:
- Content in one pane gets cut off at the height of the shorter adjacent pane
- Box art (like TFE's rounded corner borders) bleeds into adjacent panes
- Clicking between panes sometimes causes rendering corruption
- Switching tabs causes display issues
- Issue is worse with larger font sizes

## Root Cause Analysis

**Core Issue**: Mismatch between xterm.js viewport dimensions and tmux pane dimensions.

When you have tmux splits displayed in browser via xterm.js:
- Each xterm.js instance calculates its own cols/rows based on container size
- But they all share the SAME PTY process (the tmux session)
- When one terminal sends a resize event, it affects the entire PTY
- This causes dimension conflicts between what xterm.js thinks it has vs what tmux pane actually has

**Example:**
```
Left pane:  xterm.js calculates 90 cols → sends resize(90) → PTY becomes 90 cols
Right pane: xterm.js calculates 80 cols → sends resize(80) → PTY becomes 80 cols
Left pane:  Now thinks it has 90 cols but PTY is 80 cols → box art bleeds
```

---

## Attempted Solutions

### 1. ✅ Tmux Configuration Fixes (.tmux-terminal-tabs.conf)

**What we changed:**
```tmux
# Disabled aggressive-resize (was causing pane height mismatches)
setw -g aggressive-resize off

# Set window-size to latest (prevents client-based constraints)
set -g window-size latest

# Changed terminal type for better compatibility
set -g default-terminal "tmux-256color"  # was: screen-256color

# Added pane border styling (prevents box art bleeding)
set -g pane-border-style fg=colour240
set -g pane-active-border-style fg=colour39
set -g pane-border-lines single

# Added refresh hooks to force redraw
set-hook -g after-select-pane 'refresh-client -c'
set-hook -g client-attached 'refresh-client -c'
set-hook -g pane-focus-in 'refresh-client -c'
```

**Result:** Helped with initial rendering and border issues, but didn't fully solve dimension mismatches.

---

### 2. ✅ Frontend: Added Fit/Resize on Focus (Terminal.tsx)

**What we changed:**
Added logic to call `fitAddon.fit()` + send resize to backend when clicking on a terminal.

**Location:** `src/components/Terminal.tsx` - focusHandler function (line ~360)

**Problems encountered:**
- Initially caused escape sequences to leak (saw `?1;2c` in input fields)
- Was firing during text selection, breaking user experience
- Was sending conflicting resize events for tmux sessions

**Solutions applied:**
```typescript
// Added 1 second initialization delay
let isTerminalReady = false;
setTimeout(() => { isTerminalReady = true; }, 1000);

// Skip during text selection
if (!isSelecting && !xterm.hasSelection())

// Skip for tmux sessions (tmux manages dimensions)
if (!isUsingTmux)
```

**Result:** Fixed escape sequence leakage, but dimension mismatches persisted.

---

### 3. ✅ Frontend: Added Resize on Tab Switch (Terminal.tsx)

**What we changed:**
Modified tab switching useEffect to also send resize event to backend.

**Location:** `src/components/Terminal.tsx` - line ~590

**Result:** Improved tab switching behavior, but didn't solve split pane issues.

---

### 4. ❌ ATTEMPTED: Disable PTY Resize for Tmux Sessions

**Theory:** Stop sending PTY resize events from individual panes, let tmux manage everything.

**What we tried:**
```typescript
const isUsingTmux = useTmux || agent.name?.includes('tmux') || agent.sessionName;
if (!isUsingTmux) {
  // Only send resize for non-tmux terminals
}
```

**Result:** Didn't work - still had dimension mismatches.

---

### 5. ⚠️ CURRENT: Column Buffer Approach (useTerminalResize.ts)

**Theory:** Artificially reduce reported columns by 2 for tmux sessions to create buffer zone.

**What we changed:**
```typescript
// In useTerminalResize.ts - all resize locations
const adjustedCols = useTmux ? Math.max(20, xtermRef.current.cols - 2) : xtermRef.current.cols;
```

**Files modified:**
- `src/hooks/useTerminalResize.ts` (6 locations)
- `src/components/Terminal.tsx` (pass useTmux flag to hook)

**Result:** Not fully working yet - still seeing box art bleed and dimension issues.

---

## Key Findings

### Font Size Correlation
- **Important Discovery:** Issue is WORSE with larger font sizes (20pt) and BETTER with smaller font sizes (16pt)
- **Why:** Larger fonts → fewer columns fit in same width → dimension calculations more sensitive to small differences
- **Implication:** The dimension mismatch is likely 1-2 characters, which is more noticeable at 20pt than 16pt

### Scrollback Settings Matter
- Tmux terminals: `scrollback: 0` (tmux handles history)
- Non-tmux terminals: `scrollback: 10000`
- **Issue:** Bash terminals in tmux splits had scrollback enabled, causing detection issues
- **Fixed:** Now using `useTmux` flag instead of checking scrollback value

### Text Selection Interference
- Clicking on selectable text rows (bash output) triggers text selection mechanism
- This interferes with fit/resize logic
- Bottom of TUI apps (non-selectable) doesn't have this issue

---

## Current Code State

### Modified Files
1. `.tmux-terminal-tabs.conf` - tmux hooks and settings
2. `src/components/Terminal.tsx` - focus handler with guards
3. `src/hooks/useTerminalResize.ts` - column buffer logic

### Key Variables
- `useTmux` - Global setting from useSettingsStore
- `agent.sessionName` - Indicates tmux session
- `scrollback` - 0 for tmux, 10000 for bash

---

## ❌ ATTEMPTED: Terminal Detection Issue (From TFE LESSONS_LEARNED.md)

**RESULT: Made it worse - reverted**

### Discovery
TFE's LESSONS_LEARNED.md revealed that **terminal type detection** affects box width calculations:

**The Problem:**
- xterm.js (browser) behaves like xterm/WezTerm: borders are included in lipgloss Width()
- Windows Terminal behaves differently: borders are added to Width()
- This causes a **2-character difference** in box width calculations
- TFE uses different width offsets based on detected terminal:
  - Windows Terminal: `availableWidth = width - 6`
  - xterm/WezTerm: `availableWidth = width - 8`

**What Was Happening:**
1. Backend PTY inherits `process.env` from Windows host
2. This includes `WT_SESSION` and `WT_PROFILE_ID` environment variables
3. TFE detects as Windows Terminal (sees `WT_SESSION`)
4. TFE calculates box width with `-6` offset
5. But xterm.js needs `-8` offset
6. **Result: 2-character box art bleed!**

### Solution Applied
Modified `backend/modules/pty-handler.js` to filter Windows Terminal environment variables:

```javascript
// Filter out WT_SESSION to prevent TUI apps from detecting as Windows Terminal
const filteredEnv = { ...process.env };
delete filteredEnv.WT_SESSION;
delete filteredEnv.WT_PROFILE_ID;

const enhancedEnv = {
  ...filteredEnv,
  ...env,
  TERM_PROGRAM: 'xterm', // Explicitly set for TUI apps
  // ... rest of env
};
```

**Expected Result:**
- TFE now detects as xterm (not Windows Terminal)
- Uses correct `-8` offset for box width
- Box art should stay within pane boundaries
- Works for all terminals in splits, not just TFE

### Testing Result
- Filtering WT_SESSION made box art bleed WORSE
- This means Windows Terminal detection (-6 offset) was closer to correct than xterm detection (-8 offset)
- **Reverted this change**

### Analysis
The LESSONS_LEARNED.md assumption doesn't apply here because:
- Native xterm.js in browser may have different rendering than native terminal emulators
- Lipgloss box width calculations might not directly map to web-based terminals
- The issue is more complex than just terminal type detection

---

## Current Status (End of Day)

### What's Still Applied
1. ✅ Tmux config changes (hooks, aggressive-resize off, window-size latest)
2. ⚠️ Frontend focus handler with fit/resize (may be causing conflicts)
3. ⚠️ -2 column buffer for tmux sessions (may be making it worse)
4. ⚠️ Skip PTY resize for tmux sessions logic (may not be helping)

### What Made It Worse
- ❌ Filtering WT_SESSION environment variable
- ⚠️ Column buffer approach (-2 cols) - unclear if helping or hurting
- ⚠️ Multiple resize handlers firing - may be conflicting

### Key Observations
1. **Font size correlation remains**: Larger fonts (20pt) → worse, smaller fonts (16pt) → better
2. **Worked briefly then stopped**: Suggests timing/race condition issue
3. **WT_SESSION matters**: Removing it made things worse, not better
4. **Not just TFE**: Affects all terminals in splits (bash, TFE, etc.)

### Possible Real Issue
The problem might be **timing/synchronization** rather than dimension calculation:
- Two xterm.js instances sharing one PTY
- Both trying to resize the PTY independently
- No coordination between them
- Race condition where one overwrites the other's resize
- Tmux refresh hooks can't keep up with rapid resize events

---

## Fresh Approaches for Tomorrow

### Consider Rolling Back
Before trying new approaches, consider reverting today's changes to get back to baseline:
```bash
cd /home/matt/projects/terminal-tabs
git restore src/components/Terminal.tsx
git restore src/hooks/useTerminalResize.ts
# Keep tmux config changes - those seem helpful
```

### Potential Next Steps

### Option A: Query Actual Tmux Pane Dimensions
Instead of having xterm.js calculate dimensions, query tmux for actual pane size:
```bash
tmux list-panes -F "#{pane_width}x#{pane_height}"
```
Then tell xterm.js to use those exact dimensions.

### Option B: Single Shared PTY Handler
Create a wrapper that manages PTY resize centrally:
- Only resize PTY when window-level size changes
- Individual panes never send resize events
- Panes just query their dimensions from tmux

### Option C: Different PTY Per Pane
Instead of all panes sharing one PTY (tmux session):
- Each pane gets its own tmux attach command as separate PTY
- Each PTY can have independent dimensions
- More overhead but isolated dimension management

### Option D: CSS/Padding Approach
Add CSS padding to terminals to create visual buffer:
```css
.terminal-tmux .xterm {
  padding-right: 20px; /* ~2 characters */
}
```
This keeps box art visually constrained without changing actual dimensions.

### Option E: Increase Column Buffer
Current: -2 columns
Try: -3 or -4 columns
Or make it proportional: `cols * 0.98` (98% of width)

### Option F: Investigate xterm.js FitAddon
The FitAddon might be calculating incorrectly for split layouts.
- Check if FitAddon accounts for scrollbar width
- Check if border/padding is included in calculations
- Try manual dimension calculation instead of FitAddon

### Option G: Backend PTY Resize Throttling
Add debouncing/throttling on backend PTY resize handler:
```javascript
// Only allow one resize per 500ms
// Ignore rapid resize events from different panes
```

---

## Debugging Commands

```bash
# Check tmux settings
tmux show-options -g window-size
tmux show-options -gw aggressive-resize
tmux show-hooks -g

# Check actual pane dimensions
tmux list-panes -F "#{pane_id} #{pane_width}x#{pane_height} #{pane_active}"

# Reload tmux config
tmux source-file ~/.tmux-terminal-tabs.conf

# Kill tmux server (fresh start)
tmux kill-server

# Browser console checks
localStorage.clear()  // Clear state
// Check terminal dimensions
console.log(xtermRef.current?.cols, xtermRef.current?.rows)
```

---

## References

- **Migration Plan:** `TMUX_MIGRATION_PLAN.md`
- **PTY Handler:** `backend/modules/pty-handler.js`
- **Terminal Component:** `src/components/Terminal.tsx`
- **Resize Hook:** `src/hooks/useTerminalResize.ts`
- **Tmux Config:** `.tmux-terminal-tabs.conf`

---

## Notes

- The fix that briefly worked involved font size change triggering proper sync
- This suggests the synchronization mechanism exists but isn't being triggered correctly
- May need to force tmux refresh more aggressively
- Consider looking at how tmux-resurrect handles dimension restoration

---

## Recommended Next Steps (Priority Order)

### 1. Start Fresh - Roll Back Today's Changes
```bash
cd /home/matt/projects/terminal-tabs
git restore src/components/Terminal.tsx src/hooks/useTerminalResize.ts
# Keep .tmux-terminal-tabs.conf changes
git add .tmux-terminal-tabs.conf
git add TMUX_SPLIT_RENDERING_DEBUG.md
git commit -m "docs: Add tmux split rendering debug summary + tmux config improvements"
```

### 2. Investigate the Actual Root Cause
The real issue might be that **xterm.js FitAddon calculates columns differently than tmux panes**.

**Test this hypothesis:**
```javascript
// In browser console when TFE split is visible
// Check what xterm.js calculated:
console.log('Left pane cols:', leftXterm.cols)
console.log('Right pane cols:', rightXterm.cols)
```

Then in bash terminal:
```bash
# Check what tmux thinks the panes are:
tmux list-panes -F "#{pane_index}: #{pane_width}x#{pane_height}"
```

If these don't match, that's the smoking gun.

### 3. Try CSS-Based Solution
Instead of manipulating resize events, adjust the visual display:

```css
/* Add padding to create visual buffer */
.terminal-tmux .xterm-screen {
  padding-right: 20px; /* ~2 characters */
  box-sizing: border-box;
}
```

This keeps dimensions correct while creating visual boundary.

### 4. Alternative: Disable Tmux Pane Borders
The bleeding happens at pane boundaries. Try:
```tmux
set -g pane-border-lines heavy  # Or double
# Thicker borders might prevent visual bleed
```

### 5. Nuclear Option: Separate PTY Per Pane
If shared PTY is the issue, each "split" could attach to tmux independently:
```bash
# Left pane
tmux attach -t session -r  # Read-only attach

# Right pane  
tmux attach -t session -r  # Independent read-only attach
```

Both view same session but don't send conflicting resize events.

---

## Summary

This is a complex issue involving:
- xterm.js FitAddon calculations
- Tmux pane dimension management
- Lipgloss box width rendering
- Shared PTY resize conflicts
- Timing/race conditions

The approaches tried today (column buffers, skip resize, terminal detection) all made things worse or didn't help. Need fresh perspective tomorrow starting from clean baseline.
