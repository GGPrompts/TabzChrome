---
description: "Spawn multiple Claude workers with skill-aware prompts to tackle beads issues in parallel"
---

# Beads Swarm - Parallel Issue Processing

Spawn multiple Claude workers to tackle beads issues in parallel.

## Before Starting: Create Todo List

**Use TodoWrite to track workflow progress.** This ensures no steps are missed:

```
1. Get ready issues (bd ready)
2. Create worktrees (BEFORE spawning)
3. Set CONDUCTOR_SESSION
4. Spawn workers
5. Craft and send prompts
6. Monitor workers
7. Run wave-done when complete
```

Mark each step as `in_progress` when starting and `completed` when done.

## Prerequisites (Execute Now)

**Invoke orchestration skill** to load spawn patterns and tmux commands:

```
Run `/conductor:orchestration` to load spawn patterns.
```

Skip only if already loaded this session or running as `--agent conductor:conductor`.

## Quick Start

```bash
# Interactive: select issues and worker count
/conductor:bd-swarm

# Auto mode: process entire backlog autonomously
/conductor:bd-swarm --auto
```

## Workflow Overview

```
1. Get ready issues      →  bd ready
2. Create worktrees      →  scripts/setup-worktree.sh (BEFORE spawning)
3. Set CONDUCTOR_SESSION →  tmux display-message (REQUIRED for notifications)
4. Spawn workers         →  TabzChrome /api/spawn
5. Craft & send prompts  →  engineering-prompts skill + tmux send-keys
6. Monitor               →  scripts/monitor-workers.sh
7. Merge & review        →  /conductor:wave-done
```

**Key insight:** TabzChrome spawn creates tmux sessions with `ctt-*` prefix. Cleanup is via `tmux kill-session`.

> **⚠️ CRITICAL ORDER: Worktrees BEFORE spawn, CONDUCTOR_SESSION BEFORE spawn**
>
> Workers need isolated directories (worktrees) and must know how to notify you (CONDUCTOR_SESSION).
> If you skip these, workers conflict on files and complete silently.

---

## Prompt Crafting with prompt-engineer

Invoke the engineering-prompts skill to craft context-rich prompts:

```
Skill(skill: "conductor:engineering-prompts")
```

Then follow its workflow for the issues you're processing.

The engineering-prompts workflow:

1. **Match skills** for each issue using `scripts/match-skills.sh`
2. **Spawn parallel Explore agents** (haiku) per issue via Task tool
3. Explore agents return **only summaries** (full exploration is out of your context)
4. **Synthesize** findings + skill triggers into detailed prompts
5. Output ready-to-use prompts with Skills section for workers

> **Context efficient:** Task tool subagents run out of your context and return only summaries.

### Skill Matching

The `match-skills.sh` script generates natural trigger phrases from issue titles:

```bash
# Example:
${CLAUDE_PLUGIN_ROOT}/scripts/match-skills.sh --triggers "fix terminal resize bug"
# Output: Use the xterm-js skill for terminal integration and resize handling.
```

These triggers are included in the prompt's **Skills** section to help workers load the right capabilities.

---

## Execute Workflow - Step by Step

Follow these steps in order. Do not skip or reorder.

### Step 1: Get Ready Issues

```bash
bd ready
```

Select issues to work on (or use all for `--auto` mode).

### Step 2: Create Worktrees (MANDATORY - Before Spawning)

**Run this for EACH issue before spawning any workers:**

```bash
ISSUE_ID="TabzChrome-xxx"
./plugins/conductor/scripts/setup-worktree.sh "$ISSUE_ID"
# Output: READY: /path/to/TabzChrome-worktrees/TabzChrome-xxx
```

For multiple issues in parallel:
```bash
for ISSUE in TabzChrome-abc TabzChrome-def; do
  ./plugins/conductor/scripts/setup-worktree.sh "$ISSUE" &
done
wait
echo "All worktrees ready"
```

**What the script does:**
- Creates worktree with proper locking (safe for parallel workers)
- Installs dependencies (npm/pnpm/yarn based on lockfile)
- Runs initial build
- Output: `READY: /path/to/worktree`

### Step 3: Set CONDUCTOR_SESSION (REQUIRED - Before Spawning)

**Workers use this to notify you when done. If not set, workers complete silently.**

```bash
CONDUCTOR_SESSION=$(tmux display-message -p '#{session_name}')
echo "Conductor session: $CONDUCTOR_SESSION"
```

### Step 4: Spawn Workers

Now spawn workers with CONDUCTOR_SESSION in their environment:

```bash
ISSUE_ID="TabzChrome-xxx"
WORKTREE_PATH="$(pwd)-worktrees/$ISSUE_ID"
TOKEN=$(cat /tmp/tabz-auth-token)

# BD_SOCKET isolates beads daemon per worker (prevents conflicts)
RESPONSE=$(curl -s -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d "{\"name\": \"worker-$ISSUE_ID\", \"workingDir\": \"$WORKTREE_PATH\", \"command\": \"BD_SOCKET=/tmp/bd-worker-$ISSUE_ID.sock CONDUCTOR_SESSION='$CONDUCTOR_SESSION' claude --dangerously-skip-permissions\"}")

SESSION_NAME=$(echo "$RESPONSE" | jq -r '.terminal.ptyInfo.tmuxSession // .terminal.id')
echo "Spawned: $SESSION_NAME"

# Record session IDs in beads for audit trail
bd update "$ISSUE_ID" --notes "conductor_session: $CONDUCTOR_SESSION
worker_session: $SESSION_NAME
started_at: $(date -Iseconds)"
```

### Step 5: Send Prompts

Wait for Claude to initialize, then send the prompt:

```bash
sleep 4
tmux send-keys -t "$SESSION_NAME" -l 'Your prompt here...'
sleep 0.3
tmux send-keys -t "$SESSION_NAME" C-m
```

Skills auto-activate via UserPromptSubmit hook - no manual skill invocation needed in prompts.

**Alternative - Direct tmux** (simpler, no TabzChrome UI):
```bash
# Setup worktree first
ISSUE_ID="TabzChrome-xxx"
./plugins/conductor/scripts/setup-worktree.sh "$ISSUE_ID"
WORKTREE_PATH="$(pwd)-worktrees/$ISSUE_ID"

SESSION="worker-$ISSUE_ID"
CONDUCTOR_SESSION=$(tmux display-message -p '#{session_name}')
tmux new-session -d -s "$SESSION" -c "$WORKTREE_PATH"
# BD_SOCKET isolates beads daemon per worker (prevents conflicts in parallel workers)
tmux send-keys -t "$SESSION" "BD_SOCKET=/tmp/bd-worker-$ISSUE_ID.sock CONDUCTOR_SESSION='$CONDUCTOR_SESSION' claude --dangerously-skip-permissions" C-m

# Record session IDs in beads for audit trail
bd update "$ISSUE_ID" --notes "conductor_session: $CONDUCTOR_SESSION
worker_session: $SESSION
started_at: $(date -Iseconds)"

sleep 4
# Skills are already loaded in worker context - send prompt directly
tmux send-keys -t "$SESSION" -l 'Your prompt here...'
sleep 0.3
tmux send-keys -t "$SESSION" C-m
```

---

## Worker Completion Notifications

Workers notify the conductor when done via tmux send-keys (primary) and API broadcast (secondary):

```
Worker completes → /conductor:worker-done
                 → tmux send-keys to CONDUCTOR_SESSION (primary)
                 → POST /api/notify for browser UIs (secondary)
                 → Conductor receives message and can cleanup
```

**How it works:**
1. Worker completes task and runs `/conductor:worker-done`
2. Worker sends message via `tmux send-keys -t "$CONDUCTOR_SESSION"` (Claude Code queues these safely)
3. Worker also calls `POST /api/notify` for browser UIs
4. Conductor receives notification and can cleanup

**Why tmux is primary:** Claude Code queues incoming tmux messages even during output, so it's safe. The API broadcasts via WebSocket which browser UIs can receive, but tmux-based Claude sessions cannot receive WebSocket messages.

**CONDUCTOR_SESSION is required** - if not passed during spawn, Step 7 in worker-done skips notification.

**API notification pattern:**
```bash
TOKEN=$(cat /tmp/tabz-auth-token)
curl -s -X POST http://localhost:8129/api/notify \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d "{\"type\": \"worker-complete\", \"issueId\": \"$ISSUE_ID\", \"summary\": \"commit message\", \"session\": \"$WORKER_SESSION\"}"
```

**Spawn command (BD_SOCKET isolates beads daemon per worker):**
```bash
"command": "BD_SOCKET=/tmp/bd-worker-$ISSUE_ID.sock claude --dangerously-skip-permissions"
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

### Full Closeout (Recommended)

Use the wave-done skill for comprehensive closeout with code review:

```bash
# Full pipeline: verify -> merge -> build -> review -> cleanup -> push -> summary
/conductor:wave-done $ISSUES
```

This runs all 9 steps: verify workers closed, kill sessions, merge branches, build verification, unified code review, cleanup worktrees, visual QA (if UI changes), sync & push, comprehensive summary.

### Quick Cleanup (Skip Review)

For trivial changes or when you want to review manually:

```bash
# Quick: kill sessions -> merge -> cleanup -> audio notification
${CLAUDE_PLUGIN_ROOT}/scripts/completion-pipeline.sh "$ISSUES"
```

**When to use which:**

| Scenario | Use |
|----------|-----|
| Production work, multiple workers | `/conductor:wave-done` (full) |
| Trivial changes, single worker | `completion-pipeline.sh` (quick) |
| Need to review manually | `completion-pipeline.sh` then manual review |

**Visual review happens at conductor level** (after merge):
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

### Self-Service Optimization (Optional)

Workers can self-optimize before starting real work:

```
1. Worker receives basic prompt from conductor
2. Worker runs /conductor:worker-init (or spawns prompt-enhancer agent)
3. Issue is analyzed, skills identified, enhanced prompt crafted
4. Context reset (/clear) and enhanced prompt auto-submitted
5. Worker now has full context budget for implementation
```

**When to use:** Complex issues where context optimization helps. Skip for simple fixes.

See `commands/worker-init.md` and `agents/prompt-enhancer.md`.

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

## Prompt Structure

The engineering-prompts skill generates prompts following this structure:

```markdown
## Task: ISSUE-ID - Title
[Explicit, actionable description]

## Context
[Background and WHY - gathered via exploration]

## Key Files
- /path/to/file.ts:45-60 - [what's relevant]
- /path/to/pattern.ts:120 - [pattern to follow]

## Approach
[Implementation guidance based on codebase patterns]

Use subagents in parallel for exploration, testing, and multi-file analysis.

## When Done
Run `/conductor:worker-done ISSUE-ID`
```

**Skills auto-activate** via the UserPromptSubmit hook based on prompt content - no manual `/skill:name` invocation needed in prompts.

**The `/conductor:worker-done` instruction is mandatory** - without it, workers don't know how to signal completion.

---

## Scripts

| Script | Purpose |
|--------|---------|
| `scripts/setup-worktree.sh` | Create worktree + install deps |
| `scripts/monitor-workers.sh` | Spawn/poll tmuxplexer watcher |
| `scripts/completion-pipeline.sh` | Quick cleanup: kill sessions, merge, cleanup |
| `scripts/wave-summary.sh` | Comprehensive wave summary with stats |

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
