# File Filters for TabzChrome Dashboard

## Status: In Progress

**Target:** TFE-style file filters integrated into the Files section - filter by Prompts, Claude ecosystem files, or Favorites.

## Overview

Instead of a separate "Prompts" section, integrate filters directly into the existing Files section. Inspired by TFE's filter system with special colors for Claude-related files.

## UI Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ Dashboard Sidebar │  Files Section                                  │
│ ──────────────────│─────────────────────────────────────────────────│
│ 📁 Working Dir ▼  │  Files    [All] [📝 Prompts] [🤖 Claude] [⭐]   │
│                   │  /home/matt/projects/TabzChrome        ⚙️       │
│ • Terminals       ├─────────────┬───────────────────────────────────│
│ • Files           │  FileTree   │  File Viewer                      │
│ • Focus           │  (left)     │  (right with tabs)                │
│ • Settings        │             │                                   │
└───────────────────┴─────────────┴───────────────────────────────────┘
```

## Filter Definitions

| Filter | Icon | Sources | Shows |
|--------|------|---------|-------|
| **All** | - | Working dir | Normal tree view |
| **Prompts** | 📝 | `~/.prompts/`, `.prompts/`, `.claude/commands/` | `.prompty` files, markdown templates |
| **Claude** | 🤖 | `~/.claude/`, `.claude/`, project root | CLAUDE.md, settings, skills, agents, hooks, .mcp.json |
| **Favorites** | ⭐ | Saved paths | User-bookmarked files |

## File Type Colors (TFE-Inspired)

| Type | Light | Dark | Examples |
|------|-------|------|----------|
| claude-config | #D75F00 | #FF8700 | CLAUDE.md, settings.json |
| prompt | #D7005F | #FF79C6 | .prompty, .prompts/ |
| skill | #008B8B | #50FAE9 | .claude/skills/*.md |
| agent | #8B00FF | #BD93F9 | .claude/agents/*.md, AGENTS.md |
| hook | #5F8700 | #A6E22E | .claude/hooks/*.md |
| mcp | #0087AF | #66D9EF | .mcp.json |
| command | #0087D7 | #87CEEB | .claude/commands/*.md |

## Implementation

### Phase 1: Core Filter System
- [x] Update plan document
- [ ] Create `claudeFileTypes.ts` utility (detection + colors)
- [ ] Add `activeFilter` state to FilesContext
- [ ] Add filter toggle buttons to Files.tsx header
- [ ] Backend: `GET /api/files/list?filter=X&workingDir=Y`
- [ ] Create FilteredFileList component (grouped list view)
- [ ] Apply colors to FileTree rendering

### Phase 2: Prompts Features
- [ ] Variable detection in `.prompty` files (scan for `{{var}}`)
- [ ] Variable form when prompt file selected
- [ ] Live preview with substitution
- [ ] "Send to terminal" button for filled prompts
- [ ] Terminal selector dropdown

### Phase 3: Favorites
- [ ] Star button on files/folders
- [ ] Persist favorites to Chrome storage
- [ ] Favorites filter view

### Phase 4: Template Management
- [ ] Create new template UI
- [ ] Edit templates in-place
- [ ] Duplicate/fork templates

## Backend API

### GET /api/files/list

Returns grouped file list for a filter.

**Request:**
```
GET /api/files/list?filter=claude&workingDir=/home/matt/projects/TabzChrome
```

**Response:**
```json
{
  "groups": [
    {
      "name": "Global (~/.claude/)",
      "icon": "🌐",
      "files": [
        { "name": "settings.json", "path": "/home/matt/.claude/settings.json", "type": "claude-config" },
        { "name": "Explore.md", "path": "/home/matt/.claude/agents/Explore.md", "type": "agent" }
      ]
    },
    {
      "name": "Project",
      "icon": "📁",
      "files": [
        { "name": "CLAUDE.md", "path": "/home/matt/projects/TabzChrome/CLAUDE.md", "type": "claude-config" },
        { "name": ".mcp.json", "path": "/home/matt/projects/TabzChrome/.mcp.json", "type": "mcp" }
      ]
    }
  ]
}
```

### Filter: prompts

Searches:
- `~/.prompts/**/*.prompty`
- `<workingDir>/.prompts/**/*`
- `<workingDir>/.claude/commands/**/*.md`

### Filter: claude

Searches:
- `~/.claude/` (settings, skills, agents, commands, hooks)
- `<workingDir>/.claude/`
- `<workingDir>/CLAUDE.md`, `CLAUDE.local.md`
- `<workingDir>/.mcp.json`
- `<workingDir>/plugins/` (if exists)

## Frontend Components

| Component | Purpose |
|-----------|---------|
| `utils/claudeFileTypes.ts` | File type detection and color mapping |
| `components/files/FilterBar.tsx` | Filter toggle buttons |
| `components/files/FilteredFileList.tsx` | Grouped list view (non-tree) |
| `contexts/FilesContext.tsx` | Add activeFilter state |

## State Shape

```typescript
// FilesContext additions
interface FilesContextType {
  // Existing...

  // New filter state
  activeFilter: 'all' | 'prompts' | 'claude' | 'favorites'
  setActiveFilter: (filter: FileFilter) => void
  filteredFiles: FilteredFilesResponse | null
  loadFilteredFiles: (filter: FileFilter) => Promise<void>
}

interface FilteredFilesResponse {
  groups: Array<{
    name: string
    icon?: string
    files: Array<{
      name: string
      path: string
      type: ClaudeFileType
    }>
  }>
}
```

## Prompty File Format

```yaml
---
name: Quick Release Notes Generator
description: Generate GitHub release notes from recent commits
inputs:
  version:
    type: string
    description: Version number for this release
  last_version:
    type: string
    description: Previous version tag
---

# Quick Release Notes for {{version}}

## Instructions
1. Review commits since last release:
```bash
git log {{last_version}}..HEAD --oneline
```
...
```

**Key elements:**
- YAML frontmatter: `name`, `description`, `inputs` (optional)
- `{{variable}}` placeholders in body
- Variables auto-detected from `{{...}}` patterns

## Integration Points

- **File viewer**: Existing viewer handles all file types
- **Terminal sending**: Use `chrome.runtime.sendMessage({ type: 'TERMINAL_INPUT', ... })`
- **Working directory**: Use sidebar's working dir for project context
- **Terminal list**: Reuse `useTerminalSessions` hook

## Reference

- **TFE Implementation**: `~/projects/TFE/` - Filter system, file colors
- **TFE styles**: `~/projects/TFE/styles.go` - Color definitions
- **TFE filters**: `~/projects/TFE/favorites.go` - getFilteredFiles()
