# Split Terminal Patterns

This document covers patterns for split terminal layouts, detach/reattach workflows, and multi-pane management.

## Split Terminal Architecture

### Data Structure

```typescript
interface Terminal {
  id: string
  name: string
  status: 'running' | 'detached' | 'spawning' | 'error'
  agentId?: string  // PTY agent ID
  sessionName?: string  // Tmux session name
  windowId?: string  // For multi-window support

  // Split layout
  splitLayout?: {
    type: 'single' | 'horizontal' | 'vertical'
    panes: Terminal[]  // For splits: array of 2 terminals
    splitPercentage?: number  // 0-100, position of divider
  }
}
```

### Single vs. Split Terminals

**Single Terminal:**
```typescript
{
  id: 'terminal-abc',
  name: 'Claude Code',
  status: 'running',
  agentId: 'agent-xyz',
  sessionName: 'tt-cc-abc',
  splitLayout: {
    type: 'single',
    panes: []
  }
}
```

**Split Terminal (Container):**
```typescript
{
  id: 'split-123',  // Container ID
  name: 'Split',
  status: 'running',
  splitLayout: {
    type: 'horizontal',  // or 'vertical'
    splitPercentage: 50,
    panes: [
      {
        id: 'terminal-left',
        name: 'Claude Code',
        agentId: 'agent-1',
        sessionName: 'tt-cc-1',
        splitLayout: { type: 'single', panes: [] }
      },
      {
        id: 'terminal-right',
        name: 'Bash',
        agentId: 'agent-2',
        sessionName: 'tt-bash-1',
        splitLayout: { type: 'single', panes: [] }
      }
    ]
  }
}
```

## Creating Splits

### Drag and Drop Pattern

```typescript
// User drags tab onto another tab
const handleDrop = (draggedId: string, targetId: string, position: 'left' | 'right') => {
  const dragged = terminals.find(t => t.id === draggedId)
  const target = terminals.find(t => t.id === targetId)

  // Can't split if either terminal is already split
  if (dragged.splitLayout?.type !== 'single' ||
      target.splitLayout?.type !== 'single') {
    return
  }

  // Create new split container
  const splitId = `split-${Date.now()}`
  const newSplit: Terminal = {
    id: splitId,
    name: 'Split',
    status: 'running',
    windowId: target.windowId,  // Inherit window
    splitLayout: {
      type: position === 'left' || position === 'right'
        ? 'horizontal'
        : 'vertical',
      splitPercentage: 50,
      panes: position === 'left' || position === 'top'
        ? [dragged, target]
        : [target, dragged]
    }
  }

  // Remove original terminals, add split
  const newTerminals = terminals
    .filter(t => t.id !== draggedId && t.id !== targetId)
    .concat(newSplit)

  setTerminals(newTerminals)

  // Set active to the split
  setActiveTerminal(splitId)
}
```

### Disable Drop Zones on Split Tabs

```typescript
// useDragDrop.ts
const handleDragOver = (e: DragEvent, terminalId: string) => {
  const terminal = terminals.find(t => t.id === terminalId)

  // Don't allow dropping on already-split tabs
  if (terminal?.splitLayout?.type !== 'single') {
    return  // No drop zone shown
  }

  // Show drop zones for single terminals
  e.preventDefault()
  showDropZones(terminalId)
}
```

## Closing vs. Detaching Panes

### Closing a Pane (Permanent)

**Flow:**
1. Find split container
2. Remove pane from split.panes array
3. If only 1 pane left → convert to single terminal
4. Send WebSocket 'close' → **KILLS tmux session**
5. removeTerminal() → removes from localStorage

**Code:**
```typescript
const handleClosePane = (paneId: string) => {
  // Find split container containing this pane
  const splitContainer = terminals.find(t =>
    t.splitLayout?.panes.some(p => p.id === paneId)
  )

  if (!splitContainer) return

  const remainingPanes = splitContainer.splitLayout.panes
    .filter(p => p.id !== paneId)

  if (remainingPanes.length === 1) {
    // Convert remaining pane to single terminal
    const remaining = remainingPanes[0]
    updateTerminal(splitContainer.id, {
      ...remaining,
      id: splitContainer.id,  // Keep container ID
      splitLayout: { type: 'single', panes: [] }
    })
  } else {
    // Update split with remaining panes
    updateTerminal(splitContainer.id, {
      splitLayout: {
        ...splitContainer.splitLayout,
        panes: remainingPanes
      }
    })
  }

  // Close the pane's tmux session (destructive!)
  const pane = splitContainer.splitLayout.panes.find(p => p.id === paneId)
  if (pane?.agentId) {
    wsRef.current.send(JSON.stringify({
      type: 'close',
      terminalId: pane.agentId
    }))
  }

  // Remove from state
  removeTerminal(paneId)
}
```

### Detaching a Pane (Temporary)

**Flow:**
1. Find split container
2. Remove pane from split.panes array
3. If only 1 pane left → convert to single terminal
4. Call /api/tmux/detach → **keeps tmux session alive**
5. Mark pane as 'detached' → stays in localStorage

**Code:**
```typescript
const handleDetachPane = async (paneId: string) => {
  // Find split container containing this pane
  const splitContainer = terminals.find(t =>
    t.splitLayout?.panes.some(p => p.id === paneId)
  )

  if (!splitContainer) return

  const pane = splitContainer.splitLayout.panes.find(p => p.id === paneId)
  if (!pane) return

  // API call to detach (non-destructive)
  if (pane.sessionName) {
    await fetch(`/api/tmux/detach/${pane.sessionName}`, {
      method: 'POST'
    })
  }

  // Clear ref so reattach can work
  if (pane.agentId) {
    clearProcessedAgentId(pane.agentId)
  }

  // Mark as detached (stays in localStorage!)
  updateTerminal(paneId, {
    status: 'detached',
    agentId: undefined
  })

  // Update split container
  const remainingPanes = splitContainer.splitLayout.panes
    .filter(p => p.id !== paneId)

  if (remainingPanes.length === 1) {
    // Convert remaining pane to single terminal
    const remaining = remainingPanes[0]
    updateTerminal(splitContainer.id, {
      ...remaining,
      id: splitContainer.id,
      splitLayout: { type: 'single', panes: [] }
    })
  } else {
    // Update split with remaining panes
    updateTerminal(splitContainer.id, {
      splitLayout: {
        ...splitContainer.splitLayout,
        panes: remainingPanes
      }
    })
  }
}
```

### Key Differences

| Operation | Tmux Session | Terminal in State | Can Reattach? |
|-----------|--------------|-------------------|---------------|
| **Close** | Killed (permanent) | Removed from localStorage | ❌ No |
| **Detach** | Alive (preserved) | Kept in localStorage as 'detached' | ✅ Yes |

## Detaching Whole Container

### Container vs. Pane Detach

**Detaching a Pane:**
- Only that pane becomes detached
- Split layout lost
- Other panes stay active

**Detaching Whole Container:**
- ALL panes become detached
- Split layout preserved in container
- Can restore entire split on reattach

**Code:**
```typescript
const handleDetachSplit = async (splitId: string) => {
  const split = terminals.find(t => t.id === splitId)
  if (!split || split.splitLayout?.type === 'single') return

  // Detach ALL panes
  for (const pane of split.splitLayout.panes) {
    if (pane.sessionName) {
      await fetch(`/api/tmux/detach/${pane.sessionName}`, {
        method: 'POST'
      })
    }

    if (pane.agentId) {
      clearProcessedAgentId(pane.agentId)
    }

    // Mark pane as detached
    updateTerminal(pane.id, {
      status: 'detached',
      agentId: undefined
    })
  }

  // Mark container as detached (preserves splitLayout!)
  updateTerminal(splitId, {
    status: 'detached',
    splitLayout: {
      ...split.splitLayout,
      panes: split.splitLayout.panes.map(p => ({
        ...p,
        status: 'detached',
        agentId: undefined
      }))
    }
  })
}
```

## Reattaching Panes

### Bug: Clicking Detached Pane Only Reattached One Terminal

**Problem:**
After detaching a split, clicking on a **pane tab** (not container) only reconnected that one pane as a single terminal. The split was lost.

**What Happened:**
```
1. Detach split → creates 3 detached tabs:
   - Pane 1 (detached)
   - Pane 2 (detached)
   - Container (detached, with splitLayout preserved)

2. Click Pane 1 tab to reattach
3. handleReattachTerminal(pane1.id) called
4. Code checked: is this a split container? NO
5. Reconnected as single terminal (no split!)
6. SplitLayout waiting for other pane → stuck "Waiting for agents"
```

**Root Cause:**
Code didn't check if the terminal being reattached was a PANE in a detached split. It only checked if the terminal itself was a container.

### The Fix: Check for Detached Split Container

**Code:**
```typescript
const handleReattachTerminal = async (terminalId: string) => {
  // CRITICAL: Check if this terminal is a PANE in a detached split
  const detachedSplitContainer = terminals.find(t =>
    t.status === 'detached' &&
    t.splitLayout?.type !== 'single' &&
    t.splitLayout?.panes.some(p => p.terminalId === terminalId)
  )

  if (detachedSplitContainer) {
    // Reattach the whole container, which reattaches all panes
    console.log('[Reattach] Terminal is pane in detached split, reattaching container')
    return handleReattachTerminal(detachedSplitContainer.id)
  }

  // Not a pane - check if it's a split container
  const terminal = terminals.find(t => t.id === terminalId)
  if (!terminal) return

  if (terminal.splitLayout?.type !== 'single') {
    // Reattach all panes in split
    for (const pane of terminal.splitLayout.panes) {
      if (pane.sessionName) {
        await reconnectToSession(pane)
      }
    }

    // Mark container as running
    updateTerminal(terminalId, {
      status: 'running'
    })
  } else {
    // Single terminal - reconnect
    if (terminal.sessionName) {
      await reconnectToSession(terminal)
    }
  }

  // Set as active
  setActiveTerminal(terminalId)
}
```

**Result:**
Clicking any detached pane tab now restores the entire split with all panes!

## Resize Split Dividers

### Performance Optimization

**Problem:**
Dragging split dividers felt laggy due to excessive terminal refits (10 per second).

**Solution:**
Eliminate live refits during drag - only refit once when drag completes.

**Code:**
```typescript
// SplitLayout.tsx
<ReactSplit
  direction={splitLayout.type === 'horizontal' ? 'horizontal' : 'vertical'}
  sizes={[splitPercentage, 100 - splitPercentage]}
  // DON'T refit during drag (removed onResize)
  // onResize={(sizes) => {
  //   fitAddon.fit()  // Too frequent!
  // }}
  onResizeStop={(sizes) => {
    // Only refit once when drag completes
    updateSplitPercentage(terminal.id, sizes[0])

    // Refit both panes
    leftTerminal.fitAddon?.fit()
    rightTerminal.fitAddon?.fit()
  }}
>
  {/* Split panes */}
</ReactSplit>
```

**CSS Optimization:**
```css
/* Add GPU acceleration hints */
.split-divider {
  will-change: transform;
  transform: translateZ(0);
}

.split-pane {
  will-change: width, height;
}
```

**Impact:**
- ✅ Buttery smooth drag performance
- ✅ Terminal content snaps to correct size on release
- ✅ Reduced CPU usage during resize

## Visual Improvements

### Divider Visibility

**Problem:**
Split dividers were hard to see (1px, 15% opacity).

**Solution:**
```css
.split-divider {
  width: 2px;  /* Increased from 1px */
  background: rgba(255, 255, 255, 0.3);  /* Increased from 0.15 */
  cursor: col-resize;
}

.split-divider:hover {
  background: rgba(255, 255, 255, 0.5);
}
```

### Pane Spacing

**Problem:**
Terminals touched the edges, text was hard to read.

**Solution:**
```css
.terminal-container {
  padding-left: 12px;  /* Added left padding */
}

.split-panes {
  gap: 8px;  /* Added gap between panes */
}
```

## Testing Split Terminals

### Test Checklist

**Basic Splits:**
- [ ] Drag tab to create horizontal split
- [ ] Drag tab to create vertical split
- [ ] Both panes render correctly
- [ ] Both panes accept input
- [ ] Can resize divider
- [ ] Divider visible and smooth

**Closing Panes:**
- [ ] Close left pane → right becomes single
- [ ] Close right pane → left becomes single
- [ ] Tmux sessions killed (check `tmux ls`)

**Detaching Panes:**
- [ ] Detach left pane → appears in dropdown
- [ ] Detach right pane → appears in dropdown
- [ ] Tmux sessions survive (check `tmux ls`)
- [ ] Can reattach individual panes
- [ ] Detaching all panes preserves layout

**Detaching Container:**
- [ ] Detach split → all panes detached
- [ ] Split layout preserved in container
- [ ] Clicking any pane tab restores whole split
- [ ] All panes reconnect correctly

**Multi-Window:**
- [ ] Move split to new window
- [ ] Both panes work in new window
- [ ] Detach in new window
- [ ] Main window sees detached state immediately

## Common Issues

**Issue:** Split creates nested splits
- Check: Are drop zones disabled on split tabs?
- Fix: Return early if `splitLayout.type !== 'single'`

**Issue:** Closing pane doesn't convert to single
- Check: Is `remainingPanes.length === 1` check present?
- Check: Is `splitLayout.type` set to 'single'?

**Issue:** Detach kills pane
- Check: Are you sending WebSocket 'close'?
- Fix: Only call API endpoint, don't send WebSocket message

**Issue:** Reattaching pane loses split
- Check: Is detachedSplitContainer check present?
- Fix: Check if terminal is pane in detached split before reattaching

**Issue:** Divider drag is laggy
- Check: Are you refitting on every drag event?
- Fix: Only refit on `onResizeStop`, not `onResize`

## Files to Reference

- `src/components/SplitLayout.tsx` - Split rendering and resize logic
- `src/hooks/useDragDrop.ts` - Drag and drop patterns
- `src/SimpleTerminalApp.tsx:864-878` - Detached pane reattach fix
- `docs/lessons-learned/architecture.md` - Split terminal operations lessons
