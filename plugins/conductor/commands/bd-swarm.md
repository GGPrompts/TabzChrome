---
description: "Spawn multiple Claude workers with skill-aware prompts to tackle beads issues in parallel"
---

# Beads Swarm - Parallel Issue Processing

Spawn multiple Claude Code workers to tackle beads issues in parallel, with skill-aware prompting and environment preparation.

## Workflow

### 1. Get Ready Issues
```bash
bd ready --json | jq -r '.[] | "\(.id): [\(.priority)] [\(.type)] \(.title)"' | head -5
```

### 2. Select Worker Count
Ask user how many workers (default: 3, max: 5):
- Use AskUserQuestion with options: 2, 3, 4, 5

### 3. Check Environment (Once)
```bash
# Run init if exists
if [ -f ".claude/init.sh" ]; then
  bash .claude/init.sh
fi

# Install deps if needed
if [ -f "package.json" ] && [ ! -d "node_modules" ]; then
  npm install
fi
```

### 4. For Each Issue, Prepare Skill-Aware Prompt

**Skill Mapping:**

| Issue Type/Keywords | Skill Triggers |
|--------------------|----------------|
| bug, fix, error | "use the debugging skill" |
| feature + UI | "use the shadcn-ui skill", "use the ui-styling skill" |
| feature + terminal | "use the xterm-js skill" |
| feature + API | "use the api-design skill" |
| feature + keyboard/a11y | "use the accessibility skill" |
| task + docs | "use the documentation skill" |
| epic | Prepend "ultrathink" |

**Find Relevant Files:**
```bash
# Based on issue title keywords
grep -ril "keyword" --include="*.ts" --include="*.tsx" src/ | head -5
```

### 5. Spawn Workers

```bash
TOKEN=$(cat /tmp/tabz-auth-token)

# Claim issue first
bd update <issue-id> --status in_progress

# Spawn worker
curl -s -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{"name": "Claude: <issue-id>", "workingDir": "<project-dir>", "command": "claude --dangerously-skip-permissions"}'
```

### 6. Send Skill-Aware Prompts

```bash
SESSION="ctt-claude-<issue-id>-xxxxx"
sleep 4

tmux send-keys -t "$SESSION" -l '## Task
<issue-id>: <title>

<description from bd show>

## Approach
- <skill trigger 1>
- <skill trigger 2 if applicable>
- **Use subagents liberally to preserve your context:**
  - Explore agents (Haiku) for codebase search
  - Parallel subagents for multi-file exploration
  - Subagents for tests/builds (returns only failures)

## Relevant Files
@path/to/file1.ts
@path/to/file2.tsx

## Constraints
- Follow existing code patterns
- Add tests for new functionality

## Verification (Required Before Closing)
1. `npm test` - all tests pass
2. `npm run build` - builds without errors

## Completion
When verified:
1. `git add . && git commit -m "feat(<scope>): <description>"`
2. `bd close <issue-id> --reason "Implemented: <summary>"`'
sleep 0.3
tmux send-keys -t "$SESSION" C-m
```

### 7. Report Spawned Workers

```
🚀 Spawned 3 skill-optimized workers:

| Worker | Issue | Skills |
|--------|-------|--------|
| ctt-claude-79t-xxx | Profile theme inheritance | ui-styling, shadcn-ui |
| ctt-claude-6z1-xxx | Invalid dir notification | debugging |
| ctt-claude-swu-xxx | Keyboard navigation | xterm-js, accessibility |

📋 Monitor: `tmux ls | grep "^ctt-"`
📊 Status: Invoke conductor:watcher
```

### 8. Start Watcher (Optional)

Invoke the watcher to monitor progress:
```
Task tool:
  subagent_type: "conductor:watcher"
  prompt: "Check status of all Claude workers and notify if any complete or need attention"
```

## Worker Expectations

Each worker will:
1. Read the issue with `bd show <id>`
2. Explore relevant files with subagents
3. Implement the feature/fix
4. Run verification (`npm test`, `npm run build`)
5. Commit with issue ID in message
6. Close issue with `bd close <id> --reason "..."`

## Notes

- Workers operate independently (no cross-dependencies)
- Each gets skill-optimized prompts based on task type
- Environment prepared once before spawning
- Watcher monitors for completion/issues
- Clean up when done: `curl -X DELETE http://localhost:8129/api/agents/<id>`

Execute this workflow now.
