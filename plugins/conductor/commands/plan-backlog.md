---
name: plan-backlog
description: "AI-assisted backlog grooming: prioritize, add dependencies, assign quality gates, draft worker prompts"
---

# Plan Backlog - AI Scrum Master

You are a beads expert helping groom and organize the backlog. Transform rough notes into a well-organized, parallelizable backlog with worker-ready prompts.

**Use MCP tools when available** - they're more efficient than CLI.

## Your Role

The user adds rough issues to beads. You analyze and organize them:
- Set appropriate priorities
- Add dependencies and blockers
- Group related work
- Break down epics into subtasks
- **Assign quality gates** based on issue type, files, and labels
- **Prepare issue notes** with skill hints and context
- Organize into parallelizable waves

## Workflow

### 1. Analyze Current State

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

### 2. Review and Prioritize

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

### 3. Break Down Large Work

Epics should be decomposed into smaller tasks:

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

### 4. Auto-Detect Skills

Use `match-skills.sh` to automatically detect relevant skills based on issue content:

```bash
# Get skill suggestions for an issue
SCRIPT="$HOME/.claude/plugins/cache/my-plugins/conductor/*/scripts/match-skills.sh"
SKILLS=$($SCRIPT --triggers "$(bd show ISSUE-ID --json | jq -r '.[0].title + " " + .[0].description')")

# Example output: "Use the xterm-js skill for terminal integration and resize handling."
```

Or match from issue ID directly:
```bash
$SCRIPT --issue ISSUE-ID
```

**Available options:**
- `--triggers "text"` - Get natural language skill suggestions
- `--issue ID` - Match from beads issue content
- `--json "text"` - Get structured JSON output
- `--available-full` - List all available skills with descriptions

### 5. Assign Quality Gates

Based on issue characteristics, assign appropriate quality gates. The `/conductor:gate-runner` will execute these gates before merging.

#### Gate Types

| Gate | Purpose | Checkpoint Skill |
|------|---------|-----------------|
| `codex-review` | Code review via Codex | `/codex-review` |
| `test-runner` | Run project tests | `/test-runner` |
| `visual-qa` | Visual/UI verification | `/visual-qa` |
| `docs-check` | Documentation updates | `/docs-check` |
| `human` | Manual approval | (requires `bd gate resolve`) |

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
| `needs-manual`, `breaking-change` | `human` |

#### Creating Gates

After determining which gates apply, create them as blockers:

**Using CLI:**
```bash
# Create gate issue that blocks the work issue
bd create "codex-review for ISSUE-ID" --type gate --deps "blocks:ISSUE-ID" --labels codex-review

# Multiple gates
bd create "test-runner for ISSUE-ID" --type gate --deps "blocks:ISSUE-ID" --labels test-runner
bd create "visual-qa for ISSUE-ID" --type gate --deps "blocks:ISSUE-ID" --labels visual-qa
```

**Using MCP:**
```python
# Create gate that blocks the issue
mcp__beads__create(
  title="codex-review for ISSUE-ID",
  issue_type="gate",
  deps=["blocks:ISSUE-ID"],
  labels=["codex-review"]
)
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

### 6. Prepare Issue Notes & Mark Ready

The conductor sends the same standard prompt to every worker. All context goes in the issue notes/design/acceptance fields.

**Important:** After drafting the prompt/notes, add the `ready` label to mark the issue as ready for workers:

```bash
bd label add ISSUE-ID ready
```

Or via MCP:
```python
mcp__beads__update(issue_id="ISSUE-ID", add_labels=["ready"])
```

Issues without the `ready` label are considered "backlog" - they have been created but not yet planned/drafted. The `/conductor:auto` command only picks up issues with the `ready` label.

#### Update Issue with Context

First get skill suggestions, then update the issue:

```bash
# Get skill hints
SKILLS=$($SCRIPT --triggers "$(bd show ISSUE-ID --json | jq -r '.[0].title')")
```

**Using MCP:**
```python
mcp__beads__update(
  issue_id="ISSUE-ID",
  notes="""## Problem
Brief description of what needs fixing.

## Approach
{SKILLS}  # e.g., "Use the xterm-js skill for terminal integration."

## Key Files
- path/to/file.ts

## When Done
Close issue with reason summary""",
  design="Technical approach notes here",
  acceptance_criteria="""- [ ] Feature works as expected
- [ ] Tests pass
- [ ] No console errors"""
)
```

**CLI fallback:**
```bash
bd update ISSUE-ID --notes "## Problem
Brief description...

## Approach
$SKILLS

## Key Files
- path/to/file.ts"
```

#### Notes Structure

| Field | Purpose |
|-------|---------|
| `notes` | Problem, approach, skill hints, key files |
| `design` | Technical approach, architecture decisions |
| `acceptance_criteria` | Checkboxes for definition of done |

Keep notes concise - workers read the issue description too.

#### Parallelization Hints

For multi-part tasks, add to notes:

```
Use subagents in parallel to scaffold Dashboard, Settings, and Profile pages.
```

### 7. Organize Into Waves

Group ready issues for parallel execution:

**Using MCP:**
```python
# Wave 1 = all currently ready (no blockers)
mcp__beads__ready()

# After Wave 1 completes, new work becomes ready
# Check with mcp__beads__ready() again
```

### 8. Output Sprint Plan

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
