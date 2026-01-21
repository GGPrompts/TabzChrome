---
name: reviewing-code
description: "Code review checkpoint using codex review CLI. Returns structured result with pass/fail status and issues. Use when: 'code review', 'review changes', 'codex review', 'check my code'."
user-invocable: true
---

# Codex Review Checkpoint

Code review checkpoint that runs `codex review` on the current worktree.

**Note:** The gate-runner script runs this automatically for issues with `gate:codex-review` label. This skill documents the process for manual use.

## Quick Start

```bash
# Review uncommitted changes
codex review --uncommitted --title "My Review"

# Review branch changes against main
codex review --base main --title "Feature Review"

# Review a specific commit
codex review --commit abc123
```

## What This Skill Does

1. Determines what to review (uncommitted changes vs branch diff)
2. Runs `codex review` (non-interactive, exits on completion)
3. Parses results into structured format
4. Writes result to checkpoint file

## Workflow

### Step 1: Determine Review Scope

```bash
# Check for uncommitted changes
git status --porcelain

# Check for branch diff
git diff --quiet main...HEAD && echo "No branch changes" || echo "Has branch changes"
```

### Step 2: Run Codex Review

```bash
# For uncommitted changes
codex review --uncommitted --title "Checkpoint Review"

# For branch diff against main
codex review --base main --title "Checkpoint Review"
```

Codex review:
- Runs non-interactively (no terminal interaction needed)
- Outputs structured findings with severity levels (P1, P2, P3)
- Exits with appropriate status

### Step 3: Parse and Write Result

After reviewing, create a structured result:

```json
{
  "checkpoint": "codex-review",
  "timestamp": "2026-01-19T12:00:00Z",
  "passed": true,
  "issues": [],
  "summary": "No critical issues found"
}
```

**Result Fields:**
- `passed`: true if no P1/P2 issues found
- `issues`: array of `{severity, message, file?, line?}`
- `summary`: brief human-readable summary

### Step 4: Write Checkpoint File

```bash
mkdir -p .checkpoints
cat > .checkpoints/codex-review.json << 'EOF'
{
  "checkpoint": "codex-review",
  "timestamp": "...",
  "passed": true,
  "issues": [],
  "summary": "..."
}
EOF
```

## Decision Criteria

**Pass if:**
- No P1 or P2 issues found
- No security vulnerabilities detected
- No obvious bugs or logic errors

**Fail if:**
- P1/P2 issues found
- Security issues found
- Critical bugs detected

## Example Output

```
$ codex review --uncommitted --title "Feature Review"
OpenAI Codex v0.87.0 (research preview)
--------
workdir: /home/user/project
model: gpt-5.2
...

[P2] Guard against missing script before execution — path/to/file.sh:45
  Description of the issue...

[P3] Consider adding error handling — path/to/other.ts:120
  Suggestion details...
```

## Automated Usage

The `gate-runner.sh` script runs codex review automatically:

```bash
./plugins/conductor/scripts/gate-runner.sh --issue ISSUE-ID --worktree /path/to/worktree
```

This:
1. Checks issue labels for `gate:codex-review`
2. Runs `codex review` directly (no terminal spawn needed)
3. Writes checkpoint to `.checkpoints/codex-review.json`
4. Returns pass/fail status
