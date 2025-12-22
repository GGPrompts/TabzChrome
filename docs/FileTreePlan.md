# Files Section for TabzChrome Dashboard

## Status: Phase 1, 2, 3, 3.5 & 4 Complete ✅

**Completed:** 2025-12-22
**Source:** Adapted from Opustrator's FileTree component

## Overview

Add a "Files" section to the dashboard for browsing and viewing files with syntax highlighting, image support, and tab management. Read-only viewing with "Open in Editor" to spawn terminal editors.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Edit mode | Read-only + "Open in Editor" | Security focused, use terminal editors |
| Split view | Optional 2-pane toggle | For ultrawide screens |
| Working dir | Shared via `useWorkingDirectory` hook | Syncs with Profiles section |
| Syntax highlighting | react-syntax-highlighter + vscDarkPlus | 50+ languages supported |
| Markdown | ReactMarkdown + remark-gfm | GFM tables, code blocks |

## Layout

```
+------------------------------------------------------------------+
| Working Directory: ~/projects/TabzChrome              [Change v]  |
+------------------------------------------------------------------+
|                    |                                              |
| FILE TREE (w-72)   |  [Tab1.tsx] [Tab2.md] [image.png] [x]       |
| +--------------+   |  +----------------------------------------+ |
| | > src        |   |  | [Copy] [Open in Editor]                 | |
| |   App.tsx    |   |  +----------------------------------------+ |
| |   index.ts   |   |  |  1 | import React from 'react'         | |
| | > backend    |   |  |  2 | import { useState } from...       | |
| |   server.js  |   |  |  3 |                                    | |
| | README.md    |   |  |  4 | export function App() {           | |
| +--------------+   |  +----------------------------------------+ |
+------------------------------------------------------------------+
```

## Files Created

| File | Purpose | Status |
|------|---------|--------|
| `extension/dashboard/sections/Files.tsx` | Main section - layout, tabs, viewer | ✅ Done |
| `extension/dashboard/components/files/FileTree.tsx` | Left sidebar tree navigation | ✅ Done |
| `extension/dashboard/contexts/FilesContext.tsx` | Persistent state for caching | ✅ Done |
| `extension/dashboard/App.tsx` | Added "files" to Section type, navItems, section persistence | ✅ Done |
| `extension/dashboard/utils/fileTypeUtils.ts` | Extension to language/type mapping | ✅ Done |
| `extension/dashboard/hooks/useFileViewerSettings.ts` | Font size/family settings hook | ✅ Done |
| `extension/hooks/useWorkingDirectory.ts` | Added `isLoaded` flag for timing | ✅ Done |
| `backend/routes/files.js` | Tree, content, image, video endpoints | ✅ Done |

## Implementation Phases

### Phase 1: Foundation ✅

- [x] Create `Files.tsx` section skeleton
- [x] Register in `App.tsx` (navItems, Section type, renderSection)
- [x] Create `FileTree` component (adapted from Opustrator)
- [x] Tree navigation with expand/collapse
- [x] Search filter
- [x] Show/hide hidden files toggle
- [x] Home/Up/Refresh/Collapse buttons

### Phase 2: File Viewing ✅

- [x] Tab bar for multiple open files
- [x] Close tabs with X button
- [x] Code content display (monospace, scrollable)
- [x] Image viewer for png/jpg/gif/svg/webp
- [x] Copy button for code content
- [x] "Open in Editor" spawns terminal with nano
- [x] Working directory dropdown (shared with Profiles)
- [x] Syncs with `useWorkingDirectory` hook

### Phase 3: Polish ✅

- [x] Syntax highlighting (react-syntax-highlighter + vscDarkPlus theme)
- [x] Markdown rendering (ReactMarkdown + remark-gfm for GFM support)
- [x] Line numbers for code files
- [x] Font size/family settings (in Files header dropdown)
- [x] File tree depth setting (in Settings page)
- [x] Image viewer with zoom controls (Fit, 100%, +/- zoom)
- [x] Image download button
- [x] Image dimensions display
- [x] Uses $EDITOR env var for "Open in Editor" (fallback: nano)

### Phase 3.5: Media & Caching ✅

- [x] **Video file support** - mp4, webm, mov, avi, mkv with native player controls
- [x] **CSV table viewer** - Parsed with proper quote handling, sticky headers, hover rows
- [x] **Markdown link navigation** - Relative links (e.g., `[changelog](CHANGELOG.md)`) open in file viewer
- [x] **Icon colors in tabs** - Tab icons match file tree colors (green=code, blue=md, orange=json, purple=video, emerald=csv)
- [x] **FilesContext for caching** - Open files and file tree persist across dashboard tab switches
- [x] **Dashboard section persistence** - Active section saved to localStorage, survives page refresh
- [x] **Sidebar collapsed state** - Also persisted to localStorage

### Phase 4: File Filters & Favorites ✅

- [x] **TFE-style filter buttons** in Files header: All, Prompts, Claude, Favorites
- [x] **Claude filter** - Shows ~/.claude/, project .claude/, CLAUDE.md, .mcp.json, plugins
- [x] **Prompts filter** - Shows ~/.prompts/, project .prompts/, .claude/commands/
- [x] **Favorites filter** - Shows user-starred files (persisted to localStorage)
- [x] **Star button** in file viewer toolbar - Toggle favorites on any open file
- [x] **TFE-inspired colors** in tree view:
  - Orange: CLAUDE.md, .claude/, settings.json
  - Pink: .prompts/, .prompty files
  - Purple: agents
  - Teal: skills
  - Green: hooks
  - Cyan: .mcp.json
  - Amber: plugins
- [x] **Relative paths** in filtered views (e.g., `conductor/plugin.json` not just `plugin.json`)
- [x] **Smart icons** per file type in filtered views
- [x] **Backend API** - GET /api/files/list?filter=X&workingDir=Y
- [x] **Broken symlink handling** - Skips broken symlinks in filtered results

### Phase 5: Future Enhancements

- [ ] Split view toggle (2-pane mode for ultrawide)
- [ ] Keyboard navigation in tree
- [ ] Context menu (right-click)
- [ ] File size/modified date display in tree

## Backend APIs Used

```
GET /api/files/tree?path=X&depth=5&showHidden=false  → FileNode tree
GET /api/files/content?path=X                        → { content, fileName, fileSize }
GET /api/files/image?path=X                          → { dataUri, mimeType, size }
GET /api/files/video?path=X                          → { dataUri, mimeType, size } (100MB limit)
GET /api/files/list?filter=X&workingDir=Y            → { groups: [{ name, icon, files }] }
```

**Backend Enhancements:**
- Added tilde expansion in `/api/files/tree` to support `~` as home directory
- Added `/api/files/video` endpoint for base64 video serving (mp4, webm, mov, avi, mkv, m4v)

## State Structure

```typescript
// FilesContext.tsx - Persistent state across tab switches
interface OpenFile {
  id: string
  path: string
  name: string
  content: string | null
  fileType: FileType  // 'code' | 'markdown' | 'json' | 'image' | 'video' | 'csv' | 'text'
  mediaDataUri?: string  // for images and videos
  loading: boolean
  error?: string
}

// From FilesContext (persists across dashboard tab switches)
const { openFiles, activeFileId, openFile, closeFile, fileTree, fileTreePath } = useFilesContext()

// Shared working directory (persists to Chrome storage)
const { globalWorkingDir, setGlobalWorkingDir, recentDirs, isLoaded } = useWorkingDirectory()
```

## Open in Editor

Uses `$EDITOR` environment variable with fallback to `nano`:

```typescript
chrome.runtime?.sendMessage({
  type: 'SPAWN_TERMINAL',
  name: `Edit: ${activeFile.name}`,
  command: `${EDITOR:-nano} "${activeFile.path}"`,
  workingDir: dir,
})
```

## Reference Files

- `extension/dashboard/sections/Profiles.tsx` - Working dir dropdown pattern
- `extension/hooks/useWorkingDirectory.ts` - Shared working directory state
- `backend/routes/files.js` - API endpoints
- `~/projects/opustrator/frontend/src/components/FileTree.tsx` - Original source
