---
name: gg-plan
description: "Plan work: brainstorm ideas, break down features, or groom existing backlog"
argument-hint: "[FEATURE_DESCRIPTION] [--epic EPIC-ID]"
---

# Plan - Unified Planning Command

Smart routing based on your situation.

## Step 0: Load Beads Context (REQUIRED)

**Invoke `/conductor:brainstorming` first** to load critical beads knowledge:

- Dependency patterns (fan-out, fan-in, diamond) → `references/dependencies.md`
- Epic structures (when and how) → `references/epics.md`
- Molecules (reusable workflow templates) → `references/molecules.md`
- Gates, agents, defer → `references/advanced.md`
- Full command reference (MCP + CLI) → `references/commands.md`

This ensures you have full beads context regardless of which route you take.

## Step 1: Assess Current State

Check the backlog:

```python
stats = mcp__beads__stats()
ready = mcp__beads__ready()
backlog = mcp__beads__list(status="backlog")
```

Then route based on what you find:

---

## Route A: Brainstorm Mode
**When:** No arguments given AND (empty backlog OR user says "help me think", "not sure what to build", "brainstorm")

The brainstorming context is already loaded from Step 0. Now be a thinking partner:

1. **Listen** - understand the user's rough idea
2. **Ask clarifying questions** - goal, constraints, scope
3. **Suggest structure** - "This sounds like an epic with 3 subtasks..."
4. **Reveal features progressively** - don't dump the full API
5. **Use Explore agents** - search codebase when context helps

When concrete tasks are identified, create them in beads, then continue to Route C.

---

## Route B: Decomposition Mode
**When:** User provides a feature description OR --epic ID

Break down the feature into concrete tasks:

1. **Understand scope** - Read epic or analyze description
2. **Explore codebase** - Find relevant files and patterns
3. **Decompose** - Use `/planner:breakdown` skill (Sonnet) for strategic breakdown
4. **Create issues** - With dependencies wired

```python
# Create tasks
mcp__beads__create(title="Add theme context", priority=2)
mcp__beads__create(title="Update components", priority=2)

# Wire dependencies
mcp__beads__dep(issue_id="COMPONENTS-ID", depends_on_id="CONTEXT-ID")
```

When tasks are created, continue to Route C.

---

## Route C: Backlog Grooming Mode
**When:** Backlog has tasks that need organizing (no prompts, no gates, priorities unclear)

Run `/conductor:plan-backlog` to:
- Prioritize and wire dependencies
- Assign quality gates (codex-review, test-runner, etc.)
- Write worker prompts via `/prompt-writer:write`
- Output sprint waves

```
After creating tasks, ask:
"Tasks created. Ready to groom the backlog for worker prompts and gates?"

If yes → run /conductor:plan-backlog
```

---

## Quick Reference

| User says | Route |
|-----------|-------|
| `/plan` (no args, empty backlog) | A: Brainstorm |
| `/plan` (no args, has backlog) | C: Groom backlog |
| `/plan dark mode feature` | B: Decompose → C: Groom |
| `/plan --epic bd-xxx` | B: Decompose → C: Groom |
| "help me think", "not sure" | A: Brainstorm |
| "I have tasks, now what?" | C: Groom backlog |

---

## Decomposition Patterns (Route B)

### New Feature
1. Core infrastructure (contexts, state, types)
2. Main implementation (components, logic)
3. Edge cases and polish
4. Tests and documentation

### Refactor
1. Create new pattern alongside old
2. Migrate components one by one
3. Remove old pattern
4. Update tests

### Bug Fix
1. Investigate root cause (if complex)
2. Implement fix
3. Add regression test

## Task Sizing

| Size | Guideline |
|------|-----------|
| Too small | "Add import" - combine with related work |
| Right size | "Add theme context with toggle" - 1-2 files, clear scope |
| Too large | "Implement feature" - break into subtasks |

---

## End State

Planning is done when:
- [ ] Tasks exist in beads with clear titles
- [ ] Dependencies wired (blocking relationships)
- [ ] Priorities set (0-4)
- [ ] Quality gates assigned (gate:* labels)
- [ ] Worker prompts written (in issue notes)
- [ ] Sprint waves presented

Then ready to spawn workers on Wave 1.
