# Sound Effects (SFX) for TabzChrome

Place your sound effect files (`.mp3` or `.wav`) in this directory.

## Expected Files

| Event | Default Filename | Description |
|-------|-----------------|-------------|
| Ready | `ready.mp3` | When Claude finishes and awaits input |
| Session Start | `session-start.mp3` | When a new Claude session begins |
| Tool | `tool.mp3` | When Claude uses a tool (Read, Write, etc.) |
| Subagent | `subagent.mp3` | When Claude spawns a subagent |
| Warning | `warning.mp3` | Context at 50% (medium alert) |
| Critical | `critical.mp3` | Context at 75% (urgent alert) |
| Download | `download.mp3` | When MCP download completes |

## Finding Free SFX

### Mixkit (Recommended)
- URL: https://mixkit.co/free-sound-effects/
- Categories: alerts, notification, chimes, technology
- Format: WAV (royalty-free, no attribution required)
- Use the browser automation: `.prompts/audio/mixkit-sfx.prompty`

### Pixabay
- URL: https://pixabay.com/sound-effects/
- Search: notification, alert, chime, ui
- Format: MP3 (royalty-free, no attribution required)
- Use the browser automation: `.prompts/audio/pixabay-sfx.prompty`

## Quick Download via Browser Automation

```
# Open Mixkit alerts category
mcp-cli call tabz/tabz_open_url '{"url": "https://mixkit.co/free-sound-effects/alerts/"}'

# Download first sound
mcp-cli call tabz/tabz_click '{"selector": ".download-button--icon"}'
```

## Custom Paths

You can also specify custom SFX paths in the settings:
- Enter a full path like `~/sounds/my-alert.mp3`
- The path will be resolved and played

## Volume

All SFX respect the global volume setting in Audio settings.

## Priority

- `critical.mp3` plays with high priority (won't be interrupted)
- All other SFX play with low priority (skipped if TTS is speaking)
