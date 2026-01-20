---
name: gg-write
description: "Craft a worker prompt for a backlog issue"
argument-hint: "ISSUE_ID"
---

# Write Worker Prompt

Transform a backlog issue into a worker-ready prompt with skill hints and context.

## Steps

Add these to your to-dos:

1. **Read the issue** - Get issue details with `mcp__beads__show()`
2. **Discover relevant skills** - Find matching skills with `tabz_list_skills()`
3. **Quick file exploration** - Use Explore agent to find 3-5 key files
4. **Craft the prompt** - Use `/prompt-writer:prompt-craft` skill (Haiku)
5. **Store and mark ready** - Update issue notes and add ready label

---

## Step 1: Read the Issue

```python
mcp__beads__show(issue_id="ISSUE-ID")
```

Verify:
- Issue exists
- Status is `open` or `backlog` (not already in_progress/closed)

## Step 2: Discover Relevant Skills

Use the `tabz_list_skills` MCP tool to find skills that match the work:

```python
tabz_list_skills(query="terminal")
```

Match skills based on:
- Files mentioned in issue (`.tsx` -> frontend-development, xterm-js)
- Keywords in description (auth -> better-auth, database -> databases)
- Issue type (docs -> docs-seeker, visual -> ui-styling)

## Step 3: Quick File Exploration

Use Explore agent to identify 3-5 key files:

```python
Task(subagent_type="Explore", prompt="Find the main files related to: [issue description]")
```

## Step 4: Craft the Prompt

Use the `/prompt-writer:prompt-craft` skill which runs with Haiku for fast prompt crafting.

The skill will apply Claude 4 best practices:
- Explicit action verbs
- Context/motivation for rules
- Natural skill triggers
- Positive framing

**Prompt structure:**

```markdown
## Context
[1-2 sentences about the goal and why]

## Task
[Explicit instruction - what to DO, not suggest]

## Approach
Use the [skill] skill for [specific purpose].

## Key Files
- path/to/main/file.ts
- path/to/related/file.ts

## When Done
Close issue: bd close ISSUE-ID --reason "summary"
```

## Step 5: Store and Mark Ready

```python
mcp__beads__update(
  issue_id="ISSUE-ID",
  notes="[existing notes]\n\n## Prepared Prompt\n[your prompt]"
)
```

Add the ready label:
```bash
bd update ISSUE-ID --add-label ready
```

---

## Example Output

For an issue about fixing terminal resize:

```markdown
## Context
Terminal resize events aren't being properly handled, causing text corruption when the sidebar is narrowed quickly.

## Task
Fix the resize handling in Terminal.tsx to debounce resize events and re-fit the terminal after resize completes.

## Approach
Use the xterm-js skill for terminal integration and resize handling.
Check the docs/lessons-learned/terminal-rendering.md for known patterns.

## Key Files
- extension/components/Terminal.tsx
- docs/lessons-learned/terminal-rendering.md

## When Done
Close issue: bd close ISSUE-ID --reason "Fixed terminal resize with debouncing"
```

## Notes

- Keep prompts focused - workers read the full issue description
- Include skill hints but don't overload
- 3-5 key files is enough - workers can explore more
- Reference existing docs/lessons-learned when relevant
