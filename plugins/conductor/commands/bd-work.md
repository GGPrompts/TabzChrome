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

Map the issue to relevant skill triggers:

| If issue mentions... | Include in prompt... |
|---------------------|---------------------|
| UI, component, button, modal | "use the shadcn-ui skill" |
| terminal, xterm, pty | "use the xterm-js skill" |
| keyboard, navigation | "use the accessibility skill" |
| test, spec | "use the testing skill" |
| debug, error, fix, bug | "use the debugging skill" |
| API, endpoint | "use the api-design skill" |
| style, CSS, theme | "use the ui-styling skill" |
| Complex architecture | Prepend "ultrathink" |

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

## Approach
- <skill trigger based on task type>
- **Use subagents liberally to preserve your context:**
  - Explore agents (Haiku) for codebase search - they return summaries, not full files
  - Parallel subagents for multi-file exploration
  - Subagents for running tests and builds (returns only failures)
- Follow existing patterns in the codebase

## Relevant Files
@path/to/file1.ts
@path/to/file2.tsx

## Constraints
- Follow existing code patterns
- Add tests for new functionality
- Update CHANGELOG.md if user-facing change

## Verification (Required Before Closing)
1. `npm test` - all tests pass
2. `npm run build` - builds without errors
3. Manually verify the feature works

## Completion
When verified and done:
1. Commit: `git add . && git commit -m "feat(<scope>): <description>"`
2. Close: `bd close <issue-id> --reason "Implemented: <summary>"`
```

### 9. Begin Work

Start working on the issue with the prepared context.

### 10. On Completion

```bash
# Verify first
npm test
npm run build

# Then close
bd close <issue-id> --reason "Completed: <brief summary>"

# Sync
bd sync && git push
```

## Notes

- Always run verification before closing
- Commit with issue ID in message for traceability
- If context gets high (>75%), use `/wipe` to handoff to fresh session
- Update beads with progress: `bd comments <id> add "Progress: ..."`

Execute this workflow now.
