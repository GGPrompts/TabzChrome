# React Patterns Lessons

Lessons related to React hooks, state management, performance optimization, and refactoring.

> **See Also:** The `tabz-development` skill contains patterns for working on the TabzChrome codebase.

---

## Clear Refs When State Changes

### Lesson: Refs Persist Across State Changes (Nov 13, 2025)

**Problem:** Detach/reattach broke because `processedAgentIds` ref wasn't cleared when detaching terminals.

**What Happened:**
1. Terminal detached → `agentId` cleared from state
2. Terminal reattached → Backend returned **same agentId** (reconnecting to same PTY)
3. Frontend checked `processedAgentIds.current.has(agentId)` → returned `true`
4. Frontend ignored `terminal-spawned` message → terminal stuck in "spawning" state forever

**Root Cause:** Refs persist across state changes. When you clear state (`agentId: undefined`), you must also clear related refs.

**Solution:**
```typescript
// When detaching, clear from both state AND ref:
if (terminal.agentId) {
  clearProcessedAgentId(terminal.agentId)  // Clear ref
}
updateTerminal(id, { agentId: undefined })  // Clear state
```

**Key Insight:**
- State (Zustand) = what the terminal is
- Refs (useRef) = what we've processed
- When state changes, check if related refs need updating!

**Files:**
- `extension/sidepanel/sidepanel.tsx:747-750, 839-842`
- `extension/hooks/useTerminalSessions.ts:515-517`

---

## Identify Shared Refs Before Extracting Hooks

### Lesson: Hook Creates Own Ref vs Shared Ref (Nov 10, 2025)

**Problem:** After extracting `useWebSocketManager` hook, all terminal input stopped working. Typing, TUI tools, everything was broken.

**Root Cause:** Hook created its own internal `wsRef` instead of using the shared one from parent component. Terminal components had `null` WebSocket reference.

**Wrong Approach:**
```typescript
// WRONG - creates new ref
export function useWebSocketManager(...) {
  const wsRef = useRef<WebSocket | null>(null)  // Creates NEW ref!
}

// Parent component passes different ref to children
<Terminal wsRef={wsRef} />  // Terminal gets null!
```

**Right Approach:**
```typescript
// RIGHT - uses shared ref
export function useWebSocketManager(
  wsRef: React.MutableRefObject<WebSocket | null>,  // Pass as parameter
  ...
) {
  // Hook uses parent's ref, all components share same WebSocket
}
```

**Checklist Before Extracting Hooks:**
- [ ] Map out all refs (diagram which components use which refs)
- [ ] Check if ref is used outside the hook
- [ ] If ref is shared → pass as parameter, don't create internally
- [ ] Test with real usage immediately after extraction

**Files:**
- `extension/hooks/useTerminalSessions.ts` - wsRef parameter pattern
- `extension/sidepanel/sidepanel.tsx` - Parent passes wsRef to hook

---

## useEffect Dependencies Must Include ref.current for Initialization

### Lesson: Early Returns Need Corresponding Dependencies (Nov 10, 2025)

**Problem:** Terminals stayed at tiny size after refactoring resize logic.

**Root Cause:** ResizeObserver setup had early return if `terminalRef.current` was null, but `terminalRef.current` wasn't in dependency array. If null at mount, ResizeObserver was NEVER set up.

```typescript
// WRONG - only runs once, may return early forever
useEffect(() => {
  if (!terminalRef.current) return  // Returns if null
  // Setup ResizeObserver
}, [])  // Never re-runs!

// RIGHT - re-runs when ref becomes available
useEffect(() => {
  if (!terminalRef.current) return
  // Setup ResizeObserver
}, [terminalRef.current])  // Re-runs when ref changes!
```

**Prevention:**
- If useEffect checks a ref and returns early → add `ref.current` to dependencies
- Test initialization timing (refs may be null on first render)
- Common pattern: Wait for DOM refs AND library instances (xterm) before setup

**Files:**
- `extension/components/Terminal.tsx` - ResizeObserver retry pattern

---

## Test Real Usage Immediately After Refactoring

### Lesson: TypeScript Compilation != Working Code (Nov 10, 2025)

**Problem:** TypeScript compiled successfully after refactoring, but terminals were completely broken in production.

**Refactoring Checklist:**
```bash
# After refactoring:
npm run build              # 1. Check TypeScript
# Open http://localhost:5173
# Spawn terminal            # 2. Test spawning
# Type in terminal          # 3. Test input (WebSocket)
# Resize window             # 4. Test resize (ResizeObserver)
# Spawn TUI tool like htop  # 5. Test complex ANSI sequences
```

**Prevention:**
- Don't batch multiple hook extractions (extract one, test, commit)
- Create refactoring checklist and follow it religiously
- If something breaks, rollback immediately and extract smaller pieces

---

## React.memo + Smart Comparison Prevents Re-render Spam

### Lesson: Prevent Component Re-renders During High-Frequency Events (Nov 12, 2025)

**Problem:** Split terminals were choppy during resize - component rendering hundreds of times per second.

**Root Cause:**
1. Parent creating new arrays on every render via `.filter()`
2. No memoization on SplitLayout component
3. Props changing reference on every parent render

**Solution:**
```typescript
// 1. Memoize computed arrays in parent
const visibleTerminals = useMemo(() =>
  storedTerminals.filter(t => t.windowId === currentWindowId),
  [storedTerminals, currentWindowId]
)

// 2. Wrap component with React.memo + custom comparison
export const SplitLayout = memo(SplitLayoutComponent, (prevProps, nextProps) => {
  return (
    prevProps.terminal.id === nextProps.terminal.id &&
    prevProps.terminal.splitLayout?.type === nextProps.terminal.splitLayout?.type &&
    prevProps.activeTerminalId === nextProps.activeTerminalId &&
    prevProps.terminals.length === nextProps.terminals.length &&
    JSON.stringify(prevProps.terminal.splitLayout?.panes) ===
      JSON.stringify(nextProps.terminal.splitLayout?.panes)
  )
})
```

**Impact:** Reduced renders from ~200/second to ~20/second (90% reduction!)

**Key Insight:**
- Always pass memoized arrays/objects as props, not inline computations
- Use React.memo with custom comparison for components with complex props
- Check parent render behavior, not just component itself

**Files:**
- `extension/components/SplitLayout.tsx` - React.memo implementation
- `extension/sidepanel/sidepanel.tsx` - useMemo for visibleTerminals

---

## Throttle High-Frequency Events, Debounce Final Actions

### Lesson: Throttle vs Debounce (Nov 12, 2025)

**Problem:** Terminal refit happening hundreds of times per second during drag.

**Root Cause:** `onResize` fires on every mousemove during drag (no rate limiting).

**Solution:**
```typescript
// Throttle: Allow max 10 refits/second during drag
const triggerTerminalRefitThrottled = () => {
  const now = Date.now()
  const timeSinceLastRefit = now - lastRefitTimeRef.current

  if (timeSinceLastRefit >= 100) {  // 100ms = 10/sec
    window.dispatchEvent(new Event('terminal-container-resized'))
    lastRefitTimeRef.current = now
  }
}

// Debounce: Wait 150ms after last resize before final refit
const triggerTerminalRefit = () => {
  if (refitTimeoutRef.current) clearTimeout(refitTimeoutRef.current)
  refitTimeoutRef.current = setTimeout(() => {
    window.dispatchEvent(new Event('terminal-container-resized'))
  }, 150)
}

// Use both:
<ResizableBox
  onResize={() => triggerTerminalRefitThrottled()}  // During drag
  onResizeStop={() => triggerTerminalRefit()}       // After drag
/>
```

**When to Use Each:**
- **Throttle:** High-frequency events where you want live feedback (resize, scroll, mousemove)
- **Debounce:** Actions that should only run after user stops (search, save, final refit)
- Combine both for smooth UX: throttled live feedback + debounced final action

**Files:**
- `extension/components/SplitLayout.tsx:100-119` - Throttle + debounce implementation

---

## Remove Debug Logging Before Committing

### Lesson: Clean Up High-Frequency Logs (Nov 12, 2025)

**Problem:** Console spam making debugging impossible, performance impact.

**What to Remove:**
```typescript
// ❌ REMOVE BEFORE COMMIT
console.log('[SplitLayout] Rendering split:', {...})  // Logs 200x/second
console.log('[Terminal] Focus event:', event)         // Logs constantly
```

**What to Keep:**
```typescript
// ✅ KEEP - Important state changes
console.log('[SimpleTerminalApp] Detaching from tmux session:', sessionName)

// ✅ KEEP - Error conditions
console.error('[WebSocket] Connection failed:', error)

// ✅ KEEP - Warnings about unexpected states
console.warn('[Terminal] agentId not found for terminal:', terminalId)
```

**Prevention:**
```typescript
// Use a debug flag
const DEBUG = false
if (DEBUG) console.log('[Component] Rendering...')
```

---

**Last Updated:** December 13, 2025
