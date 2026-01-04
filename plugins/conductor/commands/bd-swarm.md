---
description: "Spawn multiple Claude workers with skill-aware prompts to tackle beads issues in parallel"
---

# Beads Swarm - Parallel Issue Processing

Spawn multiple Claude Code workers to tackle beads issues in parallel, with skill-aware prompting and environment preparation.

## Modes

| Mode | Invocation | Behavior |
|------|------------|----------|
| **Interactive** | `/bd-swarm` | Ask for worker count, spawn one wave, user controls next steps |
| **Auto** | `/bd-swarm --auto` | Fully autonomous - run waves until backlog is empty |

---

## Auto Mode (`--auto`)

Fully autonomous backlog completion. Runs until `bd ready` returns empty.

### Concept

```
┌─────────────────────────────────────────────────────────────┐
│  Wave 1: Spawn workers for ALL ready issues                 │
│    ↓                                                        │
│  Monitor: Watcher handles review → docs → merge             │
│    ↓                                                        │
│  Wave Complete: Check `bd ready` for newly unblocked        │
│    ↓                                                        │
│  Wave 2: Spawn workers for new ready issues                 │
│    ↓                                                        │
│  ... repeat until `bd ready` is empty ...                   │
│    ↓                                                        │
│  ✅ "Backlog complete!"                                     │
└─────────────────────────────────────────────────────────────┘
```

### Auto Mode Differences

| Aspect | Interactive | Auto |
|--------|-------------|------|
| Worker count | Ask user | All ready issues |
| Waves | One wave | Repeat until empty |
| Context check | Manual | Auto /wipe at 75% |
| Decisions | AskUserQuestion | Reasonable defaults |
| Completion | Report and stop | Exit on empty backlog |

### Auto Mode Workflow

#### 1. Initialize State

```bash
# Get conductor session ID for watcher communication
CONDUCTOR_SESSION=$(tmux display-message -p '#{session_name}')
PROJECT_DIR=$(pwd)
WAVE_NUMBER=1

# State file for recovery after /wipe
STATE_FILE="/tmp/bd-swarm-auto-state.json"
```

#### 2. Wave Loop

```bash
auto_wave_loop() {
  while true; do
    echo "=== Wave $WAVE_NUMBER ==="

    # Get all ready issues
    READY_ISSUES=$(bd ready --json 2>/dev/null | jq -r '.[].id')
    ISSUE_COUNT=$(echo "$READY_ISSUES" | grep -c . || echo 0)

    if [ "$ISSUE_COUNT" -eq 0 ]; then
      echo "✅ Backlog complete! No more ready issues."
      # Cleanup and notify
      notify_completion
      return 0
    fi

    echo "Found $ISSUE_COUNT ready issues for Wave $WAVE_NUMBER"

    # Spawn workers for ALL ready issues
    for ISSUE_ID in $READY_ISSUES; do
      spawn_worker_for_issue "$ISSUE_ID"
    done

    # Save state for potential /wipe recovery
    save_state "$WAVE_NUMBER" "$READY_ISSUES"

    # Wait for wave completion
    wait_for_wave_completion

    # Check conductor context
    check_conductor_context

    WAVE_NUMBER=$((WAVE_NUMBER + 1))
  done
}
```

#### 3. Spawn Worker (Auto Mode)

Auto mode spawns without asking - uses all ready issues:

```bash
spawn_worker_for_issue() {
  local ISSUE_ID="$1"

  # Create worktree
  WORKTREE="${PROJECT_DIR}-worktrees/${ISSUE_ID}"
  mkdir -p "$(dirname "$WORKTREE")"
  git worktree add "$WORKTREE" -b "feature/${ISSUE_ID}" 2>/dev/null || \
  git worktree add "$WORKTREE" "feature/${ISSUE_ID}" 2>/dev/null || \
  git worktree add "$WORKTREE" HEAD

  # Install deps if needed
  [ -f "$WORKTREE/package.json" ] && [ ! -d "$WORKTREE/node_modules" ] && \
    (cd "$WORKTREE" && npm ci 2>/dev/null || npm install)

  # Claim issue
  bd update "$ISSUE_ID" --status in_progress

  # Spawn worker
  TOKEN=$(cat /tmp/tabz-auth-token)
  RESPONSE=$(curl -s -X POST http://localhost:8129/api/spawn \
    -H "Content-Type: application/json" \
    -H "X-Auth-Token: $TOKEN" \
    -d "{\"name\": \"Claude: $ISSUE_ID\", \"workingDir\": \"$WORKTREE\", \"command\": \"claude --dangerously-skip-permissions\"}")

  SESSION=$(echo "$RESPONSE" | jq -r '.data.terminal.sessionName // empty')

  if [ -z "$SESSION" ]; then
    echo "ERROR: Failed to spawn worker for $ISSUE_ID"
    return 1
  fi

  # Wait for Claude init
  sleep 4

  # Send prompt
  send_auto_mode_prompt "$SESSION" "$ISSUE_ID"
}
```

#### 4. Auto Mode Worker Prompt

Workers in auto mode get explicit instructions about autonomous completion:

```bash
send_auto_mode_prompt() {
  local SESSION="$1"
  local ISSUE_ID="$2"

  # Validate session exists
  if ! tmux has-session -t "$SESSION" 2>/dev/null; then
    echo "ERROR: Session $SESSION does not exist"
    return 1
  fi

  # Get issue details
  ISSUE_JSON=$(bd show "$ISSUE_ID" --json 2>/dev/null)
  TITLE=$(echo "$ISSUE_JSON" | jq -r '.title // "Untitled"')
  DESCRIPTION=$(echo "$ISSUE_JSON" | jq -r '.description // ""')
  TYPE=$(echo "$ISSUE_JSON" | jq -r '.type // "task"')

  # Determine skills based on issue content
  SKILLS=""
  if echo "$TITLE $DESCRIPTION" | grep -qiE "terminal|xterm|pty"; then
    SKILLS="Run \`/xterm-js\` for terminal patterns."
  elif echo "$TITLE $DESCRIPTION" | grep -qiE "ui|component|modal|button|sidebar"; then
    SKILLS="Run \`/ui-styling:ui-styling\` for component patterns."
  elif echo "$TITLE $DESCRIPTION" | grep -qiE "debug|fix|error|bug"; then
    SKILLS="Use debugging patterns."
  fi

  tmux send-keys -t "$SESSION" -l "## Task (Auto Mode - Wave $WAVE_NUMBER)
$ISSUE_ID: $TITLE

$DESCRIPTION

## Mode
This is an AUTO MODE swarm. Work autonomously without asking questions.
Make reasonable decisions and proceed. If truly blocked, document in issue comments.

## Skills to Invoke
$SKILLS

## Approach
- Use subagents liberally to preserve context
- Make autonomous decisions (don't ask - decide)
- Build and test before completing
- Follow existing code patterns

## Completion
When finished, run:
\`\`\`
/worker-done $ISSUE_ID
\`\`\`

This verifies build/test, runs code review, commits, and closes the issue."
  sleep 0.3
  tmux send-keys -t "$SESSION" C-m
}
```

#### 5. Wait for Wave Completion

```bash
wait_for_wave_completion() {
  # Spawn watcher for this wave
  # Watcher handles:
  # - Code review per worker
  # - Worker reuse (low context)
  # - Merge when all pass
  # - Docs update
  # - Notify when wave complete

  Task tool:
    subagent_type: "conductor:watcher"
    run_in_background: true
    prompt: |
      CONDUCTOR_SESSION=$CONDUCTOR_SESSION
      PROJECT_DIR=$PROJECT_DIR
      AUTO_MODE=true
      WAVE_NUMBER=$WAVE_NUMBER

      Monitor Wave $WAVE_NUMBER workers:

      On WORKER_DONE:
      1. Worker self-reviewed via /worker-done
      2. Mark as complete

      On ALL_WORKERS_DONE:
      1. Merge all feature branches to main
      2. Clean up worktrees
      3. Run: bd sync
      4. Send to conductor: "WAVE_COMPLETE"

      Do NOT spawn docs-updater per wave (save for end).
      Do NOT push to origin per wave (push at end).
}
```

#### 6. Context Check & Recovery

The conductor monitors its own context and triggers /wipe when needed:

```bash
check_conductor_context() {
  # Read context from Claude status line
  # Format: "XX% ctx" in terminal status bar
  CONTEXT=$(tmux capture-pane -t "$CONDUCTOR_SESSION" -p 2>/dev/null | grep -oP '\d+(?=% ctx)' | tail -1)
  CONTEXT=${CONTEXT:-0}

  if [ "$CONTEXT" -ge 75 ]; then
    echo "⚠️ Conductor at ${CONTEXT}% context - triggering /wipe recovery"
    trigger_wipe_recovery
  fi
}

trigger_wipe_recovery() {
  # Save state for recovery
  save_state "$WAVE_NUMBER" "$(bd list --status=in_progress --json | jq -r '.[].id' | tr '\n' ',')"

  # The /wipe skill will:
  # 1. Generate handoff summary
  # 2. Save to clipboard
  # 3. Clear context
  # 4. Auto-continue in fresh session

  # Include recovery instructions in handoff
  echo "
## Auto Mode Recovery State

Saved to: $STATE_FILE

### Resume Command
In fresh session, run:
\`\`\`
/bd-swarm --auto --resume
\`\`\`

### State
- Wave: $WAVE_NUMBER
- In-progress issues: $(bd list --status=in_progress --json | jq -r '.[].id' | tr '\n' ', ')
- Workers active: $(tmux ls 2>/dev/null | grep -c "^ctt-claude" || echo 0)

The fresh conductor will:
1. Check for active workers from previous session
2. Resume monitoring until wave completes
3. Continue with next wave
" >> /tmp/bd-swarm-handoff.md

  # Trigger /wipe
  /wipe
}
```

#### 7. State Persistence

```bash
save_state() {
  local WAVE="$1"
  local ISSUES="$2"

  cat > "$STATE_FILE" << EOF
{
  "wave_number": $WAVE,
  "project_dir": "$PROJECT_DIR",
  "conductor_session": "$CONDUCTOR_SESSION",
  "timestamp": "$(date -Iseconds)",
  "active_issues": "$(bd list --status=in_progress --json | jq -r '.[].id' | tr '\n' ',')",
  "active_workers": "$(tmux ls 2>/dev/null | grep "^ctt-claude" | cut -d: -f1 | tr '\n' ',')"
}
EOF
}

load_state() {
  if [ -f "$STATE_FILE" ]; then
    WAVE_NUMBER=$(jq -r '.wave_number // 1' "$STATE_FILE")
    PROJECT_DIR=$(jq -r '.project_dir // "."' "$STATE_FILE")
    echo "Resuming from Wave $WAVE_NUMBER"
    return 0
  fi
  return 1
}
```

#### 8. Resume After /wipe

When invoked with `--resume`:

```bash
if [ "$1" = "--resume" ]; then
  if load_state; then
    echo "🔄 Resuming auto mode from Wave $WAVE_NUMBER"

    # Check for still-active workers from previous session
    ACTIVE_WORKERS=$(tmux ls 2>/dev/null | grep "^ctt-claude" | cut -d: -f1)

    if [ -n "$ACTIVE_WORKERS" ]; then
      echo "Found active workers from previous session:"
      echo "$ACTIVE_WORKERS"

      # Spawn watcher to monitor existing workers
      wait_for_wave_completion
    fi

    # Continue with wave loop
    auto_wave_loop
  else
    echo "No saved state found. Starting fresh."
    auto_wave_loop
  fi
fi
```

### Final Completion

When `bd ready` returns empty and all workers are done:

```bash
notify_completion() {
  # Final docs update (covers all waves)
  Task tool:
    subagent_type: "conductor:docs-updater"
    prompt: "Review all commits since auto mode started. Update CHANGELOG.md and docs as needed. Working dir: $PROJECT_DIR"

  # Final sync and push
  cd "$PROJECT_DIR"
  bd sync
  git push origin main

  # Cleanup state file
  rm -f "$STATE_FILE"

  # Notify user
  mcp-cli call tabz/tabz_notification_show '{"title": "🎉 Backlog Complete!", "message": "All waves finished. Changes pushed to origin.", "type": "basic"}'

  # TTS announcement
  mcp-cli call tabz/tabz_speak '{"text": "Backlog complete! All waves finished and pushed to origin."}'

  echo "
╔═══════════════════════════════════════════════════════════╗
║  🎉 AUTO MODE COMPLETE                                    ║
╠═══════════════════════════════════════════════════════════╣
║  Waves completed: $WAVE_NUMBER                            ║
║  Issues resolved: $(bd list --status=closed --json | jq length)  ║
║  Changes pushed to origin                                 ║
╚═══════════════════════════════════════════════════════════╝
"
}
```

### Auto Mode Summary

| Phase | Action |
|-------|--------|
| **Init** | Get session ID, set wave=1, load state if resuming |
| **Wave Loop** | `bd ready` → spawn all → monitor → repeat |
| **Monitoring** | Watcher handles review, merge, sync per wave |
| **Context** | Check at 75% → /wipe with handoff → resume |
| **Completion** | Empty `bd ready` → docs update → push → celebrate |

### Usage

```bash
# Start fresh auto mode
/bd-swarm --auto

# Resume after /wipe or context recovery
/bd-swarm --auto --resume

# Check progress without interacting
bd stats
tmux ls | grep "^ctt-claude"
```

---

## Interactive Workflow (Default)

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

# Validate session exists before sending (prevents crashes if spawn failed)
if ! tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "ERROR: Session $SESSION does not exist - spawn may have failed"
  exit 1
fi

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
