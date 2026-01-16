# Worker Prompt Guidelines

Best practices for crafting effective worker prompts that activate skills naturally.

## The Golden Rule: Role First

Always start with a role definition. This primes Claude for the task domain:

```markdown
You are a frontend developer working on a React application with shadcn/ui components.
```

or

```markdown
You are a backend engineer implementing API endpoints with FastAPI.
```

## Prompt Structure

```markdown
You are a [role] working on [context].

## Task: ISSUE-ID - Title

[What to do - explicit, actionable, 2-3 sentences]

## Why This Matters

[Background motivation - helps Claude make good decisions]

## Key Files

- path/to/main-file.ts - [what to focus on]
- path/to/related.ts - [why it's relevant]

## Guidance

[Natural language guidance with skill triggers woven in]

When you're done, close the issue: `bd close ISSUE-ID --reason="done"`
```

## Skill Activation: Natural Triggers

**Wrong:** Prescriptive skill loading
```markdown
Load these skills:
- /frontend:ui-styling
- /plugin-development:plugin-dev
```

**Right:** Natural trigger phrases
```markdown
Use the ui-styling skill to ensure the components follow our design system.
Use the plugin-dev skill to help structure the manifest correctly.
If the task is complex, use subagents in parallel to explore the codebase first.
```

### Trigger Phrase Examples

| Domain | Natural Trigger |
|--------|-----------------|
| UI Components | "Use the ui-styling skill to match our design patterns" |
| Plugin Development | "Use the plugin-dev skill to validate the manifest" |
| Terminal/xterm.js | "Use the xterm-js skill for terminal resize handling" |
| Complex Exploration | "Use subagents in parallel to find all related files" |
| Deep Reasoning | "Think through this step by step" or prepend "ultrathink" |
| Code Review | "Run a code review before committing" |
| Backend APIs | "Use the backend-development skill for API patterns" |

### Keywords That Activate Skills

The skill-eval hook detects domain keywords. Include them naturally in context:

| Domain | Keywords to Weave In |
|--------|----------------------|
| Frontend | shadcn/ui, Tailwind CSS, Radix UI, React components |
| Terminal | xterm.js, PTY, WebSocket, FitAddon, terminal resize |
| Backend | FastAPI, REST API, Node.js, database, authentication |
| Plugin | Claude Code plugin, skill, agent, manifest, SKILL.md |
| Browser | browser automation, MCP tools, screenshots, DOM |

**Example:** "This task involves building React components with shadcn/ui and Tailwind CSS styling."

## Core Principles

### 1. Be Explicit

Claude follows instructions precisely. "Suggest changes" means suggest, not implement.

| Vague | Explicit |
|-------|----------|
| Fix the bug | Fix the null reference on line 45 of Terminal.tsx |
| Improve the UI | Add a loading spinner to the submit button |
| Make it better | Refactor to use the existing useTerminal hook |

### 2. Explain Why

Context helps Claude make good judgment calls:

```markdown
# Without why
Add error handling to the WebSocket connection.

# With why
Add try-catch around the WebSocket connection to gracefully handle
backend disconnections. Currently users see a cryptic error when
the server restarts.
```

### 3. Reference Existing Patterns

Point to code for consistency:

```markdown
Follow the same validation pattern used in RegisterForm.tsx (lines 30-45).
```

### 4. Use Positive Framing

Tell Claude what TO DO, not what NOT to do:

| Negative | Positive |
|----------|----------|
| Don't use any external libraries | Use only built-in Node.js modules |
| Never commit without tests | Include tests for new functionality |
| Don't break existing behavior | Maintain backward compatibility |

### 5. Soften Aggressive Language

Claude 4.x overtriggers on aggressive phrasing:

| Aggressive | Calm |
|------------|------|
| CRITICAL: You MUST do X | Do X when... |
| NEVER do Y | Prefer Z over Y because... |
| ALWAYS use X | Default to X for... |

## Anti-Patterns

| Anti-Pattern | Problem | Fix |
|--------------|---------|-----|
| `Load these skills: [list]` | Too mechanical, doesn't explain when/why | "Use the X skill to help with Y" |
| ALL CAPS INSTRUCTIONS | Reads as shouting, overtriggers | Normal case, clear structure |
| Full file contents | Bloats prompt, may be stale | File paths only, read on-demand |
| "Don't do X" | Negative framing harder to follow | "Do Y instead" |
| No role definition | Claude doesn't know the context | Start with "You are a..." |
| Vague adjectives | "Good", "proper" are undefined | Specific criteria or examples |

## Complete Example

```markdown
You are a frontend developer working on a React dashboard with shadcn/ui components and Tailwind CSS.

## Task: TabzBeads-123 - Add dark mode toggle

Add a dark mode toggle to the settings page that persists the user's preference.

## Why This Matters

Users have requested dark mode for late-night coding sessions. The toggle should
feel native to our existing UI and persist across browser sessions.

## Key Files

- src/components/Settings.tsx - add the toggle here
- src/contexts/ThemeContext.tsx - theme state lives here
- src/components/ui/switch.tsx - use this shadcn component

## Guidance

Use the ui-styling skill to ensure the toggle matches our design system.
Follow the pattern in Settings.tsx for other preference toggles.
Store the preference in localStorage for persistence.

If you need to explore how theming works across the app, use subagents
in parallel to find all theme-related files first.

When you're done, close the issue: `bd close TabzBeads-123 --reason="done"`
```
