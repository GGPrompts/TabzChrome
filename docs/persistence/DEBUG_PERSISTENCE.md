# Terminal Persistence Debugging Session

## 🎯 Current Status (Nov 8, 2025 - 2:10 AM)

### ✅ What Works
1. **localStorage persistence** - Terminals are saved and restored from localStorage
2. **Short session names** - Using format `tt-bash-xyz`, `tt-cc-abc`, etc. (random suffix)
3. **Tmux sessions survive refresh** - Sessions remain alive in tmux
4. **Session query works** - Backend correctly returns list of active sessions
5. **All terminals matched successfully** - All 3 terminals show "✅ Matched terminal" in logs
6. **All terminals reach 'active' status** - Logs show `status: 'active'` for all 3 terminals
7. **Command matching works** - Fixed to match by `terminal.command` (e.g., 'tfe', 'lazygit')
8. **Clear button works** - 🗑️ button kills all `tt-*` sessions safely

### ❌ Critical Bug: Only Active Tab Renders After Refresh

**Symptoms:**
- All 3 terminals match successfully (see logs)
- All 3 terminals have `status: 'active'`
- Only the **currently selected/active** terminal actually renders
- Other terminals show emoji icon but xterm.js never loads
- Console logs show: "All 3 matched" but only 1 renders

**Key Logs from Last Test:**
```
[SimpleTerminalApp] ✅ Matched terminal: terminal-1762586950342-wso8p82f5 (tui-tool)
[SimpleTerminalApp] ✅ Matched terminal: terminal-1762586954175-fsvu24veb (opencode)
[SimpleTerminalApp] ✅ Matched terminal: terminal-1762587013401-gwa873cn1 (bash)

All 3 have:
- requestId: undefined (correct after match)
- status: 'active' (correct)
- Found in pendingSpawns: true
```

---

## 🔍 Investigation Steps for Next Session

### 1. Check Terminal Component Mounting

**File:** `src/components/Terminal.tsx`

**Check if ALL terminals are trying to mount xterm.js:**
- Look for the `xterm.open()` call
- Add console.log to track which terminal IDs attempt to mount
- Check if inactive terminals fail silently

**Hypothesis:** Only the active terminal successfully mounts xterm.js, inactive ones fail to attach.

### 2. Check Rendering Condition

**File:** `src/SimpleTerminalApp.tsx` (around line 912)

```typescript
// Current condition:
if (!agent || terminal.status !== 'active') {
  return <LoadingSpinner />
}
```

**Debug steps:**
- Add console.log BEFORE rendering each Terminal component
- Log: `terminal.id`, `agent exists?`, `status`, `isActive`
- Check if condition is passing for all 3 terminals

### 3. Check `isSelected` Prop Issue

**File:** `src/SimpleTerminalApp.tsx` (around line 939)

```typescript
<Terminal
  isSelected={terminal.id === activeTerminalId}
  // ...
/>
```

**Hypothesis:** The Terminal component might only fully initialize when `isSelected={true}`.

**Debug steps:**
- Check if Terminal.tsx has conditional logic based on `isSelected`
- Look for visibility effects in Terminal.tsx
- Try removing the `isSelected` dependency temporarily

### 4. Check Agent Synchronization

**File:** `src/SimpleTerminalApp.tsx` (lines 64-89)

The `agents` useMemo merges WebSocket agents with stored terminals:

```typescript
const agents = useMemo(() => {
  // Complex merging logic
}, [webSocketAgents, storedTerminals])
```

**Debug steps:**
- Log the final `agents` array - does it have 3 agents?
- For each terminal, log if `agents.find(a => a.id === terminal.agentId)` succeeds
- Check if agentIds are being cleared too aggressively

---

## 🛠️ Quick Fixes to Try

### Fix 1: Force Render All Terminals (Test)

**File:** `src/SimpleTerminalApp.tsx` (line 913)

```typescript
// TEMPORARILY remove status check:
if (!agent) {
  return <LoadingSpinner />
}
// Don't check terminal.status !== 'active'
```

This will force rendering even if status is wrong.

### Fix 2: Add Visibility Effect

**File:** `src/components/Terminal.tsx`

Add a useEffect that triggers when terminal becomes visible:

```typescript
useEffect(() => {
  if (isSelected && !xtermRef.current) {
    // Force initialize xterm.js
    initializeTerminal()
  }
}, [isSelected])
```

### Fix 3: Check Display None Issue

**File:** `src/SimpleTerminalApp.tsx` (line 927)

```typescript
<div
  style={{ display: terminal.id === activeTerminalId ? 'block' : 'none' }}
  className="terminal-wrapper"
>
```

**Issue:** xterm.js might fail to initialize when parent has `display: none`.

**Fix:** Change to `visibility: hidden` or render all terminals with `display: block` but use CSS positioning:

```typescript
<div
  style={{
    display: 'block',
    position: terminal.id === activeTerminalId ? 'relative' : 'absolute',
    visibility: terminal.id === activeTerminalId ? 'visible' : 'hidden',
    left: terminal.id === activeTerminalId ? 0 : '-9999px'
  }}
  className="terminal-wrapper"
>
```

---

## 📋 Files Modified This Session

### Critical Files:
1. **src/SimpleTerminalApp.tsx** - Main app, reconnection logic, rendering
2. **src/stores/simpleTerminalStore.ts** - Added `command` field to Terminal interface
3. **backend/server.js** - Fixed session query filter (`tt-*` instead of `terminal-tabs-*`)
4. **backend/routes/api.js** - Added `/api/tmux/cleanup` endpoint

### Key Changes:
- `resumable: true` - Sessions survive disconnect
- Random session names (`tt-bash-xyz`)
- Command-based matching for spawn options
- Stale agentId clearing on mount
- `spawnOptionsRef` to fix closure bug

---

## 🎯 Most Likely Root Cause

**The `display: none` CSS is preventing xterm.js from initializing for inactive terminals.**

xterm.js requires:
1. Parent element to have non-zero dimensions
2. Element to be in the DOM and visible
3. `xterm.open(element)` to be called when element is ready

When terminals are hidden with `display: none`, the container has **zero dimensions**, so xterm.js can't calculate the proper size.

---

## 🚀 Recommended Next Steps

1. **Change `display: none` to `visibility: hidden`** (keeps dimensions)
2. **Add resize trigger when tab becomes active** (force xterm to recalculate)
3. **Add console logs to Terminal.tsx** to see which terminals actually mount
4. **Check if fitAddon fails silently** for hidden terminals

---

## 📊 Test Results Summary

| Test | Result |
|------|--------|
| localStorage saves all terminals | ✅ Working |
| Tmux sessions survive refresh | ✅ Working |
| Backend query returns all sessions | ✅ Working |
| All terminals match successfully | ✅ Working |
| All terminals reach status: 'active' | ✅ Working |
| **All terminals RENDER after refresh** | ❌ **BROKEN** |
| Only active tab renders | ✅ Reproducible bug |
| Clear button kills tt-* sessions | ✅ Working |
| Random session names | ✅ Working |
| Command-based spawn option matching | ✅ Working |

---

## 💡 Additional Context

### Session Name Format
- `tt-cc-xyz` - Claude Code
- `tt-bash-abc` - Bash
- `tt-tfe-123` - TFE
- `tt-lg-456` - LazyGit
- Random 3-char suffix prevents collisions

### Cleanup Pattern
- Kills: `tt-*` (only our sessions)
- Safe: `terminal-tabs`, `pyradio`, etc.

### Request Flow
```
Page Load
  ↓
Clear stale agentIds (✅ working)
  ↓
Query tmux sessions (✅ working)
  ↓
Match terminals to sessions (✅ working)
  ↓
Reconnect all terminals (✅ working)
  ↓
Update status to 'active' (✅ working)
  ↓
Render Terminal components (❌ BROKEN - only active tab renders)
```

---

## 🔑 Key Code Locations

**Rendering logic:** `src/SimpleTerminalApp.tsx:912-940`
**Terminal mounting:** `src/components/Terminal.tsx:~200-250`
**Agent matching:** `src/SimpleTerminalApp.tsx:377-420`
**Reconnection:** `src/SimpleTerminalApp.tsx:630-680`
**Session query:** `backend/server.js:223-251`

---

**Status:** Ready for next debugging session
**Priority:** HIGH - Core functionality broken
**Estimated Fix Time:** 15-30 minutes (likely CSS/visibility issue)
**Complexity:** Medium (xterm.js mounting quirk)
