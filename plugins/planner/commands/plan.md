---
name: gg-plan
description: "Break down a feature or epic into concrete backlog issues with dependencies"
argument-hint: "FEATURE_DESCRIPTION or --epic EPIC-ID"
---

# Plan Feature

Break down a feature description or epic into concrete, parallelizable backlog issues.

## Steps

Add these to your to-dos:

1. **Understand the scope** - Read epic or analyze feature description
2. **Explore the codebase** - Find relevant files and patterns
3. **Break down into tasks** - Use `/planner:breakdown` skill (Sonnet)
4. **Create issues with dependencies** - Wire up the backlog
5. **Output sprint plan** - Present organized waves

---

## Step 1: Understand the Scope

If given an epic ID:
```python
mcp__beads__show(issue_id="EPIC-ID")
```

If given a description, analyze:
- What's the end goal?
- What areas of the codebase are affected?
- Are there dependencies on external systems?

## Step 2: Explore the Codebase

Use an Explore agent to understand context:

```python
Task(
  subagent_type="Explore",
  prompt="Find the main components and patterns for: [feature area]. Identify key files, existing patterns, and potential file conflicts."
)
```

## Step 3: Break Down Into Tasks

Use the `/planner:breakdown` skill which runs with Sonnet for strategic decomposition.

The skill will:
- Apply decomposition patterns (feature, refactor, or bug fix)
- Identify task sizing (target S-M tasks)
- Detect file overlaps that need sequencing
- Suggest wave organization

## Step 4: Create Issues with Dependencies

Create concrete, actionable tasks:

```python
# Create subtasks
mcp__beads__create(
  title="Add theme context provider",
  issue_type="task",
  priority=1,
  description="Create React context for theme state management"
)

# Wire dependencies (BLOCKED depends on BLOCKER)
mcp__beads__dep(issue_id="BLOCKED-ID", depends_on_id="BLOCKER-ID")
```

**Good tasks:**
- "Add theme context provider to React app"
- "Update Header component for dark mode support"

**Bad tasks:**
- "Implement dark mode" (too vague)
- "Fix everything" (not actionable)

## Step 5: Output Sprint Plan

Present the organized breakdown:

```markdown
## Feature: [Name]

### Wave 1 (Ready Now)
| Issue | Priority | Description |
|-------|----------|-------------|
| ID-1 | P1 | First task (no blockers) |

### Wave 2 (After Wave 1)
| Issue | Blocked By | Description |
|-------|------------|-------------|
| ID-2 | ID-1 | Depends on infrastructure |
| ID-3 | ID-1 | Can run parallel with ID-2 |

### File Overlap Notes
- ID-2 and ID-4 both touch styles.css - sequenced via dependency
```

---

## Decomposition Patterns

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

## Task Sizing Guidelines

| Size | Guideline |
|------|-----------|
| Too small | "Add import statement" - combine with related work |
| Right size | "Add theme context with toggle hook" - 1-2 files, clear scope |
| Too large | "Implement full feature" - break into subtasks |

## Notes

- Create backlog status issues - prompt-writer will prepare them
- Set realistic priorities (don't make everything P1)
- Identify file conflicts early - saves merge headaches
- Keep tasks independent where possible for parallelization
