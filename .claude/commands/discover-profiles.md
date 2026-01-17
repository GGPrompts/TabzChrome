---
name: discover-profiles
description: "Help users manage TabzChrome profiles via the REST API"
---

# Profile Discovery Assistant

Help users view, create, and manage TabzChrome terminal profiles.

## Profile API Endpoints

**Get all profiles:**
```bash
curl -s http://localhost:8129/api/browser/profiles | jq
```

**Create a profile:**
```bash
TOKEN=$(cat /tmp/tabz-auth-token)
curl -X POST http://localhost:8129/api/browser/profiles \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{"profile": {"name": "My Tool", "command": "mytool", "category": "Tools"}}'
```

**Update a profile:**
```bash
curl -X PUT http://localhost:8129/api/browser/profiles/<profile-id> \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{"name": "New Name", "command": "new-command"}'
```

**Delete a profile:**
```bash
curl -X DELETE http://localhost:8129/api/browser/profiles/<profile-id> \
  -H "X-Auth-Token: $TOKEN"
```

**Bulk import:**
```bash
curl -X POST http://localhost:8129/api/browser/profiles/import \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{"profiles": [...], "mode": "merge"}'
```

## Profile Schema

```json
{
  "id": "my-tool-abc123",
  "name": "My Tool",
  "category": "Tools",
  "command": "mytool --flag",
  "workingDir": "",
  "fontSize": 16,
  "fontFamily": "JetBrains Mono, monospace",
  "themeName": "high-contrast",
  "reference": "~/docs/my-tool-guide.md",
  "backgroundMedia": "~/Videos/ambient.mp4",
  "backgroundMediaType": "video",
  "backgroundMediaOpacity": 30
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Auto | Unique ID (generated if not provided) |
| `name` | Yes | Display name |
| `category` | No | Grouping category (e.g., "Claude Code", "TUI Tools") |
| `command` | No | Command to run (empty = bash) |
| `workingDir` | No | Starting directory (empty = inherit from header) |
| `fontSize` | No | Font size (default: 16) |
| `fontFamily` | No | Font (default: monospace) |
| `themeName` | No | Theme: high-contrast, dracula, ocean, neon, amber, matrix |
| `reference` | No | Reference URL or file path (shows 📎 paperclip on tab) |
| `pinnedToNewTab` | No | Show on New Tab page (up to 6 pinned profiles) |
| `useDefaultTheme` | No | Inherit theme settings from default profile |

### Background Media Fields

| Field | Required | Description |
|-------|----------|-------------|
| `backgroundMedia` | No | Path to image/video file (e.g., ~/Pictures/space.mp4) |
| `backgroundMediaType` | No | Type: "none", "image", or "video" |
| `backgroundMediaOpacity` | No | 0-100, controls media visibility (default: 50) |

### Theme Customization Fields

| Field | Required | Description |
|-------|----------|-------------|
| `backgroundGradient` | No | Override gradient (undefined = use theme default) |
| `panelColor` | No | Base panel color shown through gradient (default: #000000) |
| `transparency` | No | Gradient opacity 0-100 (default: 100) |

### Audio Override Fields

| Field | Required | Description |
|-------|----------|-------------|
| `audioOverrides.mode` | No | "default" (follow global), "enabled", or "disabled" |
| `audioOverrides.voice` | No | Override TTS voice for this profile |
| `audioOverrides.rate` | No | Override speech rate (e.g., "+30%") |
| `audioOverrides.pitch` | No | Override pitch (e.g., "+20Hz") |

## Instructions

1. First, get existing profiles to see what's already configured
2. Ask the user what profiles they'd like to add or modify
3. Use the API to create/update profiles based on their needs
4. Profiles appear immediately in the TabzChrome sidebar dropdown
