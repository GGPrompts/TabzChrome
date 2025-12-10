# Lessons Learned - Tabz

This document captures important debugging lessons, gotchas, and best practices discovered during development.

---

## Tmux Status Bar Position

### Lesson: Put Tmux Status Bar at TOP When Running Claude Code (Dec 9, 2025)

**Problem**: Tmux status bar would disappear and show terminal content from above the viewport in its place.

**What Happened:**
1. During Claude Code output (especially diffs with ANSI colors), the green tmux status bar at bottom would vanish
2. In its place, a line of terminal content that should be *above* the visible area would appear
3. The corruption also triggered during sidebar resize or extension reload
4. `Ctrl+L` didn't fix it; `Ctrl+a r` (reload tmux config) temporarily fixed it but it recurred

**Root Cause**: Scroll region conflict between tmux and Claude Code's dynamic statusline.

- Tmux uses escape codes (`\e[1;24r`) to define scroll regions, protecting the status bar
- Claude Code has its own statusline at the bottom that can **grow/shrink dynamically** (tool use, subagents, bypass mode)
- When both compete for the bottom rows, scroll region calculations get corrupted
- The row "above" the viewport bleeds into where the status bar should be

**Solution**: Move tmux status bar to the **top**:
```bash
# In .tmux-terminal-tabs.conf
set -g status-position top
```

This gives each their own space:
- Tmux status bar → top (static, 1 row)
- Claude Code statusline → bottom (dynamic, 1-2 rows)

**What Didn't Work:**
- `tmux refresh-client` - only redraws, doesn't fix scroll regions
- `tmux resize-window` trick - caused visual artifacts (dots around terminal)
- Removing dynamic `#{pane_current_path}` from status - didn't help
- Removing Claude status script from status bar - didn't help
- Debounced resize tricks in Terminal.tsx - helped but didn't fully fix

**Key Insight**:
- When two systems manage the same screen area (bottom rows), scroll region bugs are inevitable
- The fix isn't better timing or refresh logic - it's **separation of concerns**
- Put tmux status at top, let Claude Code own the bottom

**Files**:
- `.tmux-terminal-tabs.conf:60-64` - status-position top
- `extension/components/Terminal.tsx:65-84` - scheduleTmuxRefresh (still useful for resize recovery)

---

## Polling State and UI Flicker

### Lesson: Debounce Polled State Changes to Prevent UI Flashing (Dec 7, 2025)

**Problem**: Claude status tabs were flashing between showing status and showing name.

**What Happened:**
1. `useClaudeStatus` hook polled every 2 seconds
2. Each poll created a new Map and replaced the old one
3. If API briefly returned `unknown` (during tool execution), terminal disappeared from map
4. Tab instantly switched from "🤖 🔧 Read: file.tsx" to "Bash"
5. Next poll returned valid status, tab switched back
6. Result: Constant flashing during active Claude work

**Root Cause**: Replacing entire state on every poll. Any transient failure caused immediate UI change.

**Solution**: Use a "miss counter" with threshold before removing entries:
```typescript
const MISS_THRESHOLD = 3  // 3 polls × 2s = 6 seconds grace

const missCountsRef = useRef<Map<string, number>>(new Map())

// In poll callback:
if (result.success && result.status !== 'unknown') {
  missCountsRef.current.set(id, 0)  // Reset on success
  newStatuses.set(id, result.status)
} else {
  const misses = (missCountsRef.current.get(id) || 0) + 1
  missCountsRef.current.set(id, misses)

  // Keep previous status until threshold exceeded
  if (misses < MISS_THRESHOLD && prevStatuses.has(id)) {
    newStatuses.set(id, prevStatuses.get(id)!)
  }
}
```

**Key Insight**:
- Transient failures are normal in polling systems
- Don't immediately reflect failures in UI - add grace period
- Use refs for counters (don't trigger re-renders for tracking state)
- Pattern applies to any polled data that affects UI

**Files**:
- `extension/hooks/useClaudeStatus.ts:41-120`

---

## Refs and State Management

### Lesson: Clear Refs When State Changes (Nov 13, 2025)

**Problem**: Detach/reattach broke because `processedAgentIds` ref wasn't cleared when detaching terminals.

**What Happened:**
1. Terminal detached → `agentId` cleared from state
2. Terminal reattached → Backend returned **same agentId** (reconnecting to same PTY)
3. Frontend checked `processedAgentIds.current.has(agentId)` → returned `true`
4. Frontend ignored `terminal-spawned` message → terminal stuck in "spawning" state forever

**Root Cause**: Refs persist across state changes. When you clear state (`agentId: undefined`), you must also clear related refs.

**Solution**:
```typescript
// When detaching, clear from both state AND ref:
if (terminal.agentId) {
  clearProcessedAgentId(terminal.agentId)  // Clear ref
}
updateTerminal(id, { agentId: undefined })  // Clear state
```

**Key Insight**:
- State (Zustand) = what the terminal is
- Refs (useRef) = what we've processed
- When state changes, check if related refs need updating!

**Files**:
- `src/SimpleTerminalApp.tsx:747-750, 839-842`
- `src/hooks/useWebSocketManager.ts:515-517`

---

## WebSocket Message Types

### Lesson: 'close' vs 'disconnect' - Know Your Destructive Operations (Nov 13, 2025)

**Problem**: Detaching terminals killed their tmux sessions.

**What Happened:**
```typescript
// WRONG - This KILLS the tmux session!
wsRef.current.send(JSON.stringify({
  type: 'close',
  terminalId: terminal.agentId,
}))
```

**Root Cause**: Backend has two close behaviors:
- `case 'disconnect'`: Graceful disconnect, keep tmux session alive
- `case 'close'`: **Force close and KILL tmux session** (backend/server.js:254)

**Solution**: For detach, only call the API endpoint - don't send WebSocket message:
```typescript
// CORRECT - Let PTY disconnect naturally
await fetch(`/api/tmux/detach/${sessionName}`, { method: 'POST' })
// Don't send WebSocket 'close' message!
```

**Key Insight**:
- Read backend code to understand what each message type does
- "Close" often means "destroy" in WebSocket contexts
- For non-destructive operations, use API endpoints only

**Files**:
- `backend/server.js:240-256` - Close message handler
- `backend/routes/api.js:714-744` - Safe detach endpoint
- `src/SimpleTerminalApp.tsx:743-744, 833-835` - Removed close messages

---

## Split Terminal Architecture

### Lesson: Split Container IS the Terminal (Nov 14, 2025)

**Problem**: Unsplitting caused one terminal to disappear completely.

**What Happened:**
1. User drags Terminal A onto Terminal B to create split
2. User unsplits by popping out Terminal A
3. Terminal B disappeared! Only Terminal A remained visible

**Root Cause**: Misunderstanding of split architecture:
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

**Wrong Fix (What We Tried First)**:
```typescript
// Delete the container when 1 pane remains
removeTerminal(splitContainer.id)  // ❌ DELETES Terminal B!
```

**Correct Fix**:
```typescript
// Clear the split layout, don't delete the container
updateTerminal(splitContainer.id, {
  splitLayout: { type: 'single', panes: [] }  // ✓ Converts B back to normal terminal
})
```

**Key Insights**:
- Split container = one of the original terminals, not a wrapper
- The container terminal keeps its ID, name, theme, etc.
- Never delete the container - just clear its `splitLayout` property
- Check if remaining pane IS the container before unhiding

**Prevention Checklist**:
- [ ] Does this operation delete a terminal that might be a split container?
- [ ] Could the pane I'm operating on be the container itself?
- [ ] Am I clearing state vs. deleting entities?

**Files**:
- `src/SimpleTerminalApp.tsx:1392-1408` - Fixed unsplit logic
- `src/hooks/useDragDrop.ts:277-283` - How splits are created

---

## Multi-Window State Synchronization

### Lesson: Cross-Window State Changes Require Local Cleanup (Nov 14, 2025)

**Problem**: After detaching terminal in Window B, Window A showed terminal stuck on "reconnecting" forever.

**What Happened:**
1. Window A: Terminal connected with active WebSocket agent
2. Window B: User clicks "Detach" on same terminal
3. Window B: Calls backend, updates state, broadcasts to Window A
4. Window A: Receives broadcast, updates terminal status to 'detached'
5. Window A: **But WebSocket agent still exists!**
6. Window A: Terminal shows "reconnecting" because `status='detached'` but `agent` exists

**Root Cause**: Zustand store syncs via BroadcastChannel, but WebSocket agents are local React state:
```typescript
// Window B detaches:
updateTerminal(id, { status: 'detached', agentId: undefined })  // Syncs via broadcast

// Window A receives broadcast:
setState({ terminals: [...] })  // ✓ Terminal updated
// But webSocketAgents state is NOT synced! ❌
```

**Solution**: Monitor terminal status changes and clean up local agents:
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

**Key Insights**:
- BroadcastChannel only syncs what you explicitly send (Zustand state)
- Local React state (agents, refs) doesn't sync automatically
- When remote window changes terminal status, local window must clean up side effects
- Status changes can come from broadcasts, not just local actions

**Prevention Checklist**:
- [ ] Does this terminal have local side effects? (WebSocket, refs, timers)
- [ ] Can terminal status change via broadcast from another window?
- [ ] Do we watch for status changes and clean up local state?
- [ ] Are we handling both local AND remote state changes?

**Anti-Pattern to Avoid**:
```typescript
// ❌ Only handling local detach
const handleDetach = () => {
  updateTerminal(id, { status: 'detached' })
  setWebSocketAgents(prev => prev.filter(...))  // Only runs in this window!
}
```

**Correct Pattern**:
```typescript
// ✓ Handle both local and remote detach
const handleDetach = () => {
  updateTerminal(id, { status: 'detached' })  // Syncs to other windows
  setWebSocketAgents(prev => prev.filter(...))  // Local cleanup
}

// ✓ Also watch for remote detach
useEffect(() => {
  // Clean up agents for terminals detached in other windows
}, [storedTerminals.status])
```

**Files**:
- `src/hooks/useWebSocketManager.ts:115-140` - Agent cleanup on detach
- `src/SimpleTerminalApp.tsx:544-581` - BroadcastChannel state sync

---

## Debugging Patterns

### Pattern: Add Diagnostic Logging Before Fixing

When debugging complex state issues, add comprehensive logging first:

```typescript
// BEFORE fixing, add logging to understand the problem:
console.log('[useWebSocketManager] 📨 Received terminal-spawned:', {
  agentId: message.data.id,
  requestId: message.requestId,
  sessionName: message.data.sessionName,
  pendingSpawnsSize: pendingSpawns.current.size
})

// Log each fallback attempt:
if (!existingTerminal) {
  existingTerminal = storedTerminals.find(t => t.requestId === message.requestId)
  console.log('[useWebSocketManager] 🔍 Checking by requestId:', existingTerminal ? 'FOUND' : 'NOT FOUND')
}
```

**Benefits**:
1. Shows exactly which code path is executing
2. Reveals data mismatches (wrong ID, missing state, etc.)
3. Helps users self-diagnose issues
4. Can be left in for production debugging

**Files**: `src/hooks/useWebSocketManager.ts:118-157`

---

## Multi-Step State Changes

### Pattern: Handle All Side Effects When Changing State

When a state change affects multiple systems, update all of them:

**Checklist for Terminal State Changes**:
- [ ] Update Zustand state (terminal properties)
- [ ] Clear/update refs (processedAgentIds, pending spawns)
- [ ] Notify WebSocket (if needed)
- [ ] Clean up event listeners
- [ ] Update localStorage (if using persist)

**Example (Detach)**:
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

**Anti-Pattern**: Only updating state and forgetting side effects.

---

## Session Naming & Reconnection

### Pattern: Use Consistent Session Identifiers

**Lesson**: When reconnecting, the backend needs to find the existing PTY. Use the existing `sessionName` (not a new one):

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

**Key Insight**: Tmux sessions have stable names. Use them as the source of truth for reconnection.

**Files**: `src/hooks/useTerminalSpawning.ts:246-247`

---

## Testing Detach/Reattach

### Checklist: How to Verify Detach Works Correctly

```bash
# 1. Spawn terminal
# Right-click → spawn Claude Code

# 2. Detach
# Right-click tab → Detach

# 3. Verify session survived
tmux ls | grep tt-cc-
# Should show: tt-cc-xxx: 1 windows (created ...) (attached)

# 4. Reattach
# Click detached tab

# 5. Check console logs (should see):
# [SimpleTerminalApp] Detaching from tmux session: tt-cc-xxx
# [SimpleTerminalApp] Clearing processedAgentId: 1810f662
# [SimpleTerminalApp] ✓ Detached from session: tt-cc-xxx
# [useWebSocketManager] 📨 Received terminal-spawned: {...}
# [useWebSocketManager] 🔍 Checking pendingSpawns: FOUND
# [useWebSocketManager] ✅ Matched terminal: terminal-xxx

# 6. Terminal should be active and responsive immediately
```

---

## Split Terminal Operations

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

**Key Difference**:
- Close = permanent deletion + kills tmux
- Detach = temporary suspension + preserves tmux

### Bug: Clicking Detached Pane Tab Only Reattached One Terminal (Nov 13, 2025)

**Problem**: After detaching a split, clicking on a **pane tab** (not container) only reconnected that one pane as a single terminal. The split was lost.

**What Happened**:
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

**Root Cause**: Code didn't check if the terminal being reattached was a PANE in a detached split. It only checked if the terminal itself was a container.

**Solution**: Before reattaching, check if terminal is part of a detached split container. If yes, reattach the container instead:

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

**Result**: Clicking any detached pane tab now restores the entire split with all panes!

**Files**: `src/SimpleTerminalApp.tsx:864-878`

---

## React Hooks & Refactoring

### Lesson: Identify Shared Refs Before Extracting Hooks (Nov 10, 2025)

**Problem:** After extracting `useWebSocketManager` hook, all terminal input stopped working. Typing, TUI tools, everything was broken.

**Root Cause:** Hook created its own internal `wsRef` instead of using the shared one from parent component. Terminal components had `null` WebSocket reference.

**Key Insight:**
- **Identify shared refs BEFORE extracting hooks**:
  - If a ref is used by both hook AND child components → pass as parameter
  - WebSocket refs, DOM refs, library instance refs must be shared
  - **Rule:** If a ref is used by both the hook AND child components, pass it as a parameter!

**Wrong Approach:**
```typescript
// WRONG - creates new ref
export function useWebSocketManager(...) {
  const wsRef = useRef<WebSocket | null>(null)
  // Hook creates its own WebSocket
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

**Prevention:**
- Map out all refs before refactoring (diagram which components use which refs)
- Check if ref is used outside the hook
- Test with real usage immediately after extraction:
  ```bash
  npm run build              # 1. Check TypeScript
  # Open http://localhost:5173
  # Spawn terminal            # 2. Test spawning
  # Type in terminal          # 3. Test input (WebSocket)
  # Resize window             # 4. Test resize
  # Spawn TUI tool            # 5. Test complex interactions
  ```

**Files to Remember:**
- `src/hooks/useWebSocketManager.ts` - wsRef parameter pattern
- `src/SimpleTerminalApp.tsx` - Parent passes wsRef to hook

---

### Lesson: useEffect Dependencies Must Include ref.current for Initialization (Nov 10, 2025)

**Problem:** Terminals stayed at tiny size after refactoring resize logic.

**Root Cause:** ResizeObserver setup had early return if `terminalRef.current` was null, but `terminalRef.current` wasn't in dependency array. If null at mount, ResizeObserver was NEVER set up.

**Key Insight:**
- **Early returns need corresponding dependencies**:
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
- Use React DevTools to verify effects re-run when expected
- Common pattern: Wait for DOM refs AND library instances (xterm) before setup

**Files to Remember:**
- `src/hooks/useTerminalResize.ts` - ResizeObserver retry pattern

---

### Lesson: Test Real Usage Immediately After Refactoring (Nov 10, 2025)

**Problem:** TypeScript compiled successfully after refactoring, but terminals were completely broken in production.

**Key Insight:**
- **TypeScript compilation ≠ working code** - Always test with real usage:
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
- [ ] Check backend logs via `tmux capture-pane -t tabz:backend -p -S -50`
- [ ] Run test suite: `npm test`

**Prevention:**
- Don't batch multiple hook extractions (extract one, test, commit)
- Create refactoring checklist and follow it religiously
- If something breaks, rollback immediately and extract smaller pieces

---

## React Performance Optimization

### Lesson: React.memo + Smart Comparison Prevents Re-render Spam (Nov 12, 2025)

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
- `src/components/SplitLayout.tsx` - React.memo implementation
- `src/SimpleTerminalApp.tsx` - useMemo for visibleTerminals

**Reference:** `docs/SPLIT_PERFORMANCE_FIXES_v2.md`

---

### Lesson: Throttle High-Frequency Events, Debounce Final Actions (Nov 12, 2025)

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

**Key Insight:**
- Throttle = "do this at most X times per second"
- Debounce = "do this after user stops for X ms"
- Combine both for smooth UX: throttled live feedback + debounced final action

**Files:**
- `src/components/SplitLayout.tsx:100-119` - Throttle + debounce implementation

**Reference:** `docs/SPLIT_PERFORMANCE_FIXES_v2.md`, `docs/SPLIT_TERMINAL_FIXES.md`

---

### Lesson: Remove Debug Logging Before Committing (Nov 12, 2025)

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

**Key Insight:**
- Debug logging is great during development
- Clean it up before committing or make it conditional on DEBUG flag
- High-frequency logs (render, mousemove, resize) should always be removed

**Prevention:**
```typescript
// Use a debug flag
const DEBUG = false
if (DEBUG) console.log('[Component] Rendering...')
```

**Files:** `src/components/SplitLayout.tsx` (removed lines)

**Reference:** `docs/SPLIT_PERFORMANCE_FIXES_v2.md`

---

## xterm.js & Terminal Rendering

### Lesson: Tmux Sessions Need Different Resize Strategy (Nov 12, 2025)

**Problem:** Native tmux splits had flickering content, disappeared when clicking between panes.

**Root Cause:** Multiple resize events interfering with tmux's internal pane management:
- ResizeObserver firing on ANY container change (clicks, focus, layout)
- Focus events triggering resize
- Tab switch triggering resize
- ALL of these sent resize to PTY → tmux tried to resize → content cleared

**Solution - Tmux Resize Policy:**

**✅ DO resize for tmux:**
- ONCE on initial connection (sets viewport dimensions)
- ONLY on actual browser window resize

**❌ DON'T resize for tmux:**
- ResizeObserver events (don't even set it up!)
- Focus events
- Tab switching
- Container changes
- Hot refresh recovery

**Implementation:**
```typescript
// 1. Skip ResizeObserver setup entirely
if (useTmux) {
  console.log('[Resize] Skipping ResizeObserver (tmux session)')
  return  // Don't set up observer at all
}

// 2. Skip focus resize
if (!useTmux && isTerminalReady && fitAddon && xterm) {
  // Only send resize for non-tmux terminals
} else if (useTmux) {
  console.log('[Terminal] FOCUS (tmux): skipping resize')
}

// 3. Send initial resize ONLY ONCE
const initialResizeSentRef = useRef(false)
const shouldSendInitialResize = !useTmux || !initialResizeSentRef.current

if (shouldSendInitialResize) {
  sendResize()
  if (useTmux) initialResizeSentRef.current = true
}
```

**Why All 3 Are Needed:**
- Without #1: Container changes trigger resize
- Without #2: Clicking between panes triggers resize
- Without #3: Tab switching triggers resize

**Key Insight:**
- Native tmux splits = single xterm viewport showing entire session
- React splits = separate terminals → resize independently
- Tmux manages its own panes → only tell it the viewport size, then hands off

**Files:**
- `src/hooks/useTerminalResize.ts:129-131` - Skip ResizeObserver
- `src/components/Terminal.tsx:393-424` - Skip focus resize
- `src/components/Terminal.tsx:499-533` - Initial resize once

**Reference:** `docs/TMUX_RENDERING_FINAL.md`

---

### Lesson: Account for Fixed Headers in Layout Calculations (Nov 12, 2025)

**Problem:** Terminal was 47px too tall, causing tmux panes to overflow.

**Root Cause:** Fixed header (47px) not accounted for in xterm.js FitAddon calculations.

**Solution:**
```css
.terminal-display {
  padding-top: 47px;  /* Match header height exactly */
}
```

**Key Insight:**
- FitAddon calculates based on container dimensions
- Fixed/absolute positioned elements reduce available space
- Add padding to terminal container = FitAddon gets correct dimensions

**Prevention:**
- When adding fixed headers/footers, add corresponding padding to terminal container
- Test with `htop` or other TUI tools that use full terminal height

**Files:**
- `src/SimpleTerminalApp.css:1001-1018` - Header padding

**Reference:** `docs/TMUX_RENDERING_FINAL.md`

---

### Lesson: Tmux Splits Require Disabled EOL Conversion (Nov 14, 2025)

**Problem:** Tmux split panes corrupted each other - text from one pane bled into the other, split divider misaligned.

**What Happened:**
1. User spawns TFE terminal → works fine
2. User splits it horizontally/vertically → creates React split with two xterm instances
3. Both xterm instances connect to same tmux session (different panes)
4. Output corruption: bash terminal's newlines corrupt TFE's rendering
5. Split divider appears 1 space to the right on first 2 rows only

**Root Cause:** xterm.js EOL (End-of-Line) conversion was enabled for all terminals:

```typescript
// WRONG - Causes tmux corruption:
const xtermOptions = {
  convertEol: true,  // Converts \n to \r\n for ALL terminals
}
```

**Why This Breaks Tmux Splits:**
- Tmux sends properly formatted terminal sequences with `\n` (line feed)
- xterm with `convertEol: true` converts `\n` → `\r\n` (carriage return + line feed)
- **Each xterm instance** in the split converts the SAME tmux output independently
- Different conversion = different cursor positioning = panes corrupt each other
- The split divider is rendered by tmux, but xterm's extra `\r` shifts it

**Solution:** Conditionally disable EOL conversion for tmux sessions:

```typescript
// CORRECT - Let tmux manage its own line endings:
const xtermOptions = {
  // Disable EOL conversion for tmux - it manages terminal sequences
  convertEol: !isTmuxSession,  // Only convert for regular shells
  // Ensure UNIX-style line endings
  windowsMode: false,
}
```

**Why This Works:**
- **Tmux sessions**: `convertEol: false` → xterm displays raw PTY output without modification
- **Regular shells**: `convertEol: true` → xterm converts for proper display (Windows compatibility)
- Both xterm instances now handle tmux output identically → no corruption

**Key Insights:**
- Tmux is a terminal multiplexer - it manages its own terminal protocol
- When multiple xterm instances share one tmux session, they must handle output identically
- EOL conversion must be disabled to prevent double-processing of tmux sequences
- `windowsMode: false` ensures UNIX-style line endings (`\n` only, not `\r\n`)

**Debugging This Issue:**
```bash
# Symptoms:
# - Text from bash pane appears in TFE pane
# - Split divider offset on first few rows only
# - Newlines cause visual corruption between panes

# Check browser console for dimension mismatch:
[TmuxDimensions] Dimension mismatch for session tt-tfe-xxx!
  Current: 391x58 (full container width - WRONG!)
  Reference: 80x24 (correct tmux split size)
```

**Prevention Checklist:**
- [ ] Are you creating split terminals that share a tmux session?
- [ ] Do both xterm instances have identical EOL handling?
- [ ] Is `convertEol` conditional on `isTmuxSession`?
- [ ] Is `windowsMode: false` for tmux sessions?

**Files:**
- `src/components/Terminal.tsx:240-245` - Conditional EOL conversion
- `src/hooks/useTmuxSessionDimensions.ts` - Dimension tracking (prevents font mismatches)

**Related Issues:** Font normalization (both panes must use same font to get matching dimensions)

---

### Lesson: Backend Debouncing Prevents Dimension Thrashing (Nov 12, 2025)

**Problem:** Multiple resize events with slightly different dimensions (310 vs 308) hitting same PTY.

**Solution:**
```javascript
// Backend PTY handler
this.resizeTimers = new Map()
this.resizeDebounceMs = 300

// Debounce resize per terminal
clearTimeout(this.resizeTimers.get(terminalId))
this.resizeTimers.set(terminalId, setTimeout(() => {
  ptyProcess.resize(cols, rows)
}, this.resizeDebounceMs))
```

**Key Insight:**
- Even with frontend debouncing, multiple clients or race conditions can send rapid resizes
- Backend debouncing is last line of defense
- Last resize wins after timeout → prevents dimension thrashing in PTY

**Files:**
- `backend/modules/pty-handler.js:38-46, 487-564` - Debouncing

**Reference:** `docs/TMUX_RENDERING_FINAL.md`

---

## Testing Infrastructure

### Lesson: Mock Classes Need Constructor Syntax (Nov 12, 2025)

**Problem:** `ResizeObserver is not a constructor` error in tests.

**Root Cause:** Using `vi.fn().mockImplementation()` creates a function, not a class constructor.

**Wrong Approach:**
```typescript
// ❌ BROKEN - not a constructor
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn()
}))
```

**Right Approach:**
```typescript
// ✅ WORKS - class syntax
global.ResizeObserver = class ResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}
```

**Key Insight:**
- Browser APIs instantiated with `new` need class syntax
- Applies to: ResizeObserver, IntersectionObserver, WebSocket, etc.
- `vi.fn()` is for function mocks, not constructor mocks

**Prevention:**
- Check how the API is used: `new ResizeObserver()` → use class
- Test your test infrastructure first (smoke tests!)

**Files:**
- `tests/setup.ts` - Global mocks with class syntax

**Reference:** `docs/TEST_INFRASTRUCTURE_SUMMARY.md`

---

### Lesson: WebSocket Mocks Need Message Simulation (Nov 12, 2025)

**Problem:** Testing WebSocket interactions requires simulating server messages.

**Solution:**
```typescript
class MockWebSocket {
  constructor(url: string) {
    this.url = url
    this.readyState = WebSocket.CONNECTING
  }

  // Simulate server events
  simulateOpen() {
    this.readyState = WebSocket.OPEN
    this.onopen?.(new Event('open'))
  }

  simulateMessage(data: any) {
    this.onmessage?.(new MessageEvent('message', {
      data: JSON.stringify(data)
    }))
  }

  simulateClose() {
    this.readyState = WebSocket.CLOSED
    this.onclose?.(new CloseEvent('close'))
  }

  // Track sent messages
  getSentMessages() {
    return this.sentMessages
  }
}
```

**Key Insight:**
- WebSocket is bidirectional → need to mock both directions
- Track outgoing messages for assertions
- Simulate incoming messages for testing handlers
- Control ready state for connection lifecycle tests

**Files:**
- `tests/mocks/MockWebSocket.ts` - Full WebSocket mock

**Reference:** `docs/TEST_INFRASTRUCTURE_SUMMARY.md`

---

## Multi-Window Architecture

### Lesson: Backend Broadcasting Breaks Multi-Window (Nov 12, 2025)

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

**Reference:** CLAUDE.md "Critical Architecture (Popout Flow)"

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
- `src/components/SplitLayout.css` - Z-index hierarchy

**Reference:** `docs/SPLIT_TERMINAL_FIXES.md`

---

---

## Chat Input & Tmux Integration

### Lesson: Tmux Session Targets Don't Need Window/Pane Suffix (Dec 8, 2025)

**Problem:** Chat messages sent to plain bash terminals "disappeared into the void" - never appeared in terminal.

**What Happened:**
1. User types message in chat input for bash terminal
2. Frontend sends `TMUX_SESSION_SEND` with `sessionName: "ctt-defaultbash-a559de93"`
3. Backend constructs target as `${sessionName}:0.0` → `ctt-defaultbash-a559de93:0.0`
4. Runs `tmux send-keys -t ctt-defaultbash-a559de93:0.0 -l "test"`
5. Tmux error: `can't find window: 0`
6. Message silently lost

**Root Cause:** The `:0.0` suffix assumes window 0, pane 0 exists. But tmux sessions may:
- Have `base-index` set to 1 (windows start at 1, not 0)
- Have different window numbering due to config
- Only have the active window/pane

**Wrong Approach:**
```javascript
// ❌ BROKEN - assumes window 0 exists
const target = `${sessionName}:0.0`;
spawnSync('tmux', ['send-keys', '-t', target, '-l', text]);
```

**Right Approach:**
```javascript
// ✅ CORRECT - let tmux use current/active window
const target = sessionName;
spawnSync('tmux', ['send-keys', '-t', target, '-l', text]);
```

**Why This Works:**
- `tmux send-keys -t sessionName` targets the session's **current** window and pane
- No need to specify `:0.0` - tmux knows which pane is active
- Works regardless of `base-index` setting

**Verification:**
```bash
# This FAILS if base-index=1:
tmux send-keys -t ctt-bash-abc123:0.0 -l "test"
# Error: can't find window: 0

# This ALWAYS WORKS:
tmux send-keys -t ctt-bash-abc123 -l "test"
# Success - sends to current window/pane
```

**Key Insight:**
- Tmux session names are sufficient targets for send-keys
- Window/pane suffixes (`:0.0`) are only needed when targeting specific panes in multi-window sessions
- For single-window sessions (most terminal tabs), just use the session name

**Related Issue - defaultProfile Validation:**
Also discovered that `defaultProfile` setting can point to non-existent profile ID, causing spawn to skip profile entirely. Added auto-validation that fixes `defaultProfile` to first available profile if mismatch detected.

**Files:**
- `backend/server.js:325-328` - Removed `:0.0` suffix from tmux target
- `extension/sidepanel/sidepanel.tsx:519-535` - Auto-fix invalid defaultProfile
- `extension/components/SettingsModal.tsx:219-230` - Validate defaultProfile on load

---

## Chrome Extension Audio Notifications

### Lesson: Polling-Based Audio Misses Fast Tool Transitions (Dec 9, 2025)

**Problem:** Chrome extension audio notifications only announced ~1 tool out of 4-5, while WSL-based audio announced all of them.

**What Happened:**
1. Extension polls `/api/claude-status` every 1 second
2. Backend returns current status (`tool_use`, `processing`, `awaiting_input`) with tool name
3. Extension only triggered audio when `status === 'tool_use'`
4. But tools complete fast - by the time poll happens, status is often `processing` (post-tool)
5. Result: Most tools missed, only occasionally caught one

**Root Cause - Multiple Issues:**

1. **Status vs Tool Name**: Original code only announced when transitioning INTO `tool_use` status. But quick tools often show as `processing` with a tool name by the time poll catches them.

2. **Same-Status Transitions**: If Claude does Read → Grep → Glob quickly:
   - Poll 1: `processing (Read)`
   - Poll 2: `processing (Grep)` - status unchanged, tool changed!
   - Original code: `prevStatus !== 'tool_use'` → false, no announcement

3. **Build Not Deployed**: After fixing code, forgot to copy build to Windows location where Chrome loads extension from.

**Solution - Three Fixes:**

```typescript
// 1. Track tool NAME changes, not just status changes
const prevToolNamesRef = useRef<Map<string, string>>(new Map())

// 2. Announce on EITHER status transition OR tool name change
const isActiveStatus = currentStatus === 'tool_use' || currentStatus === 'processing'
const isNewTool = currentToolName !== '' && currentToolName !== prevToolName

if (audioSettings.events.tools && isActiveStatus && isNewTool) {
  playAudio(announcement, session, true)
}

// 3. Update prev tool after checking
prevToolNamesRef.current.set(terminalId, currentToolName)
```

**Also Required:**
- Reduce polling interval from 3s → 1s for better responsiveness
- Reduce tool debounce from 1000ms → 250ms to allow rapid announcements
- **Copy build to Windows**: `rsync -av dist-extension/ /mnt/c/Users/.../dist-extension/`

**Why WSL Audio Works Better:**
- WSL uses Claude Code hooks (`PreToolUse`) that fire **instantly** on every tool
- No polling - event-driven via `state-tracker.sh` → `audio-announcer.sh`
- Chrome extension can't use hooks directly, must poll state files

**Key Insights:**
- Polling-based systems miss fast state transitions
- Track the **data** that matters (tool name), not just status
- `processing` status with a tool name is just as valid as `tool_use`
- Always verify builds are deployed to correct location (WSL vs Windows paths)

**Debugging Pattern - Backend Logging:**
```javascript
// Add to /api/claude-status endpoint:
console.log(`[claude-status] → ${status} (tool: ${current_tool || 'none'})`)
```
This showed the backend WAS catching all tools - problem was frontend logic.

**Files:**
- `extension/sidepanel/sidepanel.tsx:113,525-550` - prevToolNamesRef + isNewTool logic
- `extension/hooks/useClaudeStatus.ts:148` - Polling interval (1000ms)
- `backend/routes/api.js:920-1035` - Claude status endpoint

**Build & Deploy Reminder:**
```bash
# Build AND copy to Windows for Chrome to load:
npm run build && rsync -av --delete dist-extension/ /mnt/c/Users/marci/Desktop/TabzChrome/dist-extension/
# Then reload extension in chrome://extensions
```

---

---

## WebSocket Output Routing

### Lesson: Don't Auto-Register as Owner of All Terminals on Connect (Dec 9, 2025)

**Problem:** Terminal corruption - same text appeared 100+ times, had to refresh page to fix. Happened especially when:
1. Restarting the backend
2. Spawning new terminals via HTTP API (like `/api/spawn`)
3. Multiple browser windows open

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
5. Same text rendered 100 times → corruption

**Root Cause:** The auto-registration was meant to "restore" sessions after reconnect, but it's fundamentally wrong:
- A single browser sidebar should only own terminals IT created or explicitly reconnected to
- HTTP API-spawned terminals shouldn't broadcast to existing sidebars
- Multiple browser windows would all get each other's output

**Solution:** Remove auto-registration. Let frontend explicitly reconnect:

```javascript
// NEW CODE - CORRECT
// Send terminal list (for UI display)
ws.send(JSON.stringify({ type: 'terminals', data: existingTerminals }));

// Do NOT auto-register as owner of all terminals!
// Frontend must send 'reconnect' message for each terminal it owns
```

Frontend already sends `RECONNECT` messages during session reconciliation:
```typescript
// In sidepanel.tsx
backendTerminals.forEach(terminal => {
  sendMessage({ type: 'RECONNECT', terminalId: terminal.id })
})
```

**Why This Works:**
- Each sidebar only owns terminals it explicitly requests
- HTTP API-spawned terminals only owned by the spawning connection
- Multiple windows don't interfere with each other
- Backend restart → frontend reconnects only to its own terminals

**Key Insights:**
- "Helpful" auto-registration can cause subtle bugs
- Multi-tenant WebSocket servers need explicit ownership, not implicit
- Always verify routing in multi-client scenarios

**Prevention Checklist:**
- [ ] Does new WebSocket connection get output from terminals it didn't create?
- [ ] Can spawning terminal in Window A affect Window B?
- [ ] After backend restart, does each sidebar reconnect only to its own terminals?

**Files:**
- `backend/server.js:268-286` - Removed auto-registration, added comment explaining why

---

## Chrome Extension Reconnection & State Sync

### Lesson: Read Chrome Storage Directly for Race-Prone Values (Dec 10, 2025)

**Problem:** Spawning terminals used wrong working directory - always `~` instead of header dropdown value.

**What Happened:**
1. User sets header working directory to `~/projects/TabzChrome`
2. User clicks + to spawn terminal
3. `handleSpawnDefaultProfile()` reads `globalWorkingDir` from React state
4. But React state hasn't loaded from Chrome storage yet!
5. `globalWorkingDir` is still `''` (initial state) or stale
6. Terminal spawns in `~` instead of selected directory

**Root Cause:** React state hydration from Chrome storage is async. If user acts before hydration completes, state values are stale.

**Wrong Approach:**
```typescript
// ❌ BROKEN - React state may not be hydrated yet
const handleSpawnDefaultProfile = () => {
  const effectiveWorkingDir = profile.workingDir || globalWorkingDir || '~'
  // globalWorkingDir might be '' if storage hasn't loaded!
}
```

**Right Approach:**
```typescript
// ✅ CORRECT - Read from Chrome storage directly
const handleSpawnDefaultProfile = () => {
  chrome.storage.local.get(['globalWorkingDir'], (result) => {
    const currentGlobalWorkingDir = (result.globalWorkingDir as string) || globalWorkingDir || '~'
    // Now we have the actual saved value, even if React state is stale
  })
}
```

**Key Insight:**
- Chrome storage is the source of truth, React state is a cache
- For user actions that depend on persisted values, read storage directly
- Use React state as fallback, not primary source

**Files:**
- `extension/sidepanel/sidepanel.tsx:328-393` - Both spawn functions read from storage

---

### Lesson: Deduplicate WebSocket Message Handlers (Dec 10, 2025)

**Problem:** Terminals appearing 2-3 times in the sidebar after spawn or reconnect.

**What Happened - Multiple Issues:**

1. **Backend sent terminals 3x on connect:**
   - Once immediately on WebSocket open
   - Once from session recovery broadcast
   - Once in response to LIST_TERMINALS

2. **Frontend sent LIST_TERMINALS 2x:**
   - Once from initial effect
   - Once after port reconnection

3. **Duplicate RECONNECT messages:**
   - Sent when receiving terminal-spawned
   - Sent again when reconciling stored sessions

**Solution - Deduplication at Multiple Levels:**

```typescript
// 1. Backend: Don't auto-send terminals on connect
// Let frontend explicitly request via LIST_TERMINALS
// Removed from server.js WebSocket onopen handler

// 2. Frontend: Track if we've sent LIST_TERMINALS
const hasSentListTerminalsRef = useRef(false)

if (wsConnected && !hasSentListTerminalsRef.current) {
  hasSentListTerminalsRef.current = true
  sendMessage({ type: 'LIST_TERMINALS' })
}

// 3. Frontend: Track reconnected terminals
const reconnectedTerminalsRef = useRef<Set<string>>(new Set())

if (!reconnectedTerminalsRef.current.has(terminal.id)) {
  reconnectedTerminalsRef.current.add(terminal.id)
  sendMessage({ type: 'RECONNECT', terminalId: terminal.id })
}
```

**Key Insight:**
- WebSocket reconnection triggers multiple initialization paths
- Each path may send the same messages
- Use refs to track "already done" state across re-renders
- Clear tracking refs appropriately (on disconnect, not on every message)

**Files:**
- `backend/server.js:268-286` - Removed auto-send on connect
- `extension/hooks/useTerminalSessions.ts:47-50,117-125,265-271` - Dedup refs

---

### Lesson: Tmux refresh-client Requires Attached Client (Dec 10, 2025)

**Problem:** "Can't find client" errors in tmux hooks after certain operations.

**What Happened:**
1. `.tmux-terminal-tabs.conf` had hooks that ran `refresh-client`
2. `refresh-client` needs an attached tmux client
3. PTY terminals (xterm.js via WebSocket) aren't "attached" in tmux's view
4. Error: `refresh-client: can't find client`

**Wrong Approach:**
```bash
# ❌ BROKEN - no attached client for PTY terminals
set-hook -g after-split-window 'refresh-client -S'
```

**Right Approach:**
```bash
# ✅ CORRECT - send empty keys to trigger redraw without client
set-hook -g after-split-window 'send-keys ""'

# Or suppress errors if refresh is truly needed:
set-hook -g after-split-window 'run-shell "tmux refresh-client -S 2>/dev/null || true"'
```

**Key Insight:**
- Tmux "clients" are terminal emulators attached via `tmux attach`
- PTY connections via node-pty are NOT tmux clients
- Use `send-keys ""` to trigger redraw without requiring attached client

**Files:**
- `.tmux-terminal-tabs.conf` - Updated hooks
- `backend/routes/api.js` - Changed refresh-client to send-keys

---

### Lesson: Gate Audio on File Freshness, Not Just Content (Dec 10, 2025)

**Problem:** "Ready" audio announcements playing repeatedly, sometimes for terminals that weren't even active.

**What Happened:**
1. Claude Code writes status to `~/.claude-status/{sessionName}.json`
2. Chrome extension polls `/api/claude-status` endpoint
3. Backend reads status file and returns `awaiting_input` (ready state)
4. Extension sees transition to "ready" → plays audio
5. But file might be **hours old** from previous session!
6. Result: Stale files trigger announcements for inactive terminals

**Solution - Check file freshness:**

```typescript
// Backend: Include last_updated in response
const stats = fs.statSync(statusFile)
const lastUpdated = stats.mtimeMs

return {
  status: statusData.status,
  last_updated: lastUpdated,
  // ... other fields
}

// Frontend: Only announce if file is fresh (< 30 seconds old)
const isFileFresh = Date.now() - status.last_updated < 30000

if (audioSettings.events.ready && isFileFresh && isNewlyReady) {
  playAudio('ready', session)
}
```

**Key Insight:**
- Status files persist across sessions
- "Current" status might be from hours/days ago
- Always gate time-sensitive actions on data freshness
- File mtime is a reliable freshness indicator

**Files:**
- `extension/hooks/useAudioNotifications.ts` - Added last_updated check
- `backend/routes/api.js` - Added last_updated to response

---

## Dev Environment & Debugging

### Lesson: Named Tmux Sessions Enable Claude Log Capture (Dec 10, 2025)

**Problem:** Debugging Chrome extension issues required manual copy-paste of logs from browser console.

**Solution:** Create dev script that runs backend in named tmux session:

```bash
# scripts/dev.sh creates:
# - tabz-chrome:backend - Backend server with logs
# - tabz-chrome:logs (optional) - Auto-refreshing log view

# Claude can now capture logs directly:
tmux capture-pane -t tabz-chrome:backend -p -S -100
```

**Also added "Backend Logs" profile:**
```json
{
  "id": "backend-logs",
  "name": "Backend Logs",
  "command": "watch -n1 'tmux capture-pane -t tabz-chrome:backend -p -S -50 2>/dev/null || echo \"Start backend: ./scripts/dev.sh\"'"
}
```

**Key Insight:**
- Named tmux sessions are capturable by Claude
- Browser console forwarding to backend makes logs available in one place
- Dev scripts should create predictable session names for tooling

**Files:**
- `scripts/dev.sh` - Dev environment launcher
- `extension/profiles.json` - Backend Logs profile
- `backend/server.js:617-628` - Browser console → stdout with [Browser] prefix

**Last Updated**: December 10, 2025
