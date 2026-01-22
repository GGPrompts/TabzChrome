---
name: gg-spawn
description: "Spawn a Claude worker for an issue"
argument-hint: "ISSUE_ID"
---

# Spawn Worker

Spawn a Claude terminal in an isolated git worktree to work on a beads issue.

## Quick Spawn

```python
import time

ISSUE_ID = "bd-abc"
PROJECT_DIR = "/path/to/project"  # Set to actual project path

# 1. Verify issue exists
issue = mcp__beads__show(issue_id=ISSUE_ID)
title = issue[0].get('title', 'the task')
```

```bash
ISSUE_ID="bd-abc"
PROJECT_DIR=$(pwd)

# 2. Create worktree with beads redirect
bd worktree create ".worktrees/$ISSUE_ID" --branch "feature/$ISSUE_ID"

# 3. Init deps (optional - runs in background, overlaps with Claude boot)
INIT_SCRIPT=$(find ~/plugins ~/.claude/plugins -name "init-worktree.sh" -path "*spawner*" 2>/dev/null | head -1)
[ -n "$INIT_SCRIPT" ] && $INIT_SCRIPT ".worktrees/$ISSUE_ID" &
```

```python
# 4. Spawn terminal
tabz_spawn_profile(
    profileId="claudula",  # Vanilla Claude profile
    workingDir=f"{PROJECT_DIR}/.worktrees/{ISSUE_ID}",
    name=ISSUE_ID,
    env={"BEADS_WORKING_DIR": PROJECT_DIR}
)

# 5. Wait for Claude boot
time.sleep(8)

# 6. Send prompt
prompt = f"bd show {ISSUE_ID}"
tabz_send_keys(terminal=ISSUE_ID, text=prompt)

# 7. Claim issue and announce
mcp__beads__update(issue_id=ISSUE_ID, status="in_progress")
tabz_speak(text=f"{ISSUE_ID} spawned")
```

---

## Step-by-Step Details

### Step 1: Pre-flight Checks

```python
# Verify TabzChrome is running
terminals = tabz_list_terminals(state="all")

# Verify issue exists
issue = mcp__beads__show(issue_id=ISSUE_ID)
if not issue:
    print(f"Issue {ISSUE_ID} not found")
```

### Step 2: Create Git Worktree

```bash
ISSUE_ID="bd-abc"

# REQUIRED: Use bd worktree create, not git worktree add
bd worktree create ".worktrees/$ISSUE_ID" --branch "feature/$ISSUE_ID"
```

**Why `bd worktree create`?** It creates a `.beads/redirect` file in the worktree that points MCP tools to the main repo's database. Without this, beads MCP tools fail silently in the worktree.

### Step 3: Initialize Dependencies

```bash
# Find and run init script
INIT_SCRIPT=$(find ~/plugins ~/.claude/plugins -name "init-worktree.sh" -path "*spawner*" 2>/dev/null | head -1)
[ -n "$INIT_SCRIPT" ] && $INIT_SCRIPT ".worktrees/$ISSUE_ID"
```

The init script handles:

| Detected File | Action |
|---------------|--------|
| `package.json` | `npm ci` (or pnpm/yarn/bun) |
| `pyproject.toml` | `uv pip install -e .` |
| `requirements.txt` | `uv pip install -r requirements.txt` |
| `Cargo.toml` | `cargo fetch` |
| `go.mod` | `go mod download` |

**Tip:** Run init in background (`&`) to overlap with Claude's 8-second boot time.

### Step 4: Spawn Terminal

```python
tabz_spawn_profile(
    profileId="claudula",  # Vanilla Claude profile
    workingDir=f"{PROJECT_DIR}/.worktrees/{ISSUE_ID}",
    name=ISSUE_ID,
    env={"BEADS_WORKING_DIR": PROJECT_DIR}
)
```

**Key settings:**
- `profileId`: Use a Claude profile (e.g., "claudula" for vanilla Claude)
- `name`: Use issue ID for easy lookup
- `env.BEADS_WORKING_DIR`: Points to main repo so beads MCP works in worktree

### Step 5: Wait for Claude Boot

```python
import time
time.sleep(8)
```

Claude needs ~8 seconds to fully initialize before receiving prompts.

### Step 6: Send Prompt

```python
prompt = f"bd show {ISSUE_ID}"
tabz_send_keys(terminal=ISSUE_ID, text=prompt)
```

The `tabz_send_keys` tool has a built-in 600ms delay before pressing Enter, ensuring Claude processes the full prompt.

### Step 7: Update Issue Status

```python
mcp__beads__update(issue_id=ISSUE_ID, status="in_progress")
tabz_speak(text=f"{ISSUE_ID} spawned")
```

---

## Monitor After Spawn

```python
# Check output
output = tabz_capture_terminal(terminal=ISSUE_ID, lines=50)

# Send follow-up if needed
tabz_send_keys(terminal=ISSUE_ID, text="Status check - how's it going?")
```

---

## Kill Worker

```bash
TOKEN=$(cat /tmp/tabz-auth-token)
AGENT_ID=$(curl -s http://localhost:8129/api/agents | jq -r --arg name "$ISSUE_ID" '.data[] | select(.name == $name) | .id')
curl -s -X DELETE "http://localhost:8129/api/agents/$AGENT_ID" -H "X-Auth-Token: $TOKEN"
```

---

## Cleanup Worktree

After merge:

```bash
git worktree remove ".worktrees/$ISSUE_ID" --force
git branch -d "feature/$ISSUE_ID"
```

---

## Quick Reference

| Action | How |
|--------|-----|
| Create worktree | `bd worktree create ".worktrees/ID" --branch "feature/ID"` |
| Init deps | `init-worktree.sh` (or run in background) |
| Spawn terminal | `tabz_spawn_profile(profileId, workingDir, name, env)` |
| Wait for boot | `time.sleep(8)` |
| Send prompt | `tabz_send_keys(terminal, text)` |
| Claim issue | `mcp__beads__update(issue_id, status="in_progress")` |
| Check output | `tabz_capture_terminal(terminal, lines)` |
| Announce | `tabz_speak(text)` |

## Critical Settings

| Setting | Value | Why |
|---------|-------|-----|
| `BEADS_WORKING_DIR` | Main repo path | Beads MCP finds database |
| Wait time | 8 seconds | Claude boot time |
| `delay` | 600ms (default) | Prompt fully sent before Enter |

## Naming Convention

**Use issue ID as terminal name:**
- Easy lookup: `tabz_send_keys(terminal="bd-abc", ...)`
- Clear correlation: terminal = issue = branch = worktree

## Notes

- **Use `bd worktree create`** (not `git worktree add`) - creates beads redirect file
- **Wait 8+ seconds** for Claude to boot before sending prompt
- **Workers have their own CLAUDE.md** - they'll read the issue and work autonomously
- **Init deps can overlap** with Claude boot time for faster spawns
