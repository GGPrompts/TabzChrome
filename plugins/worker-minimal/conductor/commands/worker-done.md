---
description: "Orchestrate full task completion: build, test, review, commit, close. Composes atomic commands."
---

# Worker Done (Command Alias)

This is a command alias for the `/conductor:worker-done` skill.

## Usage

```
/conductor:worker-done <issue-id>
```

## See

Full documentation in skill: `plugins/conductor/skills/worker-done/SKILL.md`

## Quick Reference

Runs these commands in sequence:
1. `/conductor:verify-build` - Build verification
2. `/conductor:run-tests` - Test verification
3. `/conductor:code-review` - Code review (Opus)
4. `/conductor:commit-changes` - Commit with conventional format
5. `/conductor:create-followups` - Create follow-up issues
6. `/conductor:update-docs` - Update documentation
7. `/conductor:close-issue` - Close beads issue

## Atomic Commands

Each step can be run standalone - see individual command files in this directory.
