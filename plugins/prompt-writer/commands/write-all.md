---
name: gg-write-all
description: "Batch process all backlog issues - craft prompts and mark ready in parallel"
---

# Write All - Batch Prompt Processing

Process all backlog issues in parallel, crafting worker-ready prompts for each.

## Steps

Add these to your to-dos:

1. **Get backlog issues** - Find all open issues without 'ready' label
2. **Process in parallel** - Use Task tool with Haiku for each issue
3. **Output summary** - Report which issues were prepared

---

## Step 1: Get Backlog Issues

Find issues that need prompts prepared:

```python
# Get all open issues
issues = mcp__beads__list(status="open")

# Filter to those without 'ready' label
backlog = [i for i in issues if 'ready' not in (i.get('labels') or [])]
```

**CLI alternative:**
```bash
bd list --status open --json | jq '[.[] | select(.labels | index("ready") | not)]'
```

## Step 2: Process in Parallel

For each backlog issue, spawn a Haiku task to craft the prompt:

```python
# Process all issues in parallel using Task tool
for issue in backlog:
    Task(
        subagent_type="general-purpose",
        model="haiku",
        prompt=f"/prompt-writer:write {issue['id']}",
        description=f"Prepare {issue['id']}"
    )
```

Each task will:
- Read issue details
- Discover relevant skills
- Explore key files (3-5 only)
- Craft a focused prompt
- Store in issue notes
- Mark as ready

**Why Haiku?** Fast and cheap - processing multiple issues in parallel saves time without burning through budget.

## Step 3: Output Summary

After all tasks complete, summarize results:

```markdown
## Batch Processing Complete

| Issue | Title | Status |
|-------|-------|--------|
| bd-xxx | Fix login bug | Ready |
| bd-yyy | Add dark mode | Ready |
| bd-zzz | Update docs | Ready |

**Prepared:** 3 issues
**Errors:** 0

Run `bd ready` to see all ready issues.
```

---

## Quick Reference

```bash
# Get backlog count
bd list --status open --json | jq '[.[] | select(.labels | index("ready") | not)] | length'

# After processing, verify
bd ready --json | jq 'length'
```

## Notes

- Issues already marked 'ready' are skipped
- Closed or in_progress issues are skipped
- Each parallel task runs independently
- If a task fails, others continue
- Use `bd show ISSUE-ID` to check individual results
