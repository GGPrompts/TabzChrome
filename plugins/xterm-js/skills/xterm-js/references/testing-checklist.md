# Testing Workflows and Checklists

This document provides comprehensive testing workflows for xterm.js terminal applications.

## Pre-Commit Testing (REQUIRED)

**Rule:** Before committing ANY code changes, run the test suite. All tests must pass.

```bash
npm test
```

**If tests fail:**
1. Fix the failing tests (don't skip them)
2. If your changes intentionally break tests, update the tests
3. Never commit with failing tests

## Test Suite Organization

### Integration Tests

**Detach/Reattach Workflow** (15 tests)
- Terminal detach preserves tmux session
- Detach clears processedAgentIds
- Reattach reconnects with same agentId
- Split container detach/reattach
- Clicking detached pane restores whole split

**Split Operations** (35+ tests)
- Drag tab to create split
- Close pane converts to single
- Detach pane vs. detach container
- Split layout preservation
- Resize split dividers

**Terminal Spawning** (20+ tests)
- Spawn different terminal types
- Working directory validation
- Tilde path expansion
- Spawn options validation
- Error handling

### Unit Tests

**Hooks**
- useWebSocketManager
- useTerminalResize
- useKeyboardShortcuts
- useTerminalSpawning

**Stores**
- simpleTerminalStore
- useSettingsStore

**Utilities**
- Session name generation
- Path validation
- Theme resolution

## Testing After Refactoring

### Comprehensive Refactoring Checklist

After extracting hooks or refactoring components:

```bash
# 1. TypeScript compilation
npm run build
# ✅ Check: No TypeScript errors

# 2. Automated tests
npm test
# ✅ Check: All tests pass

# 3. Visual inspection
# Open http://localhost:5173

# 4. Test spawning
# Right-click → Spawn → Claude Code
# ✅ Check: Terminal spawns
# ✅ Check: No console errors
# ✅ Check: Terminal has correct size

# 5. Test input (WebSocket)
# Type: ls -la<Enter>
# ✅ Check: Characters echo
# ✅ Check: Command executes
# ✅ Check: Output appears

# 6. Test resize (ResizeObserver)
# Resize browser window
# ✅ Check: Terminal resizes to fit
# ✅ Check: No resize loops
# ✅ Check: Text wraps correctly

# 7. Test TUI tools (complex ANSI)
# Spawn: htop or vim
# ✅ Check: TUI renders correctly
# ✅ Check: Colors work
# ✅ Check: Navigation works
# ✅ Check: Can exit cleanly

# 8. Test persistence
# Refresh page (Ctrl+R)
# ✅ Check: Terminals restore
# ✅ Check: Content preserved
# ✅ Check: Active tab restored

# 9. Test split terminals
# Drag tab to split horizontally
# ✅ Check: Split created
# ✅ Check: Both panes work
# ✅ Check: Can resize divider

# 10. Check logs
# Browser console
# ✅ Check: No errors
# ✅ Check: No warnings (or expected only)

# Backend logs
tmux capture-pane -t tabz:backend -p -S -50
# ✅ Check: No errors
# ✅ Check: WebSocket connected
# ✅ Check: PTY spawned
```

## Detach/Reattach Testing

### Verification Workflow

```bash
# 1. Spawn terminal
# Right-click → Spawn → Claude Code

# 2. Detach
# Right-click tab → Detach

# 3. Verify session survived
tmux ls | grep tt-cc-
# ✅ Expected: tt-cc-xxx: 1 windows (created ...) (attached)
# ❌ Error: No sessions found (session was killed!)

# 4. Reattach
# Click detached tab dropdown → Click terminal

# 5. Check console logs (should see):
# [SimpleTerminalApp] Detaching from tmux session: tt-cc-xxx
# [SimpleTerminalApp] Clearing processedAgentId: 1810f662
# [SimpleTerminalApp] ✓ Detached from session: tt-cc-xxx
# [useWebSocketManager] 📨 Received terminal-spawned: {...}
# [useWebSocketManager] 🔍 Checking pendingSpawns: FOUND
# [useWebSocketManager] ✅ Matched terminal: terminal-xxx

# 6. Verify terminal responsive
# Type: echo "test"<Enter>
# ✅ Check: Command executes
# ✅ Check: Output appears

# 7. Test split detach/reattach
# Create split (drag tab)
# Detach whole container
# Click detached pane tab (not container)
# ✅ Check: Whole split restores (not just one pane!)
```

### Common Issues

**Issue:** Tmux session killed on detach
- Check: Are you sending WebSocket 'close' message?
- Fix: Remove WebSocket message, use API endpoint only

**Issue:** Reattach stuck in "spawning" state
- Check: Is processedAgentIds cleared on detach?
- Check: Console logs for "Already processed agentId"
- Fix: Add clearProcessedAgentId() call

**Issue:** Clicking detached pane only restores one terminal
- Check: Is detachedSplitContainer check present?
- Fix: Check if terminal is pane in detached split before reattaching

## Multi-Window Testing

### Verification Workflow

```bash
# 1. Spawn terminal in main window
# Right-click → Spawn → Bash

# 2. Move to new window
# Right-click tab → Open in Separate Window

# 3. Verify window IDs
# Main window URL: ?window=main
# New window URL: ?window=window-abc123

# 4. Test isolation
# In main window: Spawn another terminal
# In new window: Check terminal list
# ✅ Check: New terminal NOT in new window
# ✅ Check: Only moved terminal visible

# 5. Test backend routing
# Type in terminal in new window
# Check backend logs
tmux capture-pane -t tabz:backend -p -S -50
# ✅ Check: Output only sent to correct window
# ✅ Check: No escape sequences in other windows

# 6. Test state sync (BroadcastChannel)
# In new window: Detach terminal
# In main window: Check detached dropdown
# ✅ Check: Detached terminal appears immediately (no refresh needed)

# 7. Test cleanup
# Close new window
# Check backend logs
# ✅ Check: WebSocket connection cleaned up
# ✅ Check: Terminal ownership updated
```

### Common Issues

**Issue:** Escape sequences in wrong terminal
- Check: Backend using terminalOwners map?
- Check: Frontend filtering by windowId?

**Issue:** Detached dropdown doesn't update
- Check: BroadcastChannel messages being sent?
- Check: StorageEvent listener set up?

**Issue:** Terminal output stops after popout closes
- Check: Backend cleaning up dead connections?
- Check: Periodic cleanup running?

## Performance Testing

### Resize Performance

```bash
# 1. Spawn terminal
# 2. Open DevTools Performance tab
# 3. Start recording
# 4. Drag split divider rapidly for 5 seconds
# 5. Stop recording

# Analyze:
# ✅ Check: Frame rate stays above 30 FPS
# ✅ Check: No long tasks (>50ms)
# ✅ Check: Terminal refits only on drag end (not during drag)
```

### Memory Leaks

```bash
# 1. Open DevTools Memory tab
# 2. Take heap snapshot (Snapshot 1)
# 3. Spawn 10 terminals
# 4. Close all 10 terminals
# 5. Force garbage collection (🗑️ icon)
# 6. Take heap snapshot (Snapshot 2)

# Analyze:
# ✅ Check: Snapshot 2 size similar to Snapshot 1
# ❌ Error: Snapshot 2 much larger (memory leak!)

# Common leaks:
# - Event listeners not removed
# - ResizeObserver not disconnected
# - WebSocket refs not cleared
# - Tmux sessions not killed
```

## Test-Driven Development

### Writing Tests First

When fixing bugs or adding features:

1. **Write a failing test** that reproduces the bug
2. **Fix the bug** until the test passes
3. **Verify all other tests** still pass
4. **Commit with passing tests**

### Example: Detach Bug

```typescript
// 1. Write test showing the bug
it('should reattach terminal after detach', async () => {
  // Spawn terminal
  const terminal = await spawnTerminal('bash')

  // Detach
  await detachTerminal(terminal.id)

  // Verify session survived
  const sessions = await getTmuxSessions()
  expect(sessions).toContain(terminal.sessionName)

  // Reattach
  await reattachTerminal(terminal.id)

  // Test fails here - terminal stuck in "spawning" state
  expect(terminal.status).toBe('running')
})

// 2. Fix the code (add clearProcessedAgentId)

// 3. Test now passes - commit!
```

## Continuous Integration (Future)

When CI is set up, tests will run automatically on:
- Every push to GitHub
- Every pull request
- Pre-merge validation

**CI Configuration:**
```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
      - run: npm install
      - run: npm run build
      - run: npm test
```

## Coverage Goals

**Current Coverage:**
- Unit tests: ~70%
- Integration tests: ~80%
- E2E tests: ~30%

**Target Coverage:**
- Unit tests: 85%
- Integration tests: 90%
- E2E tests: 60%

**Priority Areas:**
- WebSocket communication (critical)
- State management (critical)
- Terminal lifecycle (critical)
- UI interactions (important)
- Error handling (important)

## Debugging Test Failures

### Integration Test Failures

```bash
# Run specific test file
npm test -- tests/integration/detach-reattach.test.ts

# Run specific test
npm test -- -t "should reattach terminal after detach"

# Run with verbose output
npm test -- --verbose

# Run with debug logging
DEBUG=* npm test
```

### Common Test Issues

**Issue:** Tests pass locally, fail in CI
- Check: Different Node.js versions?
- Check: Missing environment variables?
- Check: Timing issues (add waits)?

**Issue:** Flaky tests (sometimes pass, sometimes fail)
- Check: Race conditions in async code?
- Check: Not waiting for state updates?
- Check: Using fixed timeouts instead of conditions?

**Fix flaky tests:**
```typescript
// WRONG - Fixed timeout
await sleep(1000)
expect(terminal.status).toBe('running')

// RIGHT - Wait for condition
await waitFor(() => {
  expect(terminal.status).toBe('running')
}, { timeout: 5000 })
```

## Files to Reference

- `tests/integration/detach-reattach.test.ts` - Detach/reattach tests
- `tests/integration/split-operations.test.ts` - Split terminal tests
- `tests/integration/terminal-spawning.test.ts` - Spawning tests
- `tests/unit/hooks/` - Hook unit tests
- `CLAUDE.md:1024-1077` - Testing workflow section
