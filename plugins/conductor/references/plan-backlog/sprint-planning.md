# Sprint Planning - Plan Backlog

Generate waves of parallelizable work.

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

## Phase 6: AI-Assisted Analysis (Optional)

Use Codex (GPT-5.2) for deeper backlog insights when needed.

### Dependency Analysis

```bash
# Get all issues with dependencies as JSON
ISSUES_JSON=$(bd list --all --json)

# Ask Codex to analyze dependency graph
mcp-cli call codex/codex "$(echo "$ISSUES_JSON" | jq -Rs '{
  prompt: ("Analyze this issue backlog for dependency optimization:\n\n" + . + "\n\nIdentify:\n1. Circular dependencies\n2. Issues that should be dependencies but arent\n3. Critical path (longest chain)\n4. Parallelization opportunities\n\nRespond with actionable recommendations."),
  model: "gpt-5.2",
  sandbox: "read-only"
}')"
```

### Priority Recommendations

```bash
mcp-cli call codex/codex "$(bd list --all --json | jq -Rs '{
  prompt: ("Review these issues and suggest priority adjustments:\n\n" + . + "\n\nConsider:\n- Blocking relationships\n- Estimated complexity\n- User impact\n- Quick wins\n\nOutput as: ISSUE_ID: current_priority -> suggested_priority (reason)"),
  model: "gpt-5.2",
  sandbox: "read-only"
}')"
```

### Epic Breakdown Suggestions

```bash
EPIC_ID="beads-xxx"
EPIC_DETAILS=$(bd show $EPIC_ID)

mcp-cli call codex/codex "$(echo "$EPIC_DETAILS" | jq -Rs '{
  prompt: ("Break down this epic into implementable subtasks:\n\n" + . + "\n\nFor each subtask provide:\n- Title\n- Type (feature/task/bug)\n- Priority (1-4)\n- Dependencies (which subtasks must complete first)\n- Estimated complexity (small/medium/large)\n\nOutput as structured list ready for bd create commands."),
  model: "gpt-5.2",
  sandbox: "read-only"
}')"
```

**Why GPT-5.2?** Planning and analysis tasks benefit from GPT-5.2's reasoning without the agentic overhead of codex variants.
