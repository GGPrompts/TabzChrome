---
description: Generate a handoff summary, copy to clipboard, and speak via Tabz TTS
---

**Arguments:** `$ARGUMENTS`
- If the user types `/handoff quiet`, skip audio playback and only copy to clipboard
- If no arguments (empty), play audio after copying

Generate a concise handoff summary of our conversation that I can use to continue in a new Claude Code session.

Use this exact format:

```
## What we're working on
- [Primary task/topic]
- [Secondary items if applicable]

## Current state
- [Where we left off]
- [Any pending questions or decisions]

## Key decisions made
- [Important choices/conclusions from this conversation]

## Recent changes
- [Files modified, if any]
- [Commands run or actions taken]

## Important context
- [Facts, preferences, or constraints I mentioned]
- [Technical details that matter for continuing]

## Next steps
- [Immediate next action]
- [Follow-up tasks]
```

Requirements:
- Be concise but complete - capture what's needed to continue without re-explaining
- Focus on actionable state, not conversation history
- Include file paths and technical specifics where relevant
- Skip sections that don't apply (e.g., "Recent changes" if no files were modified)

After generating the summary, copy it to clipboard using this bash command:

```bash
# Detect environment and copy accordingly
if command -v clip.exe &> /dev/null; then
    # WSL with Windows clipboard
    cat <<'HANDOFF_EOF' | clip.exe
[INSERT THE GENERATED HANDOFF SUMMARY HERE]
HANDOFF_EOF
    echo "Handoff copied to clipboard (WSL/Windows)"
elif command -v xclip &> /dev/null; then
    # Linux with xclip
    cat <<'HANDOFF_EOF' | xclip -selection clipboard -i &>/dev/null &
[INSERT THE GENERATED HANDOFF SUMMARY HERE]
HANDOFF_EOF
    sleep 0.2
    echo "Handoff copied to clipboard (xclip)"
elif command -v xsel &> /dev/null; then
    # Linux with xsel
    cat <<'HANDOFF_EOF' | xsel --clipboard --input
[INSERT THE GENERATED HANDOFF SUMMARY HERE]
HANDOFF_EOF
    echo "Handoff copied to clipboard (xsel)"
elif command -v wl-copy &> /dev/null; then
    # Wayland
    cat <<'HANDOFF_EOF' | wl-copy
[INSERT THE GENERATED HANDOFF SUMMARY HERE]
HANDOFF_EOF
    echo "Handoff copied to clipboard (Wayland)"
else
    echo "No clipboard tool found. Manual copy required."
    echo ""
    cat <<'HANDOFF_EOF'
[INSERT THE GENERATED HANDOFF SUMMARY HERE]
HANDOFF_EOF
fi
```

Then display:

```
Handoff summary copied to clipboard!

To continue in a new session:
1. Start new Claude Code session: claude
2. Paste the handoff (Ctrl+V or Ctrl+Shift+V)
3. Add your next question/task after the handoff
```

## Audio Playback via Tabz

**Check `$ARGUMENTS` first:**
- If `$ARGUMENTS` contains "quiet" -> Skip audio entirely
- If `$ARGUMENTS` is empty or doesn't contain "quiet" -> Play audio via Tabz TTS

When playing audio, use jq to safely escape the text for JSON (handles quotes, newlines, special chars):

```bash
cat <<'AUDIO_TEXT_EOF' | jq -Rs '{text: ., voice: "en-GB-SoniaNeural", rate: "+20%", volume: 0.8}' | curl -s -X POST http://localhost:8129/api/audio/speak -H "Content-Type: application/json" -d @- > /dev/null 2>&1 &
[INSERT PLAIN TEXT VERSION OF SUMMARY - no markdown, conversational, 2-4 sentences max]
AUDIO_TEXT_EOF
```

**IMPORTANT**:
- Use the heredoc + jq pattern above - it safely handles any text content
- Convert the summary to plain spoken text (no markdown, no bullet points)
- Keep it VERY concise for audio - 2-4 sentences summarizing the key state (aim for 15-30 seconds of speech)
- Example: "We've been working on the React dashboard for TabzChrome. Added system info panel, connection status, and MCP playground. The build is passing and ready to test."

After triggering playback, tell the user: "Audio summary playing through Tabz!"

If quiet mode, just confirm: "Handoff copied to clipboard (audio skipped)"
