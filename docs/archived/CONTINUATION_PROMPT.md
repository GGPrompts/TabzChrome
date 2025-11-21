# Continuation Prompt: Multi-Window Detach/Reattach + Working Directory Display Complete

## What Was Completed (November 13, 2025)

### Session Summary
This session fixed critical cross-window state synchronization for the detach/reattach feature and added working directory display to tab names and tmux status bar.

### Cross-Window State Sync Fix ✅ (Codex-Assisted)

**Problem:** When detaching a terminal in a popped-out window, the main window didn't see the update in real-time (only after manual refresh). Same issue when reattaching from main window - popout window didn't update.

**Root Cause (discovered via Codex):**
1. **localStorage is process-cached per window in Chrome** - Other windows don't see new values until browser delivers a real storage event that refreshes the cache
2. **Reading localStorage directly returns stale data** - The receiver window's cache isn't refreshed by BroadcastChannel messages
3. **Zustand persist doesn't auto-sync across tabs** - It writes on every set but doesn't listen to storage events to update other tabs
4. **No debounce exists in persist** - The 100ms delay assumption was incorrect; setItem happens synchronously

**Fix Applied:**
- **Sender:** Include full state payload in broadcast message (not just notification)
- **Receiver:** Apply state directly from payload to Zustand store (bypass localStorage read)
- **Result:** Instant cross-window sync without refresh

**Files Modified:**
- `src/SimpleTerminalApp.tsx`:
  - Lines 549-581: Updated receiver to parse payload and apply directly to store
  - Lines 674-683: Added payload to window-closing detach broadcast
  - Lines 1013-1024: Added payload to split container detach broadcast
  - Lines 1112-1125: Added payload to single terminal detach broadcast
  - Lines 1206-1217: Added payload to split container reattach broadcast
  - Lines 1256-1267: Added payload to single terminal reattach broadcast

**Broadcast Message Format (NEW):**
```typescript
{
  type: 'state-changed',
  payload: localStorage.getItem('simple-terminal-storage'), // Full state JSON
  from: currentWindowId, // Sender window ID (to ignore self)
  at: Date.now() // Timestamp
}
```

**Receiver Logic (NEW):**
```typescript
// Parse payload and apply directly (no localStorage read)
const parsed = JSON.parse(event.data.payload)
const next = parsed?.state
if (next && next.terminals) {
  useSimpleTerminalStore.setState({
    terminals: next.terminals,
    activeTerminalId: next.activeTerminalId,
    focusedTerminalId: next.focusedTerminalId
  })
}
```

### WebSocket Disconnect on Detach Fix ✅

**Problem:** When reattaching a terminal in the main window after detaching in popout window, the terminal would spawn in BOTH windows and the main window would hang on "Connecting to terminal..."

**Root Cause:**
- When detaching, we weren't sending WebSocket `disconnect` message to backend
- Backend's `terminalOwners` map still had popout window as owner
- When main window reattached and spawned, backend sent `terminal-spawned` to BOTH windows
- Both windows tried to connect, creating a race condition

**Fix Applied:**
- Added WebSocket disconnect message when detaching (both single and split)
- Uses `type: 'disconnect'` (not `close` which would kill tmux session)
- Backend removes window from terminalOwners map
- Only requesting window receives `terminal-spawned` on reattach

**Files Modified:**
- `src/SimpleTerminalApp.tsx`:
  - Lines 1092-1100: Send disconnect for single terminal detach
  - Lines 984-992: Send disconnect for each pane in split container detach

**Disconnect Message:**
```typescript
if (terminal.agentId && wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
  wsRef.current.send(JSON.stringify({
    type: 'disconnect',
    data: { terminalId: terminal.agentId }
  }))
}
```

### Working Directory Display ✅

**Feature:** Tab names and tmux status bar now show current working directory

**Implementation:**
- Backend API now fetches `#{pane_current_path}` from tmux
- Shortens home directory to `~` for display
- Appends to tab names as `@ ~/path`
- Filters out directory-like window names (e.g., `./script`, `../dir`)
- Shows in both Tabz tab names AND green tmux status bar

**Files Modified:**
- `backend/routes/api.js`:
  - Lines 802-807: Added `#{pane_current_path}` to tmux display-message query
  - Lines 814-816: Shorten home dir to `~`
  - Lines 825-827: Filter directory-like window names
  - Lines 829-846: Build display name with optional directory context

- `.tmux-terminal-tabs.conf`:
  - Line 65: Updated status-right to show `#{pane_current_path}` alongside Claude status

**Display Examples:**
- `claude @ ~/projects/terminal-tabs`
- `bash @ ~/my-repo`
- `gitui @ ~/projects/foo`
- `bash (./script) @ ~/scripts` (when running local script)

### Terminal Name Sync Improvements ✅

**Fix:** Prevent directory paths from being used as terminal names

**Changes:**
- `src/hooks/useTerminalNameSync.ts`:
  - Removed aggressive debug logging (clean console)
  - Uses `setTimeout(0)` to prevent React setState warnings during render
  - Filters generic hostnames and shell names

- `backend/routes/api.js`:
  - Detects directory-like window names (contains `.`, `/`, `~`)
  - Prefers window_name only if it's a useful app name (not a directory)
  - Falls back to spawn label for generic titles

## Testing Guide for Multi-Window Detach/Reattach

### Critical Test Scenarios (NEEDS AUTOMATED TESTS)

**1. Basic Detach → Reattach Flow:**
```
Setup:
  - Main window with 1 terminal
  - Pop out terminal to new window

Test:
  1. In popout window: Right-click tab → Detach
  2. Verify main window shows "📌 Detached (1)" button (no refresh)
  3. Verify popout window shows grayed tab with 📌 icon
  4. In main window: Click "📌 Detached (1)" → Select terminal → Reattach
  5. Verify terminal spawns ONLY in main window (not popout)
  6. Verify popout window sees detached count → 0 (no refresh)
  7. Verify terminal is connected and usable in main window

Expected Console Logs:
  - Popout: "📡 Broadcasting state-changed to other windows (after localStorage sync)"
  - Popout: "Sending disconnect to backend for agentId: xxxxxxxx"
  - Main: "🔄 State changed in another window, applying payload..."
  - Main: "✓ Applied state from broadcast: 1 detached terminals"
  - Main: "📡 Broadcasting reattach to other windows"
  - Popout: "✓ Applied state from broadcast: 0 detached terminals"
```

**2. Split Container Detach → Reattach:**
```
Setup:
  - Create split (TFE + Bash)
  - Pop out split to new window

Test:
  1. In popout window: Right-click either split tab → Detach
  2. Verify both panes detached (split layout preserved)
  3. Verify main window shows "📌 Detached (1)" for container
  4. In main window: Reattach split container
  5. Verify split restores with both panes
  6. Verify both panes spawn ONLY in main window
  7. Verify no escape sequence corruption (no `1;2c0;276;0c`)

Expected:
  - Detach sends disconnect for BOTH panes
  - Backend removes both from terminalOwners
  - Reattach spawns both panes in main window only
  - Split layout preserved (horizontal/vertical)
```

**3. Close Popout Window (beforeunload handler):**
```
Setup:
  - Pop out terminal to new window

Test:
  1. Close popout window (X button or Ctrl+W)
  2. Verify main window shows "📌 Detached (1)" immediately
  3. Verify terminal can be reattached from main window
  4. Verify terminal spawns only in main window (not zombie popout)

Expected:
  - beforeunload marks terminal as detached
  - Broadcasts state-changed with payload
  - Main window receives and updates immediately
```

**4. Bidirectional Sync:**
```
Setup:
  - Main window + Popout window both open

Test:
  1. Main window: Detach terminal A
  2. Verify popout sees "📌 Detached (1)"
  3. Popout window: Detach terminal B
  4. Verify main sees "📌 Detached (2)"
  5. Main window: Reattach terminal A
  6. Verify popout sees "📌 Detached (1)"
  7. Popout window: Reattach terminal B
  8. Verify main sees "📌 Detached (0)"

Expected:
  - Each action broadcasts with payload
  - Other windows update instantly
  - No race conditions or stale state
```

**5. Working Directory Display:**
```
Test:
  1. Spawn bash terminal in ~/projects/myapp
  2. Verify tab shows "bash @ ~/projects/myapp"
  3. Verify tmux status bar shows "📁 ~/projects/myapp"
  4. cd to ~/documents
  5. Wait 2 seconds (name sync interval)
  6. Verify tab updates to "bash @ ~/documents"
  7. Run local script: ./build.sh
  8. Verify tab shows "bash (./build.sh) @ ~/projects/myapp"

Expected:
  - Working directory updates every 2 seconds
  - Home directory shortened to ~
  - Directory commands shown in parentheses
```

## Architecture Notes

**BroadcastChannel + Zustand State Sync:**
- **Old approach (broken):** Broadcast notification → receiver reads localStorage → localStorage cache stale → shows 0 detached
- **New approach (working):** Broadcast full payload → receiver applies directly to Zustand → instant update

**Critical Timing:**
- Sender waits 150ms before broadcasting (allows Zustand persist to write to localStorage)
- Receiver applies payload immediately (no localStorage read)
- No race conditions because payload contains authoritative state

**Backend Terminal Ownership:**
- `terminalOwners` Map tracks which WebSocket connections own each terminal
- When detaching: send `disconnect` message to remove from map
- When spawning: backend only sends `terminal-spawned` to registered owners
- Prevents multiple windows from receiving spawn events

**Window Closing Detection:**
- `beforeunload` event handler marks terminals as detached
- Only fires for non-main windows (currentWindowId !== 'main')
- Broadcasts state to other windows before closing
- Allows seamless reattach from other windows

## Known Edge Cases to Test

1. **Rapid detach/reattach cycles** - Verify no duplicate broadcasts or state corruption
2. **Multiple windows detaching simultaneously** - Verify last-write-wins and no lost updates
3. **Network interruption during broadcast** - Verify graceful degradation (localStorage still works)
4. **Closing window mid-detach** - Verify broadcast completes before window closes
5. **Reattaching while other window still connecting** - Verify backend ownership prevents conflicts

## Files Modified Summary

### Frontend:
- `src/SimpleTerminalApp.tsx` - BroadcastChannel receiver + all broadcast senders (6 locations)
- `src/hooks/useTerminalNameSync.ts` - Removed debug logs, added setTimeout(0) for React warnings
- `.tmux-terminal-tabs.conf` - Added `#{pane_current_path}` to status-right

### Backend:
- `backend/routes/api.js` - Added working directory to tmux info API, filter directory names

### Key Changes:
- Broadcast messages now include full state payload
- Receiver applies state directly (no localStorage read)
- Detach sends WebSocket disconnect message
- Working directory shown in tabs and tmux status bar

## Next Session TODO

**Write comprehensive integration tests for:**
1. Cross-window detach/reattach flow
2. Split container detach/reattach
3. Window closing auto-detach
4. Bidirectional state sync (multiple windows)
5. Working directory display and updates
6. Edge cases listed above

**Test framework considerations:**
- Need multi-window/tab testing capability
- Mock BroadcastChannel or use real browser contexts
- Mock WebSocket for backend interaction
- Test localStorage sync timing
- Verify Zustand state updates across windows

**Recommended tools:**
- Playwright (multi-tab/window support)
- Jest + @testing-library/react (unit tests for hooks)
- Mock Service Worker (WebSocket mocking)
