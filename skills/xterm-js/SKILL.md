---
name: xterm-js
description: This skill should be used when working with xterm.js terminal implementations, React-based terminal applications, WebSocket terminal communication, or refactoring terminal-related code. It provides battle-tested patterns, common pitfalls, and debugging strategies learned from building production terminal applications.
---

# xterm.js Best Practices

## Overview

This skill provides comprehensive best practices for building terminal applications with xterm.js, React, and WebSockets. It captures critical patterns discovered through debugging production terminal applications, including state management, WebSocket communication, React hooks integration, and terminal lifecycle management.

## When to Use This Skill

Use this skill when:
- Building or debugging xterm.js terminal implementations
- Integrating xterm.js with React (hooks, state, refs)
- Implementing WebSocket-based terminal I/O
- Managing terminal persistence with tmux or similar backends
- Refactoring terminal-related React components into custom hooks
- Debugging terminal initialization, resize, or rendering issues
- Implementing split terminal layouts or multi-window terminal management
- Working on detach/reattach terminal functionality

## Core Best Practices

### 1. Refs and State Management

**Critical Pattern: Clear Refs When State Changes**

Refs persist across state changes. When clearing state, also clear related refs.

```typescript
// CORRECT - Clear both state AND ref
if (terminal.agentId) {
  clearProcessedAgentId(terminal.agentId)  // Clear ref
}
updateTerminal(id, { agentId: undefined })  // Clear state
```

**Key Insight:**
- State (Zustand/Redux) = what the terminal is
- Refs (useRef) = what we've processed
- When state changes, check if related refs need updating

**Common Scenario:** Detach/reattach workflows where the same agentId returns from backend. Without clearing the ref, the frontend thinks it already processed this agentId and ignores reconnection messages.

See `references/refs-state-patterns.md` for detailed examples.

### 2. WebSocket Message Types

**Critical Pattern: Know Your Destructive Operations**

Backend WebSocket handlers often have different semantics for similar-looking message types:
- `type: 'disconnect'` - Graceful disconnect, keep session alive
- `type: 'close'` - **FORCE CLOSE and KILL session** (destructive!)

```typescript
// WRONG - This KILLS the tmux session!
wsRef.current.send(JSON.stringify({
  type: 'close',
  terminalId: terminal.agentId,
}))

// CORRECT - For detach, use API endpoint only
await fetch(`/api/tmux/detach/${sessionName}`, { method: 'POST' })
// Don't send WebSocket message - let PTY disconnect naturally
```

**Key Insight:** Read backend code to understand what each message type does. "Close" often means "destroy" in WebSocket contexts.

See `references/websocket-patterns.md` for backend routing patterns.

### 3. React Hooks & Refactoring

**Critical Pattern: Identify Shared Refs Before Extracting Hooks**

When extracting custom hooks that manage shared resources:

```typescript
// WRONG - Hook creates its own ref
export function useWebSocketManager(...) {
  const wsRef = useRef<WebSocket | null>(null)  // Creates NEW ref!
}

// RIGHT - Hook uses shared ref from parent
export function useWebSocketManager(
  wsRef: React.MutableRefObject<WebSocket | null>,  // Pass as parameter
  ...
) {
  // Uses parent's ref - all components share same WebSocket
}
```

**Checklist Before Extracting Hooks:**
- [ ] Map out all refs (diagram which components use which refs)
- [ ] Check if ref is used outside the hook
- [ ] If ref is shared → pass as parameter, don't create internally
- [ ] Test with real usage immediately after extraction

See `references/react-hooks-patterns.md` for refactoring workflows.

### 4. Terminal Initialization

**Critical Pattern: xterm.js Requires Non-Zero Container Dimensions**

xterm.js cannot initialize on containers with 0x0 dimensions. Use visibility-based hiding, not display:none.

```typescript
// WRONG - Prevents xterm initialization
<div style={{ display: isActive ? 'block' : 'none' }}>
  <Terminal />
</div>

// CORRECT - All terminals get dimensions, use visibility to hide
<div style={{
  position: 'absolute',
  top: 0, left: 0, right: 0, bottom: 0,
  visibility: isActive ? 'visible' : 'hidden',
  zIndex: isActive ? 1 : 0,
}}>
  <Terminal />
</div>
```

**Why This Works:**
- All terminals render with full dimensions (stacked via absolute positioning)
- xterm.js can initialize properly on all terminals
- `visibility: hidden` hides inactive terminals without removing dimensions
- Use `isSelected` prop to trigger refresh when tab becomes active

**Common Scenario:** Tab-based terminal UI where switching tabs should show different terminals. After refresh, only active tab would render if using `display: none`.

### 5. useEffect Dependencies for Initialization

**Critical Pattern: Early Returns Need Corresponding Dependencies**

If a useEffect checks a ref and returns early, include `ref.current` in dependencies so it re-runs when ref becomes available.

```typescript
// WRONG - Only runs once, may return early forever
useEffect(() => {
  if (!terminalRef.current) return  // Returns if null
  // Setup ResizeObserver
}, [])  // Never re-runs!

// CORRECT - Re-runs when ref becomes available
useEffect(() => {
  if (!terminalRef.current) return
  // Setup ResizeObserver
}, [terminalRef.current])  // Re-runs when ref changes!
```

**Common Pattern:** Wait for DOM refs AND library instances (xterm, fitAddon) before setup:

```typescript
useEffect(() => {
  if (!terminalRef.current?.parentElement ||
      !xtermRef.current ||
      !fitAddonRef.current) {
    return  // Wait for all refs
  }
  // Setup ResizeObserver
}, [terminalRef.current, xtermRef.current, fitAddonRef.current])
```

### 6. Session Naming & Reconnection

**Critical Pattern: Use Consistent Session Identifiers**

When reconnecting, use the existing `sessionName` to find the existing PTY. Don't generate a new one.

```typescript
// CORRECT - Reconnect to existing session
const config = {
  sessionName: terminal.sessionName,  // Use existing!
  resumable: true,
  useTmux: true,
}

// WRONG - Would create new session
const config = {
  sessionName: generateNewSessionName(),  // DON'T DO THIS
}
```

**Key Insight:** Tmux sessions have stable names. Use them as the source of truth for reconnection.

### 7. Multi-Window Terminal Management

**Critical Pattern: Backend Output Routing Must Use Ownership Tracking**

For multi-window setups, track which WebSocket connections own which terminals. Never broadcast terminal output to all clients.

```javascript
// Backend: Track ownership
const terminalOwners = new Map()  // terminalId -> Set<WebSocket>

// On output: send ONLY to owners (no broadcast!)
terminalRegistry.on('output', (terminalId, data) => {
  const owners = terminalOwners.get(terminalId)
  owners.forEach(client => client.send(message))
})
```

**Why:** Broadcasting terminal output causes escape sequence corruption (DSR sequences) in wrong windows.

**Frontend Pattern:** Filter terminals by windowId before adding to agents:

```typescript
// Check windowId BEFORE adding to webSocketAgents
if (existingTerminal) {
  const terminalWindow = existingTerminal.windowId || 'main'
  if (terminalWindow !== currentWindowId) {
    return  // Ignore terminals from other windows
  }
  // Now safe to add to webSocketAgents
}
```

See CLAUDE.md "Multi-Window Support - Critical Architecture" section for complete flow.

### 8. Testing Workflows

**Critical Pattern: Test Real Usage Immediately After Refactoring**

TypeScript compilation ≠ working code. Always test with real usage:

```bash
# After refactoring:
npm run build              # 1. Check TypeScript
# Open http://localhost:5173
# Spawn terminal            # 2. Test spawning
# Type in terminal          # 3. Test input (WebSocket)
# Resize window             # 4. Test resize (ResizeObserver)
# Spawn TUI tool            # 5. Test complex interactions
```

**Refactoring Checklist:**
- [ ] TypeScript compilation succeeds
- [ ] Spawn a terminal (test spawning logic)
- [ ] Type in terminal (test WebSocket communication)
- [ ] Resize window (test ResizeObserver)
- [ ] Spawn TUI tool like htop (test complex ANSI sequences)
- [ ] Check browser console for errors
- [ ] Check backend logs
- [ ] Run test suite: `npm test`

**Prevention:** Don't batch multiple hook extractions. Extract one, test, commit.

### 9. Debugging Patterns

**Critical Pattern: Add Diagnostic Logging Before Fixing**

When debugging complex state issues, add comprehensive logging first to understand the problem:

```typescript
// BEFORE fixing, add logging:
console.log('[useWebSocketManager] 📨 Received terminal-spawned:', {
  agentId: message.data.id,
  requestId: message.requestId,
  sessionName: message.data.sessionName,
  pendingSpawnsSize: pendingSpawns.current.size
})

// Log each fallback attempt:
if (!existingTerminal) {
  existingTerminal = storedTerminals.find(t => t.requestId === message.requestId)
  console.log('[useWebSocketManager] 🔍 Checking by requestId:',
    existingTerminal ? 'FOUND' : 'NOT FOUND')
}
```

**Benefits:**
- Shows exactly which code path is executing
- Reveals data mismatches (wrong ID, missing state, etc.)
- Helps users self-diagnose issues
- Can be left in for production debugging

### 10. Multi-Step State Changes

**Critical Pattern: Handle All Side Effects When Changing State**

When a state change affects multiple systems, update all of them.

**Checklist for Terminal State Changes:**
- [ ] Update Zustand state (terminal properties)
- [ ] Clear/update refs (processedAgentIds, pending spawns)
- [ ] Notify WebSocket (if needed)
- [ ] Clean up event listeners
- [ ] Update localStorage (if using persist)

**Example (Detach):**
```typescript
// 1. API call
await fetch(`/api/tmux/detach/${sessionName}`, { method: 'POST' })

// 2. Clear ref (DON'T FORGET THIS!)
if (terminal.agentId) {
  clearProcessedAgentId(terminal.agentId)
}

// 3. Update state
updateTerminal(id, {
  status: 'detached',
  agentId: undefined,
})
```

### 11. Tmux Split Terminals & EOL Conversion

**Critical Pattern: Disable EOL Conversion for Tmux Sessions**

When multiple xterm.js instances share a tmux session (e.g., React split terminals), enabling `convertEol: true` causes output corruption.

**Problem:**
- Tmux sends terminal sequences with proper line endings (`\n`)
- xterm with `convertEol: true` converts `\n` → `\r\n` independently
- Each xterm instance converts the SAME tmux output differently
- Result: text bleeding between panes, misaligned split divider

**Solution:**
```typescript
const isTmuxSession = !!agent.sessionName || shouldUseTmux;

const xtermOptions = {
  theme: theme.xterm,
  fontSize: savedFontSize,
  cursorBlink: true,
  scrollback: isTmuxSession ? 0 : 10000,

  // CRITICAL: Disable EOL conversion for tmux
  convertEol: !isTmuxSession,  // Only convert for regular shells
  windowsMode: false,          // Ensure UNIX-style line endings
};
```

**Why This Works:**
- **Tmux sessions**: `convertEol: false` → xterm displays raw PTY output
- **Regular shells**: `convertEol: true` → xterm converts for Windows compatibility
- Both xterm instances handle tmux output identically → no corruption

**Key Insight:** Tmux is a terminal multiplexer that manages its own terminal protocol. Multiple xterm instances sharing one tmux session must handle output identically to prevent corruption.

**Reference:** [Tmux EOL Fix Gist](https://gist.github.com/GGPrompts/7d40ea1070a45de120261db00f1d7e3a) - Complete guide with font normalization patterns

### 12. Resize Strategy for Tmux Sessions (The Tabz Pattern)

**Critical Pattern: Only Send Resize to Backend on Window Resize**

For tmux-backed terminals, DON'T try to time resize around output. Instead, simply don't send resize to backend on container changes at all. This eliminates the root cause of corruption.

```typescript
// Determine if this is a tmux session
const isTmuxSession = !!sessionName || terminalId.startsWith('ctt-')

// fitTerminal now takes a sendToBackend parameter
const fitTerminal = (sendToBackend = false) => {
  fitAddonRef.current.fit()
  xtermRef.current.refresh(0, xtermRef.current.rows - 1)

  // Only send resize to backend when explicitly requested
  if (sendToBackend) {
    debouncedSendResize()
  }
}

// ResizeObserver: local fit only for tmux
const resizeObserver = new ResizeObserver(() => {
  if (isTmuxSession) {
    fitTerminal(false)  // Local only - no backend
  } else {
    fitTerminal(true)   // Regular shells send to backend
  }
})

// Window resize: the ONE place we send to backend
window.addEventListener('resize', () => {
  fitTerminal(true)  // Send to backend
})
```

**Why This Works:**
- Tmux manages its own pane dimensions internally
- Container changes (sidebar resize, tab switch) only affect xterm's viewport, not tmux's understanding of size
- Only actual window resize changes the viewport dimensions tmux needs to know about
- No output deferral logic = no race conditions = no corruption

**Critical Pattern: Two-Step Resize Trick for Reconnection**

Tmux ignores resize events when dimensions haven't changed. For reconnection scenarios (page refresh, WebSocket reconnect), xterm is new/empty but tmux session exists. Plain resize won't redraw. Use the "resize trick" to force SIGWINCH:

```typescript
const triggerResizeTrick = () => {
  if (!xtermRef.current || !fitAddonRef.current) return

  // Simple debounce - no output deferral needed
  const timeSinceLast = Date.now() - lastResizeTrickTimeRef.current
  if (timeSinceLast < 500) return
  lastResizeTrickTimeRef.current = Date.now()

  const currentCols = xtermRef.current.cols
  const currentRows = xtermRef.current.rows

  // Step 1: Resize down by 1 ROW (sends SIGWINCH)
  // CRITICAL: Shrink ROWS not COLUMNS! Column shrink causes tmux status bar
  // to wrap its last character to the next line, corrupting scroll regions.
  isResizingRef.current = true
  const minRows = Math.max(1, currentRows - 1)
  xtermRef.current.resize(currentCols, minRows)
  sendResize(currentCols, minRows)

  // Step 2: Fit to container and send final dimensions (200ms for tmux to process)
  setTimeout(() => {
    fitAddonRef.current.fit()
    const finalCols = xtermRef.current.cols
    const finalRows = xtermRef.current.rows
    sendResize(finalCols, finalRows)
    prevDimensionsRef.current = { cols: finalCols, rows: finalRows }
    isResizingRef.current = false
    writeQueueRef.current = []  // Clear, don't flush - stale data from reflow
  }, 200)
}

// Use on reconnection events
case 'REFRESH_TERMINALS':
case 'WS_CONNECTED':
case 'TERMINAL_RECONNECTED':
  fitAddonRef.current.fit()
  xtermRef.current.refresh(0, xtermRef.current.rows - 1)
  triggerResizeTrick()  // Force tmux to redraw to new xterm
  break
```

**Key Insight:** Plain resize with same dimensions is IGNORED by tmux. The rows-1/fit trick forces SIGWINCH even when dimensions haven't "changed".

**Why ROWS not COLUMNS:** Tmux status bar is sized to fit terminal width exactly. Shrinking by 1 column causes the last character (often a date digit) to wrap to the next line, corrupting the scroll region. Shrinking by 1 row temporarily hides content but keeps status bar width intact.

See `references/resize-patterns.md` for the complete Tabz pattern.

### 13. Tmux Resize Quick Reference

This is a quick reference for the Tabz Pattern described in Pattern 12.

**Why Tmux Is Different:**
- Regular shells: Each xterm instance owns its PTY, resize freely
- Tmux sessions: Single PTY with tmux managing internal panes
- Tmux receives SIGWINCH and redraws ALL panes
- Multiple resize events = multiple full redraws = corruption

**The Rule (Tabz Pattern):**

| Event | Action |
|-------|--------|
| ResizeObserver (container change) | Local fit only - NO backend resize |
| Tab switch | Local fit + refresh - NO backend resize |
| Window resize | Send resize to backend ✓ |
| Reconnection (WS_CONNECTED, REFRESH_TERMINALS) | triggerResizeTrick() to force SIGWINCH |

**Key Insight:** Tmux ignores resize when dimensions haven't changed. Use the rows-1/fit trick to force SIGWINCH on reconnection. Shrink ROWS not COLUMNS - column shrink causes tmux status bar wrapping corruption.

### 14. Clear Buffer Before Large Resize Changes

**Critical Pattern: xterm.js Reflow Corrupts Complex ANSI Content**

When dimensions change significantly (>5 columns), xterm.js tries to reflow/rewrap existing content. This corrupts content with complex ANSI sequences (Claude Code statusline, colored diffs, cursor positioning).

```typescript
// In ResizeObserver or window resize handler:
const afterCols = xtermRef.current.cols
const colDelta = Math.abs(afterCols - beforeCols)

// For large dimension changes, clear xterm before tmux redraws
// xterm's reflow algorithm corrupts content with complex ANSI sequences
if (isTmuxSession && colDelta > 5) {
  // Lock during clear to prevent isWrapped error from concurrent writes
  isResizingRef.current = true
  xtermRef.current.clear()
  isResizingRef.current = false
  writeQueueRef.current = []  // Discard stale data
}

// Then trigger resize trick to force tmux to redraw fresh
triggerResizeTrick()
```

**Why This Works:**
1. `clear()` wipes xterm's buffer - no content to reflow
2. `triggerResizeTrick()` sends SIGWINCH to tmux
3. Tmux redraws everything formatted for new dimensions
4. Fresh content renders correctly in empty xterm

**Why >5 Columns Threshold:**
- Small changes (≤5 cols) rarely cause visible corruption
- Large changes (>5 cols) trigger significant reflow that corrupts complex ANSI
- The threshold avoids unnecessary clears during minor adjustments

**Critical:** Protect `clear()` with resize lock! Without it, concurrent WebSocket writes crash xterm with "Cannot set properties of undefined (setting 'isWrapped')" error.

## Resources

### references/

This skill includes detailed reference documentation organized by topic:

- `refs-state-patterns.md` - Ref management patterns and examples
- `websocket-patterns.md` - WebSocket communication and backend routing
- `react-hooks-patterns.md` - React hooks refactoring workflows
- `testing-checklist.md` - Comprehensive testing workflows
- `split-terminal-patterns.md` - Split terminal and detach/reattach patterns
- `advanced-patterns.md` - Advanced patterns (emoji width fix, mouse coordinate transformation, tmux reconnection)
- `resize-patterns.md` - Resize coordination and output handling

Load these references as needed when working on specific aspects of terminal development.

**Highlights from advanced-patterns.md:**
- **Unicode11 Addon** - Fix emoji/Unicode width issues (2 days of debugging → 1 line fix)
- **Mouse Coordinate Transformation** - Handle CSS zoom/transform on terminal containers
- **Tmux Reconnection Best Practices** - Prevent reconnecting to wrong sessions

### scripts/

No scripts included - xterm.js integration is primarily about patterns and architecture, not executable utilities.

### assets/

No assets included - this skill focuses on best practices and patterns rather than templates.
