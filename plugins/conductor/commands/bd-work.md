---
description: "Pick the top ready beads issue, prepare environment, and start working with skill-aware prompting"
---

# Beads Work - Start on Top Ready Issue

Pick the highest priority ready issue, prepare the environment, and begin working with optimized skill-aware prompting.

## Workflow

### 1. Get Ready Issues
```bash
bd ready --json | jq -r '.[] | "\(.id): [\(.priority)] [\(.type)] \(.title)"' | head -5
```

### 2. Select Issue
- If user provided an issue ID as argument, use that
- Otherwise, pick the top priority (lowest P number)

### 3. Get Issue Details
```bash
bd show <issue-id>
```

### 4. Claim the Issue
```bash
bd update <issue-id> --status in_progress
```

### 5. Prepare Environment (Initializer Pattern)

**Check for init script:**
```bash
if [ -f ".claude/init.sh" ]; then
  echo "Found .claude/init.sh - running..."
  bash .claude/init.sh
fi
```

**Check dependencies:**
```bash
if [ -f "package.json" ] && [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi
```

### 6. Analyze Task for Skills

Map the issue to relevant skill triggers. **Use slash commands, not prose!**

| If issue mentions... | Add to prompt |
|---------------------|---------------|
| UI, component, button, modal | `Run /shadcn-ui for component patterns` |
| terminal, xterm, pty | `Run /xterm-js for terminal patterns` |
| style, CSS, theme, tailwind | `Run /ui-styling:ui-styling for styling` |
| API, endpoint, backend | `Run /docs-seeker for API docs` |
| Complex architecture | Prepend `ultrathink` to task |

**Wrong:** "use the shadcn-ui skill" (does nothing)
**Right:** "Run `/shadcn-ui` for component patterns"

### 7. Find Relevant Files (Size-Aware)

**CRITICAL: Don't @ reference large files - they consume too much context!**

```bash
# Find files by keyword, filter by size
for file in $(grep -ril "keyword" --include="*.ts" --include="*.tsx" src/ 2>/dev/null); do
  LINES=$(wc -l < "$file" 2>/dev/null || echo 9999)
  if [ "$LINES" -lt 500 ]; then
    echo "@$file"
  else
    echo "# LARGE ($LINES lines): $file - explore with subagents"
  fi
done | head -10
```

**Size Guidelines:**
- < 200 lines: ✅ Safe to @ reference
- 200-500 lines: ⚠️ Only if highly relevant
- 500+ lines: ❌ Don't @ reference - tell worker to explore specific sections

### 8. Craft Skill-Aware Prompt

Build a structured prompt:

```markdown
## Task
<issue-id>: <title>

<full description from bd show>

## Skills to Invoke
Run these commands first to load relevant patterns:
- `/shadcn-ui` - for UI component patterns
- `/ui-styling:ui-styling` - for styling patterns

## Approach
- **Use subagents liberally to preserve your context:**
  - Explore agents (Haiku) for codebase search - they return summaries, not full files
  - Parallel subagents for multi-file exploration
  - Subagents for running tests and builds (returns only failures)
- Follow existing patterns in the codebase

## Relevant Files
@path/to/file1.ts
@path/to/file2.tsx

## Large Files (use subagents to explore)
- src/large-file.ts (1200 lines) - search for "functionName"

## Constraints
- Follow existing code patterns
- Add tests for new functionality

## Completion
When you have finished implementing, run:
```
/worker-done <issue-id>
```

This runs the full completion pipeline:
1. Build verification (npm run build)
2. Test verification (npm test)
3. Code review (spawns code-reviewer subagent)
4. Commit with proper format
5. Close beads issue

If any step fails, fix the issue and run `/worker-done` again.
```

### 9. Begin Work

Start working on the issue with the prepared context.

### 10. On Completion

Run `/worker-done <issue-id>` which handles:
- Build verification
- Test verification
- Code review (spawns subagent)
- Commit with proper format
- Close beads issue

## Notes

- `/worker-done` is idempotent - safe to re-run after fixing issues
- If context gets high (>75%), use `/wipe` to handoff to fresh session
- Update beads with progress: `bd comments <id> add "Progress: ..."`

Execute this workflow now.
