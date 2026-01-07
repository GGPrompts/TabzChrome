---
name: worker-done
description: "Complete worker task: verify build, run code review, commit, and close issue. Invoke with /conductor:worker-done <issue-id>"
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

| Step | Command | Blocking? |
|------|---------|-----------|
| 1 | `/conductor:verify-build` | Yes - stop on failure |
| 2 | `/conductor:run-tests` | Yes - stop on failure |
| 3 | `/conductor:code-review` | Yes - stop on failure |
| 4 | `/conductor:commit-changes` | Yes - stop on failure |
| 5 | `/conductor:create-followups` | No - log and continue |
| 6 | `/conductor:update-docs` | No - log and continue |
| 7 | `/conductor:close-issue` | Yes - report result |

---

## Execute Pipeline

### Step 1: Verify Build
```bash
echo "=== Step 1: Build Verification ==="
```
Run `/conductor:verify-build`. If `passed: false` -> **STOP**, fix errors, re-run.

### Step 2: Run Tests
```bash
echo "=== Step 2: Test Verification ==="
```
Run `/conductor:run-tests`. If `passed: false` -> **STOP**, fix tests, re-run.

### Step 3: Code Review
```bash
echo "=== Step 3: Code Review ==="
```
Run `/conductor:code-review` (spawns code-reviewer subagent). If `passed: false` -> **STOP**, fix blockers, re-run.

### Step 4: Commit Changes
```bash
echo "=== Step 4: Commit ==="
```
Run `/conductor:commit-changes <issue-id>`. Creates conventional commit with Claude signature.

### Step 5-6: Non-blocking
```bash
echo "=== Step 5: Follow-up Tasks ==="
echo "=== Step 6: Documentation Check ==="
```
Run `/conductor:create-followups` and `/conductor:update-docs`. Log and continue.

### Step 7: Close Issue
```bash
echo "=== Step 7: Close Issue ==="
```
Run `/conductor:close-issue <issue-id>`. Reports final status.

---

## Atomic Commands Reference

| Command | Description |
|---------|-------------|
| `/conductor:verify-build` | Run build, report errors |
| `/conductor:run-tests` | Run tests if available |
| `/conductor:code-review` | Opus review with auto-fix |
| `/conductor:codex-review` | Codex review (read-only, cheaper) |
| `/conductor:commit-changes` | Stage + commit with conventional format |
| `/conductor:create-followups` | Create follow-up beads issues |
| `/conductor:update-docs` | Check/update documentation |
| `/conductor:close-issue` | Close beads issue |

---

## Custom Pipelines

Compose commands for custom workflows:

**Quick commit (skip review):**
```
/conductor:verify-build
/conductor:run-tests
/conductor:commit-changes
/conductor:close-issue <id>
```

**Review-focused (no commit):**
```
/conductor:verify-build
/conductor:code-review
```

---

## Error Handling

| Step | On Failure |
|------|------------|
| Build | Show errors, stop pipeline |
| Tests | Show failures, stop pipeline |
| Review | Show blockers, stop pipeline |
| Commit | Show git errors, stop pipeline |
| Follow-ups | Non-blocking - log and continue |
| Docs | Non-blocking - log and continue |
| Close | Show beads errors |

---

## Re-running After Fixes

If the pipeline stopped:
1. Fix the issues
2. Run `/conductor:worker-done` again

The pipeline is idempotent - safe to re-run.

---

## After Completion

When `/conductor:worker-done` succeeds:
- Issue is closed in beads
- Commit is on the feature branch
- Worker's job is done

**The conductor is responsible for:**
- Merging the feature branch to main
- Killing this worker's tmux session
- Removing the worktree
- Deleting the feature branch

Workers do NOT kill their own session - the conductor monitors for closed issues and handles cleanup.

---

## Reference Files

| File | Content |
|------|---------|
| `references/example-sessions.md` | Example output for different scenarios |

Execute this pipeline now.
