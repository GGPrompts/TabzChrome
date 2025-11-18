# Refs and State Management Patterns

This document provides detailed patterns for managing refs and state in xterm.js applications.

## The Fundamental Pattern

**Rule:** Refs persist across state changes. When clearing state, also clear related refs.

### Why This Matters

State management libraries (Zustand, Redux, etc.) handle **what the terminal is**:
- Terminal ID
- Session name
- Connection status
- Agent ID

Refs (useRef) handle **what we've processed**:
- Processed agent IDs (to prevent duplicate handling)
- Pending spawn requests
- WebSocket connection
- DOM elements and xterm instances

When state changes, refs don't automatically update. This causes bugs.

## Common Scenario: Detach/Reattach

### The Bug

```typescript
// User detaches terminal
updateTerminal(id, {
  status: 'detached',
  agentId: undefined,  // ✅ State cleared
})
// ❌ But processedAgentIds ref still contains the agentId!

// User reattaches terminal
// Backend returns SAME agentId (reconnecting to same PTY)
const alreadyProcessed = processedAgentIds.current.has(agentId)
// Returns TRUE! Frontend thinks it already processed this.
// Terminal stuck in "spawning" state forever.
```

### The Fix

```typescript
// When detaching, clear from both state AND ref
if (terminal.agentId) {
  clearProcessedAgentId(terminal.agentId)  // ✅ Clear ref
}
updateTerminal(id, {
  status: 'detached',
  agentId: undefined,  // ✅ Clear state
})
```

### Implementation

```typescript
// In useWebSocketManager hook
const clearProcessedAgentId = useCallback((agentId: string) => {
  processedAgentIds.current.delete(agentId)
  console.log('[useWebSocketManager] Cleared processedAgentId:', agentId)
}, [])

// Expose the function
return {
  clearProcessedAgentId,
  // ... other returns
}

// In parent component
const handleDetach = async (terminalId: string) => {
  const terminal = terminals.find(t => t.id === terminalId)
  if (!terminal) return

  // 1. API call
  await fetch(`/api/tmux/detach/${terminal.sessionName}`, {
    method: 'POST'
  })

  // 2. Clear ref (CRITICAL!)
  if (terminal.agentId) {
    clearProcessedAgentId(terminal.agentId)
  }

  // 3. Update state
  updateTerminal(terminalId, {
    status: 'detached',
    agentId: undefined,
  })
}
```

## Pattern: Diagnostic Logging for Refs

When debugging ref issues, add comprehensive logging:

```typescript
// Log when adding to ref
const markAsProcessed = (agentId: string) => {
  processedAgentIds.current.add(agentId)
  console.log('[Refs] Added to processedAgentIds:', agentId, {
    totalProcessed: processedAgentIds.current.size,
    ids: Array.from(processedAgentIds.current)
  })
}

// Log when checking ref
const isProcessed = (agentId: string) => {
  const processed = processedAgentIds.current.has(agentId)
  console.log('[Refs] Checking processedAgentIds:', {
    agentId,
    isProcessed: processed,
    totalProcessed: processedAgentIds.current.size
  })
  return processed
}

// Log when clearing ref
const clearProcessedAgentId = (agentId: string) => {
  const existed = processedAgentIds.current.has(agentId)
  processedAgentIds.current.delete(agentId)
  console.log('[Refs] Cleared from processedAgentIds:', {
    agentId,
    existed,
    remainingSize: processedAgentIds.current.size
  })
}
```

## Checklist: State Changes That Need Ref Updates

When changing terminal state, check if these refs need updating:

### processedAgentIds
Update when:
- ✅ Detaching terminal (clear the agentId)
- ✅ Closing terminal (clear the agentId)
- ✅ Reconnecting failed (clear the agentId so retry can work)

Don't clear when:
- ❌ Just switching tabs (not a state change)
- ❌ Updating terminal properties (name, theme, etc.)

### pendingSpawns
Update when:
- ✅ Terminal spawned successfully (remove the requestId)
- ✅ Spawn failed (remove the requestId)
- ✅ User cancels spawn (remove the requestId)

Don't clear when:
- ❌ Still waiting for backend response

### WebSocket ref (wsRef)
Update when:
- ✅ WebSocket disconnects (set to null)
- ✅ Creating new WebSocket (set to new instance)

Don't update when:
- ❌ Sending messages (just use current ref)
- ❌ Terminal state changes (WebSocket is independent)

### DOM and xterm refs
Update when:
- ✅ Component unmounts (cleanup in useEffect)
- ✅ Terminal ID changes (rare, but re-initialize)

Don't update when:
- ❌ Terminal properties change (theme, font, etc.)
- ❌ Switching tabs (refs stay valid)

## Anti-Patterns to Avoid

### ❌ Clearing State Without Clearing Refs

```typescript
// WRONG - Only clears state
updateTerminal(id, { agentId: undefined })
// processedAgentIds ref still has the agentId!
```

### ❌ Assuming Refs Auto-Sync with State

```typescript
// WRONG - Refs don't magically update
const handleReconnect = () => {
  // State says agentId is undefined
  // But processedAgentIds ref still has old agentId
  // Reconnection will fail!
}
```

### ❌ Clearing Refs Without Understanding Why

```typescript
// WRONG - Clearing everything on any state change
useEffect(() => {
  processedAgentIds.current.clear()  // Too aggressive!
}, [terminals])  // Every terminal change clears ALL refs
```

### ❌ Not Logging Ref Operations

```typescript
// WRONG - Silent ref operations
processedAgentIds.current.delete(agentId)
// When bugs happen, you have no visibility into ref state
```

## Best Practices Summary

1. **Map state changes to ref changes** - For every state change, ask "Does a ref need updating?"
2. **Log all ref operations** - Add diagnostic logging for add/remove/check operations
3. **Test state transitions** - Test detach → reattach, close → respawn, etc.
4. **Document ref purpose** - Comment why each ref exists and when it should be cleared
5. **Use callbacks for ref operations** - Expose `clearProcessedAgentId()` functions from hooks

## Files to Reference

- `src/SimpleTerminalApp.tsx:747-750, 839-842` - Detach flow with ref clearing
- `src/hooks/useWebSocketManager.ts:515-517` - clearProcessedAgentId implementation
- `src/hooks/useWebSocketManager.ts:118-157` - Diagnostic logging example
