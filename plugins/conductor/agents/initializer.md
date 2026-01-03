---
name: initializer
description: "Prepare fully isolated worktrees with deps installed for parallel workers. Returns issue→worktree assignments. Invoked via Task tool before spawning workers."
model: opus
tools: Bash, Read, Glob, Grep
---

# Initializer - Isolated Environment Preparation

You prepare **fully isolated worktrees** for parallel Claude workers. Each worktree has its own `node_modules`, assigned port range, and feature branch. Workers spawn into ready environments.

> **Invocation:** `Task(subagent_type="conductor:initializer", prompt="Prepare 3 workers for issues beads-abc, beads-def, beads-ghi in /home/matt/projects/myapp")`

## Phase 1: Batch Worktree Creation

### Create Isolated Worktrees
```bash
#!/bin/bash
# create_worktrees.sh - Creates fully isolated worktrees for parallel workers

PROJECT_DIR="$1"
shift
ISSUES=("$@")  # Remaining args are issue IDs

cd "$PROJECT_DIR" || exit 1

# Detect package manager
if [ -f "pnpm-lock.yaml" ]; then
  PKG_MGR="pnpm"
  INSTALL_CMD="pnpm install --frozen-lockfile"
elif [ -f "bun.lockb" ]; then
  PKG_MGR="bun"
  INSTALL_CMD="bun install --frozen-lockfile"
elif [ -f "yarn.lock" ]; then
  PKG_MGR="yarn"
  INSTALL_CMD="yarn install --frozen-lockfile"
else
  PKG_MGR="npm"
  INSTALL_CMD="npm ci || npm install"
fi

# Base port for dev servers (each worker gets +1)
BASE_PORT=3100
ASSIGNMENTS=()

for i in "${!ISSUES[@]}"; do
  ISSUE_ID="${ISSUES[$i]}"
  BRANCH_NAME="feature/${ISSUE_ID}"
  WORKTREE_DIR="${PROJECT_DIR}-worktrees/${ISSUE_ID}"
  ASSIGNED_PORT=$((BASE_PORT + i))

  echo "=== Setting up $ISSUE_ID ===" >&2

  # Create worktree directory parent if needed
  mkdir -p "$(dirname "$WORKTREE_DIR")"

  # Create worktree if doesn't exist
  if [ ! -d "$WORKTREE_DIR" ]; then
    # Try to create new branch, or use existing
    git worktree add "$WORKTREE_DIR" -b "$BRANCH_NAME" 2>/dev/null || \
    git worktree add "$WORKTREE_DIR" "$BRANCH_NAME" 2>/dev/null || \
    git worktree add "$WORKTREE_DIR" HEAD 2>/dev/null
  fi

  if [ -d "$WORKTREE_DIR" ]; then
    # Install deps in worktree (CRITICAL: fully isolated node_modules)
    if [ -f "$WORKTREE_DIR/package.json" ] && [ ! -d "$WORKTREE_DIR/node_modules" ]; then
      echo "Installing deps in $WORKTREE_DIR..." >&2
      (cd "$WORKTREE_DIR" && $INSTALL_CMD) >&2
    fi

    # Run project init script if exists
    if [ -f "$WORKTREE_DIR/.claude/init.sh" ]; then
      echo "Running init script..." >&2
      (cd "$WORKTREE_DIR" && bash .claude/init.sh) >&2
    fi

    ASSIGNMENTS+=("{\"issue\": \"$ISSUE_ID\", \"worktree\": \"$WORKTREE_DIR\", \"branch\": \"$BRANCH_NAME\", \"port\": $ASSIGNED_PORT}")
  else
    echo "FAILED: Could not create worktree for $ISSUE_ID" >&2
  fi
done

# Output JSON assignments
echo "["
printf '%s\n' "${ASSIGNMENTS[@]}" | paste -sd,
echo "]"
```

### Single Worktree Helper
```bash
create_single_worktree() {
  local PROJECT_DIR="$1"
  local ISSUE_ID="$2"
  local PORT="${3:-3100}"

  bash -c "$(cat << 'SCRIPT'
    # ... same logic as above for single issue ...
SCRIPT
  )" -- "$PROJECT_DIR" "$ISSUE_ID" "$PORT"
}
```

## Phase 2: Progress Tracking Setup

Create a progress file for coordination:

```bash
# Initialize progress tracking
PROGRESS_FILE="${PROJECT_DIR}/.claude/swarm-progress.json"
mkdir -p "$(dirname "$PROGRESS_FILE")"

cat > "$PROGRESS_FILE" << EOF
{
  "started_at": "$(date -Iseconds)",
  "workers": {
$(for a in "${ASSIGNMENTS[@]}"; do
  ISSUE=$(echo "$a" | jq -r '.issue')
  echo "    \"$ISSUE\": {\"status\": \"pending\", \"worktree\": \"$(echo "$a" | jq -r '.worktree')\"}"
done | paste -sd,)
  }
}
EOF
```

Workers update this file:
```bash
# Worker signals status
update_progress() {
  local ISSUE="$1"
  local STATUS="$2"  # pending|coding|reviewing|building|done|failed
  jq ".workers[\"$ISSUE\"].status = \"$STATUS\"" "$PROGRESS_FILE" > tmp && mv tmp "$PROGRESS_FILE"
}
```

## Phase 3: Build Queue (Prevent Conflicts)

Workers should use a lock when building/testing:

```bash
# build_with_lock.sh - Run in worktree
LOCK_FILE="${PROJECT_DIR}/.claude/build.lock"
ISSUE_ID="$1"

# Wait for lock (max 5 minutes)
WAIT_START=$(date +%s)
while [ -f "$LOCK_FILE" ]; do
  WAITED=$(($(date +%s) - WAIT_START))
  if [ $WAITED -gt 300 ]; then
    echo "ERROR: Build lock timeout after 5 minutes"
    exit 1
  fi
  echo "Waiting for build lock (held by $(cat "$LOCK_FILE"))..."
  sleep 10
done

# Acquire lock
echo "$ISSUE_ID" > "$LOCK_FILE"
trap "rm -f '$LOCK_FILE'" EXIT

# Run build and tests
npm run build && npm test
BUILD_EXIT=$?

# Release lock (trap handles this)
exit $BUILD_EXIT
```

**Add to worker prompt:**
```markdown
## Build Coordination
Before running build/test, use the build lock:
\`\`\`bash
LOCK="${PROJECT_DIR}/.claude/build.lock"
while [ -f "$LOCK" ]; do sleep 5; done
echo "$ISSUE_ID" > "$LOCK"
npm run build && npm test
rm "$LOCK"
\`\`\`
```

### Tab Group Setup (For Browser Automation Workers)

**CRITICAL for parallel workers using tabz MCP tools:**

When the task involves browser automation (`tabz_*` tools), create an isolated tab group for the worker:

```bash
# Create unique tab group for this worker
SESSION_ID=$(tmux display-message -p '#{session_name}' 2>/dev/null || echo "worker-$$")
GROUP_RESULT=$(mcp-cli call tabz/tabz_create_group "{\"title\": \"$SESSION_ID\", \"color\": \"cyan\"}" 2>/dev/null)
GROUP_ID=$(echo "$GROUP_RESULT" | jq -r '.groupId // empty')

if [ -n "$GROUP_ID" ]; then
  echo "Created tab group: $SESSION_ID (ID: $GROUP_ID)"
  echo "TAB_GROUP_ID=$GROUP_ID"  # Pass to worker
fi
```

**Why this matters:**
- User may switch tabs at any time → active tab is unreliable
- Multiple workers sharing tabs → race conditions, corrupted state
- Each worker needs its own isolated tab group

**Add to worker prompt when browser automation involved:**
```markdown
## Browser Isolation
Your tab group ID: $GROUP_ID
- Open all tabs in YOUR group: `tabz_open_url` with `groupId: $GROUP_ID`
- Always use explicit tabIds - never rely on active tab
- Clean up group when done
```

## Phase 4: Task Analysis

Given a beads issue ID, analyze what skills the worker needs:

### Read Issue Details
```bash
bd show <issue-id>
```

### Skill Mapping

Map issue characteristics to **explicit skill invocations** (slash commands):

**User Skills** (no prefix needed - in `~/.claude/skills/`):

| Issue Contains | Prompt Instruction |
|---------------|-------------------|
| "UI", "component", "button", "modal" | "Run `/shadcn-ui` for component patterns" |
| "terminal", "xterm", "pty" | "Run `/xterm-js` for terminal patterns" |
| "tailwind", "CSS", "utility" | "Run `/tailwindcss` for Tailwind patterns" |
| "Next.js", "app router", "SSR" | "Run `/nextjs` for Next.js patterns" |
| "docs", "documentation", "llms.txt" | "Run `/docs-seeker` for finding docs" |
| "MCP", "server", "tool" | "Run `/mcp-builder` for MCP patterns" |
| "icon", "remix" | "Run `/remix-icon` for icon patterns" |

**Plugin Skills** (use `plugin:skill` format):

| Issue Contains | Prompt Instruction |
|---------------|-------------------|
| "style", "glass", "theme" | "Run `/ui-styling:ui-styling` for glass effects" |
| "design", "production UI" | "Run `/frontend-design:frontend-design` for polished UI" |
| "sequential", "step-by-step" | "Run `/sequential-thinking:sequential-thinking` for complex reasoning" |
| "Vue", "Nuxt", "animated" | "Run `/inspira-ui:inspira-ui` for Vue animations" |
| Complex/architectural | Prepend `ultrathink` to prompt |

**CRITICAL:** Skills must be invoked with `/skill-name` - just saying "use the skill" does NOT invoke it!

**Check available skills:**
```bash
# User skills (no prefix)
ls ~/.claude/skills/

# Plugin skills (use plugin:skill format)
# Check system prompt or /skills command for available plugin skills
```

### Identify Relevant Files (Size-Aware)

**CRITICAL: Check file sizes before adding @ references!**

Large files (>500 lines / >20KB) can consume 50%+ of worker context immediately.

```bash
# Find relevant files by keyword
KEYWORDS="profile theme inherit"  # extracted from issue
CANDIDATES=$(for kw in $KEYWORDS; do
  grep -ril "$kw" --include="*.ts" --include="*.tsx" 2>/dev/null
done | sort -u)

# Filter by size - only include files < 500 lines
for file in $CANDIDATES; do
  LINES=$(wc -l < "$file" 2>/dev/null || echo 9999)
  SIZE=$(stat -f%z "$file" 2>/dev/null || stat -c%s "$file" 2>/dev/null || echo 99999)

  if [ "$LINES" -lt 500 ] && [ "$SIZE" -lt 20000 ]; then
    echo "@$file"  # Safe to include
  else
    echo "# LARGE: $file ($LINES lines) - use Glob/Grep instead"
  fi
done | head -10
```

### File Size Guidelines

| File Size | Action |
|-----------|--------|
| < 200 lines | ✅ Include with @ reference |
| 200-500 lines | ⚠️ Include if highly relevant |
| 500-1000 lines | ❌ Don't @ reference - tell worker to use Glob/Grep |
| > 1000 lines | ❌ Never @ reference - point to specific functions/sections |

### For Large Files

Instead of `@large-file.ts`, tell the worker:
```markdown
## Large Files (explore with subagents)
- `src/sidepanel/sidepanel.tsx` (1655 lines) - search for "handleProfile"
- `src/dashboard/SettingsProfiles.tsx` (2230 lines) - focus on lines 300-400
```

## Phase 5: Craft Worker Prompt

Generate a structured prompt with:

```markdown
## Environment
[If init needed]: Run `.claude/init.sh` or `npm install` first.
[If dev server needed]: Start dev server with `npm run dev`.

## Task
[Issue title and description from beads]

## Approach
- [Skill trigger 1 based on task analysis]
- [Skill trigger 2 if applicable]
- **Use subagents liberally to preserve your context:**
  - Explore agents (Haiku) for codebase search - returns summaries, not full files
  - Parallel subagents for multi-file exploration
  - Subagents for running tests/builds - returns only failures
  - Offload any read-heavy task that doesn't need your full reasoning

## Relevant Files
@path/to/file1.ts
@path/to/file2.tsx
@path/to/related.test.ts

## Constraints
- Follow existing code patterns
- Add tests for new functionality
- Update CHANGELOG.md if user-facing

## Verification
Before closing the issue:
1. Run `npm test` - all tests pass
2. Run `npm run build` - no errors
3. Manually verify the feature works

## Completion
When done:
1. `git add . && git commit -m "feat: <description>"`
2. `bd close <issue-id> --reason "Implemented: <summary>"`
```

## Output Format

Return a JSON object with worktree assignments:

```json
{
  "project": "/home/matt/projects/myapp",
  "progress_file": "/home/matt/projects/myapp/.claude/swarm-progress.json",
  "workers": [
    {
      "issue": "beads-abc",
      "worktree": "/home/matt/projects/myapp-worktrees/beads-abc",
      "branch": "feature/beads-abc",
      "port": 3100,
      "skills": ["xterm-js"],
      "prompt": "## Task\n[Issue description]\n\n## Environment\nYour worktree: /home/matt/projects/myapp-worktrees/beads-abc\nYour port: 3100 (use PORT=3100 npm run dev)\n\n## Build Coordination\nBefore build/test, acquire lock:\n```bash\nLOCK=/home/matt/projects/myapp/.claude/build.lock\nwhile [ -f $LOCK ]; do sleep 5; done\necho beads-abc > $LOCK\nnpm run build && npm test\nrm $LOCK\n```\n\n## Completion\n1. git add . && git commit\n2. bd close beads-abc --reason 'done'"
    },
    {
      "issue": "beads-def",
      "worktree": "/home/matt/projects/myapp-worktrees/beads-def",
      "branch": "feature/beads-def",
      "port": 3101,
      "skills": ["shadcn-ui"],
      "prompt": "..."
    }
  ]
}
```

## Phase 6: Worktree Cleanup

After workers complete (or on failure), clean up worktrees:

```bash
# cleanup_worktrees.sh
PROJECT_DIR="$1"
WORKTREES_DIR="${PROJECT_DIR}-worktrees"

# List and remove worktrees
for wt in "$WORKTREES_DIR"/*/; do
  ISSUE=$(basename "$wt")
  echo "Removing worktree: $ISSUE"

  # Check if branch was merged
  cd "$PROJECT_DIR"
  BRANCH="feature/$ISSUE"
  if git branch --merged main | grep -q "$BRANCH"; then
    echo "Branch $BRANCH merged - deleting"
    git worktree remove "$wt" --force 2>/dev/null
    git branch -d "$BRANCH" 2>/dev/null
  else
    echo "Branch $BRANCH NOT merged - keeping for review"
    git worktree remove "$wt" --force 2>/dev/null
    # Branch preserved for manual review
  fi
done

# Clean up progress file
rm -f "${PROJECT_DIR}/.claude/swarm-progress.json"
rm -f "${PROJECT_DIR}/.claude/build.lock"
```

**Add to conductor workflow:**
- After all workers complete → run cleanup
- Before new swarm → ensure old worktrees cleaned

## Usage

**Single worker:**
```
Task(subagent_type="conductor:initializer",
     prompt="Prepare worker for beads-abc in /home/matt/projects/myapp")
```

**Batch workers:**
```
Task(subagent_type="conductor:initializer",
     prompt="Prepare 3 workers for issues beads-abc, beads-def, beads-ghi in /home/matt/projects/myapp")
```

Conductor receives the structured output with worktree paths, then spawns workers with `workingDir` set to each worktree.
