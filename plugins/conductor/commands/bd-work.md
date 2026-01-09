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
3. VERIFY SKILLS      →  scripts/match-skills.sh --available-full (MANDATORY)
4. Explore context    →  Task(Explore) for relevant files
5. Craft prompt       →  Follow worker-architecture.md template (VERIFIED skills only)
6. Spawn worker       →  TabzChrome API (no worktree)
7. Send prompt        →  tmux send-keys
8. User watches       →  Worker visible in sidebar
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

## Phase 2: VERIFY Skills (MANDATORY)

**CRITICAL: Run this BEFORE crafting prompts.** Only include skills that appear in output:

```bash
# List ALL available skills - ONLY use these in prompts
${CLAUDE_PLUGIN_ROOT}/scripts/match-skills.sh --available-full

# Or verify and match for specific keywords
${CLAUDE_PLUGIN_ROOT}/scripts/match-skills.sh --verify "backend api terminal"
```

**Rules:**
- If a skill doesn't appear in `--available-full`, DO NOT include it in prompts
- MCP tools (shadcn/*, tabz/*) are NOT skills - call them via `mcp-cli call`
- If no skills match, omit the "Skills to Load" section entirely

Common verified skill patterns (if installed):

| Keywords | Skill to Invoke |
|----------|-----------------|
| UI, component, modal, dashboard | `/ui-styling:ui-styling` |
| terminal, xterm, pty, resize | `/xterm-js:xterm-js` |
| backend, API, server, websocket | `/backend-development:backend-development` |
| plugin, skill, agent, hook | `/plugin-dev:plugin-dev` |
| MCP, browser, screenshot | `/conductor:tabz-mcp` |
| auth, login, oauth | `/better-auth:better-auth` |

**CRITICAL:** Use full `plugin:skill` format. "Use the X skill" does NOT trigger invocation.

---

## Phase 3: Explore Context

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

## Phase 4: Craft Prompt

Follow the template from `references/worker-architecture.md`:

```markdown
Fix beads issue ISSUE-ID: "Title"

## Skills to Load
**FIRST**, invoke these skills before starting work:
- /backend-development:backend-development
- /ui-styling:ui-styling

These load patterns and context you'll need.

## Context
[WHY this matters, background from issue description]

## Key Files
[File paths as text - worker reads on-demand]
- path/to/relevant/file.ts
- path/to/pattern/to/follow.ts

## Approach
[Implementation guidance - what to do, not which skills to use]

After implementation, verify the build passes and test the changes work as expected.

## When Done
Run: /conductor:worker-done ISSUE-ID

This command will: build, run code review, commit changes, and close the issue.
```

**The `/conductor:worker-done` instruction is mandatory** - without it, workers don't know how to signal completion.

---

## Phase 5: Spawn Worker

First, get the conductor's tmux session name:
```bash
CONDUCTOR_SESSION=$(tmux display-message -p '#{session_name}')
```

Then spawn the worker with `CONDUCTOR_SESSION` env var:
```bash
TOKEN=$(cat /tmp/tabz-auth-token)
ISSUE_ID="<issue-id>"
PROJECT_DIR=$(pwd)

RESPONSE=$(curl -s -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d "{\"name\": \"$ISSUE_ID-worker\", \"workingDir\": \"$PROJECT_DIR\", \"command\": \"CONDUCTOR_SESSION=$CONDUCTOR_SESSION claude --dangerously-skip-permissions\"}")

# Response: {"success":true,"terminal":{"id":"ctt-xxx","ptyInfo":{"tmuxSession":"ctt-xxx"}}}
SESSION=$(echo "$RESPONSE" | jq -r '.terminal.ptyInfo.tmuxSession')
echo "Spawned: $SESSION"

# Record session IDs in beads for audit trail
bd update "$ISSUE_ID" --notes "conductor_session: $CONDUCTOR_SESSION
worker_session: $SESSION
started_at: $(date -Iseconds)"
```

**Why CONDUCTOR_SESSION?** When worker runs `/conductor:worker-done`, it sends a completion notification back to the conductor via tmux. No polling needed - push-based.

**Why record session IDs?** Enables later audit of which Claude session worked on which issue. Can review chat histories to improve prompts/workflows.

**No worktree needed** - single worker, no conflict risk.

---

## Phase 6: Send Prompt

Wait for Claude to load (~8 seconds), then send using `$SESSION` from Phase 5:

```bash
sleep 8
tmux send-keys -t "$SESSION" -l "<crafted-prompt>"
sleep 0.3
tmux send-keys -t "$SESSION" C-m
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
# Kill the worker session (use $SESSION from Phase 5)
tmux kill-session -t "$SESSION"
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
