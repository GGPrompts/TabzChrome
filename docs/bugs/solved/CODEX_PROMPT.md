# Codex Analysis Request: Audio/Reconnection Bugs

## Problem Summary

After refactoring a Chrome extension sidebar (extracting hooks from sidepanel.tsx), three issues appeared:

1. **No audio on session start** - `audioSettings.events.sessionStart` is true but no sound plays when spawning terminal
2. **Backend restart corrupts terminals** - Terminals freeze until page refresh
3. **"Ready" audio plays every ~10 seconds** - Should only play once when Claude finishes work

## Architecture

- Chrome extension sidebar with React + TypeScript
- Backend: Node.js + Express + WebSocket (port 8129)
- Terminals run in tmux sessions (`ctt-*` prefix)
- Audio notifications via edge-tts backend API

## Key Files

### useAudioNotifications.ts (Audio Logic)

```typescript
// Tracks previous status to detect transitions
const prevClaudeStatusesRef = useRef<Map<string, string>>(new Map())
const lastReadyAnnouncementRef = useRef<Map<string, number>>(new Map())

// Ready notification fires when: processing/tool_use → awaiting_input
const wasWorking = prevStatus === 'processing' || prevStatus === 'tool_use'
const isNowReady = currentStatus === 'awaiting_input' || currentStatus === 'idle'
const isValidTransition = wasWorking && isNowReady && currentSubagentCount === 0
const cooldownPassed = (now - lastReadyTime) > cooldownMs  // 30s cooldown

// BUG: No sessionStart event handling exists in this hook!
```

### useTerminalSessions.ts (Session State)

```typescript
// Deduplication for reconnects
const reconnectedTerminalsRef = useRef<Set<string>>(new Set())

// On terminal spawn, sends RECONNECT immediately (line 246-249)
sendMessage({ type: 'RECONNECT', terminalId: terminal.id })

// On terminals list, sends RECONNECT for each (line 110-118)
backendTerminals.forEach((t: any) => {
  if (!reconnectedTerminalsRef.current.has(t.id)) {
    reconnectedTerminalsRef.current.add(t.id)
    sendMessage({ type: 'RECONNECT', terminalId: t.id })
  }
})
```

### Backend Log on Session Start

```
[Server] 📤 Broadcasting terminal-spawned: {...}
[WS] Received reconnect request for terminal: ctt-quietclaude-3b3c6e24
[TerminalRegistry] Terminal QuietClaude already has active PTY, returning
```

Note: RECONNECT is sent immediately after spawn, which may be redundant.

## Questions for Analysis

1. **Session Start Audio**: The `audioSettings.events.sessionStart` flag exists but I don't see any code that plays audio when a terminal spawns. Was this never implemented, or was it lost during refactoring?

2. **Repeated Ready Audio**: The code has `prevClaudeStatusesRef` to track transitions, plus a 30s cooldown. Why might "ready" still play every 10 seconds? Possible causes:
   - Hook remounting (refs reset)
   - prevStatus being undefined on first check
   - Multiple hook instances

3. **Terminal Freeze on Backend Restart**: The RECONNECT deduplication uses `reconnectedTerminalsRef`. If the backend restarts but the frontend doesn't clear this set, terminals won't re-register. Is the `!wsConnected` branch (line 86-89) working correctly?

4. **Race Condition**: On spawn, both `terminal-spawned` handler AND `terminals` list handler may send RECONNECT for the same terminal. Is this safe or problematic?

## What I Need

Identify the root causes and suggest specific code fixes for each of the 3 issues.
