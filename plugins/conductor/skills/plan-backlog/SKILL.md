---
user-invocable: false
name: gg-plan-backlog
description: "AI-assisted backlog grooming: prioritize, add dependencies, assign quality gates, draft worker prompts"
---

# Plan Backlog - AI Scrum Master

Transform rough notes into a well-organized, parallelizable backlog with worker-ready prompts.

## Steps

Add these to your to-dos:

1. **Analyze current state** - Get backlog stats and ready/blocked issues
2. **Break down epics** - Use `/planner:breakdown` skill (Sonnet) for decomposition
3. **Prioritize and wire dependencies** - Set priorities, add blockers
4. **Assign quality gates** - Create gate issues based on issue characteristics
5. **Prepare issue prompts** - Use `/prompt-writer:write` for each backlog issue (Haiku)
6. **Output sprint plan** - Present waves of parallelizable work

## Step 1: Analyze Current State

**Using MCP (preferred):**
```python
mcp__beads__stats()                    # Overview
mcp__beads__ready()                    # What's unblocked
mcp__beads__blocked()                  # What's stuck
mcp__beads__list(status="open")        # All open work
```

**CLI fallback:**
```bash
bd stats
bd ready --json
bd blocked --json
bd list --status open --json
```

## Step 2: Break Down Large Work (Epics)

Use the `/planner:breakdown` skill for strategic decomposition of epics.

The skill runs with Sonnet and will:
- Apply decomposition patterns (feature, refactor, or bug fix)
- Identify task sizing (target S-M tasks)
- Detect file overlaps that need sequencing
- Suggest wave organization

**Using MCP:**
```python
# Create epic
mcp__beads__create(
  title="Auth System",
  issue_type="epic",
  priority=1
)

# Add subtasks
mcp__beads__create(title="Design auth flow", issue_type="task")
mcp__beads__create(title="Implement login", issue_type="task")
mcp__beads__create(title="Add tests", issue_type="task")

# Wire dependencies
mcp__beads__dep(issue_id="IMPL-ID", depends_on_id="DESIGN-ID")
mcp__beads__dep(issue_id="TESTS-ID", depends_on_id="IMPL-ID")
```

## Step 3: Prioritize and Wire Dependencies

For each issue, consider:
- Is it blocking other work? -> Raise priority
- Is it a quick win? -> Raise priority
- Does it have dependencies? -> Add them
- What labels apply? -> Add them

**Using MCP:**
```python
# Set priority (0=critical, 1=high, 2=medium, 3=low, 4=backlog)
mcp__beads__update(issue_id="ID", priority=1)

# Add dependencies (blocker blocks blocked)
mcp__beads__dep(issue_id="BLOCKED-ID", depends_on_id="BLOCKER-ID")
```

**CLI fallback:**
```bash
bd update ID --priority 1 --json
bd dep add BLOCKED-ID BLOCKER-ID --json
bd label add ID frontend,auth --json
```

## Step 4: Assign Quality Gates

Based on issue characteristics, assign appropriate quality checkpoints. The `/conductor:gate-runner` (or the one-shot `finalize-issue.sh`) runs these checkpoints before merging.

### Gate Types

| Gate | Purpose | Checkpoint Skill |
|------|---------|-----------------|
| `codex-review` | Code review via Codex | `/conductor:reviewing-code` |
| `test-runner` | Run project tests | `/conductor:running-tests` |
| `visual-qa` | Visual/UI verification | `/conductor:visual-qa` |
| `docs-check` | Changelog/docs hygiene | `/conductor:docs-check` |

#### Assignment Heuristics

Analyze each issue and suggest gates based on:

| Indicator | Suggested Gates |
|-----------|-----------------|
| **Issue Type** | |
| Bug fix | `codex-review` |
| New feature | `codex-review`, `test-runner` |
| Refactor | `codex-review`, `test-runner` |
| Chore/config | (none or `codex-review`) |
| Docs only | (none) |
| Epic close | `codex-review` |
| **Files Touched** | |
| `*.tsx`, `*.jsx`, `*.css`, `*.scss` | `visual-qa` |
| `*.test.ts`, `*.spec.ts` | `test-runner` |
| `README.md`, `docs/`, `*.md` | `docs-check` |
| **Labels** | |
| `needs-visual`, `ui`, `frontend` | `visual-qa` |
| `needs-tests`, `testing` | `test-runner` |
| `needs-review`, `security` | `codex-review` |
| `needs-docs` | `docs-check` |

#### Assigning Gates (Recommended: labels on the work issue)

After determining which gates apply, add labels to the work issue:

**Using CLI:**
```bash
# Add one gate
bd label add ISSUE-ID gate:codex-review

# Add multiple gates
bd label add ISSUE-ID gate:codex-review,gate:test-runner,gate:visual-qa,gate:docs-check
```

**Using MCP:**
```python
mcp__beads__update(issue_id="ISSUE-ID", labels=["gate:codex-review", "gate:test-runner"])
```

**Docs-check bypass label (explicit, searchable):**
```bash
bd label add ISSUE-ID no-changelog
```

#### Presenting Gate Suggestions

When outputting the sprint plan, show suggested gates:

```markdown
## Issue Analysis

| Issue | Type | Files | Suggested Gates |
|-------|------|-------|-----------------|
| bd-xxx | bug | Terminal.tsx | codex-review, visual-qa |
| bd-yyy | feature | api.js, api.test.js | codex-review, test-runner |
| bd-zzz | docs | README.md | (none) |

**Create these gates?** [y/N]
```

#### User Override

Always allow the user to:
- Add additional gates
- Remove suggested gates
- Skip gates entirely for low-risk changes

```markdown
Would you like to:
1. Create all suggested gates
2. Select gates per issue
3. Skip gate assignment
```

## Step 5: Prepare Issue Prompts

Use `/prompt-writer:write` for each backlog issue to craft worker-ready prompts.

The prompt-writer skill runs with Haiku and will:
- Read issue details
- Discover relevant skills
- Explore key files (3-5 only)
- Craft a focused prompt following Claude 4 best practices
- Store prompt in issue notes
- Mark issue as ready

For batch processing, use `/prompt-writer:write-all` to process all backlog issues in parallel.

## Step 6: Output Sprint Plan

Present the organized backlog:

```markdown
## Wave 1 (Ready Now)
| Issue | Priority | Type | Description |
|-------|----------|------|-------------|
| bd-xxx | P1 | bug | Fix login redirect |
| bd-yyy | P2 | feature | Add dark mode toggle |

## Wave 2 (After Wave 1)
| Issue | Blocked By | Description |
|-------|------------|-------------|
| bd-zzz | bd-xxx | Refactor auth flow |
```

## Decision Guidance

| Situation | Action |
|-----------|--------|
| Blocks 3+ issues | Priority 0-1 |
| Quick win (<1hr) | Priority 1-2 |
| User-facing bug | Priority 0-1 |
| Nice-to-have | Priority 3-4 |
| Large feature | Break into epic + subtasks |

## Sparse Backlog?

If there are few/no ready issues, offer to brainstorm:

"Your backlog is light. Want to brainstorm what needs to be done?"

Then help the user think through:
- What work needs to be done (rough ideas -> concrete tasks)
- How to structure it (epics, dependencies, waves)
- What would "done" look like

See the brainstorm skill references for dependency patterns and epic structures.

Start by running `mcp__beads__stats()` and `mcp__beads__ready()` to understand the current state.
