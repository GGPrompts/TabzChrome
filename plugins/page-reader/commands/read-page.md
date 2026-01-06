---
description: Capture current page, summarize key points, and read aloud via TTS
---

**Arguments:** `$ARGUMENTS`
- If empty: Summarize entire page with key points
- If contains text: Focus summary on that topic/question
- If "quiet": Skip audio, just display summary

## Step 1: Get Page Content

First, get the current page info and extract readable text content.

Use the tabz MCP tools:

```bash
# Get page title and URL
mcp-cli call tabz/tabz_get_page_info '{}'
```

Then extract the main text content:

```bash
# Extract readable text from page (excludes scripts, styles, navigation)
mcp-cli call tabz/tabz_execute_script '{"script": "(() => { const clone = document.body.cloneNode(true); clone.querySelectorAll(\"script, style, nav, header, footer, aside, [role=navigation], [role=banner], [aria-hidden=true]\").forEach(el => el.remove()); return clone.innerText.substring(0, 15000); })()"}'
```

## Step 2: Summarize the Content (via Codex Mini)

Use Codex with gpt-5.1-codex-mini for fast, cheap summarization:

```bash
# Store page content in variable
PAGE_CONTENT="[extracted text from Step 1]"
FOCUS_TOPIC="$ARGUMENTS"  # Empty if no specific focus

# Build the prompt
if [ -n "$FOCUS_TOPIC" ] && [ "$FOCUS_TOPIC" != "quiet" ]; then
  PROMPT="Summarize this page, focusing on: $FOCUS_TOPIC\n\n$PAGE_CONTENT"
else
  PROMPT="Summarize this page:\n\n$PAGE_CONTENT"
fi

# Call Codex mini for summarization (fast and cheap)
SUMMARY=$(mcp-cli call codex/codex "$(echo "$PROMPT" | jq -Rs '{
  prompt: (. + "\n\nProvide:\n1. One sentence overview\n2. 3-5 key points as bullet points\n3. Notable details (numbers, dates, names)\n\nKeep it concise - 30-60 seconds of reading."),
  model: "gpt-5.1-codex-mini",
  sandbox: "read-only"
}')")

echo "$SUMMARY"
```

**Why gpt-5.1-codex-mini?** Summarization is a simple structured task - mini is fast, cheap, and more than capable. Saves Claude tokens for real work.

The summary should include:

1. **What this page is about** (1 sentence)
2. **Key points** (3-5 bullet points of the most important information)
3. **Notable details** (any specific numbers, dates, names, or facts worth remembering)

Keep the summary concise - aim for what someone could absorb in 30-60 seconds of listening.

## Step 3: Display Summary

Show the summary in a readable format:

```
## Page Summary: [Title]
URL: [url]

### Overview
[1 sentence description]

### Key Points
- [Point 1]
- [Point 2]
- [Point 3]

### Notable Details
- [Specific facts, numbers, dates worth remembering]
```

## Step 4: Audio Playback

**Check `$ARGUMENTS` first:**
- If contains "quiet" -> Skip audio, just display "Summary complete (audio skipped)"
- Otherwise -> Read the summary aloud

Convert the summary to natural spoken text (no markdown, no bullets - conversational):

```bash
cat <<'AUDIO_TEXT_EOF' | jq -Rs '{text: ., voice: "en-US-AriaNeural", rate: "+10%", pitch: "+0Hz", volume: 0.85, priority: "high"}' | curl -s -X POST http://localhost:8129/api/audio/speak -H "Content-Type: application/json" -d @- > /dev/null 2>&1 &
[INSERT SPOKEN VERSION OF SUMMARY HERE]
This page is about [topic]. The key points are: [point 1], [point 2], and [point 3].
Notable details include [specific facts].
AUDIO_TEXT_EOF
```

**Audio text guidelines:**
- Convert bullets to flowing sentences with "First...", "Second...", "Also..."
- Keep it under 60 seconds of speech (roughly 150-180 words)
- Use natural transitions: "The main takeaway is...", "Worth noting that..."
- End with the most actionable or memorable point

After triggering playback: "Reading page summary aloud..."

## Error Handling

If page content extraction fails:
- Check if there's an active browser tab
- The page might be restricted (chrome:// pages, PDFs, etc.)
- Suggest: "Try navigating to a regular web page first"

If the page has very little text content:
- Note this in the summary
- Still provide what information is available
