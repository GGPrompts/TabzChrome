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
7. Complete              ->  scripts/completion-pipeline.sh
```

**Key insight:** TabzChrome spawn creates tmux sessions with `ctt-*` prefix. Cleanup is via `tmux kill-session`.

---

## Spawn Workers - Copy-Paste Example

**IMPORTANT**: Use this exact pattern to spawn workers via TabzChrome:

```bash
# 1. Get auth token
TOKEN=$(cat /tmp/tabz-auth-token)

# 2. Spawn worker (creates ctt-worker-ISSUE-xxxx tmux session)
RESPONSE=$(curl -s -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d "{\"name\": \"worker-$ISSUE_ID\", \"workingDir\": \"$WORKTREE_PATH\", \"command\": \"claude --dangerously-skip-permissions\"}")

# 3. Extract session name from response
SESSION_NAME=$(echo "$RESPONSE" | jq -r '.terminal.ptyInfo.tmuxSession // .terminal.id')
echo "Spawned: $SESSION_NAME"

# 4. Wait for Claude to initialize, then send prompt
sleep 4
tmux send-keys -t "$SESSION_NAME" -l 'Your prompt here...'
sleep 0.3
tmux send-keys -t "$SESSION_NAME" C-m
```

**Alternative - Direct tmux** (simpler, no TabzChrome UI):
```bash
SESSION="worker-$ISSUE_ID"
tmux new-session -d -s "$SESSION" -c "$WORKTREE_PATH"
tmux send-keys -t "$SESSION" "claude --dangerously-skip-permissions" C-m
sleep 4
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

**Spawn with CONDUCTOR_SESSION:**
```bash
CONDUCTOR_SESSION=$(tmux display-message -p '#{session_name}')
# Include in spawn command:
"command": "CONDUCTOR_SESSION='$CONDUCTOR_SESSION' claude --dangerously-skip-permissions"
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

Order: **Kill sessions -> Merge branches -> Remove worktrees -> Sync**

---

## Worker Expectations

Each worker will:
1. Read issue: `bd show <id>`
2. Implement feature/fix
3. Build and test
4. Complete: `/conductor:worker-done <issue-id>`

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

## Skill Matching

Match issue keywords to skill hints for worker prompts:

| Keywords | Skill Hint | Purpose |
|----------|-----------|---------|
| terminal, xterm, pty, resize | `/xterm-js:xterm-js` | Terminal rendering, resize, WebSocket |
| UI, component, modal, dashboard | `/ui-styling:ui-styling` | shadcn/ui, Tailwind patterns |
| backend, api, server, websocket | `/backend-development:backend-development` | Node.js, APIs, databases |
| browser, screenshot, click, mcp | `/conductor:tabz-mcp` | Browser automation tools |
| auth, login, oauth | `/better-auth:better-auth` | Authentication patterns |

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
- Monitor via tmuxplexer background window (no watcher subagent)
- Check actual pane content before nudging idle workers
- Sessions MUST be killed before removing worktrees
