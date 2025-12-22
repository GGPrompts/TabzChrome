# Prompts Section for TabzChrome Dashboard

## Status: Planning

**Target:** Dashboard prompt engineering workbench with template library, variable filling, AI enhancement, and direct terminal sending.

## Overview

A "Prompts" section that loads `.prompty` template files, allows filling variables, optionally enhances with AI, and sends directly to terminal sessions.

## Prompty File Format

```yaml
---
name: Quick Release Notes Generator
description: Generate GitHub release notes from recent commits
inputs:
  version:
    type: string
    description: Version number for this release (e.g., v0.6.1)
  last_version:
    type: string
    description: Previous version (e.g., v1.0.0)
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
- YAML frontmatter: `name`, `description`, `inputs` (optional with type/description)
- `{{variable}}` placeholders in body
- Variables can be defined in inputs OR just detected from `{{...}}` in body

## Source Locations

1. `~/.prompts/` - Global user prompts
2. `<project>/.prompts/` - Project-specific prompts (based on working directory)

## UI Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Prompts                                                    [+]  │
├──────────────┬──────────────────────────────────────────────────┤
│ Templates    │  Quick Release Notes Generator                   │
│ ────────     │  ─────────────────────────────                   │
│ 📝 Release   │  "Generate GitHub release notes from commits"    │
│ 📝 Review    │                                                  │
│ 📝 Debug     │  ┌─ Variables ────────────────────────────────┐  │
│              │  │ version:      [v1.2.3        ]             │  │
│ ── Project ──│  │ last_version: [v1.2.2        ]             │  │
│ 📝 Deploy    │  └────────────────────────────────────────────┘  │
│              │                                                  │
│              │  ┌─ Preview ──────────────────────────────────┐  │
│              │  │ # Quick Release Notes for v1.2.3           │  │
│              │  │                                            │  │
│              │  │ ## Instructions                            │  │
│              │  │ 1. Review commits since last release:      │  │
│              │  │ ```bash                                    │  │
│              │  │ git log v1.2.2..HEAD --oneline             │  │
│              │  │ ```                                        │  │
│              │  │                                            │  │
│              │  └────────────────────────────────────────────┘  │
│              │                                                  │
│              │  [🤖 Enhance]  Send to: [Claude Worker ▼]  [▶]   │
└──────────────┴──────────────────────────────────────────────────┘
```

## Features

### Phase 1: Core Template System
- [ ] Backend API: `GET /api/prompts/list` - List prompts from ~/.prompts and project .prompts
- [ ] Backend API: `GET /api/prompts/read?path=X` - Read and parse prompty file
- [ ] Frontend: Prompts section in dashboard nav
- [ ] Frontend: Template list (grouped by global/project)
- [ ] Frontend: Variable form builder (auto-generate from inputs + detected {{vars}})
- [ ] Frontend: Live preview with variables substituted
- [ ] Frontend: Terminal selector dropdown (list active terminals)
- [ ] Frontend: Send to terminal button (via WebSocket)

### Phase 2: Enhanced Editing
- [ ] Large textarea/editor for the filled prompt (editable before send)
- [ ] Syntax highlighting for markdown
- [ ] Copy to clipboard button
- [ ] Save as new template button

### Phase 3: AI Enhancement
- [ ] "Enhance with AI" button
- [ ] Options:
  - **Embedded terminal**: Small xterm running `claude --print` or `codex`
  - **API endpoint**: `/api/prompts/enhance` that pipes through local Claude
  - **Send to tab**: Open in Codex terminal, user copies result back
- [ ] Enhancement presets (expand, clarify, add examples, etc.)

### Phase 4: Template Management
- [ ] Create new template UI
- [ ] Edit existing templates
- [ ] Delete templates
- [ ] Duplicate/fork templates
- [ ] Import/export templates

## Backend APIs

### GET /api/prompts/list
Returns list of prompty files from global and project directories.

```json
{
  "global": [
    { "name": "Quick Release Notes", "path": "~/.prompts/quick-release.prompty", "description": "..." }
  ],
  "project": [
    { "name": "Deploy Script", "path": ".prompts/deploy.prompty", "description": "..." }
  ]
}
```

### GET /api/prompts/read?path=X
Returns parsed prompty file.

```json
{
  "name": "Quick Release Notes Generator",
  "description": "Generate GitHub release notes from recent commits",
  "inputs": {
    "version": { "type": "string", "description": "Version number..." },
    "last_version": { "type": "string", "description": "Previous version..." }
  },
  "detectedVariables": ["version", "last_version"],
  "body": "# Quick Release Notes for {{version}}..."
}
```

### POST /api/prompts/save
Save new or update existing prompty file.

### POST /api/prompts/enhance (Phase 3)
Enhance prompt via local Claude/Codex.

```json
{
  "prompt": "...",
  "mode": "expand" | "clarify" | "examples" | "custom",
  "customInstruction": "..."
}
```

## Frontend Components

| Component | Purpose |
|-----------|---------|
| `sections/Prompts.tsx` | Main section container |
| `components/prompts/TemplateList.tsx` | Left sidebar with template list |
| `components/prompts/VariableForm.tsx` | Form for filling template variables |
| `components/prompts/PromptPreview.tsx` | Live preview with substitution |
| `components/prompts/TerminalSelector.tsx` | Dropdown to pick target terminal |
| `components/prompts/EnhancePanel.tsx` | AI enhancement UI (Phase 3) |

## State Management

```typescript
interface PromptsState {
  templates: PromptyFile[]
  selectedTemplate: PromptyFile | null
  variables: Record<string, string>
  filledPrompt: string
  targetTerminal: string | null
  isEnhancing: boolean
}
```

## Integration Points

- **Terminal sending**: Use existing WebSocket to send to terminal via `sendMessage({ type: 'TERMINAL_INPUT', ... })`
- **Working directory**: Use sidebar's working dir to determine project .prompts location
- **Terminal list**: Reuse `useTerminalSessions` hook to get available terminals

## Reference

- **TFE Implementation**: `~/projects/TFE/` - Original bubbletea implementation
- **Prompty files**: `~/projects/TFE/.prompts/` and `~/projects/TFE/examples/.prompts/`
- **Similar**: VS Code Snippets, TextExpander, Raycast snippets

## Phase 5: 3D Focus Integration

- [ ] **Multi-terminal splits** - Combine selected terminals into tmux splits via `join-pane`
- [ ] **3D Prompt Library** - Floating panel in 3D Focus with template list
- [ ] **Broadcast to all** - Send same prompt to all splits simultaneously
- [ ] **Helix browser** - 3D helix/spiral visualization of prompt library
  - Zoom in/out navigation
  - Grab to select
  - Scroll through hundreds of prompts
  - Could show prompt preview on hover/focus
- [ ] **Split layouts** - 2x2, 3x1, custom arrangements in 3D space

## Open Questions

1. Should enhancement use embedded terminal or API call?
2. Should templates be editable in-place or require "edit mode"?
3. Should there be a "quick send" from sidebar without opening full Prompts section?
4. Keyboard shortcuts for power users?
