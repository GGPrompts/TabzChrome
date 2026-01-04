---
description: "Spawn multiple Claude workers with skill-aware prompts to tackle beads issues in parallel"
---

# Beads Swarm - Parallel Issue Processing

Spawn multiple Claude Code workers to tackle beads issues in parallel, with skill-aware prompting and environment preparation.

## Workflow

### 1. Get Ready Issues
```bash
bd ready --json | jq -r '.[] | "\(.id): [\(.priority)] [\(.type)] \(.title)"' | head -5
```

### 2. Select Worker Count
Ask user:
- How many workers? (2, 3, 4, 5)

**Worktrees are always used by default.** Each worker gets an isolated worktree to prevent:
- Build artifacts conflicting between workers
- Workers seeing errors from other sessions and trying to "fix" them
- Merge conflicts from concurrent edits

Only skip worktrees if explicitly requested (rare - e.g., read-only analysis tasks).

### 3. Create Worktrees (Fast)

Create worktrees directly with bash - no subagent needed:

```bash
PROJECT_DIR="/home/matt/projects/TabzChrome"
for ISSUE in TabzChrome-abc TabzChrome-def; do
  WORKTREE="${PROJECT_DIR}-worktrees/${ISSUE}"
  mkdir -p "$(dirname "$WORKTREE")"
  git worktree add "$WORKTREE" -b "feature/${ISSUE}" 2>/dev/null || \
  git worktree add "$WORKTREE" "feature/${ISSUE}" 2>/dev/null || \
  git worktree add "$WORKTREE" HEAD

  # Install deps if needed
  [ -f "$WORKTREE/package.json" ] && [ ! -d "$WORKTREE/node_modules" ] && \
    (cd "$WORKTREE" && npm ci 2>/dev/null || npm install)
done
```

**OR** use initializer subagent (Haiku, fast):
```
Task tool:
  subagent_type: "conductor:initializer"
  prompt: "Create worktree for <issue-id> in <project-dir>"
```

The initializer ONLY creates worktrees. Prompt crafting is YOUR job (conductor).

### 4. Skill Invocation Format

**CRITICAL:** Skills must be invoked explicitly with slash commands!

**User skills** (no prefix):
- `/shadcn-ui`, `/xterm-js`, `/tailwindcss`, `/nextjs`, `/docs-seeker`

**Plugin skills** (plugin:skill format):
- `/ui-styling:ui-styling`, `/frontend-design:frontend-design`, `/sequential-thinking:sequential-thinking`

**Wrong:** "use the shadcn-ui skill" (does nothing)
**Right:** "Run `/shadcn-ui` for component patterns"

### 5. Spawn Workers

```bash
TOKEN=$(cat /tmp/tabz-auth-token)

# Claim issue first
bd update <issue-id> --status in_progress

# Spawn worker
curl -s -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{"name": "Claude: <issue-id>", "workingDir": "<project-dir>", "command": "claude --dangerously-skip-permissions"}'
```

### 6. Send Skill-Aware Prompts

Use the prompt from initializer, or craft manually with explicit skill invocations:

```bash
SESSION="ctt-claude-<issue-id>-xxxxx"
sleep 4

tmux send-keys -t "$SESSION" -l '## Task
<issue-id>: <title>

<description from bd show>

## Skills to Invoke
Run these commands first to load relevant patterns:
<match from your available_skills based on issue keywords>

## Approach
- **Use subagents liberally to preserve your context:**
  - Explore agents (Haiku) for codebase search
  - Parallel subagents for multi-file exploration
  - Subagents for tests/builds (returns only failures)

## Relevant Files
@path/to/file1.ts (only files < 500 lines)
@path/to/file2.tsx

## Large Files (use subagents to explore)
- src/large-file.ts (1200 lines) - search for "functionName"

## Constraints
- Follow existing code patterns
- Add tests for new functionality

## Completion
When you have finished implementing, run:
```
/worker-done <issue-id>
```

This runs the full completion pipeline:
1. Build verification (npm run build)
2. Test verification (npm test)
3. Code review (spawns code-reviewer subagent)
4. Commit with proper format
5. Close beads issue

If any step fails, fix the issue and run `/worker-done` again.'
sleep 0.3
tmux send-keys -t "$SESSION" C-m
```

### 7. Report Spawned Workers

```
🚀 Spawned 3 skill-optimized workers:

| Worker | Issue | Skills |
|--------|-------|--------|
| ctt-claude-79t-xxx | Profile theme inheritance | ui-styling, shadcn-ui |
| ctt-claude-6z1-xxx | Invalid dir notification | debugging |
| ctt-claude-swu-xxx | Keyboard navigation | xterm-js, accessibility |

📋 Monitor: `tmux ls | grep "^ctt-"`
📊 Status: Invoke conductor:watcher
```

### 8. Start Watcher with Full Pipeline (Required)

**Always spawn watcher** to handle the completion pipeline automatically:

```bash
# Get your session ID
CONDUCTOR_SESSION=$(tmux display-message -p '#{session_name}')

# Get project directory
PROJECT_DIR=$(pwd)

# Build issue list
ISSUES="TabzChrome-abc,TabzChrome-def,TabzChrome-ghi"
```

Spawn watcher with full pipeline configuration:
```
Task tool:
  subagent_type: "conductor:watcher"
  run_in_background: true
  prompt: |
    CONDUCTOR_SESSION=$CONDUCTOR_SESSION
    PROJECT_DIR=$PROJECT_DIR
    ISSUES=$ISSUES

    Run full pipeline:

    On WORKER_DONE (issue closed):
    1. Spawn conductor:code-reviewer for the worker's worktree
    2. If review fails → nudge worker to fix blockers
    3. If review passes → mark worker as reviewed

    On ALL_REVIEWED (all workers pass review):
    1. Merge all feature branches to main
    2. Clean up worktrees
    3. Spawn conductor:docs-updater to update CHANGELOG/API.md
    4. Run: bd sync && git push origin main
    5. Notify: "Sprint complete: N workers, reviewed, docs updated, pushed"

    Exit when all done.
```

The watcher handles:
- ✅ Code review for each completed worker
- ✅ Nudging workers who fail review
- ✅ **Worker reuse** for low-context workers (see below)
- ✅ Merging branches when all pass
- ✅ Spawning docs-updater
- ✅ Syncing beads and pushing to origin
- ✅ Notifying you when sprint is complete

### Worker Reuse (Low-Context Optimization)

When a worker completes with **low context usage (<50%)**, the watcher automatically assigns them the next related task instead of killing them. This provides:

| Benefit | Impact |
|---------|--------|
| Skills already loaded | No cold start overhead |
| CLAUDE.md parsed | Codebase understanding preserved |
| Faster completion | ~30-60s saved per reused worker |
| Token efficiency | Context reused instead of discarded |

**How it works:**
1. Worker closes beads issue
2. Watcher checks context % (from Claude status line)
3. If context < 50%: find related unblocked issue
4. If found: claim issue, send task prompt to same worker
5. If not found OR context >= 50%: retire worker

**Related task matching** (in priority order):
1. Same labels (component/area markers)
2. Same issue type (feature, bug, task)
3. Same parent epic
4. Any ready issue (fallback)

**Enable worker reuse:**
```
Task tool:
  subagent_type: "conductor:watcher"
  run_in_background: true
  prompt: |
    ENABLE_WORKER_REUSE=true
    REUSE_THRESHOLD=50
    MAX_TASKS_PER_WORKER=5
    ...
```

**Events:**
| Event | Meaning |
|-------|---------|
| `WORKER_REUSED` | Worker assigned next task |
| `WORKER_RETIRING` | Worker context too high, closing |
| `WORKER_DONE` | Worker completed, no more tasks |

## Worker Expectations

Each worker will:
1. Read the issue with `bd show <id>`
2. Explore relevant files with subagents
3. Implement the feature/fix
4. Run verification (`npm test`, `npm run build`)
5. Commit with issue ID in message
6. Close issue with `bd close <id> --reason "..."`

## Worktree Cleanup

After all workers complete, merge and clean up worktrees:

```bash
# List worktrees
git worktree list

# For each completed worktree:
cd /path/to/main/repo
git merge feat/<issue-id>        # Merge the feature branch
git worktree remove ../TabzChrome-<issue-id>  # Remove worktree
git branch -d feat/<issue-id>    # Delete local branch

# Or bulk cleanup (after verifying all merged):
git worktree list --porcelain | grep "^worktree" | grep -v "/TabzChrome$" | cut -d' ' -f2 | xargs -I{} git worktree remove {}
```

**Tip:** The watcher can automate this when `ALL_DONE` is detected.

## Notes

- Workers operate independently (no cross-dependencies)
- Each gets skill-optimized prompts based on task type
- Each worker runs in isolated worktree (prevents build conflicts)
- Watcher monitors for completion/issues
- Clean up agents when done: `curl -X DELETE http://localhost:8129/api/agents/<id>`

Execute this workflow now.
