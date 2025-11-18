# Multi-Window Reattach Race Condition - Investigation Prompt

## Bug Description

**Race condition where main window tries to reattach terminal that popout window is already reattaching, causing "reconnecting" stuck state.**

## Reproduction Steps

1. **Main window**: Spawn several bash terminals (e.g., 3-4 terminals)
   - Note: Naming goes "Bash", "Bash-2", "Bash-3" (skips "Bash-1" - potential confusion?)
2. **Main window**: Detach one terminal (e.g., "Bash-2")
   - Terminal disappears from main window
   - Terminal appears in detached dropdown (yellow button in header)
3. **Main window**: Click popout button (↗) on another terminal (e.g., "Bash-3")
   - "Bash-3" opens in new browser window (Popout Window)
4. **Popout window**: Open detached dropdown, click "Reattach" on "Bash-2"
   - **EXPECTED**: "Bash-2" appears ONLY in popout window
   - **ACTUAL**: "Bash-2" appears in popout window, BUT main window ALSO tries to reattach it
5. **Main window**: "Bash-2" shows "reconnecting..." and gets stuck

## Expected Behavior

- **Popout window**: "Bash-2" reattaches successfully
- **Main window**: "Bash-2" should NOT appear (it's now owned by popout window)
- **State**: "Bash-2" should have `windowId: 'window-xxx'` (popout's ID)

## Actual Behavior

- **Popout window**: "Bash-2" reattaches successfully ✅
- **Main window**: "Bash-2" appears with "reconnecting..." status ❌
- **Result**: Two windows both trying to connect to same terminal session

## Potential Contributing Factors

### 1. Terminal Naming Confusion

**Observation**: Terminal naming skips "-1" suffix:
- First terminal: "Bash" (no suffix)
- Second terminal: "Bash-2" (skips "Bash-1")
- Third terminal: "Bash-3"

**Potential issue**: Could name-based lookups be confused by this pattern?

**Files to check**:
- `src/stores/simpleTerminalStore.ts` - Terminal name generation
- Search for: Name-based terminal lookups (should use ID, not name!)

### 2. Cross-Window State Sync Issue

When popout window reattaches "Bash-2":

1. **Popout window**: Calls reattach logic
2. **Popout window**: Updates state: `{ agentId: 'agent-bash-2', status: 'active', windowId: 'window-xxx' }`
3. **Broadcast**: State change broadcasted to all windows via `BroadcastChannel`
4. **Main window**: Receives broadcast, sees "Bash-2" in state
5. **Main window**: **BUG - Ignores windowId check**, tries to create WebSocket agent for "Bash-2"
6. **Main window**: Gets stuck on "reconnecting" because session already connected in popout

## Root Cause Hypothesis

### Missing windowId Filtering in Reattach Flow

Check `src/SimpleTerminalApp.tsx` around line **757-785** (Frontend Window Filtering):

```typescript
// CRITICAL: Check windowId BEFORE adding to webSocketAgents
if (existingTerminal) {
  const terminalWindow = existingTerminal.windowId || 'main'
  if (terminalWindow !== currentWindowId) {
    return  // Ignore terminals from other windows
  }
  // Now safe to add to webSocketAgents
}
```

**If this check is missing or bypassed in the reattach flow**, main window will try to connect to "Bash-2" even though it belongs to popout window.

## Files to Investigate

### 1. Reattach Logic
**Location**: `src/SimpleTerminalApp.tsx:1500-1600` - `handleReattachTerminal()` function

**Look for**:
- Does it set `windowId` when reattaching?
- Expected: `updateTerminal(id, { windowId: currentWindowId, ... })`

**Check**:
```typescript
const handleReattachTerminal = async (id: string) => {
  const terminal = storedTerminals.find(t => t.id === id)

  // Does it set windowId here?
  updateTerminal(id, {
    status: 'spawning',
    windowId: currentWindowId,  // ← Is this missing?
    // ...
  })
}
```

### 2. Broadcast Handler
**Location**: `src/stores/broadcastMiddleware.ts:40-100` - `handleStateChanged()`

**Look for**:
- Does it respect `windowId` when applying broadcasted state?
- Are reattached terminals filtered by windowId?

**Check**:
```typescript
// Does it filter terminals by windowId?
const terminalsToApply = payload.terminals.filter(terminal => {
  const terminalWindow = terminal.windowId || 'main'
  return terminalWindow === currentWindowId
})
```

### 3. WebSocket Agent Creation
**Location**: `src/hooks/useWebSocketManager.ts:100-200` - Terminal spawned handler

**Look for**:
- windowId check before adding to `webSocketAgents`
- Reference: `CLAUDE.md` line 207-218 (Frontend Window Filtering)

**Check**:
```typescript
// In terminal-spawned handler:
if (existingTerminal) {
  const terminalWindow = existingTerminal.windowId || 'main'
  if (terminalWindow !== currentWindowId) {
    console.log('⏭️ Ignoring terminal-spawned - belongs to other window')
    return  // Don't create agent for other window's terminal
  }
}
```

### 4. Terminal Name Generation
**Location**: `src/stores/simpleTerminalStore.ts` - Search for name generation logic

**Look for**:
- Why does naming skip "-1" suffix? (Bash, Bash-2, Bash-3)
- Could this cause ID/name confusion in lookups?

**Check**: Are there any name-based lookups instead of ID-based?

## Debugging Steps

### 1. Add Diagnostic Logging

In `src/SimpleTerminalApp.tsx` handleReattachTerminal:

```typescript
console.log('[Reattach] Starting reattach:', {
  terminalId: id,
  terminalName: terminal.name,
  currentWindowId,
  terminalWindowId: terminal.windowId,
  terminalStatus: terminal.status
})

// After updating state:
console.log('[Reattach] Updated terminal state:', {
  terminalId: id,
  newWindowId: currentWindowId,
  newStatus: 'spawning'
})
```

### 2. Check Broadcast Messages

**In browser console of BOTH windows**:

```javascript
// Main window console - Should see:
[BroadcastMiddleware] 📡 Received state-changed from window-xxx
[BroadcastMiddleware] Processing terminals update...
// Should NOT see: Adding WebSocket agent for Bash-2

// Popout window console - Should see:
[Reattach] Starting reattach: { terminalId: 'terminal-xxx', terminalName: 'Bash-2' }
[WebSocketManager] Adding WebSocket agent for Bash-2
```

### 3. Verify windowId Assignment

**After reattach in popout window**, check localStorage in BOTH windows:

```javascript
// In popout window console:
const state = JSON.parse(localStorage.getItem('simple-terminal-storage'))
const terminal = state.state.terminals.find(t => t.name === 'Bash-2')
console.log('Bash-2 in popout:', {
  windowId: terminal.windowId,  // Should be: 'window-xxx'
  status: terminal.status,      // Should be: 'active'
  agentId: terminal.agentId     // Should be defined
})

// In main window console:
const state = JSON.parse(localStorage.getItem('simple-terminal-storage'))
const terminal = state.state.terminals.find(t => t.name === 'Bash-2')
console.log('Bash-2 in main:', {
  windowId: terminal.windowId,  // Should be: 'window-xxx' (NOT 'main')
  status: terminal.status,      // What is it? 'reconnecting'?
  agentId: terminal.agentId     // Should be defined
})
```

### 4. Check WebSocket Agents Map

In `useWebSocketManager.ts`, add logging:

```typescript
// After receiving terminal-spawned:
console.log('[WebSocketManager] Current agents:', {
  agentIds: Array.from(webSocketAgents.current.keys()),
  terminalId: message.data.id,
  shouldAddAgent: terminalWindow === currentWindowId
})
```

## Expected Fix

**Hypothesis**: Missing windowId check in reattach flow or broadcast handler

**Solution Options**:

### Option 1: Set windowId in Reattach Handler

```typescript
const handleReattachTerminal = async (id: string) => {
  const terminal = storedTerminals.find(t => t.id === id)
  // ... existing logic ...

  // NEW: Set windowId to current window when reattaching
  updateTerminal(id, {
    status: 'spawning',
    windowId: currentWindowId,  // ← Critical! Assigns terminal to this window
    // ... other updates ...
  })
}
```

### Option 2: Filter in Broadcast Handler

```typescript
// In broadcastMiddleware.ts handleStateChanged:
const handleStateChanged = (event: MessageEvent) => {
  const { payload, sourceWindowId } = event.data

  // Filter terminals by windowId before applying
  const relevantTerminals = payload.terminals.filter(terminal => {
    const terminalWindow = terminal.windowId || 'main'
    return terminalWindow === currentWindowId
  })

  // Apply only relevant terminals
  set({ terminals: relevantTerminals })
}
```

### Option 3: Filter in WebSocket Manager

```typescript
// In useWebSocketManager.ts terminal-spawned handler:
if (existingTerminal) {
  const terminalWindow = existingTerminal.windowId || 'main'
  if (terminalWindow !== currentWindowId) {
    console.log('⏭️ Ignoring terminal-spawned - belongs to window:', terminalWindow)
    return  // Don't create agent for other window's terminal
  }
  // Now safe to create agent
  webSocketAgents.current.set(message.data.id, { id: message.data.id, ... })
}
```

## Success Criteria

After fix:

1. ✅ Reattach "Bash-2" in popout window → appears only in popout
2. ✅ Main window does NOT show "Bash-2"
3. ✅ Main window does NOT show "reconnecting..." status for "Bash-2"
4. ✅ "Bash-2" has `windowId: 'window-xxx'` (popout's ID) in state
5. ✅ Only popout window has WebSocket agent for "Bash-2"
6. ✅ Main window's localStorage shows "Bash-2" with `windowId: 'window-xxx'`

## Test Coverage

After fixing, add test to `tests/integration/multi-window-popout.test.ts`:

```typescript
describe('Multi-Window Reattach Race Condition', () => {
  it('should prevent main window from reattaching terminal reattached in popout', async () => {
    // Setup: Main window with 3 terminals
    const { addTerminal, updateTerminal } = useSimpleTerminalStore.getState()

    const terminal1 = createMockTerminal('terminal-1', 'Bash', 'bash')
    terminal1.windowId = 'main'

    const terminal2 = createMockTerminal('terminal-2', 'Bash-2', 'bash')
    terminal2.windowId = 'main'

    await act(async () => {
      addTerminal(terminal1)
      addTerminal(terminal2)
    })

    // 1. Detach terminal-2 in main window
    await act(async () => {
      updateTerminal('terminal-2', {
        status: 'detached',
        agentId: undefined,
        windowId: undefined  // Cleared on detach
      })
    })

    // 2. Simulate popout window reattaching terminal-2
    const popoutWindowId = 'window-abc123'
    await act(async () => {
      updateTerminal('terminal-2', {
        status: 'spawning',
        windowId: popoutWindowId,  // ← Assigned to popout
        agentId: 'agent-terminal-2'
      })
    })

    // 3. Verify main window does NOT create agent
    const terminal2State = useSimpleTerminalStore.getState().terminals.find(t => t.id === 'terminal-2')
    expect(terminal2State!.windowId).toBe(popoutWindowId)  // Belongs to popout

    // Main window should NOT have this terminal visible
    const mainWindowTerminals = getVisibleTerminals('main')
    expect(mainWindowTerminals.find(t => t.id === 'terminal-2')).toBeUndefined()
  })
})
```

## Architecture Reference

See `CLAUDE.md` section: **Multi-Window Support - Critical Architecture**

Key principles:
- **Backend output routing**: Only send to terminal owners (line 114-143)
- **Frontend window filtering**: Check windowId BEFORE adding agents (line 203-218)
- **No fallback terminal creation**: Don't create terminals for broadcasts (line 216-219)

### Related Lessons

See `LESSONS_LEARNED.md`:
- **Multi-Window Architecture** (line 137-290)
- **Cross-Window State Changes Require Local Cleanup** (line 139-175)

## Related Commits

- `cc05c4a` - EOL conversion fix (different issue, but similar multi-window concerns)
- `88d495b` - Multi-window architecture documentation
- Search git log: `git log --grep="multi-window\|popout\|reattach" --oneline`

## Additional Investigation: Terminal Naming

**Question**: Why does terminal naming skip "-1" suffix?

**Pattern observed**:
- 1st Bash terminal: "Bash" (no suffix)
- 2nd Bash terminal: "Bash-2" (skips "-1")
- 3rd Bash terminal: "Bash-3"

**Potential issues**:
- Could cause confusion if code expects "Bash-1" to exist
- Are there any name-based lookups that would fail?
- Does auto-naming logic check for "Bash" vs "Bash-1" collision?

**To check**:
```bash
# Search for name-based terminal lookups:
grep -r "terminals.find.*name" src/
grep -r "terminals.filter.*name" src/

# Check name generation logic:
grep -r "generateTerminalName\|terminalName\|name:" src/stores/
```

---

**TL;DR**:

1. **Main bug**: Popout window reattaches "Bash-2", but main window also tries to reattach it (missing windowId filtering)
2. **Contributing factor?**: Terminal naming skips "-1" - could cause lookup confusion
3. **Fix**: Add windowId check in reattach handler or broadcast middleware
4. **Test**: Add regression test to prevent future occurrences
