# Audio Duplicate "Ready" Announcements Debug

**Date:** December 10, 2025
**Status:** Fixes applied, awaiting testing after PC restart

## Problem

Audio was announcing "[Profile] ready" repeatedly every 5-10 seconds while Claude was idle, instead of just once when Claude finished working.

## Root Causes Identified

### 1. Missing `workingDir` During Session Recovery (FIXED)

When backend restarts and recovers tmux sessions, `workingDir` was not being passed to `registerTerminal()`:

```
[TerminalRegistry] Working directory: undefined -> /home/matt
```

This caused Claude status API to fail to match properly because it was looking for terminals with workingDir `/home/matt` instead of `/home/matt/projects/TabzChrome`.

**Fix:** Added code to retrieve the actual working directory from tmux during recovery:

```javascript
// backend/server.js (lines 1031-1038)
let workingDir;
try {
  workingDir = execSync(`tmux display-message -p -t "${sessionName}" "#{pane_current_path}" 2>/dev/null`).toString().trim();
  log.info(`[Recovery] Got workingDir from tmux for ${sessionName}: ${workingDir}`);
} catch (e) {
  log.debug(`Could not get working dir for ${sessionName}: ${e.message}`);
}
```

### 2. Duplicate Reconnect Requests (FIXED)

The frontend was sending 3 `RECONNECT` requests per terminal because:
1. Backend sends `terminals` message on initial WebSocket connect
2. Frontend sends `LIST_TERMINALS` (possibly twice due to React effects)
3. Each `terminals` message triggered `RECONNECT` for every terminal

**Fix:** Added deduplication in frontend:

```typescript
// extension/hooks/useTerminalSessions.ts
const reconnectedTerminalsRef = useRef<Set<string>>(new Set())

// In terminals message handler:
backendTerminals.forEach((t: any) => {
  if (!reconnectedTerminalsRef.current.has(t.id)) {
    reconnectedTerminalsRef.current.add(t.id)
    sendMessage({ type: 'RECONNECT', terminalId: t.id })
  }
})

// Clear on disconnect so we reconnect fresh:
else if (!wsConnected) {
  reconnectedTerminalsRef.current.clear()
}
```

### 3. Audio 30-Second Cooldown (Already in place)

A 30-second per-terminal cooldown was added as a backup safeguard:

```typescript
// extension/hooks/useAudioNotifications.ts (lines 273-295)
const cooldownMs = 30000 // 30 seconds minimum between ready announcements
const lastReadyTime = lastReadyAnnouncementRef.current.get(terminalId) || 0
const cooldownPassed = (now - lastReadyTime) > cooldownMs
```

## Files Modified

1. **backend/server.js**
   - Lines 1031-1038: Added tmux workingDir retrieval during recovery
   - Added log: `[Recovery] Got workingDir from tmux for ${sessionName}: ${workingDir}`

2. **extension/hooks/useTerminalSessions.ts**
   - Line 48: Added `reconnectedTerminalsRef`
   - Lines 86-90: Clear set on WebSocket disconnect
   - Lines 107-113: Skip duplicate reconnects

3. **extension/hooks/useAudioNotifications.ts**
   - Lines 68-70: `lastReadyAnnouncementRef` with 30-second cooldown
   - Lines 76-82: Mount/unmount logging to detect sidebar remounting
   - Lines 273-295: Cooldown logic with logging

## Expected Behavior After Fixes

### Backend Restart Logs Should Show:
```
[info] [Server] 🔄 Recovering 1 ctt- sessions...
[info] [Server] [Recovery] Got workingDir from tmux for ctt-claudia-40b80e73: /home/matt/projects/TabzChrome
[TerminalRegistry] Working directory: /home/matt/projects/TabzChrome -> /home/matt/projects/TabzChrome
...
[WS] Received reconnect request for terminal: ctt-claudia-40b80e73
```

Only ONE reconnect request per terminal (not 3).

### Sidebar Console Logs Should Show:
```
[Audio] 🟢 Hook MOUNTED (id=abc123)
[Audio] useEffect triggered, claudeStatuses.size=1, sessions.length=1
[Audio] 40b80e73: processing → awaiting_input, wasWorking=true, cooldown=OK
[Audio] 🔊 PLAYING ready for 40b80e73 (processing → awaiting_input)
```

Then on subsequent polls while idle:
```
[Audio] 40b80e73: awaiting_input → awaiting_input, wasWorking=false, cooldown=25s left
```

No audio plays because `wasWorking=false`.

## Testing Steps

1. **Restart backend:** `cd backend && npm start`
2. **Reload Chrome extension:** chrome://extensions → Reload button
3. **Check backend logs** for correct workingDir and single reconnect
4. **Open sidebar DevTools** (right-click sidebar → Inspect)
5. **Watch console** for `[Audio]` logs
6. **Verify:** Claude finishing work triggers ONE "ready" announcement, then silence

## Debug Logging (To Be Removed)

Once fixes are confirmed working, remove these debug logs:

- `useAudioNotifications.ts`: Mount/unmount logging (lines 76-82)
- `useAudioNotifications.ts`: Verbose transition logging (line 285)
- `backend/server.js`: Recovery workingDir log (line 1035)

## Architecture Notes

### Audio Ready Announcement Flow:
1. Claude status polling every 1 second (`useClaudeStatus.ts`)
2. Status changes propagate to `useAudioNotifications` hook
3. Hook checks transition: `wasWorking && isNowReady && cooldownPassed`
4. If all true, plays audio via backend `/api/audio/generate`

### Terminal Recovery Flow:
1. Backend starts → detects existing `ctt-*` tmux sessions
2. Gets workingDir from tmux: `tmux display-message -p -t "session" "#{pane_current_path}"`
3. Registers terminal with full config including workingDir
4. Broadcasts `terminals` message to connected sidebars
5. Sidebar sends `RECONNECT` for each terminal (deduplicated)

### Status Matching:
- Claude state files: `/tmp/claude-code-state/_28.json`
- Contains: `status`, `working_dir`, `tmux_pane`, `current_tool`
- API matches by tmux pane ID (primary) or working_dir (fallback)
