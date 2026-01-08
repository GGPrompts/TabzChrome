---
name: worker-done
description: "Complete worker task: verify build, run tests, commit, and close issue. Code review happens at conductor level after merge. Invoke with /conductor:worker-done <issue-id>"
---

# Worker Done - Task Completion Orchestrator

Orchestrates the full task completion pipeline by composing atomic commands.

## Usage

```bash
/conductor:worker-done TabzChrome-abc

# Or if issue ID is in your task header:
/conductor:worker-done
```

## Pipeline Overview

| Step | Command | Blocking? | Skip if DOCS_ONLY? |
|------|---------|-----------|-------------------|
| 0 | Detect change types | No | - |
| 1 | `/conductor:verify-build` | Yes - stop on failure | Yes |
| 1a | `plugin-validator` agent | Yes - stop on failure | ONLY if DOCS_ONLY |
| 2 | `/conductor:run-tests` | Yes - stop on failure | Yes |
| 3 | `/conductor:commit-changes` | Yes - stop on failure | No |
| 4 | `/conductor:create-followups` | No - log and continue | No |
| 5 | `/conductor:update-docs` | No - log and continue | No |
| 5.5 | Record completion info | No - best effort | No |
| 6 | `/conductor:close-issue` | Yes - report result | No |
| 7 | Notify conductor | No - best effort | No |

**CRITICAL: You MUST execute Step 7 after Step 6.** Workers that skip Step 7 force the conductor to poll, wasting resources.

**DOCS_ONLY mode:** When all changes are markdown files (`.md`, `.markdown`), steps 1-2 are replaced with the `plugin-validator` agent. This validates markdown structure and content without running expensive build/test steps.

**Code review happens at conductor level:** Workers do NOT run code review. The conductor runs unified code review after merging all worker branches (see `/conductor:wave-done`). This prevents conflicts when multiple workers run in parallel.

---

## Execute Pipeline

### Step 0: Detect Change Types
```bash
echo "=== Step 0: Detecting Change Types ==="
# Check if only markdown files changed (staged + unstaged)
git diff --cached --name-only
git diff --name-only
```

**Detection logic:**
1. Get list of all changed files (staged and unstaged)
2. Check if ALL changes are markdown files (`.md`, `.markdown`)
3. Set `DOCS_ONLY=true` if only markdown, otherwise `DOCS_ONLY=false`

```bash
# Detection check - if ANY file is non-markdown, run full pipeline
if git diff --cached --name-only | grep -qvE '\.(md|markdown)$' 2>/dev/null; then
  DOCS_ONLY=false
elif git diff --name-only | grep -qvE '\.(md|markdown)$' 2>/dev/null; then
  DOCS_ONLY=false
else
  # Check if there are actually any changes at all
  if [ -z "$(git diff --cached --name-only)$(git diff --name-only)" ]; then
    DOCS_ONLY=false  # No changes = run normal pipeline
  else
    DOCS_ONLY=true
  fi
fi
```

If `DOCS_ONLY=true`: Run **Step 1a** (plugin-validator), then skip to **Step 3**.
If `DOCS_ONLY=false`: Continue with full pipeline (Steps 1, 2, 3...).

---

### Step 1: Verify Build (skip if DOCS_ONLY)
```bash
echo "=== Step 1: Build Verification ==="
```
Run `/conductor:verify-build`. If `passed: false` -> **STOP**, fix errors, re-run.

### Step 1a: Plugin Validator (ONLY if DOCS_ONLY)

When `DOCS_ONLY=true`, run the `plugin-validator` agent instead of build/test:

```bash
echo "=== Step 1a: Plugin Validation (markdown-only changes) ==="
```

**Invoke the plugin-validator agent** to validate the changed markdown files:

```
Task(subagent_type="plugin-dev:plugin-validator", prompt="Validate the following changed markdown files: <list files from git diff>. Check for: broken links, invalid YAML frontmatter, missing required sections, and consistent formatting.")
```

The agent will:
1. Check YAML frontmatter syntax in skill/agent files
2. Verify required fields are present (name, description, etc.)
3. Check for broken internal links
4. Validate markdown structure

If validation fails -> **STOP**, fix issues, re-run.
If validation passes -> Skip to **Step 3** (commit).

### Step 2: Run Tests (skip if DOCS_ONLY)
```bash
echo "=== Step 2: Test Verification ==="
```
Run `/conductor:run-tests`. If `passed: false` -> **STOP**, fix tests, re-run.

### Step 3: Commit Changes
```bash
echo "=== Step 3: Commit ==="
```
Run `/conductor:commit-changes <issue-id>`. Creates conventional commit with Claude signature.

### Step 4-5: Non-blocking
```bash
echo "=== Step 4: Follow-up Tasks ==="
echo "=== Step 5: Documentation Check ==="
```
Run `/conductor:create-followups` and `/conductor:update-docs`. Log and continue.

### Step 5.5: Record Completion Info
```bash
echo "=== Step 5.5: Record Completion Info ==="

# Get existing notes and append completion info
EXISTING_NOTES=$(bd show "$ISSUE_ID" --json 2>/dev/null | jq -r '.notes // ""')
COMMIT_SHA=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Append completion info to existing notes
NEW_NOTES="${EXISTING_NOTES}
completed_at: $(date -Iseconds)
commit: $COMMIT_SHA"

bd update "$ISSUE_ID" --notes "$NEW_NOTES"
```

This creates an audit trail with start time (from spawn) and completion time + commit.

### Step 6: Close Issue
```bash
echo "=== Step 6: Close Issue ==="
```
Run `/conductor:close-issue <issue-id>`. Reports final status.

### Step 7: Notify Conductor (REQUIRED)

**DO NOT SKIP THIS STEP.** After closing the issue, notify the conductor:

**Finding the conductor session:**
1. **Primary: Check your prompt** - Look for the "## Conductor Session" section in your task prompt. It contains the session name (e.g., `ctt-claude-abc123`).
2. **Backup: Check env var** - `CONDUCTOR_SESSION` environment variable (may be lost in some contexts).

**Why prompt text is primary:** Env vars are fragile and not visible in conversation context. The session name in your prompt is always accessible.

```bash
echo "=== Step 7: Notify Conductor ==="

# Get conductor session from prompt text (primary) or environment (backup)
# Workers: Look in your "## Conductor Session" prompt section for the session name
CONDUCTOR_SESSION="${CONDUCTOR_SESSION:-}"

if [ -n "$CONDUCTOR_SESSION" ]; then
  # Build completion summary
  SUMMARY="WORKER COMPLETE: $ISSUE_ID - $(git log -1 --format='%s' 2>/dev/null || echo 'committed')"

  # Send notification to conductor via tmux
  tmux send-keys -t "$CONDUCTOR_SESSION" -l "$SUMMARY"
  sleep 0.3
  tmux send-keys -t "$CONDUCTOR_SESSION" C-m

  echo "Notified conductor: $CONDUCTOR_SESSION"
else
  echo "No CONDUCTOR_SESSION found - conductor will detect completion via polling"
fi
```

**Note for workers:** If the env var is empty, extract the session name from your prompt's "## Conductor Session" section and use it directly in the tmux command.

---

## Atomic Commands Reference

| Command | Description |
|---------|-------------|
| `/conductor:verify-build` | Run build, report errors |
| `/conductor:run-tests` | Run tests if available |
| `/conductor:commit-changes` | Stage + commit with conventional format |
| `/conductor:create-followups` | Create follow-up beads issues |
| `/conductor:update-docs` | Check/update documentation |
| `/conductor:close-issue` | Close beads issue |

**Note:** `/conductor:code-review` is NOT used by workers. Code review runs at conductor level after merge (see `/conductor:wave-done`).

---

## Custom Pipelines

Compose commands for custom workflows:

**Standard worker completion:**
```
/conductor:verify-build
/conductor:run-tests
/conductor:commit-changes
/conductor:close-issue <id>
```

**Quick commit (skip tests):**
```
/conductor:verify-build
/conductor:commit-changes
/conductor:close-issue <id>
```

---

## Error Handling

| Step | On Failure |
|------|------------|
| Build | Show errors, stop pipeline |
| Tests | Show failures, stop pipeline |
| Commit | Show git errors, stop pipeline |
| Follow-ups | Non-blocking - log and continue |
| Docs | Non-blocking - log and continue |
| Close | Show beads errors |
| Notify | Non-blocking - log and continue |

---

## Re-running After Fixes

If the pipeline stopped:
1. Fix the issues
2. Run `/conductor:worker-done` again

The pipeline is idempotent - safe to re-run.

---

## After Notification

When `/conductor:worker-done` succeeds:
- Issue is closed in beads
- Commit is on the feature branch
- Conductor notified (if CONDUCTOR_SESSION set)
- Worker's job is done

**The conductor then:**
- Merges the feature branch to main
- Kills this worker's tmux session
- Removes the worktree (if bd-swarm)
- Deletes the feature branch

Workers do NOT kill their own session - the conductor handles cleanup after receiving the notification.

---

## Review Policy

**Workers do NOT do code review or visual review.** All reviews happen at the conductor level after merge, not in individual workers.

### Why reviews are conductor-level only:

**Code Review:**
- Parallel workers running code review simultaneously causes resource contention
- Unified review after merge catches cross-worker interactions and combined code patterns
- Avoids duplicate review effort (workers reviewed individually, then conductor reviews again)

**Visual Review:**
- Parallel workers opening browser tabs fight over the same browser window
- Workers cannot create isolated tab groups (tabz_claude_group_* uses a single shared group)
- Unified visual review after merge provides better coverage with no conflicts

### Division of Responsibility

**Worker focus:** Implementation → Tests → Build → Commit → Close

**Conductor handles:** Merge → Unified Code Review → Visual QA → Final Push

See `/conductor:wave-done` for the full conductor pipeline.

---

## Reference Files

| File | Content |
|------|---------|
| `references/example-sessions.md` | Example output for different scenarios |

Execute this pipeline now.
