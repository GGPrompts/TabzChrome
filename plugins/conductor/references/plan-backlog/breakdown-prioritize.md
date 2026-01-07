# Breakdown & Prioritize - Plan Backlog

Procedures for epic breakdown and priority adjustments.

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
- beads-xxx: P3 -> P1 (blocks 4 issues)
- beads-yyy: P4 -> P2 (quick win)
- beads-zzz: P1 -> P3 (no longer blocking)
```

### 4.3 Apply Approved Changes

```bash
# Apply priority changes
bd update beads-xxx --priority 1
bd update beads-yyy --priority 2
bd update beads-zzz --priority 3
```
