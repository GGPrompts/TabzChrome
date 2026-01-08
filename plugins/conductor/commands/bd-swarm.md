---
description: "Spawn multiple Claude workers with skill-aware prompts to tackle beads issues in parallel"
---

# Beads Swarm - Parallel Issue Processing

Spawn multiple Claude workers to tackle beads issues in parallel, with skill-aware prompting and environment preparation.

## Quick Start

```bash
# Interactive: select issues and worker count
/conductor:bd-swarm

# Auto mode: process entire backlog autonomously
/conductor:bd-swarm --auto
```

## Workflow Overview

```
1. Get ready issues      ->  bd ready
2. Create worktrees      ->  scripts/setup-worktree.sh (parallel)
3. Wait for deps         ->  All worktrees ready before workers spawn
4. Spawn workers         ->  TabzChrome /api/spawn (see below)
5. Send prompts          ->  tmux send-keys with skill hints
6. Monitor               ->  scripts/monitor-workers.sh
7. Merge & review        ->  Merge branches, visual review (conductor only)
8. Cleanup               ->  scripts/completion-pipeline.sh
```

**Key insight:** TabzChrome spawn creates tmux sessions with `ctt-*` prefix. Cleanup is via `tmux kill-session`.

---

## Spawn Workers - Copy-Paste Example

**IMPORTANT**: Use this exact pattern to spawn workers via TabzChrome:

```bash
# 1. Get auth token and conductor session
TOKEN=$(cat /tmp/tabz-auth-token)
CONDUCTOR_SESSION=$(tmux display-message -p '#{session_name}')

# 2. Spawn worker with env vars (creates ctt-worker-ISSUE-xxxx tmux session)
# BD_SOCKET isolates beads daemon per worker (prevents conflicts in parallel workers)
RESPONSE=$(curl -s -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d "{\"name\": \"worker-$ISSUE_ID\", \"workingDir\": \"$WORKTREE_PATH\", \"command\": \"BD_SOCKET=/tmp/bd-worker-$ISSUE_ID.sock CONDUCTOR_SESSION='$CONDUCTOR_SESSION' claude --dangerously-skip-permissions\"}")

# 3. Extract session name from response
SESSION_NAME=$(echo "$RESPONSE" | jq -r '.terminal.ptyInfo.tmuxSession // .terminal.id')
echo "Spawned: $SESSION_NAME"

# 4. Wait for Claude to initialize, then send /context and prompt
sleep 4
# Send /context first so worker sees available skills
tmux send-keys -t "$SESSION_NAME" -l '/context'
sleep 0.3
tmux send-keys -t "$SESSION_NAME" C-m
sleep 2  # Wait for /context output
# Now send the work prompt
tmux send-keys -t "$SESSION_NAME" -l 'Your prompt here...'
sleep 0.3
tmux send-keys -t "$SESSION_NAME" C-m
```

**Alternative - Direct tmux** (simpler, no TabzChrome UI):
```bash
SESSION="worker-$ISSUE_ID"
CONDUCTOR_SESSION=$(tmux display-message -p '#{session_name}')
tmux new-session -d -s "$SESSION" -c "$WORKTREE_PATH"
# BD_SOCKET isolates beads daemon per worker (prevents conflicts in parallel workers)
tmux send-keys -t "$SESSION" "BD_SOCKET=/tmp/bd-worker-$ISSUE_ID.sock CONDUCTOR_SESSION='$CONDUCTOR_SESSION' claude --dangerously-skip-permissions" C-m
sleep 4
# Send /context first so worker sees available skills
tmux send-keys -t "$SESSION" -l '/context'
sleep 0.3
tmux send-keys -t "$SESSION" C-m
sleep 2  # Wait for /context output
# Now send the work prompt
tmux send-keys -t "$SESSION" -l 'Your prompt here...'
sleep 0.3
tmux send-keys -t "$SESSION" C-m
```

---

## Worker Completion Notifications

Workers notify the conductor when done via tmux send-keys (push-based, no polling):

```
Worker completes → /conductor:worker-done
                 → Sends "WORKER COMPLETE: ISSUE-ID - commit message"
                 → Conductor receives and cleans up immediately
```

**How it works:**
1. Conductor sets `CONDUCTOR_SESSION` env var when spawning workers
2. Worker-done sends completion summary to conductor via tmux
3. Conductor receives notification and can cleanup that worker immediately
4. No polling needed - workers push completion status

**Spawn with env vars:**
```bash
CONDUCTOR_SESSION=$(tmux display-message -p '#{session_name}')
# Include in spawn command (BD_SOCKET prevents daemon conflicts in parallel workers):
"command": "BD_SOCKET=/tmp/bd-worker-$ISSUE_ID.sock CONDUCTOR_SESSION='$CONDUCTOR_SESSION' claude --dangerously-skip-permissions"
```

---

## Fallback: Polling (if notifications fail)

See: `references/bd-swarm/monitoring.md`

```bash
# Poll status
${CLAUDE_PLUGIN_ROOT}/scripts/monitor-workers.sh --summary
# Output: WORKERS:3 WORKING:2 IDLE:0 AWAITING:1 STALE:0
```

| Status | Action |
|--------|--------|
| `AskUserQuestion` | Don't nudge - waiting for user |
| `<other tool>` | Working, leave alone |
| `idle` / `awaiting_input` | Check if issue closed or stuck |
| Issue closed | Ready for cleanup |

---

## Interactive Mode

**See full details:** `references/bd-swarm/interactive-mode.md`

1. Get ready issues: `bd ready`
2. Ask user for worker count (2-5)
3. Create worktrees in parallel:
   ```bash
   for ISSUE in $ISSUES; do
     ${CLAUDE_PLUGIN_ROOT}/scripts/setup-worktree.sh "$ISSUE" &
   done
   wait
   ```
4. Spawn workers via TabzChrome API or direct tmux
5. Send skill-aware prompts with issue context
6. Monitor via `monitor-workers.sh --summary` every 2 min
7. Run completion pipeline when all issues closed

---

## Auto Mode (`--auto`)

**See full details:** `references/bd-swarm/auto-mode.md`

Fully autonomous backlog completion. Runs waves until `bd ready` is empty.

**Conductor behavior:** No user questions, make reasonable defaults, loop until backlog empty.

| Aspect | Interactive | Auto |
|--------|-------------|------|
| Worker count | Ask user | All ready issues |
| Waves | One wave | Loop until empty |
| Decisions | AskUserQuestion ok | No questions |
| Context | Manual check | Auto /wipe at 75% |

---

## Completion Pipeline

**See full details:** `references/bd-swarm/completion-pipeline.md`

```bash
# Run after all workers done
${CLAUDE_PLUGIN_ROOT}/scripts/completion-pipeline.sh "$ISSUES"
```

Order: **Kill sessions -> Merge branches -> Visual review -> Remove worktrees -> Sync**

**Visual review happens here** (at conductor level, after merge):
- Conductor opens browser tabs for UI verification
- No tab conflicts since workers are done
- Full context of all merged changes

---

## Worker Expectations

Each worker will:
1. Read issue: `bd show <id>`
2. Implement feature/fix
3. Build and test
4. Complete: `/conductor:worker-done <issue-id>`

**Workers do NOT do visual review.** Visual review (browser-based UI verification) happens at the conductor level after merge. This prevents parallel workers from fighting over browser tabs.

---

## Worker Architecture

Workers are vanilla Claude sessions that receive skill-aware prompts:

```
Worker (vanilla Claude via tmux/TabzChrome)
  ├─> Gets context from `bd show <issue-id>`
  ├─> Receives skill hint in prompt (e.g., "use /xterm-js:xterm-js skill")
  ├─> Invokes skill directly when needed
  └─> Completes with /conductor:worker-done
```

Workers share the same plugin context as the conductor, so all skills are available.

---

## Skill Matching & Prompt Enhancement

**Key insight:** Workers need detailed prompts with skill hints woven naturally into guidance, not listed as sidebars.

Match issue keywords to skill triggers. Use **natural trigger language** (like pmux does) to activate skills:

| Keywords | Natural Trigger Language | Purpose |
|----------|-------------------------|---------|
| terminal, xterm, pty, resize | "Use the xterm-js skill for terminal rendering..." | Terminal, resize, WebSocket |
| UI, component, modal, dashboard | "Use the ui-styling skill for shadcn/ui..." | UI components, Tailwind |
| backend, api, server, websocket | "Use the backend-development skill for..." | APIs, servers, databases |
| browser, screenshot, click, mcp | "Use MCP browser automation tools via tabz_*..." | Browser automation |
| auth, login, oauth | "Use the better-auth skill for..." | Authentication patterns |
| plugin, skill, agent, hook | "Use the plugin-dev skills for..." | Plugin/skill development |

**Key insight from pmux**: "Use the X skill for Y" triggers skill activation better than "follow X patterns".

### Enhanced Prompt Structure

All worker prompts must follow this structure (see `references/worker-architecture.md`):

```markdown
Fix beads issue ISSUE-ID: "Title"

## Context
[Description from bd show - explains WHY]

## Key Files
[Relevant file paths, or "Explore as needed"]

## Approach
[Skill triggers woven naturally: "Use the ui-styling skill for shadcn/ui..."]

After implementation, verify the build passes and test the changes work as expected.

## When Done
Run: /conductor:worker-done ISSUE-ID

This command will: build, run code review, commit changes, and close the issue.
```

**The `/conductor:worker-done` instruction is mandatory** - without it, workers don't know how to signal completion and the conductor can't clean up.

See `references/bd-swarm/interactive-mode.md` for the `match_skills()` function that auto-generates skill hints.

---

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/setup-worktree.sh` | Create worktree + install deps |
| `scripts/monitor-workers.sh` | Spawn/poll tmuxplexer watcher |
| `scripts/completion-pipeline.sh` | Kill sessions, merge, cleanup |

---

## Reference Files

| File | Content |
|------|---------|
| `references/bd-swarm/monitoring.md` | Worker status monitoring details |
| `references/bd-swarm/interactive-mode.md` | Full interactive workflow |
| `references/bd-swarm/auto-mode.md` | Auto mode wave loop |
| `references/bd-swarm/completion-pipeline.md` | Cleanup steps |

---

## Notes

- Workers run in isolated worktrees (prevents conflicts)
- **BD_SOCKET isolates beads daemon per worker** - prevents daemon conflicts when multiple workers run `bd` commands simultaneously (beads v0.45+)
- Monitor via tmuxplexer background window (no watcher subagent)
- Check actual pane content before nudging idle workers
- Sessions MUST be killed before removing worktrees
- **Visual review happens at conductor level only** - workers skip it to avoid browser tab conflicts (see TabzChrome-s19)
