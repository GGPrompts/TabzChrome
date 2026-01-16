---
name: using-xterm-js
description: Provides battle-tested patterns for xterm.js terminal implementations. Use when building or debugging xterm.js terminals, integrating with React, implementing WebSocket terminal I/O, managing terminal persistence with tmux, or debugging terminal initialization, resize, or rendering issues.
---

# xterm.js Best Practices

Comprehensive patterns for building terminal applications with xterm.js, React, and WebSockets.

## Contents

- [Core Patterns](#core-patterns) - Essential patterns (always load)
- [Reference Files](#reference-files) - Detailed documentation by topic

## Core Patterns

### 1. Refs and State Management

**Clear refs when state changes.** Refs persist across state changes - when clearing state, also clear related refs.

```typescript
// CORRECT - Clear both state AND ref
if (terminal.agentId) {
  clearProcessedAgentId(terminal.agentId)  // Clear ref
}
updateTerminal(id, { agentId: undefined })  // Clear state
```

**Key Insight:** State = what the terminal is; Refs = what we've processed. See `references/refs-state-patterns.md`.

### 2. WebSocket Message Types

**Know your destructive operations.** Backend handlers have different semantics:
- `type: 'disconnect'` - Graceful disconnect, keep session alive
- `type: 'close'` - **FORCE CLOSE and KILL session**

```typescript
// WRONG - This KILLS the tmux session!
wsRef.current.send(JSON.stringify({ type: 'close', terminalId }))

// CORRECT - Use API endpoint only, let PTY disconnect naturally
await fetch(`/api/tmux/detach/${sessionName}`, { method: 'POST' })
```

See `references/websocket-patterns.md` for backend routing patterns.

### 3. React Hooks & Shared Refs

**Pass shared refs as parameters** when extracting hooks:

```typescript
// WRONG - Creates NEW ref, breaks sharing
export function useWebSocketManager(...) {
  const wsRef = useRef<WebSocket | null>(null)
}

// RIGHT - Uses parent's ref
export function useWebSocketManager(
  wsRef: React.MutableRefObject<WebSocket | null>,
) { }
```

See `references/react-hooks-patterns.md` for refactoring workflows.

### 4. Terminal Initialization

**xterm.js requires non-zero container dimensions.** Use visibility-based hiding, not display:none.

```typescript
// WRONG - Prevents xterm initialization
<div style={{ display: isActive ? 'block' : 'none' }}>

// CORRECT - All terminals get dimensions
<div style={{
  position: 'absolute',
  top: 0, left: 0, right: 0, bottom: 0,
  visibility: isActive ? 'visible' : 'hidden',
}}>
```

### 5. useEffect Dependencies

**Include refs in dependencies for early returns:**

```typescript
// WRONG - Only runs once, may return early forever
useEffect(() => {
  if (!terminalRef.current) return
}, [])

// CORRECT - Re-runs when ref becomes available
useEffect(() => {
  if (!terminalRef.current) return
}, [terminalRef.current])
```

### 6. Session Naming

**Use existing sessionName for reconnection:**

```typescript
// CORRECT - Reconnect to existing session
const config = { sessionName: terminal.sessionName, resumable: true }

// WRONG - Creates new session
const config = { sessionName: generateNewSessionName() }
```

### 7. Multi-Window Management

**Track terminal ownership** - never broadcast output to all clients:

```javascript
// Backend: Track ownership
const terminalOwners = new Map()  // terminalId -> Set<WebSocket>

// Send ONLY to owners
terminalRegistry.on('output', (terminalId, data) => {
  const owners = terminalOwners.get(terminalId)
  owners.forEach(client => client.send(message))
})
```

### 8. Tmux EOL Conversion

**Disable EOL conversion for tmux sessions:**

```typescript
const isTmuxSession = !!agent.sessionName
const xtermOptions = {
  convertEol: !isTmuxSession,  // Only convert for regular shells
  windowsMode: false,
}
```

Multiple xterm instances sharing tmux must handle output identically.

### 9. Resize Coordination

**Key principles:**
- Don't resize during active output (causes redraw storms)
- Use row changes, not column changes for resize trick
- Clear write queue after resize trick
- Buffer output during reconnection guard period

See `references/resize-patterns.md` for complete patterns.

### 10. Tmux Resize Strategy

**Skip ResizeObserver for tmux sessions:**

```typescript
if (useTmux) {
  // Don't set up ResizeObserver - tmux manages pane dimensions
  return
}
```

**For tmux:**
- DO resize: Initial connection, browser window resize
- DON'T resize: Focus, tab switch, container changes

## Testing Checklist

After any terminal refactoring:
1. TypeScript compilation succeeds
2. Spawn terminal works
3. Typing works (WebSocket)
4. Resize works (ResizeObserver)
5. TUI tools work (complex ANSI)
6. No console errors
7. Test suite passes: `npm test`

See `references/testing-checklist.md` for detailed workflows.

## Reference Files

Detailed documentation by topic:

| File | Content |
|------|---------|
| `references/refs-state-patterns.md` | Ref management patterns and examples |
| `references/websocket-patterns.md` | WebSocket communication and backend routing |
| `references/react-hooks-patterns.md` | React hooks refactoring workflows |
| `references/resize-patterns.md` | Resize coordination and output handling |
| `references/split-terminal-patterns.md` | Split terminal and detach/reattach patterns |
| `references/advanced-patterns.md` | Unicode11 addon, mouse coords, tmux reconnection |
| `references/testing-checklist.md` | Comprehensive testing workflows |

Load these references as needed when working on specific aspects.
