# Phase 2: Drag-and-Drop + Focus Management

## Project Context

You're working on **Tabz** (Tab>_), a lightweight tab-based terminal interface. Phase 1 implemented the basic split layout infrastructure - terminals can now be displayed side-by-side or top/bottom with resizable dividers.

**Important:** Read `CLAUDE.md`, `SPLIT_LAYOUT_DESIGN.md`, and check Phase 1 implementation in `src/components/SplitLayout.tsx` for context.

## Goal

Add drag-and-drop functionality for tabs AND proper focus management for split panes. Users should be able to:
1. Drag tabs to reorder them
2. Drag a tab onto another tab to create a split (with drop zones)
3. Click on a pane in a split to focus it
4. See which pane is focused (visual feedback on divider)
5. Footer controls should affect the focused pane

## What You're Building

### Part A: Drag-and-Drop Tabs

```
Before: [Tab A] [Tab B] [Tab C]
Action: Drag Tab C between A and B
After:  [Tab A] [Tab C] [Tab B]
```

```
Action: Drag Tab A and hold over Tab B
Visual: Drop zones appear on Tab B edges

┌─────────────────────┐
│  ←  │  Tab B  │  →  │  ← Drop zones (20% edges)
│  ↑               ↓  │
└─────────────────────┘

Drop on LEFT edge   → Merge vertical (A left, B right)
Drop on RIGHT edge  → Merge vertical (B left, A right)
Drop on TOP edge    → Merge horizontal (A top, B bottom)
Drop on BOTTOM edge → Merge horizontal (B top, A bottom)
Drop in CENTER      → Just reorder (no merge)
```

### Part B: Focus Management

```
Split Tab Before Click:
┌─────────────────────┐
│  Term 1  │  Term 2  │  ← Both panes same appearance
└─────────────────────┘
Footer: Shows Tab 1 info (not pane-specific)

Split Tab After Click on Term 2:
┌─────────────────────┐
│  Term 1  ┃  Term 2  │  ← Divider highlights right (Term 2 focused)
└─────────────────────┘
Footer: Shows Term 2 info (name, PID, font size, etc.)
```

## Phase 2 Tasks

### Part A: Drag-and-Drop Implementation

#### 1. Install Dependencies

```bash
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

#### 2. Add Tab Reordering

**File:** `src/SimpleTerminalApp.tsx`

**Requirements:**
- Wrap tab bar in `<DndContext>` and `<SortableContext>`
- Make each tab draggable using `useSortable` hook
- Implement `handleDragEnd` to reorder terminals in store
- Visual feedback: dragging tab becomes semi-transparent
- Show insertion line between tabs when reordering

**Code Reference:**
See `SPLIT_LAYOUT_DESIGN.md` lines 287-329 for example implementation.

**Key Points:**
- Use `horizontalListSortingStrategy` for tab bar
- Tab IDs must match terminal IDs
- Update store with new order on drop
- Preserve active tab selection

#### 3. Add Drop Zones for Merge

**File:** `src/SimpleTerminalApp.tsx` or new `src/components/DraggableTab.tsx`

**Requirements:**
- Each tab is both draggable (sortable) AND droppable
- Track mouse position over tabs to detect drop zone
- Show visual overlay for drop zones (20% edges = merge, 80% center = reorder)
- On drop in edge zone, create split layout

**Drop Zone Detection:**
```typescript
const handleMouseMove = (e: React.MouseEvent, tabRect: DOMRect) => {
  const x = e.clientX - tabRect.left;
  const y = e.clientY - tabRect.top;

  const leftZone = x < tabRect.width * 0.2;
  const rightZone = x > tabRect.width * 0.8;
  const topZone = y < tabRect.height * 0.2;
  const bottomZone = y > tabRect.height * 0.8;

  if (leftZone) return 'left';
  if (rightZone) return 'right';
  if (topZone) return 'top';
  if (bottomZone) return 'bottom';
  return 'center';
};
```

**Merge Logic:**
```typescript
const handleMerge = (sourceTabId: string, targetTabId: string, dropZone: string) => {
  const splitType = (dropZone === 'left' || dropZone === 'right') ? 'vertical' : 'horizontal';

  // Update target tab to have split layout
  updateTerminal(targetTabId, {
    splitLayout: {
      type: splitType,
      panes: [
        {
          id: generateId(),
          terminalId: targetTabId,
          size: 50,
          position: dropZone === 'left' || dropZone === 'top' ?
            (splitType === 'vertical' ? 'right' : 'bottom') :
            (splitType === 'vertical' ? 'left' : 'top'),
        },
        {
          id: generateId(),
          terminalId: sourceTabId,
          size: 50,
          position: dropZone === 'left' ? 'left' :
                   dropZone === 'right' ? 'right' :
                   dropZone === 'top' ? 'top' : 'bottom',
        },
      ],
    },
  });

  // Remove source tab (it's now part of target tab's split)
  removeTerminal(sourceTabId);
  setActiveTerminal(targetTabId);
};
```

#### 4. Add CSS for Drop Zones

**File:** `src/SimpleTerminalApp.css` or new `src/components/DraggableTab.css`

**Requirements:**
- `.drop-zone-overlay` - Absolute positioned overlay on tabs
- `.drop-zone-left/right/top/bottom` - Visual indicators for drop zones
- Blue highlight (rgba(59, 130, 246, 0.3)) for active drop zone
- Smooth transitions

**Example:**
```css
.tab.drag-over {
  position: relative;
}

.drop-zone-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  pointer-events: none;
  z-index: 100;
}

.drop-zone-left {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 20%;
  background: rgba(59, 130, 246, 0.3);
  border-left: 3px solid rgba(59, 130, 246, 0.8);
}

.drop-zone-right {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 20%;
  background: rgba(59, 130, 246, 0.3);
  border-right: 3px solid rgba(59, 130, 246, 0.8);
}

/* Similar for top/bottom */
```

### Part B: Focus Management Implementation

#### 5. Add Focus Tracking to Store

**File:** `src/stores/simpleTerminalStore.ts`

**Add new state:**
```typescript
interface SimpleTerminalState {
  terminals: Terminal[];
  activeTerminalId: string | null;
  focusedTerminalId: string | null; // NEW: Track focused pane in splits

  // Actions
  setFocusedTerminal: (id: string | null) => void; // NEW
  // ... existing actions
}
```

**Implementation:**
```typescript
setFocusedTerminal: (id) => set({ focusedTerminalId: id }),
```

#### 6. Update SplitLayout to Handle Focus

**File:** `src/components/SplitLayout.tsx`

**Requirements:**
- Each Terminal component in split gets `onClick` handler
- When clicked, call `setFocusedTerminal(terminal.id)`
- Pass `isFocused` prop to Terminal component
- Add `.focused` CSS class to focused pane wrapper

**Changes:**
```typescript
import { useSimpleTerminalStore } from '../stores/simpleTerminalStore';

const { focusedTerminalId, setFocusedTerminal } = useSimpleTerminalStore();

// In vertical split rendering:
<div
  className={`split-pane split-pane-left ${leftTerminal.id === focusedTerminalId ? 'focused' : ''}`}
  onClick={() => setFocusedTerminal(leftTerminal.id)}
>
  <Terminal
    // ... existing props
    isFocused={leftTerminal.id === focusedTerminalId}
  />
</div>
```

#### 7. Add Visual Focus Indicator to Divider

**File:** `src/components/SplitLayout.css`

**Requirements:**
- Divider should show which side is focused (tmux-style)
- Use `::before` or `::after` pseudo-element
- Highlight the half of divider closest to focused pane
- Subtle glow effect

**Example:**
```css
/* Vertical split divider focus indicator */
.react-resizable-handle-e {
  position: relative;
}

.react-resizable-handle-e::before,
.react-resizable-handle-e::after {
  content: '';
  position: absolute;
  top: 0;
  bottom: 0;
  width: 3px;
  background: transparent;
  transition: all 0.2s ease;
}

.react-resizable-handle-e::before {
  left: 0; /* Left half of divider */
}

.react-resizable-handle-e::after {
  right: 0; /* Right half of divider */
}

/* Highlight left half when left pane focused */
.split-pane-left.focused ~ .react-resizable-handle-e::before,
.split-pane-left.focused + * .react-resizable-handle-e::before {
  background: rgba(59, 130, 246, 0.8);
  box-shadow: -2px 0 8px rgba(59, 130, 246, 0.6);
}

/* Highlight right half when right pane focused */
.split-pane-right.focused .react-resizable-handle-e::after {
  background: rgba(59, 130, 246, 0.8);
  box-shadow: 2px 0 8px rgba(59, 130, 246, 0.6);
}

/* Similar for horizontal splits */
.react-resizable-handle-s::before {
  top: 0;
  height: 3px;
  left: 0;
  right: 0;
}

.react-resizable-handle-s::after {
  bottom: 0;
  height: 3px;
  left: 0;
  right: 0;
}

.split-pane-top.focused ~ .react-resizable-handle-s::before {
  background: rgba(59, 130, 246, 0.8);
  box-shadow: 0 -2px 8px rgba(59, 130, 246, 0.6);
}

.split-pane-bottom.focused .react-resizable-handle-s::after {
  background: rgba(59, 130, 246, 0.8);
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.6);
}
```

#### 8. Update Footer to Use Focused Terminal

**File:** `src/SimpleTerminalApp.tsx`

**Current behavior:** Footer shows `activeTerminal` (the tab)
**New behavior:** Footer shows `focusedTerminal` (the pane) if in split, otherwise `activeTerminal`

**Changes:**
```typescript
const { focusedTerminalId } = useSimpleTerminalStore();

// Determine which terminal to display in footer
const displayTerminal = useMemo(() => {
  // If a pane in split is focused, use that
  if (focusedTerminalId) {
    return terminals.find(t => t.id === focusedTerminalId);
  }
  // Otherwise use active tab
  return activeTerminal;
}, [focusedTerminalId, terminals, activeTerminal]);

const displayAgent = agents.find(a => a.id === displayTerminal?.agentId);

// Use displayTerminal and displayAgent in footer rendering
```

**Important:** Customization controls (font size, theme, etc.) should update `displayTerminal`, not `activeTerminal`.

#### 9. Set Initial Focus on Split Creation

**File:** `src/SimpleTerminalApp.tsx`

**Requirement:** When a split is created (via drag-and-drop merge), automatically focus the newly added pane.

**Implementation:**
```typescript
const handleMerge = (sourceTabId: string, targetTabId: string, dropZone: string) => {
  // ... merge logic from above ...

  // Set focus to the newly merged terminal
  setFocusedTerminal(sourceTabId);
};
```

## Important Constraints

1. **Don't break Phase 1** - Existing splits must continue working
2. **Handle tab switching** - When switching tabs, reset `focusedTerminalId` appropriately
3. **Single terminal tabs** - Footer should work normally for non-split tabs
4. **Keyboard focus** - Consider setting actual DOM focus on Terminal when clicked (for keyboard input)
5. **Edge cases:**
   - Dragging a tab that's already part of a split (handle gracefully or prevent)
   - Merging a split tab with another tab (probably prevent for now)
   - Closing a focused pane (reset focusedTerminalId)

## Files You'll Modify/Create

- 📦 `package.json` - Add @dnd-kit dependencies
- ✏️ `src/stores/simpleTerminalStore.ts` - Add focusedTerminalId state
- ✏️ `src/SimpleTerminalApp.tsx` - Add drag-and-drop, update footer logic
- ✏️ `src/components/SplitLayout.tsx` - Add focus handling
- ✏️ `src/components/SplitLayout.css` - Add focus indicators
- ✨ `src/components/DraggableTab.tsx` (optional) - Extract tab logic for cleaner code
- ✨ `src/SimpleTerminalApp.css` or `DraggableTab.css` - Drop zone styling

## Success Criteria

### Part A: Drag-and-Drop
- [ ] `@dnd-kit` packages installed
- [ ] Tabs can be dragged to reorder (visual feedback during drag)
- [ ] Dragging tab over another shows drop zones (blue highlights on edges)
- [ ] Dropping on LEFT edge creates vertical split (dragged left, target right)
- [ ] Dropping on RIGHT edge creates vertical split (target left, dragged right)
- [ ] Dropping on TOP edge creates horizontal split (dragged top, target bottom)
- [ ] Dropping on BOTTOM edge creates horizontal split (target top, dragged bottom)
- [ ] Dropping in CENTER just reorders (no split created)
- [ ] Source tab disappears after merge (now part of target tab's split)
- [ ] Tab order persists to localStorage

### Part B: Focus Management
- [ ] `focusedTerminalId` added to store
- [ ] Clicking a pane in split sets it as focused
- [ ] Focused pane shows visual indicator on divider (half highlighted)
- [ ] Footer displays focused pane's info (name, PID, type)
- [ ] Font size controls affect focused pane
- [ ] Theme/transparency controls affect focused pane
- [ ] Switching to single-terminal tab updates footer correctly
- [ ] No errors in browser console
- [ ] No TypeScript errors

## Testing Checklist

### Drag-and-Drop Tests
1. **Tab reordering** - Drag tabs left/right, verify order changes
2. **Merge vertical (left)** - Drag Tab A to left edge of Tab B, verify A|B layout
3. **Merge vertical (right)** - Drag Tab A to right edge of Tab B, verify B|A layout
4. **Merge horizontal (top)** - Drag Tab A to top edge of Tab B, verify A/B layout
5. **Merge horizontal (bottom)** - Drag Tab A to bottom edge of Tab B, verify B/A layout
6. **Reorder via center** - Drag Tab A over center of Tab B, verify reordering only
7. **Visual feedback** - Verify ghost tab, drop zones appear correctly
8. **Persistence** - Refresh page, verify merged splits are restored

### Focus Tests
9. **Focus on click** - Click left pane, then right pane, verify divider highlights switch
10. **Footer updates** - Verify footer shows correct terminal info when clicking panes
11. **Font size control** - Focus left pane, change font size, verify only left pane changes
12. **Theme control** - Focus right pane, change theme, verify only right pane changes
13. **Tab switching** - Switch between split tab and regular tab, verify footer updates
14. **Initial focus** - Create split via drag-drop, verify newly added pane is focused
15. **Keyboard input** - Focus a pane, type in it, verify input works

## Notes

- **Use `@dnd-kit` over `react-dnd`** - More modern, better accessibility
- **Drop zones are 20% of tab edges** - Adjust if too sensitive/insensitive
- **Focus indicator should be subtle** - Not distracting, but visible
- **Consider adding keyboard shortcuts** - Maybe later (Ctrl+W to close focused pane, etc.)

## Questions or Issues?

If you encounter problems:
1. Check `SPLIT_LAYOUT_DESIGN.md` for detailed examples
2. Check `@dnd-kit` docs: https://docs.dndkit.com/
3. Test incrementally - get reordering working before adding merge
4. Use browser DevTools to debug drop zone detection

## Ready to Start?

Work in this order:
1. Install dependencies
2. Implement basic tab reordering (Part A step 2)
3. Test reordering thoroughly
4. Add drop zone detection (Part A step 3)
5. Implement merge logic
6. Test merge thoroughly
7. Add focus tracking (Part B step 5-6)
8. Add visual focus indicators (Part B step 7)
9. Update footer logic (Part B step 8)
10. Test everything together

Good luck! 🚀
