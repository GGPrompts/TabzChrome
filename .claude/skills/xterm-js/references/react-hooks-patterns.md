# React Hooks Refactoring Patterns

This document covers patterns for extracting custom hooks from React components, with specific focus on xterm.js terminal implementations.

## Critical Pattern: Identify Shared Refs Before Extracting

### The Problem

When extracting custom hooks that manage shared resources, creating refs internally breaks ref sharing. Terminal components end up with `null` refs.

### Example Bug: useWebSocketManager

**Before Refactoring:**
```typescript
// SimpleTerminalApp.tsx - All in one component
function SimpleTerminalApp() {
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    // Create WebSocket
    wsRef.current = new WebSocket(WS_URL)

    wsRef.current.onmessage = (event) => {
      // Handle messages
    }
  }, [])

  return (
    <>
      {terminals.map(terminal => (
        <Terminal
          wsRef={wsRef}  // All terminals share same WebSocket
          {...terminal}
        />
      ))}
    </>
  )
}
```

**After Refactoring (BROKEN):**
```typescript
// useWebSocketManager.ts - Hook creates its own ref
export function useWebSocketManager(...) {
  const wsRef = useRef<WebSocket | null>(null)  // ❌ Creates NEW ref!

  useEffect(() => {
    // Create WebSocket connected to this internal ref
    wsRef.current = new WebSocket(WS_URL)
  }, [])

  return { /* ... */ }
}

// SimpleTerminalApp.tsx - Parent still has old ref
function SimpleTerminalApp() {
  const wsRef = useRef<WebSocket | null>(null)  // ❌ Different ref!
  useWebSocketManager(...)  // Hook uses its own ref

  return (
    <>
      {terminals.map(terminal => (
        <Terminal
          wsRef={wsRef}  // ❌ Terminal gets NULL WebSocket!
          {...terminal}
        />
      ))}
    </>
  )
}
```

**Result:** Terminals completely broken. Typing doesn't work, TUI tools fail, everything breaks.

### The Fix: Pass Refs as Parameters

```typescript
// useWebSocketManager.ts - Accept ref as parameter
export function useWebSocketManager(
  wsRef: React.MutableRefObject<WebSocket | null>,  // ✅ Pass as parameter
  terminals: Terminal[],
  // ... other params
) {
  useEffect(() => {
    // Use parent's ref - all components share same WebSocket
    wsRef.current = new WebSocket(WS_URL)

    wsRef.current.onmessage = (event) => {
      // Handle messages
    }
  }, [])

  return { /* ... */ }
}

// SimpleTerminalApp.tsx - Pass ref to hook
function SimpleTerminalApp() {
  const wsRef = useRef<WebSocket | null>(null)

  useWebSocketManager(
    wsRef,  // ✅ Pass ref to hook
    terminals,
    // ... other params
  )

  return (
    <>
      {terminals.map(terminal => (
        <Terminal
          wsRef={wsRef}  // ✅ Terminal gets same WebSocket ref
          {...terminal}
        />
      ))}
    </>
  )
}
```

## Checklist Before Extracting Hooks

### Step 1: Map Out All Refs

Before extracting, create a diagram of ref usage:

```
wsRef (WebSocket)
├── Created in: SimpleTerminalApp
├── Used in: useWebSocketManager (will extract here)
├── Passed to: Terminal components (multiple instances)
└── Decision: MUST pass as parameter (shared across components)

terminalRef (DOM element)
├── Created in: Terminal component
├── Used in: useTerminalResize (will extract here)
├── Passed to: ResizeObserver only
└── Decision: Can create in hook (not shared)

xtermRef (xterm.js instance)
├── Created in: Terminal component
├── Used in: useTerminalResize, useTerminalInput
├── Passed to: Multiple hooks
└── Decision: MUST pass as parameter (shared across hooks)
```

### Step 2: Identify Shared vs. Local Refs

**Shared Refs (pass as parameter):**
- Used by multiple components
- Used by multiple hooks
- Passed to child components
- WebSocket refs, xterm instances, shared DOM refs

**Local Refs (create in hook):**
- Only used within the hook
- Not passed to other components
- ResizeObserver instances, event handler refs

### Step 3: Check TypeScript Signatures

```typescript
// If ref is shared, accept it as parameter:
export function useWebSocketManager(
  wsRef: React.MutableRefObject<WebSocket | null>,  // Shared
  // ...
) { }

// If ref is local, create in hook:
export function useTerminalResize(...) {
  const resizeObserverRef = useRef<ResizeObserver | null>(null)  // Local
  // ...
}
```

## useEffect Dependencies Pattern

### The Problem

If a useEffect checks a ref and returns early, without proper dependencies it may never set up.

### Example Bug: ResizeObserver Setup

```typescript
// BROKEN - Only runs once
useEffect(() => {
  if (!terminalRef.current) return  // Returns if null

  // Set up ResizeObserver
  const observer = new ResizeObserver(() => {
    fitAddon.fit()
  })
  observer.observe(terminalRef.current)

  return () => observer.disconnect()
}, [])  // ❌ Never re-runs!

// If terminalRef.current is null when this runs (during initialization),
// ResizeObserver is NEVER set up! Terminal stays tiny forever.
```

### The Fix: Include ref.current in Dependencies

```typescript
// FIXED - Re-runs when ref becomes available
useEffect(() => {
  if (!terminalRef.current) return  // Returns if null

  // Set up ResizeObserver
  const observer = new ResizeObserver(() => {
    fitAddon.fit()
  })
  observer.observe(terminalRef.current)

  return () => observer.disconnect()
}, [terminalRef.current])  // ✅ Re-runs when ref changes!
```

### Pattern: Wait for Multiple Refs

Common in xterm.js apps - wait for DOM ref AND library instances:

```typescript
useEffect(() => {
  // Early return if ANY ref is missing
  if (!terminalRef.current?.parentElement ||
      !xtermRef.current ||
      !fitAddonRef.current) {
    return  // Wait for all refs
  }

  // All refs available - safe to set up
  const observer = new ResizeObserver(() => {
    fitAddonRef.current.fit()
  })
  observer.observe(terminalRef.current.parentElement)

  return () => observer.disconnect()
}, [
  terminalRef.current,      // ✅ Re-run when DOM ref ready
  xtermRef.current,         // ✅ Re-run when xterm ready
  fitAddonRef.current       // ✅ Re-run when fitAddon ready
])
```

## Testing After Extraction

### Critical Rule: Test Real Usage Immediately

TypeScript compilation ≠ working code. After extracting a hook, test immediately:

```bash
# Step 1: Check TypeScript
npm run build

# Step 2: Visual testing
# Open http://localhost:5173

# Step 3: Test spawn
# Spawn a terminal - does it appear?

# Step 4: Test input (WebSocket)
# Type in terminal - does it echo?

# Step 5: Test resize (ResizeObserver)
# Resize window - does terminal resize?

# Step 6: Test complex interactions
# Spawn htop or vim - do TUI tools work?

# Step 7: Check logs
# Browser console - any errors?
tmux capture-pane -t tabz:backend -p -S -50

# Step 8: Run test suite
npm test
```

### What to Test After Extracting Each Hook

**After extracting useWebSocketManager:**
- [ ] WebSocket connects (check browser DevTools Network tab)
- [ ] Can spawn new terminal
- [ ] Can type in terminal (input → output loop)
- [ ] Reconnection works after refresh

**After extracting useTerminalResize:**
- [ ] Terminal fills container initially
- [ ] Terminal resizes when window resizes
- [ ] Split terminals resize correctly
- [ ] No resize loops (check performance)

**After extracting useKeyboardShortcuts:**
- [ ] Keyboard shortcuts work (Ctrl+T, etc.)
- [ ] Shortcuts don't conflict with terminal input
- [ ] Modifiers work correctly (Ctrl, Alt, Shift)

**After extracting useTerminalSpawning:**
- [ ] Can spawn different terminal types
- [ ] Spawn options modal works
- [ ] Working directory validation works
- [ ] Error handling shows user-friendly messages

## Common Anti-Patterns

### ❌ Don't Batch Multiple Hook Extractions

```bash
# WRONG - Extract multiple hooks before testing
git commit -m "Extract useWebSocketManager, useTerminalResize, useKeyboardShortcuts"
# Test once at the end
# If something breaks, hard to know which extraction caused it
```

```bash
# RIGHT - Extract one hook at a time
git commit -m "Extract useWebSocketManager"
npm run build && npm test  # Test immediately
git commit -m "Extract useTerminalResize"
npm run build && npm test  # Test immediately
# Easy to identify which extraction broke things
```

### ❌ Don't Trust TypeScript Alone

```typescript
// TypeScript says this is fine:
export function useWebSocketManager(...) {
  const wsRef = useRef<WebSocket | null>(null)
  // Compiles successfully!
}

// But terminals are completely broken in browser
// Terminal components have null WebSocket
```

### ❌ Don't Skip Visual Testing

```bash
# WRONG - Only automated tests
npm run build && npm test  # Passes!
git commit

# But terminals look broken in UI:
# - Tiny size (ResizeObserver not set up)
# - Can't type (WebSocket ref broken)
# - Wrong layout (CSS issues)
```

### ❌ Don't Forget About Timing

```typescript
// Looks fine but has race condition:
useEffect(() => {
  setupTerminal()  // Runs on mount
}, [])

// What if refs aren't ready yet?
// Include ref.current in dependencies!
```

## Refactoring Workflow

### Safe Refactoring Process

1. **Map refs** - Diagram which components/hooks use which refs
2. **Choose one hook** - Don't batch extractions
3. **Identify shared refs** - Will they be passed as parameters?
4. **Update dependencies** - Check all useEffect dependencies
5. **Extract the hook** - Create new file
6. **Update imports** - Fix TypeScript errors
7. **Test immediately** - Full testing checklist above
8. **Commit if working** - Small, testable commits
9. **Repeat** - Move to next hook

### Recovery from Broken Extraction

If testing reveals issues:

```bash
# Option 1: Fix immediately (if obvious)
# Fix the ref parameter, update dependencies, test again

# Option 2: Rollback and try smaller extraction
git reset --hard HEAD~1
# Extract smaller piece next time
```

## Files to Reference

- `src/hooks/useWebSocketManager.ts` - wsRef parameter pattern (line 1-50)
- `src/hooks/useTerminalResize.ts` - ref.current dependencies (line 30-60)
- `src/SimpleTerminalApp.tsx` - Parent passes wsRef to hooks (line 100-150)
- `docs/lessons-learned/react-patterns.md` - Complete refactoring lessons
