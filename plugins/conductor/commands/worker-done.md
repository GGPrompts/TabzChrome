---
description: "Complete worker task: verify build, run tests, commit, and close issue. Code review happens at conductor level after merge."
---

# Worker Done - Task Completion Orchestrator

Orchestrates the full task completion pipeline by composing atomic commands.

## Before Starting: Create Todo List

**Use TodoWrite to track pipeline progress.** This ensures no steps are missed:

```
1. Detect change types
2. Verify build (if code changes)
3. Run tests (if code changes)
4. Commit changes
5. Create follow-ups
6. Update docs
7. Close issue
8. Notify conductor
```

Mark each step as `in_progress` when starting and `completed` when done.

## Usage

```bash
/conductor:worker-done TabzChrome-abc

# Or if issue ID is in your task header:
/conductor:worker-done
```

## Pipeline Overview

| Step | Command | Blocking? |
|------|---------|-----------|
| 0 | Detect change types | No |
| 1 | `/conductor:verify-build` | Yes (if code changes) |
| 1a | `plugin-validator` agent | Yes (if plugin-only changes) |
| 2 | `/conductor:run-tests` | Yes (if code changes) |
| 3 | `/conductor:commit-changes` | Yes |
| 4 | `/conductor:create-followups` | No |
| 5 | `/conductor:update-docs` | No |
| 6 | `/conductor:close-issue` | Yes |
| 7 | **Notify conductor** | No (REQUIRED) |

**CRITICAL: You MUST execute Step 7 after Step 6.** Workers that skip Step 7 force the conductor to poll.

**Code review happens at conductor level:** Workers do NOT run code review. The conductor runs unified review after merging all branches.

---

## Execute Pipeline

### Step 0: Detect Change Types

```bash
echo "=== Step 0: Detecting Change Types ==="
CHANGED_FILES=$(git diff --cached --name-only; git diff --name-only)

if [ -z "$CHANGED_FILES" ]; then
  CHANGE_TYPE="none"
elif echo "$CHANGED_FILES" | grep -qvE '\.(md|markdown|json)$'; then
  CHANGE_TYPE="code"
else
  CHANGE_TYPE="plugin"
fi

echo "Change type: $CHANGE_TYPE"
```

| CHANGE_TYPE | Action |
|-------------|--------|
| `none` | Skip to commit |
| `plugin` | Run plugin-validator, skip build/test |
| `code` | Run full pipeline |

---

### Step 1: Verify Build (CHANGE_TYPE=code)

```bash
echo "=== Step 1: Build Verification ==="
```

Run `/conductor:verify-build`. If failed -> **STOP**, fix errors, re-run.

### Step 1a: Plugin Validator (CHANGE_TYPE=plugin)

When only plugin files changed:

```markdown
Task(subagent_type="plugin-dev:plugin-validator",
     prompt="Validate plugin changes: $CHANGED_FILES")
```

If validation fails -> **STOP**, fix issues.
If passes -> Skip to **Step 3**.

### Step 2: Run Tests (CHANGE_TYPE=code)

```bash
echo "=== Step 2: Test Verification ==="
```

Run `/conductor:run-tests`. If failed -> **STOP**, fix tests, re-run.

### Step 3: Commit Changes

```bash
echo "=== Step 3: Commit ==="
```

Run `/conductor:commit-changes`. Creates conventional commit.

### Step 4-5: Non-blocking

```bash
echo "=== Step 4: Follow-ups ==="
echo "=== Step 5: Documentation ==="
```

Run `/conductor:create-followups` and `/conductor:update-docs`. Log and continue.

### Step 6: Close Issue

```bash
echo "=== Step 6: Close Issue ==="
```

Run `/conductor:close-issue <issue-id>`.

---

### Step 7: Notify Conductor (REQUIRED)

**DO NOT SKIP THIS STEP.** After closing the issue, notify the conductor:

```bash
echo "=== Step 7: Notify Conductor ==="

ISSUE_ID="$1"
SUMMARY=$(git log -1 --format='%s' 2>/dev/null || echo 'committed')
WORKER_SESSION=$(tmux display-message -p '#{session_name}' 2>/dev/null || echo 'unknown')

# Primary: tmux send-keys to conductor session
CONDUCTOR_SESSION="${CONDUCTOR_SESSION:-}"
if [ -n "$CONDUCTOR_SESSION" ]; then
  tmux send-keys -t "$CONDUCTOR_SESSION" -l "WORKER COMPLETE: $ISSUE_ID - $SUMMARY"
  sleep 0.3
  tmux send-keys -t "$CONDUCTOR_SESSION" C-m
  echo "Notified conductor via tmux: $CONDUCTOR_SESSION"
else
  echo "WARNING: CONDUCTOR_SESSION not set - conductor won't receive notification"
fi

# Secondary: API broadcast for browser UIs
TOKEN=$(cat /tmp/tabz-auth-token 2>/dev/null)
if [ -n "$TOKEN" ]; then
  curl -s -X POST http://localhost:8129/api/notify \
    -H "Content-Type: application/json" \
    -H "X-Auth-Token: $TOKEN" \
    -d "{\"type\": \"worker-complete\", \"issueId\": \"$ISSUE_ID\", \"summary\": \"$SUMMARY\", \"session\": \"$WORKER_SESSION\"}" >/dev/null
fi

echo "=== Worker Done ==="
```

**Why tmux is primary:** Claude Code queues incoming messages even during output, so tmux send-keys is safe.

---

## Error Handling

| Step | On Failure |
|------|------------|
| Build | Show errors, stop pipeline |
| Tests | Show failures, stop pipeline |
| Commit | Show git errors, stop pipeline |
| Follow-ups | Log and continue |
| Docs | Log and continue |
| Close | Show beads errors |
| Notify | Log and continue |

---

## Re-running After Fixes

If the pipeline stopped:
1. Fix the issues
2. Run `/conductor:worker-done` again

The pipeline is idempotent - safe to re-run.

---

## After Notification

When worker-done succeeds:
- Issue is closed in beads
- Commit is on the feature branch
- Conductor notified (if CONDUCTOR_SESSION set)
- Worker's job is done

**The conductor then:**
- Merges the feature branch to main
- Kills worker's tmux session
- Removes the worktree
- Deletes the feature branch

Workers do NOT kill their own session.

---

## Important: Use `bd` CLI, not MCP

Workers should use the `bd` command-line tool, NOT beads MCP commands:

```bash
# CORRECT - use bd CLI
bd show TabzChrome-abc
bd close TabzChrome-abc --reason "done"
bd update TabzChrome-abc --status in_progress

# WRONG - don't use MCP
mcp-cli call beads/show ...  # Workers can't use MCP reliably
```

The `bd` CLI is always available and doesn't require MCP server connection.

---

## Composable Commands

| Command | Description |
|---------|-------------|
| `/conductor:verify-build` | Run build, report errors |
| `/conductor:run-tests` | Run tests if available |
| `/conductor:commit-changes` | Stage + commit |
| `/conductor:create-followups` | Create follow-up issues |
| `/conductor:update-docs` | Update documentation |
| `/conductor:close-issue` | Close beads issue |

**Note:** `/conductor:code-review` is NOT used by workers. Review runs at conductor level.
