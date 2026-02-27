# Architecture Lessons

Lessons related to multi-window state sync, split terminal architecture, WebSocket routing, and system design patterns.

> **See Also:** The `tabz-development` skill contains patterns for working on the TabzChrome codebase.

---

## WebSocket Message Types: Know Your Destructive Operations

### Lesson: 'close' vs 'disconnect' (Nov 13, 2025)

**Problem:** Detaching terminals killed their tmux sessions.

**What Happened:**
```typescript
// WRONG - This KILLS the tmux session!
wsRef.current.send(JSON.stringify({
  type: 'close',
  terminalId: terminal.agentId,
}))
```

**Root Cause:** Backend has two close behaviors:
- `case 'disconnect'`: Graceful disconnect, keep tmux session alive
- `case 'close'`: **Force close and KILL tmux session** (backend/server.js:254)

**Solution:** For detach, only call the API endpoint - don't send WebSocket message:
```typescript
// CORRECT - Let PTY disconnect naturally
await fetch(`/api/tmux/detach/${sessionName}`, { method: 'POST' })
// Don't send WebSocket 'close' message!
```

**Key Insight:**
- Read backend code to understand what each message type does
- "Close" often means "destroy" in WebSocket contexts
- For non-destructive operations, use API endpoints only

**Files:**
- `backend/server.js:240-256` - Close message handler
- `backend/routes/api.js:714-744` - Safe detach endpoint

---

## Split Container IS the Terminal

### Lesson: Split Architecture Understanding (Nov 14, 2025)

**Problem:** Unsplitting caused one terminal to disappear completely.

**What Happened:**
1. User drags Terminal A onto Terminal B to create split
2. User unsplits by popping out Terminal A
3. Terminal B disappeared! Only Terminal A remained visible

**Root Cause:** Misunderstanding of split architecture:
```typescript
// When dragging A onto B:
updateTerminal(B.id, {  // B becomes the CONTAINER
  splitLayout: {
    type: 'vertical',
    panes: [
      { terminalId: B.id },  // B references itself!
      { terminalId: A.id }
    ]
  }
})
```

The split container **IS** one of the original terminals (Terminal B), not a new entity!

**Wrong Fix:**
```typescript
// Delete the container when 1 pane remains
removeTerminal(splitContainer.id)  // ❌ DELETES Terminal B!
```

**Correct Fix:**
```typescript
// Clear the split layout, don't delete the container
updateTerminal(splitContainer.id, {
  splitLayout: { type: 'single', panes: [] }  // ✓ Converts B back to normal terminal
})
```

**Key Insights:**
- Split container = one of the original terminals, not a wrapper
- The container terminal keeps its ID, name, theme, etc.
- Never delete the container - just clear its `splitLayout` property

**Prevention Checklist:**
- [ ] Does this operation delete a terminal that might be a split container?
- [ ] Could the pane I'm operating on be the container itself?
- [ ] Am I clearing state vs. deleting entities?

**Files:**
- `extension/sidepanel/sidepanel.tsx:1392-1408` - Fixed unsplit logic
- `extension/hooks/useDragDrop.ts:277-283` - How splits are created

---

## Multi-Window State Synchronization

### Lesson: Cross-Window State Changes Require Local Cleanup (Nov 14, 2025)

**Problem:** After detaching terminal in Window B, Window A showed terminal stuck on "reconnecting" forever.

**What Happened:**
1. Window A: Terminal connected with active WebSocket agent
2. Window B: User clicks "Detach" on same terminal
3. Window B: Calls backend, updates state, broadcasts to Window A
4. Window A: Receives broadcast, updates terminal status to 'detached'
5. Window A: **But WebSocket agent still exists!**
6. Window A: Terminal shows "reconnecting" because `status='detached'` but `agent` exists

**Root Cause:** Zustand store syncs via BroadcastChannel, but WebSocket agents are local React state:
```typescript
// Window B detaches:
updateTerminal(id, { status: 'detached', agentId: undefined })  // Syncs via broadcast

// Window A receives broadcast:
setState({ terminals: [...] })  // ✓ Terminal updated
// But webSocketAgents state is NOT synced! ❌
```

**Solution:** Monitor terminal status changes and clean up local agents:
```typescript
// In useWebSocketManager.ts
useEffect(() => {
  const detachedTerminals = storedTerminals.filter(t =>
    t.status === 'detached' && t.agentId
  )

  detachedTerminals.forEach(terminal => {
    if (webSocketAgents.some(a => a.id === terminal.agentId)) {
      // Send disconnect to backend
      wsRef.current.send(JSON.stringify({
        type: 'disconnect',
        data: { terminalId: terminal.agentId }
      }))

      // Remove from local state
      setWebSocketAgents(prev => prev.filter(a => a.id !== terminal.agentId))

      // Clear agentId
      updateTerminal(terminal.id, { agentId: undefined })
    }
  })
}, [storedTerminals, webSocketAgents])
```

**Key Insights:**
- BroadcastChannel only syncs what you explicitly send (Zustand state)
- Local React state (agents, refs) doesn't sync automatically
- When remote window changes terminal status, local window must clean up side effects
- Status changes can come from broadcasts, not just local actions

**Prevention Checklist:**
- [ ] Does this terminal have local side effects? (WebSocket, refs, timers)
- [ ] Can terminal status change via broadcast from another window?
- [ ] Do we watch for status changes and clean up local state?

**Files:**
- `extension/hooks/useTerminalSessions.ts:115-140` - Agent cleanup on detach
- `extension/sidepanel/sidepanel.tsx:544-581` - BroadcastChannel state sync

---

## Backend Broadcasting Breaks Multi-Window

### Lesson: Route Output to Owners Only (Nov 12, 2025)

**Problem:** Terminals in Window A received output from terminals in Window B, causing escape sequence corruption.

**Root Cause:** Backend was broadcasting terminal output to ALL WebSocket clients instead of routing to specific owner.

**Wrong Approach:**
```javascript
// ❌ BROKEN - broadcasts to everyone
terminalRegistry.on('output', (terminalId, data) => {
  wss.clients.forEach(client => {
    client.send(JSON.stringify({ type: 'terminal-output', ... }))
  })
})
```

**Right Approach:**
```javascript
// ✅ CORRECT - only send to owners
const terminalOwners = new Map()  // terminalId -> Set<WebSocket>

// Register ownership on spawn/reconnect
terminalOwners.get(terminalId).add(ws)

// Route output to owners only
terminalRegistry.on('output', (terminalId, data) => {
  const owners = terminalOwners.get(terminalId)
  owners.forEach(client => {
    client.send(JSON.stringify({ type: 'terminal-output', ... }))
  })
})
```

**Key Insight:**
- Multi-window = multiple clients connected to same backend
- Terminal output must be routed to specific client(s), not broadcast
- Use ownership tracking map to route messages correctly

**Files:**
- `backend/server.js:114-443` - terminalOwners map

---

## Don't Auto-Register as Owner of All Terminals

### Lesson: Explicit Ownership vs Auto-Registration (Dec 9, 2025)

**Problem:** Terminal corruption - same text appeared 100+ times, had to refresh page to fix.

**What Happened:**
1. Backend has `terminalOwners` Map: `terminalId → Set<WebSocket>`
2. When WebSocket connects, old code did this:
```javascript
// OLD CODE - BROKEN
existingTerminals.forEach(terminal => {
  terminalOwners.get(terminal.id).add(ws)  // ❌ Registers for ALL terminals!
})
```
3. Result: Every WebSocket connection received output from EVERY terminal
4. If you had 3 terminals, your one xterm instance received 3x the output

**Solution:** Remove auto-registration. Let frontend explicitly reconnect:

```javascript
// NEW CODE - CORRECT
// Send terminal list (for UI display)
ws.send(JSON.stringify({ type: 'terminals', data: existingTerminals }));

// Do NOT auto-register as owner of all terminals!
// Frontend must send 'reconnect' message for each terminal it owns
```

**Key Insights:**
- "Helpful" auto-registration can cause subtle bugs
- Multi-tenant WebSocket servers need explicit ownership, not implicit
- Always verify routing in multi-client scenarios

**Prevention Checklist:**
- [ ] Does new WebSocket connection get output from terminals it didn't create?
- [ ] Can spawning terminal in Window A affect Window B?
- [ ] After backend restart, does each sidebar reconnect only to its own terminals?

**Files:**
- `backend/server.js:268-286` - Removed auto-registration

---

## Split Terminal Operations: Close vs Detach

### Scenario: Closing vs Detaching Panes

**Split Container with 2 panes: Claude Code (left) + Bash (right)**

#### Closing a Pane (X button):
```
1. Find split container
2. Remove pane from split.panes array
3. If only 1 pane left → convert to single terminal
4. Send WebSocket 'close' → KILLS tmux session
5. removeTerminal() → removes from localStorage
Result: Pane gone forever, tmux session destroyed
```

#### Detaching a Pane (Right-click → Detach):
```
1. Find split container
2. Remove pane from split.panes array
3. If only 1 pane left → convert to single terminal
4. Call /api/tmux/detach → keeps tmux session alive
5. Mark pane as 'detached' → stays in localStorage
Result: Pane becomes detached tab, tmux session survives, can reattach
```

#### Detaching Whole Container (Right-click container → Detach):
```
1. Detach ALL panes in split
2. Mark each pane as 'detached'
3. Mark container as 'detached'
4. Preserve splitLayout
Result: All panes detached, split layout preserved, can reattach and restore split
```

**Key Difference:**
- Close = permanent deletion + kills tmux
- Detach = temporary suspension + preserves tmux

---

## Clicking Detached Pane Tab Only Reattached One Terminal

### Lesson: Check If Terminal Is Part of Detached Split (Nov 13, 2025)

**Problem:** After detaching a split, clicking on a **pane tab** (not container) only reconnected that one pane as a single terminal. The split was lost.

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
```

**Root Cause:** Code didn't check if the terminal being reattached was a PANE in a detached split container.

**Solution:** Before reattaching, check if terminal is part of a detached split container:

```typescript
// Check if this terminal is a PANE in a detached split
const detachedSplitContainer = storedTerminals.find(t =>
  t.status === 'detached' &&
  t.splitLayout?.type !== 'single' &&
  t.splitLayout?.panes.some(p => p.terminalId === terminalId)
)

if (detachedSplitContainer) {
  // Reattach the whole container, which reattaches all panes
  return handleReattachTerminal(detachedSplitContainer.id)
}
```

**Files:**
- `extension/sidepanel/sidepanel.tsx:864-878`

---

## Z-Index & Stacking Contexts

### Lesson: Establish Clear Z-Index Hierarchy (Nov 12, 2025)

**Problem:** Focus indicators visible under one pane but over another, resize handle sometimes unclickable.

**Root Cause:** Inconsistent z-index values and stacking contexts.

**Solution - Establish Clear Hierarchy:**
```css
/* Define clear z-index scale */
.react-resizable-handle {
  z-index: 50;  /* Highest - always grabbable */
}

.split-pane-right.focused::before,
.split-pane-bottom.focused::before {
  z-index: 40;  /* Medium - visible but below handle */
}

/* Split panes use default stacking (lowest) */
.split-pane-left,
.split-pane-right {
  background: transparent;
  isolation: isolate;  /* Create stacking context */
}
```

**Key Insight:**
- Define z-index scale upfront (e.g., 10 = normal, 50 = overlay, 100 = modal)
- Interactive elements (handles, buttons) should be highest
- Visual indicators below interactive elements
- Use `isolation: isolate` to prevent stacking context bleed

**Files:**
- `extension/components/SplitLayout.css` - Z-index hierarchy

---

**Last Updated:** December 13, 2025
