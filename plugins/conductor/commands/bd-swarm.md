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
4. Spawn workers         ->  TabzChrome API or direct tmux
5. Send prompts          ->  tmux send-keys with skill hints
6. Monitor               ->  scripts/monitor-workers.sh
7. Complete              ->  scripts/completion-pipeline.sh
```

**Key insight:** TabzChrome spawn creates tmux sessions. Cleanup is via `tmux kill-session`.

---

## Monitoring Workers

See: `references/bd-swarm/monitoring.md`

```bash
# Spawn tmuxplexer as background monitor
plugins/conductor/scripts/monitor-workers.sh --spawn

# Poll status
plugins/conductor/scripts/monitor-workers.sh --summary
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
     plugins/conductor/scripts/setup-worktree.sh "$ISSUE" &
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

**Workers receive:** `MODE: AUTONOMOUS` marker - no questions, reasonable defaults.

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
plugins/conductor/scripts/completion-pipeline.sh "$ISSUES"
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

## Worker Plugin Directories

Spawn lean workers with only the plugins they need using `--plugin-dir`:

| Worker Type | Plugin Dir | Contains |
|-------------|------------|----------|
| `worker-minimal` | `./plugins/worker-minimal` | Task completion commands only |
| `worker-browser` | `./plugins/worker-browser` | tabz-mcp, tabz-manager agent |
| `worker-codegen` | `./plugins/worker-codegen` | xterm-js skill |
| `worker-review` | `./plugins/worker-review` | code-reviewer, silent-failure-hunter agents |

**Spawn command:**
```bash
claude --plugin-dir ./plugins/worker-minimal --dangerously-skip-permissions
```

**Benefits:**
- Workers get exactly the skills they need
- Main session stays lean
- Context budget goes to actual work

---

## Skill Matching

Match issue keywords to worker plugin type:

| Keywords | Plugin Dir | Skills/Agents |
|----------|------------|---------------|
| terminal, xterm, pty | `worker-codegen` | xterm-js skill |
| browser, screenshot, click | `worker-browser` | tabz-mcp, tabz-manager |
| review, audit, quality | `worker-review` | code-reviewer, silent-failure-hunter |
| general, any other | `worker-minimal` | task completion only |

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
