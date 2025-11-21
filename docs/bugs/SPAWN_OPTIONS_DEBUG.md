# Spawn Options Debug Prompt

## Problem Statement

**Spawn options are not working correctly in the Chrome extension.**

**Symptom**: Backend receives invalid `terminalType: "tui-tool"` instead of valid types like `bash`, `claude-code`, etc.

**Backend Log Example**:
```
[UnifiedSpawn] Spawn request FULL CONFIG: {
  "terminalType": "tui-tool",   // ❌ INVALID - should be "bash"
  "command": "tfe",
  "useTmux": true,
  "name": "TFE",
  "requestId": "spawn-1763446099909"
}
```

**Root Cause**: Chrome extension is using `terminalType` field from spawn-options.json incorrectly.

**Additional Request**: Move ALL commands (spawn + clipboard) to spawn-options.json instead of hardcoding clipboard commands in QuickCommandsPanel.tsx.

## Tasks

### Task 1: Fix Spawn Options (terminalType Issue)

**Problem**: Extension sends wrong terminalType to backend

**Expected Behavior** (from web app):
```json
// spawn-options.json
{
  "label": "TFE",
  "terminalType": "bash",      // ✅ CORRECT - what backend spawns
  "command": "tfe",             // Command to run in bash
  "icon": "📁",
  "description": "Terminal File Explorer"
}
```

**Current Behavior** (Chrome extension):
```json
// spawn-options.json
{
  "label": "TFE",
  "terminalType": "tui-tool",  // ❌ WRONG - not a valid backend type
  "command": "tfe",
  "icon": "📁",
  "description": "Terminal File Explorer"
}
```

**Fix Required**:
1. Update `public/spawn-options.json` to use valid terminalTypes (bash, claude-code, etc.)
2. Ensure extension sends correct terminalType to backend
3. Test that terminals spawn correctly

### Task 2: Move All Commands to spawn-options.json

**Current State**:
- Spawn commands: Loaded from `spawn-options.json`
- Clipboard commands (git, npm, shell): Hardcoded in `QuickCommandsPanel.tsx`

**Desired State**:
- ALL commands stored in `spawn-options.json`
- QuickCommandsPanel loads everything from JSON
- Two sections in JSON:
  ```json
  {
    "spawnOptions": [...],      // Terminals to spawn
    "clipboardCommands": [...]  // Commands to copy
  }
  ```

**Implementation**:
1. Add `clipboardCommands` array to spawn-options.json
2. Remove hardcoded clipboard commands from QuickCommandsPanel.tsx
3. Load both arrays on mount
4. Merge into single commands list with proper categorization

---

## Audit Request

Please compare the Chrome extension (`~/projects/terminal-tabs-extension`) with the working web app (`~/projects/terminal-tabs`) to identify differences in:

1. **Xterm Configuration**
   - Terminal initialization settings
   - Scrollback, convertEol, allowProposedApi settings
   - Theme application
   - Font settings

2. **Tmux Settings & Detection**
   - How tmux sessions are detected
   - Scrollback behavior (0 vs 10000)
   - EOL conversion settings
   - Status bar rendering

3. **Spawn Options Flow**
   - How spawn options are loaded (JSON vs hardcoded)
   - Message passing from UI → background → backend
   - Terminal type, command, working directory handling
   - Session name generation

## Files to Compare

### Chrome Extension (Current - Broken)
```
extension/components/Terminal.tsx          # Xterm initialization
extension/components/QuickCommandsPanel.tsx # Spawn options loading
extension/sidepanel/sidepanel.tsx           # Terminal spawning
extension/background/background.ts          # Message forwarding to backend
extension/shared/messaging.ts               # Message types
public/spawn-options.json                   # Spawn config
```

### Web App (Reference - Working)
```
src/components/Terminal.tsx                 # Xterm initialization
src/SimpleTerminalApp.tsx                   # Terminal spawning
src/hooks/useTerminalSpawning.ts            # Spawn logic
public/spawn-options.json                   # Spawn config
```

### Backend (Shared - Should be same)
```
backend/modules/terminal-registry.js        # Terminal creation
backend/modules/pty-handler.js              # PTY spawning
backend/modules/unified-spawn.js            # Spawn logic
backend/server.js                           # WebSocket handling
```

## Specific Questions

1. **Are spawn options being loaded correctly?**
   - Check browser console for: `[QuickCommandsPanel] ✅ Loaded spawn options: X`
   - Verify spawn-options.json is being fetched
   - Compare JSON structure between extension and web app

2. **Is the spawn message format correct?**
   - Extension message format vs web app message format
   - Are all required fields present? (terminalType, command, workingDirectory, useTmux)
   - Is the background worker transforming messages correctly?

3. **Are xterm settings different?**
   - Compare Terminal.tsx xterm initialization in both projects
   - Check for differences in:
     - `convertEol` setting (should be false for tmux)
     - `scrollback` setting (0 for tmux, 10000 for non-tmux)
     - `allowProposedApi` setting
     - Theme application

4. **Is tmux detection working?**
   - How does the extension detect tmux sessions? (via `sessionName` prop)
   - How does the web app detect tmux? (via `resumable` prop or similar)
   - Are terminal props being passed correctly?

5. **Are there differences in spawn-options.json?**
   - Compare `terminalType` field usage
   - Compare `command` field usage
   - Compare `workingDir` vs `workingDirectory`
   - Compare `useTmux` vs `resumable`

6. **What are valid terminalTypes in the backend?**
   - Check `backend/modules/pty-handler.js` or `backend/modules/unified-spawn.js`
   - Valid types are likely: `bash`, `claude-code`, `zsh`, etc.
   - NOT valid: `tui-tool`, generic types
   - Most TUI tools (tfe, lazygit, htop) should use `terminalType: "bash"` with `command: "tfe"`

## Expected Output

Please provide:

1. **List of Differences**
   - Side-by-side comparison of key settings
   - Highlight what's different between extension and web app

2. **Root Cause Analysis**
   - What's causing spawn options to not work?
   - Missing fields? Wrong message format? Configuration mismatch?

3. **Fix Recommendations**
   - Specific code changes needed
   - Files to modify
   - Settings to update

## Debugging Commands

```bash
# Check if spawn-options.json is accessible
curl http://localhost:5173/spawn-options.json  # Web app
# Extension uses chrome.runtime.getURL('spawn-options.json')

# Backend logs (tmux session)
tmux attach -t tabz:backend

# Check what terminals backend sees
tmux ls | grep "ctt-"

# Browser console (after clicking spawn option)
# Should see messages like:
# [QuickCommandsPanel] Spawning: Claude Code
# [Background] 📤 Spawning terminal: { terminalType, command, cwd, useTmux, name }
# [Backend] Terminal spawned: ctt-xxxxx
```

## Test Case

**Minimal reproduction:**
1. Open Chrome extension sidebar
2. Click Commands panel
3. Click "Claude Code" spawn option
4. **Expected**: Terminal spawns with Claude Code running
5. **Actual**: ??? (describe what happens)

Check:
- Does terminal tab appear?
- Is terminal blank or does it show output?
- Are there errors in browser console?
- Are there errors in backend logs?

---

## Summary of Required Changes

1. **Fix spawn-options.json** - Change all `terminalType: "tui-tool"` to valid types
   - TFE, LazyGit, htop, etc. should use `terminalType: "bash"`
   - Claude Code should use `terminalType: "claude-code"`

2. **Move clipboard commands to JSON** - Add `clipboardCommands` array to spawn-options.json
   - Git commands (status, pull, push, commit, etc.)
   - Development commands (npm install, npm test, etc.)
   - Shell commands (ls, mkdir, find, etc.)

3. **Update QuickCommandsPanel.tsx** - Load all commands from JSON
   - Remove hardcoded `clipboardCommands` array
   - Load both `spawnOptions` and `clipboardCommands` from JSON
   - Merge into single list

4. **Test spawning** - Verify all spawn options work
   - Claude Code spawns correctly
   - Bash terminals spawn correctly
   - TUI tools (TFE, LazyGit) spawn in bash and run their commands

---

**Priority**: High - Spawn options are core functionality
**Impact**: Users cannot spawn terminals from UI
**Next Steps**:
1. Compare spawn-options.json structure between extension and web app
2. Fix terminalType values
3. Move clipboard commands to JSON
4. Test all spawn options

---

**Created**: November 18, 2025
**Status**: Ready for implementation
**Backend Error**: `terminalType: "tui-tool"` not recognized
