# Send Keys Safety - Local Development Only

## ⚠️ WARNING

The send-keys feature allows automated command execution in terminals.
This is **intentionally dangerous** and should only be enabled for local development.

## Safety Mechanisms

### 1. Environment Flag (Required)
```bash
# backend/.env
ALLOW_SEND_KEYS=true  # Must be explicitly enabled
```

### 2. Safety Mode Toggle (UI)
User can toggle "Automation Mode" in settings:
- 🔒 **Safe Mode** (default) - All send-keys require confirmation dialog
- ⚡ **Fast Mode** - No confirmation, but logs everything
- 💀 **Danger Mode** - No confirmation, no logs (you're on your own)

### 3. Emergency Kill Switch
```bash
# In any terminal:
tmux kill-session -t tt-*
# Kills all Terminal Tabs spawned sessions
```

### 4. Command History Log
All send-keys commands logged to:
```
.logs/send-keys-history.log
```

Format:
```
[2025-11-08 02:44:15] tt-bash-abc: git status
[2025-11-08 02:44:20] tt-cc-xyz: claude "review this code"
[2025-11-08 02:44:25] tt-bash-abc: rm -rf / ← USER CONFIRMED
```

## Use Cases

### Safe: Prompt Engineering
```javascript
// Send prompt to Claude Code
POST /api/tmux/send-keys
{
  "session": "tt-cc-abc",
  "text": "Review the following code:\n...",
  "execute": false  // Don't press Enter, user must confirm
}
```

### Medium Risk: Automation
```javascript
// Run tests in background
POST /api/tmux/send-keys
{
  "session": "tt-bash-abc",
  "text": "npm test",
  "execute": true,  // Auto-press Enter
  "confirm": true   // Show confirmation dialog first
}
```

### High Risk: Multi-Agent
```javascript
// AI agent sends commands
// Requires Danger Mode enabled
POST /api/tmux/send-keys
{
  "session": "tt-bash-abc",
  "text": "sudo rm -rf /tmp/build",
  "execute": true,
  "confirm": false  // YOLO mode
}
```

## Guardrails (Even in Danger Mode)

### Blocked Patterns (Always)
```javascript
const ALWAYS_BLOCKED = [
  /rm\s+-rf\s+\/(?!tmp|home\/\w+\/)/,  // Block rm -rf / (except /tmp or user home)
  /:\(\)\s*{\s*:\|:&\s*};:/,          // Fork bomb
  />\s*\/dev\/sd[a-z]/,                // Writing to disk devices
  /dd\s+if=.*of=\/dev/,                // dd to devices
  /mkfs/,                              // Formatting
  /wget.*\|\s*sh/,                     // Pipe to shell
  /curl.*\|\s*bash/,                   // Pipe to bash
];
```

### Confirmation Required (Safe/Fast Mode)
```javascript
const REQUIRES_CONFIRM = [
  /sudo/,                              // Any sudo command
  /rm\s+-rf/,                          // Recursive delete
  /chmod\s+777/,                       // Dangerous permissions
  /chown/,                             // Ownership changes
  /systemctl/,                         // System services
  /reboot/,                            // System reboot
  /shutdown/,                          // System shutdown
];
```

## Lessons Learned from PC Nuking

**What happened:**
- Subagent told to "test security"
- Ran every blocked command to "verify blocking works"
- Blocking didn't work for the test agent itself
- RIP filesystem

**How to prevent:**
- ALWAYS_BLOCKED patterns (even for AI)
- Confirmation dialogs (even in Fast Mode for destructive commands)
- Audit logging (see what went wrong)
- Emergency kill switch (tmux kill-session)

## Recommended Settings

**For prompt-engineer workflow:**
- ✅ Safe Mode ON
- ✅ Execute: false (user presses Enter)
- ✅ Audit logging enabled

**For AI agent development:**
- ⚠️ Fast Mode (with confirmations)
- ⚠️ Execute: true (auto-run)
- ⚠️ Audit logging enabled
- ⚠️ Test in VM/container first

**For "I like to live dangerously":**
- 💀 Danger Mode
- 💀 Execute: true
- 💀 No confirmations
- 💀 Good backups
- 💀 VM recommended

## Implementation Status

- [ ] Backend endpoint with safety checks
- [ ] UI safety mode toggle
- [ ] Confirmation dialogs
- [ ] Audit logging
- [ ] Emergency kill switch
- [ ] Blocked pattern matching
- [ ] Integration with /prompt-engineer

## Future Ideas

- Sandbox mode (commands run in Docker container)
- Command preview (show what will execute)
- Undo/rollback (tmux session snapshots)
- Rate limiting (max N commands per minute)
- Approval queue (review before execution)
