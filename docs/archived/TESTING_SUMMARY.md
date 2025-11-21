# Unit Tests for useWebSocketManager - Summary

## Test File Created
**Location:** `/home/matt/projects/terminal-tabs/tests/unit/hooks/useWebSocketManager.test.ts`

## Test Coverage Results
- **Line Coverage:** 58.97%
- **Statement Coverage:** 54.92%
- **Branch Coverage:** 46.04%
- **Function Coverage:** 47.36%

## Tests Written (12 Total)

### 1. Terminal Spawned Event Filtering (3 tests)
- ✅ **should accept terminal-spawned event from same window (main)**
  - Verifies terminals spawn correctly in main window
  - Checks windowId is preserved in updateTerminal call

- ✅ **should ignore terminal-spawned event from different window**
  - CRITICAL: Prevents cross-window contamination
  - Verifies terminal from window-1 is NOT added to main window

- ✅ **should accept terminal-spawned event in correct popout window**
  - Tests popout windows (window-123) accept their own terminals
  - Verifies windowId preserved for popout windows

### 2. Fast-Spawning Terminals (1 test)
- ✅ **should NOT match terminal from different window even with same terminalType**
  - CRITICAL: Prevents race condition with bash terminals
  - Verifies most recent terminal in SAME window is matched, not across windows
  - Tests the core logic at lines 136-145 in useWebSocketManager.ts

### 3. Pending Spawns Synchronous Matching (1 test)
- ✅ **should respect windowId filtering even for pendingSpawns**
  - Tests pendingSpawns ref filtering
  - Verifies early-return logic at lines 149-154

### 4. Tmux Session Reconnection (1 test)
- ✅ **should only reconnect to sessions in current window**
  - Tests tmux-sessions-list message filtering
  - Verifies only sessions with matching windowId are reconnected
  - Tests lines 355-363 (window filtering in reconnection)

### 5. WebSocket Connection Lifecycle (2 tests)
- ✅ **should connect on mount and set status to connected**
  - Basic connection flow test

- ✅ **should clear agentIds from all terminals on disconnect**
  - Tests cleanup on disconnect (lines 419-434)

### 6. Hydration (Clearing Stale AgentIds) (2 tests)
- ✅ **should clear stale agentIds from localStorage on mount**
  - Tests lines 68-84 (hydration logic)

- ✅ **should only clear agentIds once (not on every render)**
  - Prevents duplicate clearing with hasHydrated ref

### 7. No Fallback Terminal Creation (1 test)
- ✅ **should NOT create terminal for unmatched terminal-spawned event**
  - CRITICAL: Tests lines 191-196
  - Prevents creating terminals for broadcasts from other windows

### 8. Duplicate Agent Prevention (1 test)
- ✅ **should not process same agent ID twice**
  - Tests processedAgentIds ref (lines 118-120)

## Critical Bug Scenarios Tested

### Bug #1: Cross-Window Terminal Adoption
**Scenario:** Terminal spawned in Window B appears in Window A
**Test Coverage:**
- `should ignore terminal-spawned event from different window` ✅
- `should NOT match terminal from different window even with same terminalType` ✅
- `should respect windowId filtering even for pendingSpawns` ✅

**Key Lines Tested:** 136-154 (window filtering logic)

### Bug #2: Fast-Spawning Bash Terminals
**Scenario:** Two bash terminals spawn <100ms apart, get matched incorrectly across windows
**Test Coverage:**
- `should NOT match terminal from different window even with same terminalType` ✅

**Key Lines Tested:** 136-145 (most recent terminal matching with window filter)

### Bug #3: Tmux Reconnection Cross-Contamination
**Scenario:** After refresh, Window A reconnects to sessions from Window B
**Test Coverage:**
- `should only reconnect to sessions in current window` ✅

**Key Lines Tested:** 355-363 (tmux reconnection filtering)

### Bug #4: Fallback Terminal Creation
**Scenario:** Unmatched terminal-spawned events create new terminals in wrong windows
**Test Coverage:**
- `should NOT create terminal for unmatched terminal-spawned event` ✅

**Key Lines Tested:** 191-196 (early return for unmatched events)

## Uncovered Code (Needs Additional Tests)

### terminal-closed Handler (Lines 212-335)
- Split terminal cleanup logic
- Active terminal switching after close
- Popped-out window auto-close

**Suggested Test:**
```typescript
it('should handle terminal-closed and remove split panes correctly')
it('should close popped-out window when last terminal exits')
it('should switch to next available terminal after close')
```

### terminal-output Handler (Lines 200-210)
- CustomEvent dispatch for terminal output

**Suggested Test:**
```typescript
it('should dispatch terminal-output event with correct data')
```

### WebSocket Error Handling (Lines 455-459)
- Connection error during CONNECTING state

**Suggested Test:**
```typescript
it('should handle WebSocket connection errors gracefully')
```

### Exponential Backoff Reconnection (Lines 436-453)
- Max reconnect attempts
- Backoff delay calculation

**Suggested Test:**
```typescript
it('should stop reconnecting after max attempts')
it('should use exponential backoff for reconnection')
```

### Query Tmux Sessions Logic (Lines 86-108)
- Conditions for when to query
- Reset flag on disconnect

**Suggested Test:**
```typescript
it('should query tmux sessions only after conditions met')
it('should reset query flag on disconnect')
```

## Test Infrastructure

### Mocks Used
- **MockWebSocket** from `/tests/mocks/MockWebSocket.ts`
- Custom WebSocket constructor mock: `global.WebSocket = function(url) { return mockWs }`
- Mock functions: `updateTerminal`, `removeTerminal`, `setActiveTerminal`, `handleReconnectTerminal`

### Key Testing Patterns
```typescript
// 1. Open WebSocket connection
await act(async () => {
  mockWs.simulateOpen()
  await new Promise(resolve => setTimeout(resolve, 10))
})

// 2. Simulate backend message
await act(async () => {
  mockWs.simulateMessage({ type: 'terminal-spawned', ... })
  await new Promise(resolve => setTimeout(resolve, 10))
})

// 3. Wait for state update
await waitFor(() => {
  expect(result.current.webSocketAgents).toHaveLength(1)
}, { timeout: 2000 })
```

### Challenges Encountered

1. **WebSocket Mock Constructor Issue**
   - Initial approach: `global.WebSocket = vi.fn(() => mockWs)`
   - Error: "() => mockWs is not a constructor"
   - Solution: Use `function(url) { return mockWs }` instead

2. **React State Updates**
   - Required `act()` wrapper for state updates
   - Added small delays (`setTimeout`) for async processing

3. **Store Module Access**
   - terminal-closed handler uses `useSimpleTerminalStore.getState()`
   - Difficult to mock in unit tests (would need integration test)

## Next Steps to Reach 70%+ Coverage

1. **Add terminal-closed split handling tests** (+ ~5% coverage)
2. **Add WebSocket reconnection tests** (+ ~3% coverage)
3. **Add terminal-output event dispatch test** (+ ~2% coverage)
4. **Add tmux query conditions tests** (+ ~2% coverage)
5. **Add edge case tests** (duplicate sessions, etc.) (+ ~2% coverage)

**Estimated Total Coverage with Additional Tests:** ~72-75%

## Documentation References

All tests are documented with references to:
- CLAUDE.md "Critical Architecture (Popout Flow)" section
- Specific line numbers in useWebSocketManager.ts
- Bug scenarios from production issues

## Running Tests

```bash
# Run all tests
npm test -- tests/unit/hooks/useWebSocketManager.test.ts

# Run with coverage
npm test -- tests/unit/hooks/useWebSocketManager.test.ts --coverage

# Run specific test
npm test -- tests/unit/hooks/useWebSocketManager.test.ts -t "should ignore terminal-spawned event from different window"
```

## Test Metrics

- **Total Lines of Test Code:** 635 lines
- **Test Execution Time:** ~735ms
- **Number of Assertions:** ~35+
- **Mock Functions:** 4
- **Test Suites:** 8
- **Test Cases:** 12

---

**Created:** November 12, 2025
**Test File:** `/home/matt/projects/terminal-tabs/tests/unit/hooks/useWebSocketManager.test.ts`
**Coverage:** 58.97% lines, 54.92% statements, 46.04% branches
