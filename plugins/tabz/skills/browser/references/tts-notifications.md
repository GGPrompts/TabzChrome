# Text-to-Speech Notifications

## Speak Text

```bash
mcp-cli info tabz/tabz_speak  # Check schema first
mcp-cli call tabz/tabz_speak '{"text": "Task complete"}'
```

Options:
- `text`: What to say
- `voice`: Voice name (optional)
- `priority`: "high" interrupts current speech

## List Available Voices

```bash
mcp-cli call tabz/tabz_list_voices '{}'
```

Returns available TTS voices with language codes.

## Play Audio File

```bash
mcp-cli call tabz/tabz_play_audio '{"url": "https://example.com/sound.mp3"}'
```

Options:
- `url`: Audio file URL or path

## Use Cases

```bash
# Task completion
mcp-cli call tabz/tabz_speak '{"text": "Build complete"}'

# Error notification (high priority interrupts)
mcp-cli call tabz/tabz_speak '{"text": "Tests failed", "priority": "high"}'

# Attention needed
mcp-cli call tabz/tabz_speak '{"text": "Waiting for input"}'

# Long operation done
mcp-cli call tabz/tabz_speak '{"text": "Download finished"}'
```
