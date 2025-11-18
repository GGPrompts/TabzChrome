# Remaining Phases - Split Layout System

## Current Status

**✅ Phase 1:** Complete - Basic split infrastructure
**✅ Phase 2A:** Complete - Drag-and-drop tab reordering (tab click bug FIXED Nov 9, 2025)
**✅ Phase 2B:** Complete - Focus management (ALREADY IMPLEMENTED)
**✅ Phase 2C:** Complete - Split persistence & close buttons (FIXED Nov 9, 2025)
**⏳ Phase 3:** Not Started - Tab context menu
**⏳ Phase 4:** Not Started - Persistence & polish
**⏳ Phase 5:** Future - Advanced features

**Latest Update (Nov 9, 2025):** Split persistence is now fully working! Terminals reconnect correctly after page refresh, maintaining their split layout structure. Individual pane close buttons have been added, and the `exit` command now properly closes terminals in splits.

---

## Phase 2C: Split Persistence & Close Buttons ✅

**Status:** COMPLETE (Nov 9, 2025)

### What Was Implemented:

#### 1. Split Persistence Across Refresh ✅
- Fixed duplicate terminal rendering (hidden terminals no longer render twice)
- Fixed reconnection loop (prevents duplicate sessions)
- Preserved `splitLayout` and `isHidden` properties during reconnection
- Added loading state for race conditions during agent connection
- All panes reconnect properly and split structure is maintained

#### 2. Individual Pane Close Buttons ✅
- Added close button (✕) to each pane in split layouts
- Buttons appear on hover in top-right corner of each pane
- Clicking close button removes that pane from split
- Automatically converts to single terminal if only 1 pane remains
- Properly handles unhiding remaining terminal

#### 3. Exit Command Handling ✅
- Typing `exit` in a terminal now closes it properly
- For split panes: removes pane and updates split layout
- For single terminals: removes tab entirely
- Converts split to single when only 1 pane remains after exit

### Files Modified:
- `src/SimpleTerminalApp.tsx` - Reconnection logic, close handling, duplicate prevention
- `src/components/SplitLayout.tsx` - Race condition handling, close buttons, pane management
- `src/components/SplitLayout.css` - Close button styling
- `src/stores/simpleTerminalStore.ts` - Already had persistence (no changes needed)

---

## Phase 3: Tab Context Menu (Secondary UX) ⏳

**Goal:** Right-click on tabs to access split/merge options (alternative to drag-and-drop).

### Tasks Remaining:

1. **Create Context Menu Component** (~1 hour)
   - New file: `src/components/TabContextMenu.tsx`
   - Use React Portal to render menu at cursor position
   - Handle right-click event on tabs
   - Close menu on click outside

2. **Add "Split Vertical/Horizontal" Options** (~45 min)
   - Shows spawn menu when clicked
   - Detects working directory from original terminal
   - After spawn, creates split layout with new terminal
   - Inherits working directory from original terminal

3. **Add "Merge with..." Submenu** (~30 min)
   - Lists all other tabs
   - Each tab has "Split Vertical" and "Split Horizontal" options
   - Calls same merge logic as drag-and-drop

4. **Add "Pop Out Pane..." Submenu** (~1 hour)
   - Only shows if tab has splits
   - Lists all panes in current split
   - Creates new tab with selected pane
   - Removes pane from split (converts to single if only 1 pane left)

5. **Add "Close Tab" Option** (~15 min)
   - Same as clicking X button
   - Kills all terminals in split (if any)

**Estimated Time:** 3-4 hours
**Files to Create/Modify:**
- `src/components/TabContextMenu.tsx` (new)
- `src/components/TabContextMenu.css` (new)
- `src/SimpleTerminalApp.tsx` (add context menu state, handlers)

**Backend Work Needed:**
- Working directory detection via `/proc/{pid}/cwd` or tmux
- Optional: OSC 7 escape sequence parsing for better cwd tracking

---

## Phase 4: Persistence & Polish ⏳

**Goal:** Handle edge cases, add polish, improve UX.

### Tasks Remaining:

1. **Edge Case: Closing Entire Split Tab** (~20 min)
   - ✅ Individual pane closing works
   - Need: Handle closing tab with X button on tab bar
   - Should: Kill all terminals in all panes
   - Should: Remove from localStorage

2. **Edge Case: Merging a Split Tab** (~30 min)
   - Currently: Can only merge single-terminal tabs
   - Enhancement: Allow merging split tabs (creates nested structure)
   - Alternative: Prevent merging split tabs (show error/disable)

3. **Split Persistence to localStorage** (~15 min)
   - ✅ Already works via Zustand persist middleware
   - Verify: Splits restore correctly after refresh (DONE)
   - Test: Multiple splits, different layouts (DONE)

4. **Smooth Animations** (~1 hour)
   - Add CSS transitions for split creation/removal
   - Animate divider position changes
   - Fade in drop zones during drag
   - Smooth tab reordering

5. **Improved Divider Visuals** (~30 min)
   - Better hover state (more prominent)
   - Active drag state (brighter, thicker)
   - Cursor changes (col-resize, row-resize)
   - Consider adding grip dots or handle icon

6. **Mobile Responsiveness** (~2 hours)
   - Detect screen size < 768px
   - Collapse splits to single terminal on mobile
   - Add swipe gestures to switch between panes
   - Tab bar scrolls horizontally on mobile

7. **Keyboard Shortcuts** (~1 hour)
   - Ctrl+Shift+\ → Split vertical
   - Ctrl+Shift+- → Split horizontal
   - Ctrl+Shift+W → Close focused pane
   - Alt+Left/Right → Focus prev/next pane in split

**Estimated Time:** 5-6 hours (3 hours less due to completed pane close work)
**Files to Modify:**
- All existing split-related files (polish, edge cases)
- `src/SimpleTerminalApp.css` (animations, mobile)

---

## Phase 5: Advanced Features (Future) 🚀

**Goal:** Nice-to-have features, not essential for MVP.

### Potential Features:

1. **Nested Splits** (~3 hours)
   - Split a pane within a split (recursive)
   - Requires tree data structure instead of flat panes array
   - Complex UI for drop zones and resizing

2. **Drag to Swap Panes** (~2 hours)
   - Drag pane divider to swap left/right or top/bottom
   - Visual feedback during swap
   - Update split layout state

3. **Quad Split Shortcut** (~1 hour)
   - Right-click → "Quad Split (2x2)"
   - Creates 4 equal panes automatically
   - Opens spawn menu 4 times

4. **Zoom Pane (Maximize Temporarily)** (~1 hour)
   - Like tmux Ctrl+B z
   - Maximize focused pane to full tab area
   - Toggle to restore split layout
   - Could use Ctrl+Shift+Z shortcut

5. **Save/Load Split Layout Templates** (~3 hours)
   - Save current split configuration as template
   - Name templates ("Dev Setup", "Debugging", etc.)
   - Load template creates same split layout
   - Stored in localStorage or JSON file

6. **Pop-Out Windows for Multi-Monitor** (~4 hours)
   - "Pop Out Tab" button (↗) on each tab
   - Opens new browser window with terminal
   - window.open() with terminal ID in URL
   - Shared WebSocket connection
   - User arranges windows with OS/Chrome

7. **Split Layout in spawn-options.json** (~2 hours)
   - Define split layouts in spawn options
   - Example: "Claude Code + Bash (split)" as single option
   - Spawns both terminals and creates split automatically

**Estimated Time:** 15+ hours (low priority, future work)

---

## Summary by Priority

### 🔥 Critical (Must Have):
- ✅ **Phase 2C:** Split persistence & close buttons - COMPLETE!
- **Phase 3:** Context menu basics - 3-4 hours
- **Phase 4:** Edge cases & persistence - 2-3 hours

**Total Critical Work:** ~5-7 hours

### 🎯 Important (Should Have):
- **Phase 4:** Polish & animations - 2-3 hours
- **Phase 3:** Pop out pane feature - 1 hour

**Total Important Work:** ~3-4 hours

### 🌟 Nice to Have (Could Have):
- **Phase 4:** Mobile responsiveness - 2 hours
- **Phase 4:** Keyboard shortcuts - 1 hour
- **Phase 5:** Advanced features - 15+ hours

**Total Nice to Have:** ~18+ hours

---

## Implementation Order Recommendation

1. ✅ **Fix Phase 2A bug** (tab clicking) - COMPLETE
2. ✅ **~~Complete Phase 2B~~** (focus management) - ALREADY COMPLETE
3. ✅ **Complete Phase 2C** (split persistence & close buttons) - COMPLETE (Nov 9, 2025)
4. **Phase 3 (Part 1)** - Context menu + split options - 2 hours
5. **Phase 4 (Part 1)** - Edge cases - 2 hours
6. **Test & stabilize** - 1 hour
7. **Phase 3 (Part 2)** - Pop out pane - 1 hour
8. **Phase 4 (Part 2)** - Polish & animations - 3 hours
9. **Optional:** Mobile, keyboard shortcuts, advanced features

**MVP Complete After:** Steps 4-6 (~5 hours) - Phases 1, 2A, 2B, 2C done!
**Polished Version After:** Steps 4-8 (~9 hours)
**Full Feature Set:** All phases (~25+ hours)

---

## What's Already Working ✅

Don't forget what we've accomplished:

- ✅ Basic split rendering (vertical, horizontal)
- ✅ Resizable dividers with react-resizable
- ✅ Drag-and-drop tab reordering (8px activation threshold)
- ✅ Drop zones for merge (visual feedback)
- ✅ Merge logic creates splits
- ✅ Continuous drop zone updates
- ✅ Header toggle button (no auto-hide)
- ✅ Split state persists to localStorage
- ✅ Each pane has own tmux session
- ✅ No tmux corruption issues
- ✅ **Focus management complete** (focusedTerminalId tracking)
- ✅ **Footer displays focused pane info**
- ✅ **Visual focus indicators** (glowing dividers)
- ✅ **Tab clicking works** (fixed Nov 9, 2025)
- ✅ **Session persistence works** (terminals reconnect properly)
- ✅ **Split persistence works** (splits survive refresh) - FIXED Nov 9, 2025!
- ✅ **Individual pane close buttons** (X button on each pane)
- ✅ **Exit command closes terminals** (properly handles splits)
- ✅ **Race condition handling** (loading state during reconnection)

**We're ~90% done with the full split system!** 🎉

**Remaining:** Context menu (Phase 3), polish & edge cases (Phase 4)

---

**Last Updated:** 2025-11-09 02:50 AM
