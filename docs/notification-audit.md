# Desktop Notification Audit

This document identifies opportunities for adding desktop notifications using `tabz_notification_*` MCP tools throughout the TabzChrome codebase.

## Implementation Status

**Completed (8 notifications):**
- [x] WebSocket disconnect/reconnect (#1, #9)
- [x] Terminal exit with error code (#3)
- [x] ErrorBoundary crashes (#4)
- [x] Orphaned sessions detected (#8)
- [x] Question waiting timeout (#10)
- [x] Context critical persistent (#5)
- [x] MCP download failures (#7)
- [x] Long-running command completion (#6)

**Not implemented:**
- [ ] Terminal spawn errors (#2) - already has toast notification
- [ ] Terminal spawned via API (#11) - low priority
- [ ] All subagents complete (#12) - low priority
- [ ] Git operations complete (#13) - requires output detection
- [ ] Multiple browser window warning (#14) - low priority

## Current Audio Notification Events (TTS)

The following events already have TTS audio notifications via `useStatusTransitions.ts`:

| Event | Location | Trigger |
|-------|----------|---------|
| Ready | `useStatusTransitions.ts:132` | Claude transitions from processing/tool_use to awaiting_input |
| Session Start | `useSessionAnnouncements.ts` | New terminal spawned |
| Session Close | `useSessionAnnouncements.ts` | Terminal closed |
| Tools | `useStatusTransitions.ts:154` | Claude calls a tool (Read, Write, Bash, etc.) |
| Subagents | `useStatusTransitions.ts:207` | Subagent count changes |
| Context Warning | `useStatusTransitions.ts:229` | Context usage crosses 50% threshold |
| Context Critical | `useStatusTransitions.ts:247` | Context usage crosses 75% threshold |
| MCP Downloads | `useAudioPlayback.ts` | tabz_download_file/image completes |
| AskUserQuestion | `useStatusTransitions.ts:267` | Claude asks a question with options |
| Plan Approval | `useStatusTransitions.ts:303` | ExitPlanMode presents approval menu |

---

## High Priority Notification Opportunities

### 1. WebSocket Disconnection (Backend Lost)

**Location:** `extension/background/websocket.ts:255-288`

**Trigger:** WebSocket `onclose` event with non-clean closure (code 1006)

**Current Behavior:** Broadcasts `WS_DISCONNECTED` to clients, schedules reconnect

**Suggested Notification:**
```typescript
// In newWs.onclose handler
if (!event.wasClean || event.code === 1006) {
  chrome.notifications.create({
    type: 'basic',
    title: 'TabzChrome Disconnected',
    message: 'Backend connection lost. Reconnecting...',
    iconUrl: 'icons/icon48.png',
    priority: 2,
    requireInteraction: false
  })
}
```

**Impact:** Users away from browser would know backend crashed/restarted

---

### 2. Terminal Spawn Errors

**Location:** `extension/sidepanel/sidepanel.tsx:391`

**Trigger:** Backend sends `spawn-error` message (e.g., invalid working directory)

**Current Behavior:** Shows red toast banner in sidepanel for 10 seconds

**Suggested Notification:**
```typescript
// Add to spawn-error handler
chrome.notifications.create({
  type: 'basic',
  title: 'Terminal Spawn Failed',
  message: error.message || 'Failed to create terminal',
  iconUrl: 'icons/icon48.png',
  priority: 1
})
```

**Impact:** Useful for API-spawned terminals where user may not see sidepanel

---

### 3. Terminal Exit with Error Code

**Location:** `backend/modules/pty-handler.js:489-503`

**Trigger:** PTY process exits with non-zero exit code

**Current Behavior:** Emits `pty-closed` event, broadcasts to frontend

**Suggested Implementation:**
```javascript
// In exitHandler, after broadcasting
if (exitCode !== 0 && exitCode !== null) {
  broadcastToWebSocket({
    type: 'terminal-error-exit',
    terminalId: id,
    name: name,
    exitCode,
    signal
  })
}
```

Frontend handler would show notification:
```typescript
{
  type: 'basic',
  title: `${name} exited with error`,
  message: `Exit code: ${exitCode}`,
  priority: 1
}
```

**Impact:** Catch commands that fail while user is away

---

### 4. React ErrorBoundary Crashes

**Location:** `extension/components/ErrorBoundary.tsx:82-112`

**Trigger:** Uncaught React error in component tree

**Current Behavior:** Logs to console, shows fallback UI, POSTs to `/api/log`

**Suggested Notification:**
```typescript
// In componentDidCatch
chrome.notifications.create({
  type: 'basic',
  title: 'TabzChrome Error',
  message: `Sidebar crashed: ${error.message}`,
  iconUrl: 'icons/icon48.png',
  priority: 2,
  buttons: [{ title: 'Reload' }]
})
```

**Impact:** Alert even if user has sidebar minimized

---

### 5. Context Critical (Persistent)

**Location:** `extension/hooks/useStatusTransitions.ts:247-263`

**Trigger:** Context usage crosses 75% threshold

**Current Behavior:** TTS alert with elevated pitch

**Suggested Enhancement:**
```typescript
// Add desktop notification that persists
chrome.notifications.create('context-critical-' + terminalId, {
  type: 'progress',
  title: `${displayName} Context Critical`,
  message: `${currentContextPct}% context used - consider /compact`,
  progress: currentContextPct,
  iconUrl: 'icons/icon48.png',
  priority: 2,
  requireInteraction: true  // Stay until dismissed
})
```

**Impact:** Critical warning persists even when audio is muted

---

## Medium Priority Opportunities

### 6. Long-Running Command Completion

**Location:** Would require new tracking in `backend/modules/pty-handler.js`

**Trigger:** Terminal has been "processing" for 5+ minutes, then transitions to ready

**Implementation Notes:**
- Track `processing` start time per terminal
- On ready transition, if elapsed > 5 min, emit notification event
- Could integrate with existing `useStatusTransitions.ts` ready announcement

**Suggested Notification:**
```typescript
{
  type: 'basic',
  title: `${profileName} finished`,
  message: `Long-running task completed after ${minutes}m`,
  priority: 1,
  requireInteraction: false
}
```

**Impact:** Know when builds/tests/installs finish

---

### 7. Download Failures

**Location:** `extension/background/browserMcp/downloads.ts:103`

**Trigger:** MCP download tool fails

**Current Behavior:** Logs `[Download TTS] Failed:` and speaks error

**Suggested Notification:**
```typescript
{
  type: 'basic',
  title: 'Download Failed',
  message: error.message,
  iconUrl: 'icons/icon48.png',
  priority: 1
}
```

**Impact:** Visible alert when downloads fail

---

### 8. Orphaned Sessions Detected

**Location:** `extension/hooks/useOrphanedSessions.ts:52-57`

**Trigger:** Polling detects orphaned tmux sessions (ghost badge)

**Current Behavior:** Updates ghost badge count

**Suggested Notification:** (first detection only)
```typescript
if (result.data.count > 0 && previousCount === 0) {
  chrome.notifications.create({
    type: 'basic',
    title: 'Orphaned Sessions Found',
    message: `${result.data.count} detached terminal(s) available`,
    iconUrl: 'icons/icon48.png',
    priority: 0
  })
}
```

**Impact:** User knows they have sessions to reattach

---

### 9. Backend Restart Detection

**Location:** `extension/background/websocket.ts:222-235`

**Trigger:** WebSocket reconnects after being disconnected

**Current Behavior:** Broadcasts `WS_CONNECTED`, updates badge

**Suggested Notification:**
```typescript
// Only if we were previously disconnected
if (hadPreviousConnection && wsReconnectAttempts > 0) {
  chrome.notifications.create({
    type: 'basic',
    title: 'TabzChrome Reconnected',
    message: 'Backend connection restored',
    iconUrl: 'icons/icon48.png',
    priority: 0
  })
}
```

**Impact:** Confirm recovery after backend restart

---

### 10. Claude Question Waiting (Timeout)

**Location:** `extension/hooks/useStatusTransitions.ts:267-300`

**Trigger:** AskUserQuestion event, but no response after N seconds

**Implementation Notes:**
- Track when question was asked
- If still `AskUserQuestion` after 60s, show reminder notification

**Suggested Notification:**
```typescript
{
  type: 'basic',
  title: `${profileName} waiting for answer`,
  message: firstQuestion.question.substring(0, 80),
  iconUrl: 'icons/icon48.png',
  priority: 1,
  requireInteraction: true
}
```

**Impact:** Don't leave Claude waiting when you walk away

---

## Low Priority Opportunities

### 11. Terminal Spawned via API

**Location:** `backend/routes/api.js:1484`

**Trigger:** `terminal-spawned` broadcast from API spawn endpoint

**Usefulness:** Confirmation that programmatic spawn succeeded

**Suggested Notification:**
```typescript
{
  type: 'basic',
  title: 'Terminal Created',
  message: `${terminal.name} ready`,
  priority: 0
}
```

---

### 12. All Subagents Complete

**Location:** `extension/hooks/useStatusTransitions.ts:215-219`

**Trigger:** Subagent count goes from N > 0 to 0

**Current Behavior:** TTS announcement "All agents complete"

**Could Add:** Desktop notification for visibility

---

### 13. Git Operations Complete

**Location:** `extension/hooks/useGitOperations.ts` (if implemented)

**Trigger:** Git push/pull/fetch commands complete

**Implementation:** Would require detecting git commands in terminal output

---

### 14. Multiple Browser Window Warning

**Location:** `extension/hooks/useTerminalSessions.ts:248-249`

**Trigger:** `connectionCount > 1` in terminals message

**Current Behavior:** Shows warning in header

**Could Add:** One-time notification on connect

---

## Implementation Architecture

### Option A: Frontend-Driven (Recommended)

Notifications triggered from extension frontend hooks:
- Add Chrome notifications API calls alongside existing TTS calls
- Respect a separate `desktopNotifications` settings toggle
- Events flow: Backend -> WebSocket -> Frontend hooks -> chrome.notifications

**Pros:** Settings synced with audio, unified event handling
**Cons:** Requires sidebar to be loaded

### Option B: Backend-Driven via MCP

Backend calls `tabz_notification_*` MCP tools directly:
- Add notification calls in critical error paths
- Uses existing MCP infrastructure

**Pros:** Works even if sidebar crashed
**Cons:** Adds MCP dependency to backend, harder to manage settings

### Option C: Hybrid

- Critical errors (spawn fail, backend restart) -> Backend via MCP
- Status events (ready, context) -> Frontend hooks

---

## Settings Schema Addition

```typescript
// extension/components/settings/types.ts
export interface NotificationSettings {
  enabled: boolean
  events: {
    backendDisconnect: boolean
    spawnError: boolean
    terminalError: boolean
    contextCritical: boolean
    longRunningComplete: boolean
    downloadFailure: boolean
    orphanedSessions: boolean
    questionWaiting: boolean
  }
  quietHours?: {
    enabled: boolean
    start: string  // "22:00"
    end: string    // "08:00"
  }
}
```

---

## Priority Implementation Order

1. **Spawn errors** - Easy win, already have the event
2. **WebSocket disconnect/reconnect** - Critical for reliability
3. **Context critical (persistent)** - High visibility for important alert
4. **Terminal error exit** - Catch failed commands
5. **Question waiting timeout** - Don't leave Claude hanging
6. **Long-running completion** - Most useful for power users

---

## Testing Checklist

- [x] Notifications show on Windows, macOS, Linux
- [x] `requireInteraction` works correctly per platform
- [x] Duplicate notifications prevented (use stable IDs)
- [x] Quiet hours respected if implemented
- [x] Settings toggle enables/disables correctly
- [x] Notifications clear when issue resolved (e.g., reconnect clears disconnect)
