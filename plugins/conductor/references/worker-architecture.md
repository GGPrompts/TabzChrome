# Worker Architecture

This document describes the unified worker architecture for parallel issue processing with bd-swarm.

## Overview

```
Worker (vanilla Claude via tmux/TabzChrome)
  ├─> Gets context from `bd show <issue-id>`
  ├─> Receives explicit skill invocations in prompt (e.g., "/xterm-js:xterm-js")
  ├─> Invokes skills FIRST before starting work
  └─> Completes with /conductor:worker-done
```

## What Workers ARE

- **Vanilla Claude sessions** spawned via TabzChrome API or direct tmux
- **Same plugin context** as the conductor (all skills available)
- **Skill-aware** - workers receive skill hints in prompts and invoke skills directly
- **Issue-focused** - each worker receives issue context and completes the task

## What Workers are NOT

- **NOT specialized agents** - no worker-frontend.md, worker-backend.md, etc.
- **NOT plugin-isolated** - no `--plugin-dir ./plugins/worker-minimal`
- **NOT subagent invokers** - workers invoke skills directly, not via Task subagents

## Skill Matching

The conductor matches issue keywords to skill hints for worker prompts:

| Issue Keywords | Skill Hint | Purpose |
|----------------|-----------|---------|
| terminal, xterm, PTY, resize | `/xterm-js:xterm-js` | Terminal rendering, resize, WebSocket |
| UI, component, modal, dashboard | `/ui-styling:ui-styling` | shadcn/ui, Tailwind patterns |
| backend, API, server, database | `/backend-development:backend-development` | Node.js, APIs, databases |
| browser, screenshot, click | `/conductor:tabz-mcp` | Browser automation tools |
| auth, login, oauth | `/better-auth:better-auth` | Authentication patterns |

## Why This Architecture?

1. **Simplicity** - Workers are just Claude sessions, no special configuration
2. **Direct skills** - Workers invoke skills directly, avoiding subagent context overhead
3. **Flexible** - Same worker can handle any issue type with appropriate skill hints
4. **Lean prompts** - File paths as text (not @file), skills invoked on-demand

## Worker Lifecycle

```
1. Spawn      → TabzChrome API or tmux creates session
2. Prompt     → Worker receives issue context + skill hint via tmux send-keys
3. Work       → Worker invokes skill when needed, reads files on-demand
4. Complete   → Worker runs /conductor:worker-done
5. Cleanup    → Session killed, worktree merged/removed
```

## Worker Prompt Guidelines

These guidelines ensure workers receive clear, effective prompts that Claude 4.x models follow precisely.

### Be Explicit

Claude 4.x models follow instructions **precisely**. If you say "suggest changes," Claude will suggest—not implement.

| Less Effective | More Effective |
|----------------|----------------|
| Fix the bug | Fix the null reference error on line 45 of Terminal.tsx when resize callback fires before terminal is initialized |
| Improve the UI | Add loading state to the button with disabled styling and spinner icon |
| Can you suggest improvements? | Make these improvements to the code |

### Add Context (Explain WHY)

Claude generalizes from explanations. Provide motivation:

```text
# Less effective
Add error handling

# More effective
Add try-catch around the WebSocket connection to gracefully handle
backend disconnections. Currently users see a cryptic error.
```

### Reference Existing Patterns

Point workers to existing code for consistency:

```text
Follow the same error handling pattern used in useTerminalSessions.ts
(lines 45-60) for consistency.
```

### Soften Aggressive Language

Avoid ALL CAPS and aggressive phrasing—Claude 4.x may overtrigger:

| Avoid | Use Instead |
|-------|-------------|
| CRITICAL: You MUST use this tool | Use this tool when... |
| NEVER do X | Prefer Y over X because... |
| ALWAYS do Y | Default to Y for... |

### Prompt Structure

Structure worker prompts in clear sections:

```markdown
## Task: ISSUE-ID - Title
[What to do - explicit, actionable]

## Skills to Load
**FIRST**, invoke these skills before starting work:
- /backend-development:backend-development
- /ui-styling:ui-styling

These load patterns and context you'll need.

## Context
[Background, WHY this matters]

## Key Files
[File paths as text, not @file - workers read on-demand]

## Approach
[Implementation guidance - what to do, not which skills to use]

## When Done
Run `/conductor:worker-done ISSUE-ID`
```

### Skill Invocation: Explicit Commands

**CRITICAL:** Skills must be invoked with explicit `/plugin:skill` commands in a dedicated section.

| ❌ Doesn't work | ✅ Works |
|-----------------|----------|
| "Use the X skill for Y" | `/backend-development:backend-development` |
| "Follow patterns from X skill" | `/ui-styling:ui-styling` |
| Weaving into prose | Explicit invocation in "Skills to Load" section |

To find available skills:
```bash
./plugins/conductor/scripts/discover-skills.sh "backend api terminal"
```

### Anti-Patterns

| Anti-Pattern | Why It Fails | Better Approach |
|--------------|--------------|-----------------|
| ALL CAPS INSTRUCTIONS | Reads as shouting, may overtrigger | Normal case with clear structure |
| "Don't do X" | Negative framing is harder to follow | "Do Y instead" (positive framing) |
| Vague adjectives ("good", "proper") | Undefined, varies by interpretation | Specific criteria or examples |
| Including full file contents | Bloats prompt, may be stale | File paths as text, read on-demand |
| "Use the X skill for..." | Interpreted as guidance, not invocation | Explicit `/plugin:skill` commands |
| Shorthand skill names | May not resolve (e.g., `/backend-development`) | Full format `/plugin:skill` |

## Related Files

| File | Purpose |
|------|---------|
| `commands/bd-swarm.md` | Main swarm workflow |
| `skills/bd-swarm-auto/SKILL.md` | Autonomous backlog processing |
| `commands/plan-backlog.md` | Sprint planning with skill matching |
| `scripts/completion-pipeline.sh` | Cleanup after workers complete |
