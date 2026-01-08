---
description: "Pick the top ready beads issue and spawn a visible worker to complete it"
---

# Beads Work - Single Issue Worker

Spawn a visible worker to tackle one beads issue. Unlike bd-swarm, no worktree is created since there's only one worker.

## Quick Start

```bash
/conductor:bd-work              # Pick top priority ready issue
/conductor:bd-work TabzChrome-abc  # Work on specific issue
```

---

## Workflow

```
1. Select issue       →  bd ready (pick top) or use provided ID
2. Get issue details  →  bd show <id>
3. Explore context    →  Task(Explore) for relevant files
4. Craft prompt       →  Follow worker-architecture.md template
5. Spawn worker       →  TabzChrome API (no worktree)
6. Send prompt        →  tmux send-keys
7. User watches       →  Worker visible in sidebar
```

---

## Phase 1: Select Issue

```bash
# If no ID provided, get top ready issue
bd ready --json | jq -r '.[0]'

# Get full issue details
bd show <id>
```

---

## Phase 2: Explore Context

Before crafting the prompt, understand what files are relevant:

```markdown
Task(
  subagent_type="Explore",
  model="haiku",
  prompt="Find files relevant to: '<issue-title>'
         Return: key files, patterns to follow"
)
```

---

## Phase 3: Match Skills

Based on issue keywords, identify skill hints to weave into prompt:

| Keywords | Skill Trigger Words |
|----------|---------------------|
| UI, component, modal | "following UI styling best practices" |
| terminal, xterm, pty | "following xterm.js patterns" |
| backend, API, server | "following backend development patterns" |
| plugin, skill, agent | "following plugin development best practices" |
| MCP, tools, browser | "using MCP browser automation" |

**Remember:** Weave skill hints naturally into task instructions, don't list them.

---

## Phase 4: Craft Prompt

Follow the template from `references/worker-architecture.md`:

```markdown
## Task: ISSUE-ID - Title
[Explicit, actionable description of what to do]

## Context
[WHY this matters, background from issue description]

## Key Files
[File paths as text - worker reads on-demand]
- path/to/relevant/file.ts
- path/to/pattern/to/follow.ts

## Approach
[How to tackle this, with skill hints woven in naturally]
Example: "Update the component following UI styling best practices,
ensuring accessibility and responsive design."

## When Done
Run `/conductor:worker-done ISSUE-ID`
```

---

## Phase 5: Spawn Worker

```bash
TOKEN=$(cat /tmp/tabz-auth-token)
curl -s -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{
    "name": "<issue-id>-worker",
    "workingDir": "/home/marci/projects/TabzChrome",
    "command": "claude --dangerously-skip-permissions"
  }'
```

**No worktree needed** - single worker, no conflict risk.

---

## Phase 6: Send Prompt

Wait for Claude to load (~8 seconds), then send:

```bash
sleep 8
tmux send-keys -t ctt-<issue-id>-worker-<uuid> -l "<crafted-prompt>"
sleep 0.3
tmux send-keys -t ctt-<issue-id>-worker-<uuid> C-m
```

---

## Phase 7: Monitor

User watches worker progress in TabzChrome sidebar. Worker will:
1. Read issue details
2. Explore codebase as needed
3. Implement the fix/feature
4. Run `/conductor:worker-done <issue-id>`

---

## Cleanup

After worker completes:

```bash
# Kill the worker session
tmux kill-session -t ctt-<issue-id>-worker-<uuid>
```

---

## Comparison with bd-swarm

| Aspect | bd-work | bd-swarm |
|--------|---------|----------|
| Workers | 1 | Multiple |
| Worktree | No | Yes (per worker) |
| Conflict risk | None | Managed via isolation |
| Use case | Single issue focus | Batch parallel processing |
| Cleanup | Just kill session | Merge branches + cleanup |

---

## Notes

- Conductor crafts the prompt, worker executes
- Worker is visible in TabzChrome sidebar
- No worktree = simpler cleanup
- Worker completes with `/conductor:worker-done`

Execute this workflow now.
