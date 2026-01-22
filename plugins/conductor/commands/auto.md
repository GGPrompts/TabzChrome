---
name: gg-auto
description: "Event-driven worker orchestration - spawns workers, delegates monitoring to background agent, handles events as they come"
---

# Auto Mode - Event-Driven Orchestration

Orchestrate parallel workers using MCP tools for direct control. You spawn terminals, send prompts, and monitor - staying free to help the user between events.

## Philosophy

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONDUCTOR (You)                               │
│  Direct control: spawn, prompt, monitor, announce               │
│  → MCP calls are instant (~100ms)                               │
│  → If spawning fails, retry immediately                         │
└─────────────────────────────────────────────────────────────────┘
         │                                    │
         ▼                                    ▼
┌─────────────────────┐           ┌─────────────────────┐
│   HAIKU SUBAGENTS   │           │      WORKERS        │
│  (context only)     │           │  (spawned Claudes)  │
├─────────────────────┤           ├─────────────────────┤
│ • Find relevant files│          │ • Work on issues    │
│ • Analyze codebase  │           │ • Run tests         │
│ • Gather context    │           │ • Commit & close    │
└─────────────────────┘           └─────────────────────┘
```

**You spawn directly** - haiku is only for context gathering.

---

## Step 1: Pre-flight Checks

```python
# Verify TabzChrome is running
terminals = tabz_list_terminals(state="all")
```

```bash
# Start beads daemon
bd daemon status >/dev/null 2>&1 || bd daemon start
```

## Step 2: Get Current State

```python
# Get ready issues via MCP
ready_issues = mcp__beads__ready()

# Get in-progress to check for existing workers
in_progress = mcp__beads__list(status="in_progress")

# List current workers
workers = tabz_list_terminals(state="active", response_format="json")
```

```bash
# Show ready work
bd ready --json | jq -r '.[] | "\(.id): \(.title)"'
```

## Step 3: Gather Context (Haiku, Parallel) - Optional

For complex issues, use haiku to gather context before spawning:

```python
# For each issue, gather context in parallel
for issue in ready_issues[:3]:
    Task(
        subagent_type="general-purpose",
        model="haiku",
        prompt=f"""Analyze issue {issue['id']} and gather context:

1. Read the issue: bd show {issue['id']}
2. Find relevant files that will need changes
3. Check for related tests
4. Note any dependencies or gotchas

Output a brief context summary (FILES, TESTS, NOTES).""",
        description=f"Context for {issue['id']}"
    )
```

## Step 4: Create Worktrees

Create worktrees for each issue (you do this directly - it's fast):

```bash
ISSUE_ID="bd-abc"
PROJECT_DIR=$(pwd)

# Create worktree with beads redirect
bd worktree create ".worktrees/$ISSUE_ID" --branch "feature/$ISSUE_ID"

# Init deps (optional - can overlap with Claude boot)
INIT_SCRIPT=$(find ~/plugins ~/.claude/plugins -name "init-worktree.sh" -path "*spawner*" 2>/dev/null | head -1)
[ -n "$INIT_SCRIPT" ] && $INIT_SCRIPT ".worktrees/$ISSUE_ID" &
```

**Note:** `bd worktree create` (not `git worktree add`) creates the `.beads/redirect` file that MCP tools need.

## Step 5: Spawn Workers (You Do This - Direct MCP)

```python
import time

PROJECT_DIR = "/path/to/project"  # Set to actual project path

for issue in ready_issues[:3]:
    issue_id = issue['id']
    title = issue.get('title', 'the task')

    # 1. Spawn terminal directly
    tabz_spawn_profile(
        profileId="claudula",  # Vanilla Claude profile
        workingDir=f"{PROJECT_DIR}/.worktrees/{issue_id}",
        name=issue_id,
        env={"BEADS_WORKING_DIR": PROJECT_DIR}
    )

    # 2. Wait for Claude boot
    time.sleep(8)

    # 3. Send prompt
    prompt = f"bd show {issue_id}"
    tabz_send_keys(terminal=issue_id, text=prompt)

    # 4. Claim issue and announce
    mcp__beads__update(issue_id=issue_id, status="in_progress")
    tabz_speak(text=f"{issue_id} spawned")
```

## Step 6: Start Background Watcher

After spawning, kick off the watcher:

```python
Task(
    subagent_type="conductor:worker-watcher",
    prompt="Monitor workers. Return when: issue closes, critical alert (context >=75%), worker asking for input, or after 20 polls (~10 min).",
    description="Watch workers",
    run_in_background=True
)
```

**Now you're free.** Help the user with planning, grooming, or other tasks.

## Step 7: Handle Watcher Events

When the background watcher returns, it will report one of:

| Event Type | Action |
|------------|--------|
| `completed` | Run cleanup: `/cleanup:done ISSUE-ID` |
| `critical` | Notify user - worker at high context |
| `asking` | Notify user - worker needs input |
| `stale` | Check if worker is stuck |
| `timeout` | Just a check-in, spawn new watcher |

After handling:
1. Check if more ready issues exist
2. Spawn workers to fill slots
3. Spawn a new watcher
4. Return to being available

## Step 8: Wave Complete

When watcher reports no workers and no ready issues:

```bash
bd sync
git push
```

```python
tabz_speak(text="Wave complete!")
```

---

## Monitoring Workers

Check on workers directly:

```python
workers = tabz_list_terminals(state="active", response_format="json")

for w in workers['terminals']:
    if w['name'].startswith(('bd-', 'BD-', 'TabzChrome-')):
        output = tabz_capture_terminal(terminal=w['name'], lines=30)

        if "bd close" in output or "Issue closed" in output:
            print(f"✓ {w['name']} appears complete")
        elif "error" in output.lower():
            print(f"⚠ {w['name']} may have issues")
            tabz_send_keys(terminal=w['name'], text="Status check - need any help?")
```

---

## Quick Reference

| Action | How |
|--------|-----|
| Get ready work | `mcp__beads__ready()` |
| List workers | `tabz_list_terminals(state="active")` |
| Spawn worker | `tabz_spawn_profile(profileId, workingDir, name, env)` |
| Send prompt | `tabz_send_keys(terminal, text)` - 600ms delay built-in |
| Check output | `tabz_capture_terminal(terminal, lines)` |
| Announce | `tabz_speak(text)` |
| Claim issue | `mcp__beads__update(issue_id, status="in_progress")` |
| Start watcher | `Task(subagent_type="conductor:worker-watcher", run_in_background=True)` |

## Self-Monitoring

If your own context gets high (≥70%):
1. Tell the user "I need to restart to free up context"
2. Run `/wipe:wipe`
3. Resume with `/conductor:auto`

All state lives in beads - nothing is lost.

## Notes

- **You spawn directly** - don't delegate terminal spawning to haiku
- **Haiku gathers context** - use for file analysis, not actions
- **Watcher runs in background** - you stay free for the user
- **600ms delay in send_keys** - handles Claude prompt processing
