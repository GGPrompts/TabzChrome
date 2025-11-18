# Phase 1: Basic Split Layout Infrastructure

## Project Context

You're working on **Tabz** (Tab>_), a lightweight tab-based terminal interface for the web. It's built with React, TypeScript, Vite, and xterm.js, with a Node.js backend using tmux for terminal persistence.

**Important:** Read `CLAUDE.md` and `SPLIT_LAYOUT_DESIGN.md` for full context before starting.

## Goal

Implement the foundational split layout system that allows tabs to contain multiple terminal panes displayed side-by-side or top/bottom. This phase focuses on the **rendering infrastructure** only - no drag-and-drop or context menus yet.

## What You're Building

```
Current: Each tab shows ONE terminal
┌─────────────────────┐
│     Terminal        │
└─────────────────────┘

After Phase 1: Tabs can show MULTIPLE terminals with resizable dividers
┌─────────────────────┐
│  Term 1  │  Term 2  │  ← Vertical split
└─────────────────────┘

┌─────────────────────┐
│     Terminal 1      │  ← Horizontal split
├─────────────────────┤
│     Terminal 2      │
└─────────────────────┘
```

## Architecture Overview

- **Each pane is a separate terminal** with its own tmux session (e.g., `tt-bash-1`, `tt-bash-2`)
- **NOT using tmux splits** - we manage splits at the React app level using CSS
- **Dividers are resizable** using `react-resizable` library
- **Split state is stored** in the terminal store and persists to localStorage

## Phase 1 Tasks

### 1. Install Dependencies

```bash
npm install react-resizable
npm install --save-dev @types/react-resizable
```

### 2. Update Terminal Store Interface

**File:** `src/stores/simpleTerminalStore.ts`

Add split layout types:
```typescript
export interface SplitLayout {
  type: 'single' | 'vertical' | 'horizontal';
  panes: SplitPane[];
}

export interface SplitPane {
  id: string;
  terminalId: string; // References another terminal in the store
  size: number; // Percentage (0-100)
  position: 'left' | 'right' | 'top' | 'bottom';
}

export interface Terminal {
  // ... existing fields ...

  // NEW: Split layout data
  splitLayout?: SplitLayout;
}
```

### 3. Create SplitLayout Component

**File:** `src/components/SplitLayout.tsx`

Create a new component that:
- Takes a `terminal` with `splitLayout` data
- Renders single terminal if `type === 'single'`
- Renders vertical split (left/right) if `type === 'vertical'`
- Renders horizontal split (top/bottom) if `type === 'horizontal'`
- Uses `react-resizable` for draggable dividers
- Triggers xterm refit on resize

**Key requirements:**
- Import `ResizableBox` from `react-resizable`
- Each pane renders a `Terminal` component
- Divider should be draggable (use `resizeHandles={['e']}` for vertical, `['s']` for horizontal)
- On resize, update pane sizes in store
- Dispatch `terminal-container-resized` event for xterm refit

**Reference implementation from design doc:**
- See `SPLIT_LAYOUT_DESIGN.md` lines 188-232 for code examples

### 4. Update SimpleTerminalApp to Use SplitLayout

**File:** `src/SimpleTerminalApp.tsx`

Replace the current terminal rendering (lines ~1125-1141) with:
```typescript
<SplitLayout
  terminal={terminal}
  terminals={terminals}
  agents={agents}
  onClose={handleCloseTerminal}
  onCommand={handleCommand}
  wsRef={wsRef}
/>
```

The SplitLayout component will handle whether to render:
- Single terminal (current behavior)
- Split view (new functionality)

### 5. Add CSS for Split Layout

**File:** `src/components/SplitLayout.css` (new file)

Add styles for:
- `.split-layout-container` - Main container (flex layout)
- `.split-pane` - Individual pane wrapper
- `.split-divider` - Resize handle styling
- `.react-resizable-handle` - Override react-resizable default styles

Make dividers visible and user-friendly:
- Width: 4-6px
- Hover effect (change color/cursor)
- Active drag state

### 6. Test with Manual Split Data

**For testing only**, temporarily add a split layout to a terminal in localStorage:

```typescript
// In browser console or via code:
const store = useSimpleTerminalStore.getState();
const terminals = store.terminals;

// Create two terminals
store.addTerminal({ id: 'term-1', name: 'Bash', terminalType: 'bash', ... });
store.addTerminal({ id: 'term-2', name: 'TFE', terminalType: 'tfe', ... });

// Update first terminal to have split layout
store.updateTerminal('term-1', {
  splitLayout: {
    type: 'vertical',
    panes: [
      { id: 'pane-1', terminalId: 'term-1', size: 50, position: 'left' },
      { id: 'pane-2', terminalId: 'term-2', size: 50, position: 'right' },
    ],
  },
});
```

**Verify:**
- Both terminals render side-by-side
- Divider is draggable
- Resizing works smoothly
- Both terminals are interactive (can type, see output)
- Sizes persist after refresh

## Important Constraints

1. **Use existing Terminal component** - Don't modify Terminal.tsx rendering logic
2. **Pass `embedded={true}`** to all Terminal components (already the case)
3. **Handle terminal refs carefully** - Only the active pane should get the ref
4. **Trigger refit events** - When divider is dragged, dispatch `terminal-container-resized`
5. **Don't break existing functionality** - Tabs without splitLayout should work as before
6. **Follow Tabz principles** - Keep it simple, no unnecessary complexity

## Files You'll Modify/Create

- ✏️ `src/stores/simpleTerminalStore.ts` - Add SplitLayout types
- ✨ `src/components/SplitLayout.tsx` - New component (main work)
- ✨ `src/components/SplitLayout.css` - New styles
- ✏️ `src/SimpleTerminalApp.tsx` - Use SplitLayout component
- 📦 `package.json` - Add react-resizable dependency

## Success Criteria

- [ ] `react-resizable` installed and types working
- [ ] SplitLayout component renders single terminal (type: 'single')
- [ ] SplitLayout component renders vertical split (2 panes side-by-side)
- [ ] SplitLayout component renders horizontal split (2 panes top/bottom)
- [ ] Dividers are draggable and resize panes smoothly
- [ ] Both terminals in split are fully functional (keyboard input, output display)
- [ ] Pane sizes persist to localStorage
- [ ] No errors in browser console
- [ ] No TypeScript errors
- [ ] Existing single-terminal tabs still work

## Testing Checklist

1. **Single terminal tab** - Works as before (no regression)
2. **Vertical split** - Create split with manual data, verify both terminals work
3. **Horizontal split** - Same as above but top/bottom
4. **Resize divider** - Drag divider, verify smooth resizing
5. **Persistence** - Refresh page, verify split sizes are restored
6. **Terminal interaction** - Type in both panes, verify both respond
7. **Tab switching** - Switch between split tab and regular tab, verify no issues

## Notes

- **This phase is infrastructure only** - You're building the rendering system
- **Phase 2 will add drag-and-drop** - Tab reordering and merge functionality
- **Phase 3 will add context menu** - Right-click to split
- **For now, create test splits manually** via browser console or hardcoded data

## Questions or Issues?

If you encounter problems:
1. Check `SPLIT_LAYOUT_DESIGN.md` for detailed architecture
2. Check `CLAUDE.md` for project context and debugging tips
3. Look at Opustrator's resizing code: `~/workspace/opustrator/frontend/src/hooks/useDragAndDrop.ts`
4. Test with browser DevTools to verify state changes

## Ready to Start?

Read `SPLIT_LAYOUT_DESIGN.md` first, then begin with installing dependencies and updating the store interface. Work incrementally and test each component before moving to the next.

Good luck! 🚀
