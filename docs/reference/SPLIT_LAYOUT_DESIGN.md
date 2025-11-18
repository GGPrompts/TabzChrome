# Split Layout Design for Tabz

## Implementation Status (November 9, 2025)

**Phase 1 & 2: ✅ COMPLETE**

### What's Implemented:
- ✅ Basic split infrastructure (vertical & horizontal)
- ✅ Drag-and-drop tab merge to create splits
- ✅ Resizable dividers with react-resizable
- ✅ Focus management (focused pane tracking)
- ✅ Visual focus indicators (glowing divider edges)
- ✅ Split persistence across page refresh
- ✅ Individual pane close buttons (X on hover)
- ✅ Exit command handling (closes panes properly)
- ✅ Race condition handling (loading state during reconnection)

### What's Next (Phase 3 & 4):
- ⏳ Tab context menu (right-click to split/merge/pop-out)
- ⏳ Keyboard shortcuts (Ctrl+Shift+\ for split, etc.)
- ⏳ Polish & animations
- ⏳ Mobile responsiveness

**See REMAINING_PHASES.md for detailed roadmap.**

---

## Overview

Implement app-level split panes (NOT tmux splits) where each pane contains a separate terminal with its own tmux session. This avoids tmux horizontal split corruption issues and provides simpler session management.

## Key User Workflows

### 1. Drag Tab to Reorder
- Drag tabs horizontally to reorder them
- Visual indicator shows drop position

### 2. Drag Tab to Merge (Create Split)
- Drag Tab A and hold over Tab B
- Drop zones appear on edges (left/right/top/bottom = 20% of tab area)
- Drop on edge creates split, drop in center reorders
- Tab A merged into Tab B, Tab A closes

### 3. Right-Click Tab → Split
- Right-click tab → "Split Vertical" or "Split Horizontal"
- **Spawn menu opens** (shows all terminal types from spawn-options.json)
- User picks terminal type (Bash, Claude Code, TFE, etc.)
- New terminal spawns in **same working directory** as original terminal
- Split is created with both terminals

### 4. Drag Split Divider to Resize
- Drag border between split panes to resize
- Both terminals refit automatically
- Sizes persist to localStorage

### 5. Pop Out Split Pane to New Tab
- Right-click tab with splits → "Pop Out Pane..."
- Select pane to pop out
- Creates new tab with that terminal
- Source tab collapses to single terminal if only 2 panes

## Architecture

```
Tab (SimpleTerminalApp)
└── SplitLayout Component
    ├── Pane 1 (Terminal with tmux: tt-bash-1)
    ├── Divider (resizable handle)
    └── Pane 2 (Terminal with tmux: tt-bash-2)
```

## Data Structure

### Terminal Store Update

```typescript
// src/stores/simpleTerminalStore.ts

export interface Terminal {
  id: string;
  name: string;
  icon?: string;
  terminalType: string;
  agentId?: string;
  status: 'spawning' | 'active' | 'error';

  // Session persistence
  sessionName?: string;
  workingDir?: string;

  // Per-terminal customization
  theme?: string;
  background?: string;
  transparency?: number;
  fontSize?: number;
  fontFamily?: string;

  // NEW: Split layout data
  splitLayout?: SplitLayout;
}

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
```

### Example Split State

**Single terminal (current behavior):**
```json
{
  "id": "terminal-1",
  "name": "Bash",
  "terminalType": "bash",
  "sessionName": "tt-bash-abc123",
  "splitLayout": {
    "type": "single",
    "panes": []
  }
}
```

**Vertical split (2 panes side-by-side):**
```json
{
  "id": "terminal-1",
  "name": "Split View",
  "terminalType": "split-container",
  "splitLayout": {
    "type": "vertical",
    "panes": [
      {
        "id": "pane-1",
        "terminalId": "terminal-2",
        "size": 50,
        "position": "left"
      },
      {
        "id": "pane-2",
        "terminalId": "terminal-3",
        "size": 50,
        "position": "right"
      }
    ]
  }
}
```

**Horizontal split (2 panes top/bottom):**
```json
{
  "id": "terminal-1",
  "name": "Split View",
  "terminalType": "split-container",
  "splitLayout": {
    "type": "horizontal",
    "panes": [
      {
        "id": "pane-1",
        "terminalId": "terminal-2",
        "size": 50,
        "position": "top"
      },
      {
        "id": "pane-2",
        "terminalId": "terminal-3",
        "size": 50,
        "position": "bottom"
      }
    ]
  }
}
```

## Implementation Components

### 1. SplitLayout Component

```tsx
// src/components/SplitLayout.tsx

import React from 'react';
import { ResizableBox } from 'react-resizable';
import { Terminal } from './Terminal';
import { Terminal as StoredTerminal } from '../stores/simpleTerminalStore';
import { Agent } from '../types';

interface SplitLayoutProps {
  terminal: StoredTerminal;
  terminals: StoredTerminal[];
  agents: Agent[];
  onClose: (terminalId: string) => void;
  onCommand: (cmd: string, terminalId: string) => void;
  wsRef: React.RefObject<WebSocket>;
}

export const SplitLayout: React.FC<SplitLayoutProps> = ({
  terminal,
  terminals,
  agents,
  onClose,
  onCommand,
  wsRef,
}) => {
  const { splitLayout } = terminal;

  if (!splitLayout || splitLayout.type === 'single') {
    // Single terminal (no splits)
    const agent = agents.find(a => a.id === terminal.agentId);
    if (!agent) return null;

    return (
      <Terminal
        agent={agent}
        onClose={() => onClose(terminal.id)}
        onCommand={onCommand}
        wsRef={wsRef}
        embedded={true}
      />
    );
  }

  if (splitLayout.type === 'vertical') {
    return <VerticalSplit {...props} />;
  }

  if (splitLayout.type === 'horizontal') {
    return <HorizontalSplit {...props} />;
  }

  return null;
};
```

### 2. Split Components (Using react-resizable)

```tsx
// Vertical Split (side-by-side)
const VerticalSplit: React.FC<SplitLayoutProps> = ({ terminal, terminals, agents, ... }) => {
  const leftPane = terminal.splitLayout!.panes.find(p => p.position === 'left');
  const rightPane = terminal.splitLayout!.panes.find(p => p.position === 'right');

  const leftTerminal = terminals.find(t => t.id === leftPane?.terminalId);
  const rightTerminal = terminals.find(t => t.id === rightPane?.terminalId);

  const [leftSize, setLeftSize] = useState(leftPane?.size || 50);

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%' }}>
      <ResizableBox
        width={`${leftSize}%`}
        height={Infinity}
        axis="x"
        minConstraints={[200, Infinity]}
        maxConstraints={[containerWidth - 200, Infinity]}
        onResizeStop={(e, data) => {
          const newSize = (data.size.width / containerWidth) * 100;
          setLeftSize(newSize);
          updateTerminal(terminal.id, {
            splitLayout: {
              ...terminal.splitLayout!,
              panes: terminal.splitLayout!.panes.map(p =>
                p.position === 'left' ? { ...p, size: newSize } : p
              ),
            },
          });
        }}
        resizeHandles={['e']} // East handle (right edge)
      >
        <Terminal agent={leftAgent} {...props} />
      </ResizableBox>

      <div style={{ flex: 1 }}>
        <Terminal agent={rightAgent} {...props} />
      </div>
    </div>
  );
};
```

## User Workflow

### Tab Drag-and-Drop (Primary Interaction)

**1. Drag to Reorder Tabs**
```
Before: [Tab A] [Tab B] [Tab C]
Action: Drag Tab C between A and B
After:  [Tab A] [Tab C] [Tab B]
```
- Simple horizontal reordering
- Visual indicator shows drop position (vertical line between tabs)
- Updates tab order in store

**2. Drag to Merge (Create Split)**
```
Action: Drag Tab A and hold over Tab B
Visual: Tab B shows drop zones

┌─────────────────────┐
│  ←  │  Tab B  │  →  │  ← Drop zones
│  ↑               ↓  │
└─────────────────────┘

Drop zones:
- Left edge: Merge vertical (Tab A on left, B on right)
- Right edge: Merge vertical (B on left, Tab A on right)
- Top edge: Merge horizontal (Tab A on top, B on bottom)
- Bottom edge: Merge horizontal (B on top, Tab A on bottom)
- Center: No merge, just reorder

Result: Tab A merged into Tab B as split, Tab A closed
```

**Visual Feedback:**
- **Dragging tab:** Semi-transparent tab follows cursor
- **Reorder mode:** Vertical line shows insertion point
- **Merge mode (hovering over tab):** Drop zones appear with overlay
  - Left zone: Blue highlight on left 20% of tab
  - Right zone: Blue highlight on right 20% of tab
  - Top zone: Blue highlight on top 20% of tab height
  - Bottom zone: Blue highlight on bottom 20% of tab height
  - Center zone: Whole tab highlighted (reorder, not merge)

**Implementation Library:**
- Use `@dnd-kit/core` + `@dnd-kit/sortable` (recommended)
  - Modern, lightweight, hooks-based
  - Built-in sortable list support (for tab reordering)
  - Custom drop zones (for merge detection)
  - Great accessibility
- Opustrator uses custom `useDragAndDrop` hook for canvas terminals (no library)
- For tabs, we need more sophisticated drop zone detection

**Code Example (Tab Reordering):**
```tsx
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, horizontalListSortingStrategy, useSortable } from '@dnd-kit/sortable';

// Tab component with drag handle
const DraggableTab = ({ tab }) => {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({
    id: tab.id,
  });

  const style = {
    transform: transform ? `translate3d(${transform.x}px, 0, 0)` : undefined,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      {tab.icon} {tab.name}
    </div>
  );
};

// Tab bar with sortable tabs
const TabBar = ({ tabs, onReorder }) => {
  const handleDragEnd = (event) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      const oldIndex = tabs.findIndex(t => t.id === active.id);
      const newIndex = tabs.findIndex(t => t.id === over.id);
      onReorder(oldIndex, newIndex);
    }
  };

  return (
    <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={tabs} strategy={horizontalListSortingStrategy}>
        {tabs.map(tab => <DraggableTab key={tab.id} tab={tab} />)}
      </SortableContext>
    </DndContext>
  );
};
```

**Code Example (Merge Detection with Drop Zones):**
```tsx
import { useDroppable } from '@dnd-kit/core';

const TabWithDropZones = ({ tab, onMerge }) => {
  const [dropZone, setDropZone] = useState<'left' | 'right' | 'top' | 'bottom' | 'center' | null>(null);

  const { setNodeRef, isOver, active } = useDroppable({
    id: tab.id,
    data: { type: 'tab' },
  });

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isOver || !active) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Detect which drop zone (20% edges)
    const leftZone = x < rect.width * 0.2;
    const rightZone = x > rect.width * 0.8;
    const topZone = y < rect.height * 0.2;
    const bottomZone = y > rect.height * 0.8;

    if (leftZone) setDropZone('left');
    else if (rightZone) setDropZone('right');
    else if (topZone) setDropZone('top');
    else if (bottomZone) setDropZone('bottom');
    else setDropZone('center');
  };

  const handleDrop = () => {
    if (!active || !dropZone || dropZone === 'center') return;

    const splitType = (dropZone === 'left' || dropZone === 'right') ? 'vertical' : 'horizontal';
    onMerge(active.id, tab.id, splitType, dropZone);
  };

  return (
    <div
      ref={setNodeRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setDropZone(null)}
      className={`tab ${isOver ? 'drag-over' : ''}`}
    >
      {/* Drop zone overlays */}
      {isOver && dropZone && (
        <div className={`drop-zone drop-zone-${dropZone}`} />
      )}

      {tab.icon} {tab.name}
    </div>
  );
};
```

### Creating a Split

**Option 1: Split Current Tab (Spawn New Terminal)**
1. Right-click on a tab
2. Select "Split Vertical" or "Split Horizontal" from context menu
3. **Spawn menu opens** (same menu as right-click in terminal area)
4. User selects terminal type (Bash, Claude Code, TFE, etc.)
5. System:
   - Spawns selected terminal type in **same working directory** as original terminal
   - Creates new tmux session (e.g., `tt-bash-xyz`, `tt-cc-abc`, etc.)
   - Updates tab's `splitLayout` to include both terminals
   - Shows both terminals side-by-side (or top/bottom)

**Working Directory Inheritance:**
- Original terminal's working directory is detected via:
  1. `agent.workingDir` if available (from OSC 7 escape sequences)
  2. Or `/proc/{agent.pid}/cwd` on Linux
  3. Or tmux pane info: `tmux display-message -p -t session-name -F "#{pane_current_path}"`
  4. Or fallback to `spawn-options.json` default working directory
- Spawn menu temporarily overrides `workingDir` for the split spawn
- Example: Original terminal at `~/projects/tabz` → User picks "Claude Code" → Spawns at `~/projects/tabz`

**Benefits:**
- ✅ User can spawn ANY terminal type (not just Bash)
- ✅ Avoids cluttering tab bar with "Bash" tabs
- ✅ Flexible - spawn Claude Code, TFE, LazyGit, etc. in same working dir
- ✅ Consistent with existing spawn UX

**Option 2: Merge Two Tabs into Split**
1. User has Tab 1 (terminal A) and Tab 2 (terminal B)
2. Right-click on Tab 2
3. Select "Merge into Tab X → Split Vertical/Horizontal"
4. System:
   - Moves terminal B into Tab 1's split layout
   - Closes Tab 2
   - Both terminals keep their tmux sessions (no detach/reattach needed)
   - Tab 1 now shows both terminals in split view

**Benefits of Merge:**
- Rearrange tabs into splits without spawning new terminals
- Preserves tmux session state (history, working directory, etc.)
- Uses existing terminals as building blocks

### Pop Out Split Pane to New Tab

1. User has Tab 1 with split (terminal A | terminal B)
2. Right-click on the split pane (or right-click Tab 1 → submenu)
3. Select "Pop Out Pane to New Tab"
4. System:
   - Creates new Tab 2 with terminal B
   - Removes terminal B from Tab 1's split layout
   - Tab 1 converts back to single terminal (terminal A)
   - Terminal B keeps its tmux session (no session changes)

**Benefits of Pop Out:**
- Reorganize layout without losing terminal state
- Quick way to "unsplit" while keeping both terminals

### Closing a Split Pane

1. Click close button (X) on the pane itself
2. System:
   - Removes terminal from split layout
   - Kills tmux session for that pane
   - If only 1 pane remains, convert tab back to single layout

### Resizing Splits

1. Drag divider border between panes
2. System:
   - Updates pane sizes in real-time (using `react-resizable`)
   - Triggers xterm refit for both terminals
   - Persists new sizes to localStorage

## Tab Context Menu (Right-Click)

```tsx
// Tab right-click context menu (Windows Terminal style)

<ContextMenu>
  {/* Only show if current tab is single terminal */}
  {!tab.splitLayout || tab.splitLayout.type === 'single' ? (
    <>
      <MenuItem
        onClick={handleSplitVertical}
        title="Opens spawn menu, new terminal uses current working directory"
      >
        Split Vertical ⊞
      </MenuItem>
      <MenuItem
        onClick={handleSplitHorizontal}
        title="Opens spawn menu, new terminal uses current working directory"
      >
        Split Horizontal ⊟
      </MenuItem>
      <MenuDivider />
      {/* Merge with other tabs */}
      {otherTabs.length > 0 && (
        <SubMenu label="Merge with...">
          {otherTabs.map(otherTab => (
            <SubMenu key={otherTab.id} label={otherTab.name}>
              <MenuItem onClick={() => handleMerge(otherTab.id, 'vertical')}>
                Split Vertical
              </MenuItem>
              <MenuItem onClick={() => handleMerge(otherTab.id, 'horizontal')}>
                Split Horizontal
              </MenuItem>
            </SubMenu>
          ))}
        </SubMenu>
      )}
    </>
  ) : (
    <>
      {/* Tab has splits - show pop out option */}
      <SubMenu label="Pop Out Pane...">
        {tab.splitLayout.panes.map(pane => (
          <MenuItem key={pane.id} onClick={() => handlePopOut(pane.terminalId)}>
            {getTerminalName(pane.terminalId)}
          </MenuItem>
        ))}
      </SubMenu>
      <MenuDivider />
    </>
  )}
  <MenuItem onClick={handleCloseTab}>
    Close Tab
  </MenuItem>
</ContextMenu>
```

## Footer Controls Update

Remove split controls from footer - they're now in the tab context menu!

Keep only customization controls:
```tsx
// SimpleTerminalApp.tsx footer - cleaner!

<div className="footer-controls">
  {/* Font Size Controls */}
  <button onClick={() => handleFontSizeChange(-1)}>−</button>
  <span>{fontSize}px</span>
  <button onClick={() => handleFontSizeChange(1)}>+</button>

  {/* Reset to Defaults */}
  <button onClick={handleResetToDefaults} title="Reset to defaults">↺</button>

  {/* Customize Panel Toggle */}
  <button onClick={() => setShowCustomizePanel(!showCustomizePanel)}>🎨</button>
</div>
```

**Cleaner UI:** Split controls moved to context menu where they belong (like Windows Terminal)!

## Tmux Session Management for Merge/Pop Out

### How Terminals Move Between Tabs/Panes

**Key Insight:** Tmux sessions remain attached to the backend WebSocket. We just change which React component displays them!

```
Backend (tmux sessions):
  tt-bash-1 (WebSocket agent-abc)
  tt-bash-2 (WebSocket agent-def)
  tt-bash-3 (WebSocket agent-ghi)

Frontend (tabs/panes):
  Tab 1: [terminal-1 → agent-abc]
  Tab 2: [terminal-2 → agent-def]
  Tab 3: [terminal-3 → agent-ghi]
```

**When you merge Tab 2 into Tab 1:**
```
Backend (unchanged):
  tt-bash-1 (agent-abc)
  tt-bash-2 (agent-def)  ← Still running!
  tt-bash-3 (agent-ghi)

Frontend (reorganized):
  Tab 1: [terminal-1 → agent-abc | terminal-2 → agent-def]  ← Split view
  Tab 3: [terminal-3 → agent-ghi]
```

**No tmux detach/attach needed!** The WebSocket connection stays alive, we just:
1. Update Tab 1's `splitLayout` to include `terminal-2`
2. Remove Tab 2 from the tab list
3. Both terminals keep displaying their respective agents

### Pop Out Implementation

```typescript
// Pop out pane to new tab
const handlePopOut = (terminalId: string) => {
  const sourceTab = terminals.find(t =>
    t.splitLayout?.panes.some(p => p.terminalId === terminalId)
  );

  if (!sourceTab) return;

  // 1. Create new tab with the terminal
  const newTab = {
    id: generateId(),
    name: getTerminal(terminalId).name,
    icon: getTerminal(terminalId).icon,
    terminalType: getTerminal(terminalId).terminalType,
    agentId: getTerminal(terminalId).agentId,  // Keep same agent!
    splitLayout: { type: 'single', panes: [] },
  };
  addTerminal(newTab);

  // 2. Remove pane from source tab
  const remainingPanes = sourceTab.splitLayout.panes.filter(
    p => p.terminalId !== terminalId
  );

  if (remainingPanes.length === 1) {
    // Convert back to single terminal
    updateTerminal(sourceTab.id, {
      splitLayout: { type: 'single', panes: [] },
    });
  } else {
    // Still has multiple panes
    updateTerminal(sourceTab.id, {
      splitLayout: {
        ...sourceTab.splitLayout,
        panes: remainingPanes,
      },
    });
  }

  // 3. No backend changes - agent stays connected!
};
```

### Merge Implementation

```typescript
// Merge Tab B into Tab A with split
const handleMerge = (sourceTabId: string, targetTabId: string, splitType: 'vertical' | 'horizontal') => {
  const sourceTab = terminals.find(t => t.id === sourceTabId);
  const targetTab = terminals.find(t => t.id === targetTabId);

  if (!sourceTab || !targetTab) return;

  // 1. Update target tab to include both terminals
  updateTerminal(targetTabId, {
    splitLayout: {
      type: splitType,
      panes: [
        {
          id: generateId(),
          terminalId: targetTab.id,
          size: 50,
          position: splitType === 'vertical' ? 'left' : 'top',
        },
        {
          id: generateId(),
          terminalId: sourceTab.id,
          size: 50,
          position: splitType === 'vertical' ? 'right' : 'bottom',
        },
      ],
    },
  });

  // 2. Remove source tab
  removeTerminal(sourceTabId);

  // 3. Both tmux sessions stay running - no backend changes!
};
```

**Benefits:**
- ✅ Zero latency - instant UI update
- ✅ No tmux session churn
- ✅ Preserves all terminal state (history, working dir, running processes)
- ✅ WebSocket agents stay connected

## Backend Changes

### Working Directory Detection for Split

When splitting a terminal via right-click menu → spawn menu, the working directory is detected and passed to the spawn:

**Frontend Implementation:**
```typescript
// SimpleTerminalApp.tsx

const handleSplitVertical = (terminalId: string) => {
  const terminal = terminals.find(t => t.id === terminalId);
  const agent = agents.find(a => a.id === terminal?.agentId);

  if (!agent) return;

  // Detect working directory (priority order):
  const workingDir =
    agent.workingDir ||  // From OSC 7 escape sequences (if terminal supports it)
    terminal.workingDir || // Stored in terminal state
    detectWorkingDir(agent.pid); // Fallback: query via /proc or tmux

  // Open spawn menu with split context
  setSplitContext({
    type: 'vertical',
    sourceTerminalId: terminalId,
    workingDir: workingDir,
  });
  setShowSpawnMenu(true);
};

// When terminal spawns from menu:
const handleSpawnFromMenu = (spawnOption: SpawnOption) => {
  const workingDir = splitContext?.workingDir || spawnOption.workingDir || '~/projects';

  spawnService.spawn({
    ...spawnOption,
    workingDir, // Override with split context working dir
  });

  // After spawn, create split layout
  if (splitContext) {
    updateTerminal(splitContext.sourceTerminalId, {
      splitLayout: {
        type: splitContext.type,
        panes: [/* ... */],
      },
    });
  }
};
```

**Backend Options for Working Directory Detection:**

**Option 1: Use `/proc/{pid}/cwd` (Linux)**
```javascript
// backend/modules/pty-handler.js
const getWorkingDirectory = (pid) => {
  try {
    return fs.readlinkSync(`/proc/${pid}/cwd`);
  } catch (err) {
    console.error('Failed to read cwd:', err);
    return process.env.HOME || '/';
  }
};
```

**Option 2: Use tmux pane info**
```bash
# Get current working directory from tmux session
tmux display-message -p -t session-name -F "#{pane_current_path}"
```

**Option 3: OSC 7 escape sequences (Best)**
- Terminal emits `\e]7;file://hostname/path\e\\` when changing directories
- xterm.js addon parses this and updates `agent.workingDir`
- Requires shell configuration (add to .bashrc/.zshrc)

**Recommended Implementation:**
1. Frontend checks `agent.workingDir` (from OSC 7, if configured)
2. Fallback to backend API: `GET /api/terminals/{agentId}/cwd` (uses `/proc` or tmux)
3. Final fallback to spawn-option default or `~/projects`

### No Other Backend Changes Needed!

Each split pane spawns a **separate terminal** with its **own tmux session**:
- `tt-bash-1`, `tt-bash-2`, etc.
- Backend sees them as independent terminals
- No tmux split protocol needed
- Simpler session management (`tmux ls` shows all sessions separately)

## Benefits Over Tmux Splits

1. ✅ **No tmux split corruption** - Each pane is independent
2. ✅ **Simpler session management** - `tmux ls` shows flat list, not nested panes
3. ✅ **Better persistence** - Each pane saves/restores independently
4. ✅ **Full control over UI** - CSS, resizing, colors, etc.
5. ✅ **Works with existing backend** - No protocol changes needed
6. ✅ **Easier to debug** - React DevTools shows split state clearly
7. ✅ **Mobile-friendly** - Can collapse to single pane on small screens

## Migration from Tmux Splits

For users with existing tmux split sessions:
1. Detect if terminal has tmux panes (check `tmux list-panes`)
2. Show warning: "This terminal has tmux splits which may cause issues. Convert to app-level splits?"
3. If yes:
   - Parse tmux pane list
   - Create separate terminals for each pane
   - Set up split layout in app
   - Kill tmux splits, keeping only first pane

## Open Questions

1. **Nested splits?** - Should we support splits within splits? (Probably not for v1)
2. **Drag to reorder panes?** - Swap left/right or top/bottom? (Nice-to-have)
3. **Save split layouts as templates?** - Like VS Code workspace layouts? (Future)
4. **Max panes per tab?** - Limit to 4 (quad) or allow more? (Probably 4 max)

## Implementation Phases

### Phase 1: Basic Split Infrastructure (MVP)
- ✅ Clean up unused tmux controls from Terminal.tsx
- Install `react-resizable` dependency
- Add `splitLayout` to Terminal interface in store
- Create `SplitLayout.tsx` component
  - Render single terminal (no splits)
  - Render vertical split (2 panes side-by-side)
  - Render horizontal split (2 panes top/bottom)
- Implement draggable divider with `react-resizable`
- Test: Create split, resize divider, verify both terminals work

### Phase 2: Tab Drag-and-Drop (Primary UX)
- Install `@dnd-kit/core` and `@dnd-kit/sortable`
- Implement tab reordering with `SortableContext`
- Add visual feedback (ghost tab, insertion line)
- Test: Drag tabs to reorder
- Add drop zone detection (left/right/top/bottom edges)
- Implement merge on drop (create split layout)
- Add drop zone visual overlays (blue highlights)
- Test: Drag Tab A onto Tab B → verify split created

### Phase 3: Tab Context Menu (Secondary UX)
- Create `TabContextMenu.tsx` component (right-click menu)
- Add "Split Vertical" option (spawns new terminal)
- Add "Split Horizontal" option (spawns new terminal)
- Add "Close Tab" option
- Hook up menu to tab bar
- Test: Right-click tab → split → verify 2 terminals appear

### Phase 4: Merge & Pop Out (Advanced)
- Add "Merge with..." submenu to context menu
  - List all other tabs
  - Vertical/Horizontal options per tab
- Add "Pop Out Pane..." submenu (for tabs with splits)
  - List all panes in current split
- Implement merge logic (move terminal ref, close source tab)
- Implement pop out logic (create new tab, remove from split)
- Test: Merge 2 tabs → verify both terminals visible, 1 tab closed
- Test: Pop out pane → verify new tab created, split reduced

### Phase 4: Persistence & Polish
- Save/restore split layouts to localStorage
- Smooth animations for split transitions
- Better visual feedback for divider (hover state, drag cursor)
- Handle edge cases:
  - Closing a pane in split
  - Closing entire tab with splits
  - Merging a tab that already has splits
- Mobile responsiveness (collapse splits to tabs on small screens)

### Phase 5: Advanced Features (Future)
- Keyboard shortcuts (Ctrl+Shift+\, Ctrl+Shift+-, etc.)
- Drag to swap panes (reorder left/right or top/bottom)
- Nested splits (split a split)
- Quad split shortcut (2x2 grid)
- Zoom pane (maximize temporarily like tmux Ctrl+B z)
- Save/load split layout templates
