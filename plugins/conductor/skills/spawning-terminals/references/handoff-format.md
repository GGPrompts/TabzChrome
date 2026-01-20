# Handoff Note Format

Structured notes for worker-to-conductor communication. Workers write handoff notes before closing issues to provide context for conductors and gates.

## When to Write Handoffs

**Always** add a handoff before closing an issue:

```bash
bd update ISSUE --notes "$(cat <<'NOTES'
## Handoff

**Status**: done
**Summary**: Implemented feature X with tests

### Changes
- file.ts: Added validation logic
NOTES
)"

bd close ISSUE --reason "Done: Implemented feature X"
```

## Handoff Format

```markdown
## Handoff

**Status**: done | blocked | needs_review
**Summary**: Brief description of what was done

### Changes
- file1.ts: Added validation
- file2.ts: Fixed null check
- styles.css: Updated layout

### Discovered Work
- Created follow-up: bd-xyz (edge case handling)
- Created follow-up: bd-abc (related refactor)

### Concerns
- Auth flow might need review before merge
- Performance not tested with large datasets

### Retro
- What was unclear: Initial requirements for edge cases
- Missing context: Didn't know about existing validation util
- What would help: More test cases in the prompt
```

## Field Reference

| Field | Required | Description |
|-------|----------|-------------|
| **Status** | Yes | `done`, `blocked`, or `needs_review` |
| **Summary** | Yes | One-line description of work completed |
| **Changes** | Yes | List of files modified with what changed |
| **Discovered Work** | No | Issues created during work |
| **Concerns** | No | Issues for reviewer/conductor attention |
| **Retro** | Recommended | Learnings for future similar work |

## Status Values

| Status | Meaning | Conductor Action |
|--------|---------|------------------|
| `done` | Work complete, tests pass | Proceed to merge review |
| `blocked` | Cannot continue, needs help | Investigate and reassign |
| `needs_review` | Complete but uncertain | Thorough review before merge |

## Examples

### Simple Bug Fix

```markdown
## Handoff

**Status**: done
**Summary**: Fixed null check in user profile loader

### Changes
- src/profile.ts: Added null guard on line 45

### Retro
- Straightforward fix, no issues
```

### Feature Implementation

```markdown
## Handoff

**Status**: done
**Summary**: Added dark mode toggle with persistence

### Changes
- src/settings.tsx: Added toggle component
- src/theme.ts: Theme context with localStorage sync
- src/styles/dark.css: Dark mode variables

### Discovered Work
- Created: bd-xyz (system preference detection)

### Concerns
- Needs visual QA on all pages

### Retro
- What was unclear: Where to store preference (chose localStorage)
- What would help: Link to design mockups
```

### Blocked Work

```markdown
## Handoff

**Status**: blocked
**Summary**: Cannot complete - API endpoint returns 500

### Changes
- src/api.ts: Started integration (incomplete)

### Concerns
- Backend API /api/users returns 500 error
- Blocking issue needs backend team

### Retro
- Missing context: API docs were outdated
```

## Machine-Readable Alternative

For automated parsing, use JSON in a code block:

```bash
bd update ISSUE --notes '```json
{
  "handoff": {
    "status": "done",
    "summary": "Implemented dark mode",
    "changes": [
      {"file": "ui.tsx", "what": "Toggle component"},
      {"file": "theme.ts", "what": "Context provider"}
    ],
    "discovered": ["bd-xyz"],
    "concerns": ["needs visual QA"],
    "retro": {
      "unclear": null,
      "missing": null,
      "would_help": "design mockups"
    }
  }
}
```'
```

## Parsing Handoffs

### Simple Text Extraction

```bash
# Get notes field
bd show ISSUE --json | jq -r '.[0].notes'

# Check status
bd show ISSUE --json | jq -r '.[0].notes' | grep -oP '(?<=\*\*Status\*\*: )\w+'
```

### JSON Format Extraction

```bash
# Extract JSON handoff if present
bd show ISSUE --json | jq -r '.[0].notes' | sed -n '/```json/,/```/p' | sed '1d;$d' | jq '.handoff'
```

## Integration with Gates

1. Worker completes work and writes handoff notes
2. Worker runs `bd close ISSUE --reason "summary"`
3. Conductor reads notes to understand context
4. Conductor routes to appropriate gate:
   - `status: done` + no concerns -> fast merge
   - `status: done` + concerns -> thorough review
   - `status: needs_review` -> careful review
   - `status: blocked` -> investigate and reassign
5. Gate checkpoints can read notes for context

## Tips

- **Be concise** - A few lines per section is enough
- **Always include Changes** - Helps reviewers know where to look
- **Note discovered work** - Creates audit trail for new issues
- **Honest retro** - Helps improve future prompts and workflows
- **Use blocked status** - Don't close blocked work as done
