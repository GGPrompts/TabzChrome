---
description: "Groom and organize beads issues into parallelizable waves for efficient multi-worker execution"
---

# Plan Backlog - Sprint Planning for Parallel Work

Analyze, organize, and prioritize beads issues to enable efficient parallel execution with multiple Claude workers.

## Overview

| Phase | Purpose | Output |
|-------|---------|--------|
| 1. Analyze | Understand current state | Status summary |
| 2. Parallelize | Find concurrent opportunities | Groupings |
| 3. Break Down | Decompose epics | Subtasks + deps |
| 4. Prioritize | Optimize order | Priority adjustments |
| 5. Plan | Generate sprint waves | Parallel execution plan |

---

## Phase 1: Analyze Current State

### 1.1 Gather All Issues

```bash
# Get full picture
echo "=== ALL ISSUES ==="
bd list --all

echo ""
echo "=== READY (No Blockers) ==="
bd ready

echo ""
echo "=== BLOCKED ==="
bd blocked

echo ""
echo "=== STATS ==="
bd stats
```

### 1.2 Parse Into Categories

```bash
# Count by status
OPEN=$(bd list --status=open --json | jq 'length')
IN_PROGRESS=$(bd list --status=in_progress --json | jq 'length')
READY=$(bd ready --json | jq 'length')
BLOCKED=$(bd blocked --json | jq 'length')

echo "Summary: $OPEN open, $IN_PROGRESS in progress, $READY ready, $BLOCKED blocked"
```

### 1.3 Identify Issue Types

```bash
# Group by type
bd list --all --json | jq -r 'group_by(.type) | .[] | "\(.[0].type): \(length)"'
```

### 1.4 Present Summary

```markdown
## Current Backlog State

| Metric | Count |
|--------|-------|
| Open | X |
| In Progress | Y |
| Ready (unblocked) | Z |
| Blocked | W |

### By Type
- Features: N
- Bugs: N
- Tasks: N
- Epics: N
```

---

## Phase 2: Identify Parallelization Opportunities

### 2.1 Find Independent Issues

Issues with no dependencies can run in parallel:

```bash
# Issues that don't depend on anything
bd ready --json | jq -r '.[] | "\(.id): [\(.priority)] \(.title)"'
```

### 2.2 Find High-Impact Blockers

Issues that block many others should be prioritized:

```bash
# For each issue, count how many it blocks
bd list --all --json | jq -r '
  .[] |
  select(.blocks | length > 0) |
  "\(.id): blocks \(.blocks | length) issues - \(.title)"
' | sort -t':' -k2 -rn
```

### 2.3 Group by Component/Area

Analyze titles and descriptions to suggest groupings:

| Area | Indicators | Example Issues |
|------|------------|----------------|
| Frontend | UI, component, modal, button, style | ... |
| Backend | API, server, endpoint, database | ... |
| Terminal | xterm, pty, tmux, shell | ... |
| MCP | tool, mcp, browser | ... |
| Infrastructure | build, CI, test, deploy | ... |

### 2.4 Present Opportunities

```markdown
## Parallelization Analysis

### Independent Issues (Can Run Now)
These have no blockers and can be worked in parallel:
- <issue-1>
- <issue-2>
- <issue-3>

### High-Impact Blockers (Prioritize)
Completing these unblocks the most work:
- <blocker-1>: Unblocks N issues
- <blocker-2>: Unblocks M issues

### Component Groups
Workers can specialize by area:
- **Frontend:** <count> issues
- **Backend:** <count> issues
- **Terminal:** <count> issues
```

---

## Phase 3: Break Down Epics (Interactive)

### 3.1 Find Epics

```bash
bd list --all --json | jq -r '.[] | select(.type == "epic") | "\(.id): \(.title)"'
```

### 3.2 For Each Epic, Propose Breakdown

Use AskUserQuestion:

```
Question: "How should we break down epic '<epic-title>'?"
Header: "Breakdown"
Options:
- Use suggested subtasks (show list)
- Let me specify subtasks
- Skip this epic for now
- This epic is already granular enough
```

### 3.3 Create Subtasks with Dependencies

```bash
# Example breakdown
EPIC_ID="beads-xxx"

# Create subtasks (run in parallel for efficiency)
bd create --title="Design <component> API" --type=task --priority=2
bd create --title="Implement <component> backend" --type=task --priority=2
bd create --title="Create <component> UI" --type=task --priority=2
bd create --title="Add <component> tests" --type=task --priority=2

# Set dependencies (sequential where needed)
bd dep add beads-impl beads-design    # Impl depends on design
bd dep add beads-ui beads-impl        # UI depends on impl
bd dep add beads-tests beads-ui       # Tests depend on UI

# Link to epic (optional - epic blocks all)
bd dep add beads-design $EPIC_ID
```

### 3.4 Verify Dependency Graph

```bash
# Show what's now blocked/ready
bd blocked
bd ready
```

---

## Phase 4: Prioritize

### 4.1 Identify Priority Adjustments

Analyze for:

| Criterion | Adjustment | Reason |
|-----------|------------|--------|
| Blocks 3+ issues | Raise to P1 | Critical path |
| Quick win (<1hr) | Raise to P1-P2 | Fast value |
| No dependents | Lower to P3 | Not blocking |
| User-facing bug | Raise to P1 | User impact |

### 4.2 Propose Changes

Use AskUserQuestion for batch confirmation:

```
Question: "Apply these priority changes?"
Header: "Priorities"
MultiSelect: true
Options:
- beads-xxx: P3 → P1 (blocks 4 issues)
- beads-yyy: P4 → P2 (quick win)
- beads-zzz: P1 → P3 (no longer blocking)
```

### 4.3 Apply Approved Changes

```bash
# Apply priority changes
bd update beads-xxx --priority 1
bd update beads-yyy --priority 2
bd update beads-zzz --priority 3
```

---

## Phase 5: Generate Parallel Sprint Plan

### 5.1 Determine Worker Count

Use AskUserQuestion:

```
Question: "How many parallel workers for this sprint?"
Header: "Workers"
Options:
- 2 workers (conservative)
- 3 workers (balanced) (Recommended)
- 4 workers (aggressive)
- 5 workers (maximum)
```

### 5.2 Build Waves

**Wave 1:** All currently ready issues (no blockers)
**Wave 2:** Issues unblocked after Wave 1 completes
**Wave 3:** Issues unblocked after Wave 2 completes

```bash
# Get ready issues sorted by priority
WAVE1=$(bd ready --json | jq -r 'sort_by(.priority) | .[0:3] | .[] | .id')

# Simulate completion to find Wave 2
# (Issues that depend only on Wave 1 items)
```

### 5.3 Balance Waves

Ensure each wave has roughly equal work:
- Mix quick tasks with longer features
- Keep related issues in same wave when possible
- Consider component grouping to reduce context switching

### 5.4 Output Sprint Plan

```markdown
## Sprint Plan

**Workers:** 3
**Total Issues:** N
**Estimated Waves:** M

---

### Wave 1 (Parallel - Start Immediately)

| Issue | Type | Priority | Est. Complexity |
|-------|------|----------|-----------------|
| beads-xxx | feature | P1 | Medium |
| beads-yyy | bug | P2 | Small |
| beads-zzz | task | P2 | Small |

**Spawn command:**
```bash
/conductor:bd-swarm beads-xxx beads-yyy beads-zzz
```

---

### Wave 2 (After Wave 1)

| Issue | Type | Blocked By | Priority |
|-------|------|------------|----------|
| beads-aaa | feature | beads-xxx | P2 |
| beads-bbb | task | beads-yyy | P3 |

**Dependencies:** Wait for Wave 1 workers to close their issues.

---

### Wave 3 (After Wave 2)

| Issue | Type | Blocked By | Priority |
|-------|------|------------|----------|
| beads-ccc | feature | beads-aaa | P2 |

---

## Quick Actions

# Start Wave 1 now
/conductor:bd-swarm beads-xxx beads-yyy beads-zzz

# Check progress
bd list --status=in_progress

# When Wave 1 done, start Wave 2
bd ready  # Should show Wave 2 issues
/conductor:bd-swarm beads-aaa beads-bbb
```

---

## Notes

- Re-run this command after each wave completes to re-plan
- If issues get stuck, check with `bd show <id>` for blockers
- Use `bd comments <id> add "Progress: ..."` to track status
- Consider `/wipe` between major planning sessions to free context
- For complex epics, use `ultrathink` prefix before breakdown

Execute this workflow now.
