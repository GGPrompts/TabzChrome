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
- `/shadcn-ui` - for UI component patterns
- `/ui-styling:ui-styling` - for glass effects and styling

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

## Verification (Required Before Closing)
1. `npm test` - all tests pass
2. `npm run build` - builds without errors

## Quality Gate (Required)
After build passes, spawn code-reviewer subagent to review your changes:

Use the Task tool:
- subagent_type: "conductor:code-reviewer"
- prompt: "Review uncommitted changes in [your working directory] for issue [issue-id]"

The subagent will return JSON with `passed: true/false`:
- If `passed: false` → fix the blockers listed, then re-run review
- If `passed: true` → proceed to commit

## Completion
When build passes AND code review passes:
1. `git add . && git commit -m "feat(<scope>): <description>"`
2. `bd close <issue-id> --reason "Implemented: <summary>"`'
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
- ✅ Merging branches when all pass
- ✅ Spawning docs-updater
- ✅ Syncing beads and pushing to origin
- ✅ Notifying you when sprint is complete

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
