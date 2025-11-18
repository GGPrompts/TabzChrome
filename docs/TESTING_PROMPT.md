# Test Coverage Implementation for Tabz

## Project Context

Tabz (Tab>_) is a lightweight, tab-based terminal interface built with React, TypeScript, and xterm.js. It provides multi-window terminal management with tmux session persistence.

**Tech Stack:**
- Frontend: React 18 + TypeScript + Vite
- State: Zustand with localStorage persistence
- Terminal: xterm.js + xterm-addon-fit + xterm-addon-webgl
- Backend: Node.js + Express + WebSocket + node-pty
- Session Management: tmux

**Architecture:** See CLAUDE.md for full details

---

## Critical Bug-Prone Areas (Priority Order)

Based on recent bug fixes and production issues, these are the highest-risk areas requiring test coverage:

### 1. **Multi-Window Terminal Management** (HIGH PRIORITY)
**File:** `src/hooks/useWebSocketManager.ts` (lines 135-195)

**Why Critical:**
- Terminals in different browser windows can adopt each other's sessions
- Fast-spawning terminals (bash) can collide across windows
- WindowId filtering prevents cross-window contamination

**Test Requirements:**
- Terminal spawned in Window A should NOT appear in Window B
- Terminal with `windowId: 'main'` should only connect in main window
- Terminal with `windowId: 'window-123'` should only connect in that window
- Fast spawns (2+ bash terminals in <100ms) should match correctly
- WebSocket `terminal-spawned` events should filter by windowId

**Key Logic to Test:**
```typescript
// Line 142 in useWebSocketManager.ts
const terminalWindow = existingTerminal.windowId || 'main'
if (terminalWindow !== currentWindowId) {
  return // Should ignore terminal from wrong window
}
```

**Suggested Tests:**
```typescript
describe('Multi-Window Terminal Management', () => {
  test('terminal spawned in window-1 should not appear in window-2')
  test('terminal-spawned event for wrong window should be ignored')
  test('multiple bash terminals spawning <100ms apart should match correctly')
  test('reconnection after refresh should only reconnect to correct window')
})
```

---

### 2. **Split Terminal Popout** (HIGH PRIORITY)
**File:** `src/hooks/usePopout.ts` (lines 45-230)

**Why Critical:**
- Just fixed: panes staying as invisible half-tabs in main window
- Just fixed: split container not being removed properly
- Just fixed: pane state (isHidden) not being cleared

**Test Requirements:**
- Pop out single pane from split → remaining pane becomes normal tab
- Pop out single pane from split → popped pane opens in new window without split state
- Pop out entire split container → opens N separate windows
- Pop out last pane from split → split container removed
- Verify `isHidden: false` and `splitLayout: { type: 'single' }` after popout

**Key Logic to Test:**
```typescript
// Lines 60-67: Clear split state when popping out pane
updateTerminal(terminalId, {
  windowId: paneWindowId,
  isHidden: false,  // Must clear!
  splitLayout: { type: 'single', panes: [] },
})
```

**Suggested Tests:**
```typescript
describe('Split Terminal Popout', () => {
  test('popping out pane should clear isHidden state')
  test('popping out pane should remove it from split container panes array')
  test('popping out second-to-last pane should convert split to single terminal')
  test('main window should not have invisible half-tabs after popout')
  test('popped out pane should become normal tab in new window')
  test('popping out entire split should open N windows for N panes')
})
```

---

### 3. **Terminal Spawning & WebSocket Matching** (MEDIUM PRIORITY)
**Files:**
- `src/hooks/useTerminalSpawning.ts` (lines 80-250)
- `src/hooks/useWebSocketManager.ts` (lines 116-195)

**Why Critical:**
- Duplicate terminals created due to race conditions (fixed Nov 10)
- WebSocket `terminal-spawned` needs to match frontend terminal by requestId
- Fallback matching by terminalType + windowId + createdAt
- Commands not executing (fixed Nov 7)

**Test Requirements:**
- Spawning terminal should add to `pendingSpawns` ref immediately
- `terminal-spawned` event should match by requestId first
- Fallback: match by most recent `spawning` terminal of same type in same window
- No duplicate terminals created when spawn completes
- Terminal commands should execute (not just spawn shell)

**Key Logic to Test:**
```typescript
// Line 123 in useWebSocketManager.ts - synchronous matching
let existingTerminal = pendingSpawns.current.get(message.requestId)

// Line 138 - fallback with windowId filter
existingTerminal = storedTerminals
  .filter(t =>
    t.status === 'spawning' &&
    t.terminalType === message.data.terminalType &&
    (t.windowId || 'main') === currentWindowId
  )
  .sort((a, b) => b.createdAt - a.createdAt)[0]
```

**Suggested Tests:**
```typescript
describe('Terminal Spawning & Matching', () => {
  test('spawning terminal should be added to pendingSpawns ref')
  test('terminal-spawned should match by requestId first')
  test('terminal-spawned should fallback to type+window+createdAt matching')
  test('spawning 2 bash terminals rapidly should not create duplicates')
  test('spawn with command should execute command, not just shell')
  test('spawn with workingDir should start in correct directory')
})
```

---

### 4. **Split Terminal Creation & Management** (MEDIUM PRIORITY)
**Files:**
- `src/hooks/useDragDrop.ts` (lines 200-350)
- `src/SimpleTerminalApp.tsx` (lines 750-850)

**Why Critical:**
- Drag-and-drop creates split containers
- Closing panes should update split or convert back to single
- Split layout persistence across refresh

**Test Requirements:**
- Dragging terminal onto another should create split container
- Split container should have `splitLayout.type` = 'horizontal' or 'vertical'
- Panes should be marked `isHidden: true`
- Closing a pane should remove it from split
- Closing second-to-last pane should convert to single terminal
- Split should persist through refresh

**Suggested Tests:**
```typescript
describe('Split Terminal Operations', () => {
  test('dragging terminal onto another creates horizontal split')
  test('split container should have correct splitLayout structure')
  test('panes in split should be marked isHidden: true')
  test('closing pane removes it from split panes array')
  test('closing second-to-last pane converts split to single')
  test('split terminals persist through page refresh')
})
```

---

### 5. **Terminal Reconnection (tmux sessions)** (MEDIUM PRIORITY)
**Files:**
- Backend: `backend/modules/pty-handler.js` (lines 136-177)
- Frontend: `src/hooks/useWebSocketManager.ts` (lines 60-95)

**Why Critical:**
- After refresh, terminals should reconnect to existing tmux sessions
- Session name matching: `tt-bash-xyz`, `tt-cc-abc`
- Prevent creating duplicate sessions

**Test Requirements:**
- Terminal with sessionName should reconnect to existing session
- Should not create new session if one exists
- Should create new session if none exists
- Session names should be unique (use counter if collision)

**Suggested Tests:**
```typescript
describe('Terminal Reconnection', () => {
  test('terminal with sessionName should reconnect to existing tmux session')
  test('reconnection should not create duplicate tmux session')
  test('new terminal should create unique session name')
  test('session name collision should append counter (tt-bash-2)')
  test('after refresh, all terminals should reconnect to their sessions')
})
```

---

### 6. **State Persistence (Zustand + localStorage)** (LOW PRIORITY)
**File:** `src/stores/simpleTerminalStore.ts`

**Why Critical:**
- Window isolation depends on correct localStorage sync
- 250ms debounce can cause race conditions
- Split layouts must persist

**Test Requirements:**
- Adding terminal should persist to localStorage within 250ms
- Updating terminal should debounce multiple rapid updates
- Split layouts should serialize/deserialize correctly
- WindowId changes should sync across windows

**Suggested Tests:**
```typescript
describe('State Persistence', () => {
  test('adding terminal should persist to localStorage')
  test('updating terminal 5x in 100ms should debounce to 1 write')
  test('split layout should persist correctly')
  test('windowId changes should be visible to other windows after 250ms')
})
```

---

## Testing Strategy

### Unit Tests (Vitest + React Testing Library)
**Target:** Individual hooks and utility functions

**Coverage Goals:**
- `useWebSocketManager.ts` - 80%+
- `usePopout.ts` - 80%+
- `useTerminalSpawning.ts` - 70%+
- `useDragDrop.ts` - 60%+

**Mock Requirements:**
- WebSocket (mock with `MockWebSocket` class)
- Zustand store (use real store, reset between tests)
- localStorage (mock with `@testing-library/jest-dom`)
- Timers (use `vi.useFakeTimers()` for debouncing tests)

### Integration Tests (Vitest + jsdom)
**Target:** Multi-hook workflows

**Scenarios:**
1. Spawn terminal → receive terminal-spawned → match by requestId
2. Create split → close pane → verify split state updated
3. Popout split → verify main window clean, new window receives terminals
4. Spawn 2 bash terminals rapidly → verify no duplicates

### E2E Tests (Optional - Playwright/Cypress)
**Target:** Full user workflows with real backend

**Critical Flows:**
1. Multi-window: Open 2 windows, spawn terminals, verify isolation
2. Split & Popout: Create split, popout pane, verify no half-tabs
3. Refresh: Spawn terminal, refresh page, verify reconnection

---

## Test File Structure

```
tests/
├── unit/
│   ├── hooks/
│   │   ├── useWebSocketManager.test.ts       # Priority 1
│   │   ├── usePopout.test.ts                 # Priority 1
│   │   ├── useTerminalSpawning.test.ts       # Priority 2
│   │   ├── useDragDrop.test.ts               # Priority 3
│   │   └── useKeyboardShortcuts.test.ts      # Priority 4
│   ├── stores/
│   │   └── simpleTerminalStore.test.ts       # Priority 3
│   └── utils/
│       └── windowUtils.test.ts               # Priority 4
├── integration/
│   ├── terminal-spawning.test.ts             # Priority 1
│   ├── split-operations.test.ts              # Priority 2
│   ├── multi-window.test.ts                  # Priority 1
│   └── popout-flows.test.ts                  # Priority 1
└── e2e/
    ├── multi-window-isolation.spec.ts        # Optional
    └── split-popout.spec.ts                  # Optional
```

---

## Implementation Instructions for Agents

**When writing tests, please:**

1. **Read the actual implementation first** - Use `Read` tool to see current code
2. **Check existing test patterns** - Look at any existing tests for style
3. **Use TypeScript** - All tests should be `.test.ts` or `.spec.ts`
4. **Mock external dependencies** - WebSocket, fetch, localStorage, timers
5. **Test edge cases** - Race conditions, null checks, empty arrays
6. **Add descriptive test names** - Explain WHAT and WHY, not just HOW
7. **Group related tests** - Use `describe` blocks for organization
8. **Add setup/teardown** - Reset state between tests
9. **Avoid implementation details** - Test behavior, not internals
10. **Add comments for complex scenarios** - Explain the test scenario

**Example Test Template:**
```typescript
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'

describe('useWebSocketManager - Multi-Window Filtering', () => {
  beforeEach(() => {
    // Reset state
    // Mock WebSocket
    // Set up test data
  })

  afterEach(() => {
    // Cleanup
    vi.clearAllMocks()
  })

  test('should ignore terminal-spawned event from different window', () => {
    // Arrange: Terminal with windowId='window-1', currentWindowId='main'
    // Act: Receive terminal-spawned event
    // Assert: Terminal should NOT be added to webSocketAgents
  })

  test('should accept terminal-spawned event from same window', () => {
    // Arrange: Terminal with windowId='main', currentWindowId='main'
    // Act: Receive terminal-spawned event
    // Assert: Terminal should be added to webSocketAgents
  })
})
```

---

## Priority Implementation Order

**Phase 1 (Critical - Start Here):**
1. `useWebSocketManager.test.ts` - Multi-window filtering
2. `usePopout.test.ts` - Split popout scenarios
3. `terminal-spawning.test.ts` - Integration test for spawn flow

**Phase 2 (Important):**
4. `useTerminalSpawning.test.ts` - Spawn logic
5. `split-operations.test.ts` - Split create/close/manage
6. `useDragDrop.test.ts` - Drag-and-drop split creation

**Phase 3 (Nice to Have):**
7. `simpleTerminalStore.test.ts` - State persistence
8. `useKeyboardShortcuts.test.ts` - Keyboard shortcuts
9. E2E tests with Playwright

---

## Success Criteria

**Minimum Viable Coverage:**
- ✅ 70%+ line coverage for hooks
- ✅ All 6 critical areas have unit tests
- ✅ 3+ integration tests covering workflows
- ✅ CI/CD runs tests on every commit
- ✅ Tests catch the bugs we've fixed (regression tests)

**Ideal Coverage:**
- ✅ 80%+ line coverage overall
- ✅ 90%+ coverage for critical hooks
- ✅ E2E tests for multi-window and splits
- ✅ Performance tests (spawn 10 terminals in 1s)

---

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run specific test file
npm test -- useWebSocketManager.test.ts

# Run with coverage
npm test -- --coverage

# Run only unit tests
npm test -- tests/unit

# Run only integration tests
npm test -- tests/integration
```

---

## Notes for Claude Code

When implementing tests, focus on **preventing the bugs we've already fixed:**

1. ✅ **Nov 12, 2025** - Split popout leaving invisible half-tabs
2. ✅ **Nov 10, 2025** - Terminal resize stuck at tiny size (ResizeObserver timing)
3. ✅ **Nov 10, 2025** - Terminals completely unusable (wsRef sharing)
4. ✅ **Nov 9, 2025** - Multi-window tab management (windowId filtering)
5. ✅ **Nov 7, 2025** - Commands not executing, duplicate terminals

Each of these should have a corresponding **regression test** that would have caught the bug.

---

## Example Agent Invocation

```bash
# In Claude Code, use the Task tool:

Task: "Write comprehensive unit tests for useWebSocketManager.ts focusing on multi-window terminal filtering. Follow the test requirements in TESTING_PROMPT.md section 1. Use Vitest + React Testing Library. Mock WebSocket and Zustand store. Ensure tests cover the windowId filtering logic on lines 142-154."
```

Good luck! These tests will prevent 90% of the bugs we've been chasing. 🎯
