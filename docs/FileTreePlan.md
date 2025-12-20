# Files Section for TabzChrome Dashboard

## Overview

Add a "Files" section to the dashboard for browsing and viewing files with syntax highlighting, image support, and tab management. Read-only viewing with "Open in Editor" to spawn terminal editors.

## Key Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Edit mode | Read-only + "Open in Editor" | Security focused, use terminal editors |
| Split view | Optional 2-pane toggle | For ultrawide screens |
| Working dir | Inherit from global header | Consistent with other sections |
| Syntax highlighting | Prism.js | Lightweight (~2KB) vs Monaco (500KB+) |

## Layout

```
+------------------------------------------------------------------+
| Files                                    [Show Hidden] [Refresh]  |
+------------------------------------------------------------------+
| Working Directory: ~/projects/TabzChrome              [Change v]  |
+------------------------------------------------------------------+
|                    |                                              |
| FILE TREE (25%)    |  [Tab1.tsx] [Tab2.md] [image.png] [x]       |
| +--------------+   |  +----------------------------------------+ |
| | > src        |   |  | [Copy] [Open in Editor] [Split View]   | |
| |   App.tsx    |   |  +----------------------------------------+ |
| |   index.ts   |   |  |  1 | import React from 'react'         | |
| | > backend    |   |  |  2 | import { useState } from...       | |
| |   server.js  |   |  |  3 |                                    | |
| | README.md    |   |  |  4 | export function App() {           | |
| +--------------+   |  +----------------------------------------+ |
+------------------------------------------------------------------+
```

## Files to Create

| File | Purpose |
|------|---------|
| `extension/dashboard/sections/Files.tsx` | Main section - layout, state orchestration |
| `extension/dashboard/components/files/FileTree.tsx` | Left sidebar tree navigation |
| `extension/dashboard/components/files/FileTreeItem.tsx` | Recursive tree node component |
| `extension/dashboard/components/files/FileViewer.tsx` | Right side content container |
| `extension/dashboard/components/files/FileTabBar.tsx` | Tab bar for open files |
| `extension/dashboard/components/files/CodeViewer.tsx` | Syntax-highlighted code display |
| `extension/dashboard/components/files/ImageViewer.tsx` | Image display with zoom |
| `extension/dashboard/hooks/useFileTree.ts` | Tree data fetching hook |
| `extension/dashboard/hooks/useOpenFiles.ts` | Open files/tabs management hook |

## Files to Modify

| File | Changes |
|------|---------|
| `extension/dashboard/App.tsx` | Add "files" to Section type, navItems, renderSection |
| `extension/dashboard/hooks/useDashboard.ts` | Add getFileTree, getFileContent, getImageFile functions |

## Implementation Phases

### Phase 1: Foundation
1. Create `Files.tsx` section skeleton
2. Register in `App.tsx` (navItems, Section type, renderSection)
3. Create `useFileTree` hook using `/api/files/tree`
4. Create `FileTree` and `FileTreeItem` components

### Phase 2: File Viewing
5. Create `useOpenFiles` hook for tab/content management
6. Create `FileTabBar` component
7. Create `CodeViewer` with Prism.js syntax highlighting
8. Create `ImageViewer` for base64 images
9. Create `FileViewer` container routing to CodeViewer/ImageViewer

### Phase 3: Actions & Polish
10. Add "Open in Editor" button (spawns terminal with editor)
11. Add split view toggle (2-pane mode)
12. Integrate with global working directory
13. Handle edge cases (binary files, large files, errors)

## Dependencies to Add

```bash
npm install prismjs @types/prismjs
```

## Backend APIs (Already Exist)

```
GET /api/files/tree?path=X&depth=5&showHidden=false  → FileNode tree
GET /api/files/content?path=X                        → { content, fileName, fileSize }
GET /api/files/image?path=X                          → { dataUri, mimeType, size }
```

## State Structure

```typescript
// Files.tsx
interface OpenFile {
  id: string
  path: string
  name: string
  content: string | null
  isImage: boolean
  imageDataUri?: string
  loading: boolean
  error?: string
}

const [openFiles, setOpenFiles] = useState<OpenFile[]>([])
const [activeFileId, setActiveFileId] = useState<string | null>(null)
const [splitView, setSplitView] = useState(false)

// FileTree.tsx
interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[]
}

const [tree, setTree] = useState<FileNode | null>(null)
const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
```

## Open in Editor

```typescript
const handleOpenInEditor = async () => {
  await spawnTerminal({
    name: `Edit: ${activeFile.name}`,
    command: `nano "${activeFile.path}"`,  // or micro, vim, etc.
    workingDir: dirname(activeFile.path),
  })
}
```

## Reference Files

- `extension/dashboard/sections/Profiles.tsx` - Pattern for section structure, working dir integration
- `extension/hooks/useWorkingDirectory.ts` - Reuse for global dir
- `backend/routes/files.js` - API response formats
