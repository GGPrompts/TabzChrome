---
description: "Pick the top ready beads issue, explore codebase, and start working with skill-aware prompting. Adapts behavior for autonomous vs interactive mode."
---

# Beads Work - Smart Issue Workflow

Pick the highest priority ready issue, explore relevant codebase, and begin working.

## Quick Start

```bash
/conductor:bd-work              # Pick top priority ready issue
/conductor:bd-work TabzChrome-abc  # Work on specific issue
```

## Mode Detection

| Mode | Trigger | Behavior |
|------|---------|----------|
| **Interactive** | Default | Can ask clarifying questions |
| **Autonomous** | Prompt contains "MODE: AUTONOMOUS" | Make defaults, no questions |

---

## Quick Reference Workflows

### Simple Issue (bug/task)
```bash
bd show <id>
bd update <id> --status in_progress
# Implement fix
/conductor:worker-done <id>
```

### Feature Issue (interactive)
```bash
bd show <id>
bd update <id> --status in_progress
# Explore codebase (Phase 3)
# Ask questions if unclear
# Implement
/conductor:worker-done <id>
```

### Feature Issue (autonomous)
```bash
bd show <id>
bd update <id> --status in_progress
# Explore codebase
# Make reasonable defaults (no questions)
# Implement
/conductor:worker-done <id>
```

---

## Workflow Overview

| Phase | Purpose | When |
|-------|---------|------|
| 1. Select | Claim issue | Always |
| 2. Complexity | Determine depth | Always |
| 3. Explore | Analyze codebase | Medium/Complex |
| 4. Questions | Clarify ambiguity | Interactive only |
| 5. Environment | Setup deps | Always |
| 6. Skills | Match to skill | As needed |
| 7. Implement | Write code | Always |
| 8. Complete | worker-done | Always |

**Full details:** `references/bd-work/workflow-phases.md`

---

## Phase 1: Select & Claim

```bash
# Get ready issues
bd ready --json | jq -r '.[] | "\(.id): [\(.priority)] \(.title)"' | head -5

# Claim the issue
bd update $ISSUE_ID --status in_progress
```

---

## Phase 2: Determine Complexity

| Type | Complexity | Path |
|------|------------|------|
| Simple bug/task | Simple | Skip to implement |
| Complex bug | Medium | Explore first |
| Feature | Medium/Complex | Explore + questions |
| Epic | Complex | Explore + architecture |

**Simple indicators:** Single-file fix, config/docs only
**Complex indicators:** "refactor", "redesign", multi-component

---

## Phase 3: Exploration (Features)

```markdown
Task(
  subagent_type="Explore",
  model="haiku",
  prompt="Find files and patterns for: '<issue-title>'
         Return: relevant files, patterns to follow, approach"
)
```

---

## Phase 4: Autonomous vs Interactive

**Interactive:** Use AskUserQuestion for ambiguities

**Autonomous:** Make defaults, document assumptions:
```bash
# If truly blocked
bd comments $ISSUE_ID add "BLOCKED: Need clarification on <topic>"
bd close $ISSUE_ID --reason "needs-clarification"
bd create --title "Clarify: <topic>" --type task --priority 1
```

---

## Skill Matching

| Keywords | Skill |
|----------|-------|
| UI, component | `/shadcn-ui`, `/ui-styling:ui-styling` |
| terminal, xterm | `/xterm-js` |
| MCP, tools | `/mcp-builder:mcp-builder` |
| code review | `/conductor:code-review` |

---

## File Size Guidelines

| Size | Action |
|------|--------|
| < 200 lines | Safe to @ reference |
| 200-500 lines | Only if highly relevant |
| 500+ lines | Use subagents to explore |

---

## Completion

```bash
/conductor:worker-done <issue-id>
```

This runs: build -> test -> review -> commit -> close

**If fails:** Fix the issue, re-run worker-done.

---

## Notes

- `/conductor:worker-done` is idempotent - safe to re-run
- If context > 75%, use `/wipe` to handoff
- Update progress: `bd comments <id> add "Progress: ..."`
- In autonomous mode, document assumptions in commit message

Execute this workflow now.
