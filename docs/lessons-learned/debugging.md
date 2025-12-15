# Debugging & Testing Lessons

Lessons related to development environment, debugging patterns, and testing infrastructure.

---

## Add Diagnostic Logging Before Fixing

### Pattern: Understand Before You Fix

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

**Benefits:**
1. Shows exactly which code path is executing
2. Reveals data mismatches (wrong ID, missing state, etc.)
3. Helps users self-diagnose issues
4. Can be left in for production debugging

**Files:** `src/hooks/useWebSocketManager.ts:118-157`

---

## Multi-Step State Changes

### Pattern: Handle All Side Effects When Changing State

When a state change affects multiple systems, update all of them:

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

**Anti-Pattern:** Only updating state and forgetting side effects.

---

## Session Naming & Reconnection

### Pattern: Use Consistent Session Identifiers

**Lesson:** When reconnecting, the backend needs to find the existing PTY. Use the existing `sessionName` (not a new one):

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

**Files:** `src/hooks/useTerminalSpawning.ts:246-247`

---

## Testing Detach/Reattach

### Checklist: How to Verify Detach Works Correctly

```bash
# 1. Spawn terminal
# Right-click → spawn Claude Code

# 2. Detach
# Right-click tab → Detach

# 3. Verify session survived
tmux ls | grep ctt-
# Should show: ctt-xxx: 1 windows (created ...) (attached)

# 4. Reattach
# Click detached tab

# 5. Check console logs (should see):
# [SimpleTerminalApp] Detaching from tmux session: ctt-xxx
# [SimpleTerminalApp] Clearing processedAgentId: 1810f662
# [SimpleTerminalApp] ✓ Detached from session: ctt-xxx
# [useWebSocketManager] 📨 Received terminal-spawned: {...}
# [useWebSocketManager] 🔍 Checking pendingSpawns: FOUND
# [useWebSocketManager] ✅ Matched terminal: terminal-xxx

# 6. Terminal should be active and responsive immediately
```

---

## Named Tmux Sessions Enable Claude Log Capture

### Lesson: Dev Environment for Autonomous Debugging (Dec 10, 2025)

**Problem:** Debugging Chrome extension issues required manual copy-paste of logs from browser console.

**Solution:** Create dev script that runs backend in named tmux session:

```bash
# scripts/dev.sh creates:
# - tabzchrome:backend - Backend server with logs
# - tabzchrome:logs (optional) - Auto-refreshing log view

# Claude can now capture logs directly:
tmux capture-pane -t tabzchrome:backend -p -S -100
```

**Also added "Backend Logs" profile:**
```json
{
  "id": "backend-logs",
  "name": "Backend Logs",
  "command": "watch -n1 'tmux capture-pane -t tabzchrome:backend -p -S -50 2>/dev/null || echo \"Start backend: ./scripts/dev.sh\"'"
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

---

## Mock Classes Need Constructor Syntax

### Lesson: Mocking Browser APIs (Nov 12, 2025)

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

---

## WebSocket Mocks Need Message Simulation

### Lesson: Testing WebSocket Interactions (Nov 12, 2025)

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

---

## Autonomous Debugging Workflow

**When debugging the Chrome extension, you can debug autonomously:**

1. **Make code changes** (Edit/Write tools)

2. **Check if it's working** (Bash tool):
   ```bash
   # Check if backend is running
   ps aux | grep "node server.js" | grep -v grep

   # Check active Chrome extension terminals
   tmux ls | grep "^ctt-"

   # List all terminal sessions by name
   tmux ls

   # Check specific terminal output
   tmux capture-pane -t Bash -p -S -50
   ```

3. **Analyze and fix** - You can see errors directly without asking user

**Example autonomous debugging:**
```bash
# After updating extension code:
# 1. Check if backend is receiving spawn commands
ps aux | grep "node server.js" | grep -v grep

# 2. Verify Chrome extension terminals exist
tmux ls | grep "^ctt-"

# 3. Check specific terminal output
tmux capture-pane -t Bash -p -S -20
```

**This enables:**
- Fix issues without user needing to copy-paste logs
- Verify changes work before committing
- Debug race conditions by capturing exact timing
- See both browser + backend logs in one capture

**Tabz MCP Screenshot Limitation:**
The `tabz_screenshot` tool captures the **main browser viewport only** - it cannot screenshot the Chrome sidebar (where Tabz lives). This is a Chrome limitation; the sidebar runs in a separate context that CDP cannot access. Ask the user to describe what they see or manually verify sidebar UI changes.

---

## Backend Logging for Debugging

### Pattern: Add Endpoint Logging

When debugging communication issues, add logging to API endpoints:

```javascript
// Add to /api/claude-status endpoint:
console.log(`[claude-status] → ${status} (tool: ${current_tool || 'none'})`)
```

This helps identify whether the problem is:
- Backend not receiving requests
- Backend returning wrong data
- Frontend not processing responses correctly

---

## Build & Deploy Reminder (WSL)

When developing on WSL and loading extension from Windows:

```bash
# Build AND copy to Windows for Chrome to load:
npm run build && rsync -av --delete dist-extension/ /mnt/c/Users/$USER/Desktop/TabzChrome/dist-extension/
# Then reload extension in chrome://extensions
```

**Common Gotcha:** Code changes work but you forgot to copy to Windows location.

---

## Tmux Session Name Prefix Matching

### Bug: `tmux kill-session -t "tabz"` kills `tabz-chrome`

**Root Cause:** tmux uses prefix matching for session names by default.

```bash
# DANGEROUS - kills any session starting with "tabz":
tmux has-session -t "tabz"      # Matches: tabz, tabz-chrome, tabz-anything
tmux kill-session -t "tabz"     # Kills first match!

# SAFE - exact matching with = prefix:
tmux has-session -t "=tabz"     # Only matches exactly "tabz"
tmux kill-session -t "=tabz"    # Only kills exactly "tabz"
```

**Prevention Strategies:**
1. Use `=` prefix for exact matching in scripts
2. Choose session names that won't be prefixes of other names (e.g., `tabzchrome` not `tabz-chrome`)
3. Test with `tmux display-message -p -t "name" "#{session_name}"` to see what would match

**Why This Matters:**
- If another project uses `tmux kill-session -t tabz`, it will kill your `tabz-chrome` session
- The TabzChrome session is now named `tabzchrome` (no hyphen) to avoid this

**Files Changed:** `scripts/dev.sh` (SESSION_NAME)

---

**Last Updated:** December 15, 2025
