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
  agentId: undefined,  // State cleared
})
// But processedAgentIds ref still contains the agentId!

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
  clearProcessedAgentId(terminal.agentId)  // Clear ref
}
updateTerminal(id, {
  status: 'detached',
  agentId: undefined,  // Clear state
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

## Checklist: State Changes That Need Ref Updates

When changing terminal state, check if these refs need updating:

### processedAgentIds
Update when:
- Detaching terminal (clear the agentId)
- Closing terminal (clear the agentId)
- Reconnecting failed (clear the agentId so retry can work)

Don't clear when:
- Just switching tabs (not a state change)
- Updating terminal properties (name, theme, etc.)

### pendingSpawns
Update when:
- Terminal spawned successfully (remove the requestId)
- Spawn failed (remove the requestId)
- User cancels spawn (remove the requestId)

### WebSocket ref (wsRef)
Update when:
- WebSocket disconnects (set to null)
- Creating new WebSocket (set to new instance)

### DOM and xterm refs
Update when:
- Component unmounts (cleanup in useEffect)
- Terminal ID changes (rare, but re-initialize)

## Best Practices Summary

1. **Map state changes to ref changes** - For every state change, ask "Does a ref need updating?"
2. **Log all ref operations** - Add diagnostic logging for add/remove/check operations
3. **Test state transitions** - Test detach -> reattach, close -> respawn, etc.
4. **Document ref purpose** - Comment why each ref exists and when it should be cleared
5. **Use callbacks for ref operations** - Expose `clearProcessedAgentId()` functions from hooks
