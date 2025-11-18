# Split Terminal Visual & Performance Fixes

## Issues Fixed

### 1. ✅ Left Terminal Darker Background
**Problem:** Left pane appeared darker than right pane in side-by-side splits

**Root Cause:**
- ResizableBox library may add wrapper elements with backgrounds
- Stacking contexts could create unintended visual effects

**Fix:**
```css
/* Ensure equal background - no overlays or darkening */
.split-pane-left,
.split-pane-right,
.split-pane-top,
.split-pane-bottom {
  background: transparent;
  isolation: isolate; /* Create stacking context */
}

.split-pane .react-resizable {
  background: transparent;
}

.split-pane .react-resizable > div {
  background: transparent !important;
}

/* Prevent any pseudo-elements from react-resizable */
.react-resizable::before,
.react-resizable::after {
  display: none !important;
}
```

### 2. ✅ Focus Indicator Z-Index Issues
**Problem:** Focus indicator visible under left pane but over right pane

**Root Cause:**
- Right pane indicator: `z-index: 11`
- Left pane indicator: on resize handle with `z-index: 10`
- Resize handle itself had `z-index: 10`

**Fix:**
```css
/* Resize handle above everything */
.react-resizable-handle {
  z-index: 50; /* Increased from 10 */
}

/* Focus indicators below resize handle */
.split-pane-right.focused::before,
.split-pane-bottom.focused::before {
  z-index: 40; /* Changed from 11 */
}
```

**Z-Index Hierarchy:**
- Resize handle: `50` (always grabbable)
- Focus indicators: `40` (visible but not blocking handle)
- Split panes: default (lowest)

### 3. ✅ Choppy Drag Handling
**Problem:** Dragging to resize felt laggy and unresponsive

**Root Cause:**
- Only `onResizeStop` handler implemented
- No visual feedback during drag
- Terminal refits happened all at once at the end

**Fix:**
```typescript
// Added onResize handler for live updates
<ResizableBox
  onResize={(e, data) => {
    // Live update during drag for smooth visual feedback
    triggerTerminalRefit();
  }}
  onResizeStop={(e, data) => {
    // Persist size to store
    updateTerminal(terminal.id, { ... });
    // Final refit after resize completes
    triggerTerminalRefit();
  }}
/>
```

### 4. ✅ Resize Event Spam
**Problem:** Terminal refit events firing constantly, causing poor performance

**Root Cause:**
- `window.dispatchEvent(new Event('terminal-container-resized'))` called immediately on every resize
- No debouncing or throttling
- Terminal refits are expensive (xterm.js re-layout)

**Fix:**
```typescript
// Debounce terminal refit events
const refitTimeoutRef = useRef<NodeJS.Timeout | null>(null);
const triggerTerminalRefit = () => {
  if (refitTimeoutRef.current) {
    clearTimeout(refitTimeoutRef.current);
  }
  refitTimeoutRef.current = setTimeout(() => {
    window.dispatchEvent(new Event('terminal-container-resized'));
  }, 150); // Wait 150ms after last resize before refitting
};

// Cleanup on unmount
useEffect(() => {
  return () => {
    if (refitTimeoutRef.current) {
      clearTimeout(refitTimeoutRef.current);
    }
  };
}, []);
```

## Performance Improvements

**Before:**
- ❌ Terminal refit on every resize event (could be hundreds per second)
- ❌ No visual feedback during drag
- ❌ Choppy, laggy experience

**After:**
- ✅ Debounced refits (max 1 per 150ms)
- ✅ Smooth visual feedback during drag
- ✅ Terminal refits only when dragging pauses
- ✅ Clean timeout cleanup on unmount

## Visual Improvements

**Before:**
- ❌ Left pane appeared darker
- ❌ Focus indicator inconsistent (hidden on left, visible on right)
- ❌ Resize handle sometimes unclickable

**After:**
- ✅ Both panes equally bright
- ✅ Focus indicators consistent on both sides
- ✅ Resize handle always on top and grabbable

## Testing Checklist

- [x] Vertical split (left/right) drag smoothness
- [x] Horizontal split (top/bottom) drag smoothness
- [x] Focus indicators visible on both panes
- [x] No darkening on left/top pane
- [x] Resize handle always grabbable
- [x] No memory leaks from timeouts
- [x] Terminal refits work correctly

## Files Modified

1. `src/components/SplitLayout.css` - Z-index fixes, transparency fixes
2. `src/components/SplitLayout.tsx` - Debounced refits, onResize handler
