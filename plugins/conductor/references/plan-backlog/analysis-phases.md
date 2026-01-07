# Analysis Phases - Plan Backlog

Detailed procedures for analyzing and parallelizing the backlog.

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

### 1.4 Summary Output

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
