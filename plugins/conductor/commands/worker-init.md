---
description: "Self-optimize worker context by analyzing issue, identifying skills, and restarting with enhanced prompt"
---

# Worker Init - Self-Service Context Optimization

Workers call this command to optimize their context before starting real work.

**Flow:**
```
1. Analyze current issue (from bd show or provided ID)
2. Identify relevant skills based on keywords
3. Find key files (quick search, size-checked)
4. Craft enhanced prompt with skill triggers
5. Trigger context reset (/clear) and auto-submit enhanced prompt
```

## When to Use

Use `/conductor:worker-init` when:
- You're a newly spawned worker with a basic prompt
- You want to start fresh with an optimized, skill-aware prompt
- Your context is getting heavy and you need to reset

## Step 1: Get Issue Context

If you have an issue ID from your prompt, get the details:

```bash
ISSUE_ID="TabzChrome-xxx"  # From your initial prompt
bd show "$ISSUE_ID" --json 2>/dev/null || bd show "$ISSUE_ID"
```

Extract key fields:
- **title**: What to do
- **description**: Why and how
- **labels**: Hints for skill matching
- **priority**: Urgency level

## Step 2: Match Skills

Match issue keywords to skill trigger language. Use these mappings:

| Keywords in Title/Description | Skill Trigger |
|------------------------------|---------------|
| terminal, xterm, pty, resize, buffer | "Use the xterm-js skill for terminal rendering and resize handling." |
| ui, component, modal, dashboard, styling | "Use the ui-styling skill for shadcn/ui components and Tailwind CSS." |
| backend, api, server, database, websocket | "Use the backend-development skill for API and server patterns." |
| browser, screenshot, click, mcp, tabz | "Use MCP browser automation tools (tabz_*) for testing." |
| auth, login, oauth, session | "Use the better-auth skill for authentication patterns." |
| plugin, skill, agent, hook, command | "Use the plugin-dev skills for plugin/skill/agent structure." |
| prompt, worker, swarm, conductor | "Follow conductor orchestration patterns." |
| audio, tts, speech, sound | "Use the ai-multimodal skill for audio processing." |
| image, video, media | "Use the media-processing skill for multimedia handling." |
| 3d, three, scene, focus | "Reference extension/3d/ for Three.js patterns." |

**Combine multiple matches** if the issue spans domains.

## Step 3: Identify Key Files (Quick Search)

Do a **fast, targeted search** (max 30 seconds):

```bash
# Find files matching keywords from title
KEYWORD="terminal"  # Main keyword from title
grep -rl "$KEYWORD" --include="*.ts" --include="*.tsx" . 2>/dev/null | head -5

# Check file sizes (skip if >500 lines)
wc -l /path/to/file.ts
```

**Rules:**
- Max 5 key files
- Skip files >500 lines (just list path, don't read)
- Prefer files in `extension/` and `backend/` over tests
- If search takes >30 seconds, skip and let worker explore

## Step 4: Craft Enhanced Prompt

Build the enhanced prompt using this exact structure:

```markdown
Fix beads issue ISSUE-ID: "Title"

## Context
[Description from bd show - explains WHY and provides implementation hints]

## Key Files
- path/to/file1.ts (brief note on relevance)
- path/to/file2.ts
[Or: "Explore as needed based on the issue description."]

## Approach
[Skill triggers woven naturally:]
Use the xterm-js skill for terminal rendering. Reference existing patterns in Terminal.tsx for consistency.

After implementation, verify the build passes and test the changes work as expected.

## When Done
Run: /conductor:worker-done ISSUE-ID

This command will: build, run code review, commit changes, and close the issue.
```

**Key principles:**
- Be explicit about what to do
- Include WHY to help make good decisions
- Skill triggers as natural guidance, not a list
- Always include the "When Done" section

## Step 5: Save and Trigger Wipe

Save the enhanced prompt to a temp file and trigger context reset:

```bash
# Save enhanced prompt
PROMPT_FILE="/tmp/worker-init-$$.txt"
cat > "$PROMPT_FILE" << 'EOF'
[YOUR ENHANCED PROMPT HERE]
EOF

# Detect tmux pane
TMUX_PANE=$(tmux display-message -p '#{session_name}:#{window_index}.#{pane_index}' 2>/dev/null)

if [ -n "$TMUX_PANE" ]; then
    # Copy to clipboard as backup
    if command -v clip.exe &> /dev/null; then
        cat "$PROMPT_FILE" | clip.exe
    elif command -v xclip &> /dev/null; then
        cat "$PROMPT_FILE" | xclip -selection clipboard -i &>/dev/null &
        sleep 0.2
    fi

    echo "WORKER-INIT: Enhanced prompt ready, resetting context in 5 seconds..."

    # Schedule the wipe and resubmit
    (
        sleep 5
        # Cancel any pending operation
        tmux send-keys -t "$TMUX_PANE" C-c
        sleep 1
        # Clear terminal scrollback
        tmux clear-history -t "$TMUX_PANE"
        tmux send-keys -t "$TMUX_PANE" C-l
        sleep 0.5
        # Send /clear command
        tmux send-keys -t "$TMUX_PANE" '/'
        sleep 0.5
        tmux send-keys -t "$TMUX_PANE" -l 'clear'
        sleep 0.3
        tmux send-keys -t "$TMUX_PANE" C-m
        # Wait for /clear to process
        sleep 8
        # Load and paste enhanced prompt
        tmux load-buffer "$PROMPT_FILE"
        sleep 0.3
        tmux paste-buffer -t "$TMUX_PANE"
        sleep 0.3
        tmux send-keys -t "$TMUX_PANE" C-m
        sleep 1
        rm -f "$PROMPT_FILE"
    ) &
else
    echo "ERROR: Not running in tmux!"
    echo "Enhanced prompt saved to: $PROMPT_FILE"
    echo "Manual steps: /clear then paste from file"
fi
```

Run this bash script with `run_in_background: true`, then say:

> "Worker-init: Enhanced prompt ready, resetting context in 5 seconds. Backup copied to clipboard."

And stop. The background script will handle the rest.

## Example Enhanced Prompt

For issue: "Fix terminal resize corruption when sidebar narrows quickly"

```markdown
Fix beads issue TabzChrome-xyz: "Fix terminal resize corruption when sidebar narrows quickly"

## Context
Rapidly narrowing the Chrome sidebar during heavy terminal output causes text wrapping corruption. This is a race condition between resize events and xterm.js buffer updates.

## Key Files
- extension/components/Terminal.tsx (resize handling, FitAddon)
- extension/hooks/useTerminalSessions.ts (session lifecycle)

## Approach
Use the xterm-js skill for terminal rendering and resize handling. Focus on debouncing resize events and ensuring FitAddon.fit() completes before new output arrives. Reference the existing resize observer pattern in Terminal.tsx.

After implementation, verify the build passes and test rapid sidebar resizing with heavy output.

## When Done
Run: /conductor:worker-done TabzChrome-xyz
```

## When NOT to Use

Skip worker-init if:
- Your initial prompt is already detailed and skill-aware
- The task is trivial (single-file fix)
- You're already mid-implementation with good context
- Context usage is low and no optimization needed

## Important Notes

- This only works inside tmux
- Enhanced prompt is backed up to clipboard
- If timing fails, paste manually after /clear
- The 8-second wait for /clear is important - don't shorten it
