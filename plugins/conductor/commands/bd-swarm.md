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

### 2. Select Worker Count & Worktree Mode
Ask user:
- How many workers? (2, 3, 4, 5)
- Use worktrees for isolation? (Yes if workers might edit shared files, No for independent files)

### 3. For Each Issue, Invoke Initializer

**IMPORTANT:** Use the initializer subagent to prepare environment and craft prompts:

```
Task tool:
  subagent_type: "conductor:initializer"
  prompt: "Prepare worker for <issue-id> in <project-dir>.
           Create worktree: <yes/no>.
           Return: environment setup, skill invocations, relevant files, crafted prompt."
```

The initializer will:
- Check/run init scripts
- Create worktree if requested (feature branch per issue)
- Map issue keywords to **explicit skill invocations** (e.g., `/shadcn-ui`, `/ui-styling:ui-styling`)
- Find relevant files (size-aware - excludes large files)
- Craft the worker prompt

### 4. Skill Invocation Format

**CRITICAL:** Skills must be invoked explicitly with slash commands!

**User skills** (no prefix):
- `/shadcn-ui`, `/xterm-js`, `/tailwindcss`, `/nextjs`, `/docs-seeker`

**Plugin skills** (plugin:skill format):
- `/ui-styling:ui-styling`, `/frontend-design:frontend-design`, `/sequential-thinking:sequential-thinking`

**Wrong:** "use the shadcn-ui skill" (does nothing)
**Right:** "Run `/shadcn-ui` for component patterns"

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

Use the prompt from initializer, or craft manually with explicit skill invocations:

```bash
SESSION="ctt-claude-<issue-id>-xxxxx"
sleep 4

tmux send-keys -t "$SESSION" -l '## Task
<issue-id>: <title>

<description from bd show>

## Skills to Invoke
Run these commands first to load relevant patterns:
- `/shadcn-ui` - for UI component patterns
- `/ui-styling:ui-styling` - for glass effects and styling

## Approach
- **Use subagents liberally to preserve your context:**
  - Explore agents (Haiku) for codebase search
  - Parallel subagents for multi-file exploration
  - Subagents for tests/builds (returns only failures)

## Relevant Files
@path/to/file1.ts (only files < 500 lines)
@path/to/file2.tsx

## Large Files (use subagents to explore)
- src/large-file.ts (1200 lines) - search for "functionName"

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
