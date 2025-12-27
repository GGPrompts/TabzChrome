# Git Operations Feature Plan

**Branch**: `GitOperations`
**Created**: 2025-12-27
**Status**: Planning Phase

---

## Overview

Add a VS Code-style **Source Control** panel to TabzChrome that shows all git repositories in a configurable directory (default: `~/projects`) with their status, recent commits, and quick actions.

### Inspiration

VS Code's "Source Control Repositories" view when opening a parent folder:
- Lists all repos with status indicators (clean/dirty/ahead/behind)
- Shows staged/unstaged changes per repo
- Commit history with author and message
- Quick actions (commit, push, pull, sync)
- Real-time updates via file watchers

---

## Architecture

### Backend (New Route: `backend/routes/git.js`)

Following the pattern established by `files.js`:

```javascript
// backend/routes/git.js
const express = require('express');
const router = express.Router();
const { exec, spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const chokidar = require('chokidar'); // For file watching (already in deps)

// Configuration
const DEFAULT_PROJECTS_DIR = path.join(process.env.HOME, 'projects');

module.exports = (wss) => {
  // ... route handlers
  return router;
};
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/git/repos` | List all repos with status |
| `GET` | `/api/git/repos/:repo/status` | Detailed status for one repo |
| `GET` | `/api/git/repos/:repo/log` | Recent commits (default: 20) |
| `GET` | `/api/git/repos/:repo/diff` | Current diff (staged + unstaged) |
| `GET` | `/api/git/repos/:repo/branches` | List branches |
| `POST` | `/api/git/repos/:repo/stage` | Stage files |
| `POST` | `/api/git/repos/:repo/unstage` | Unstage files |
| `POST` | `/api/git/repos/:repo/commit` | Create commit |
| `POST` | `/api/git/repos/:repo/push` | Push to remote |
| `POST` | `/api/git/repos/:repo/pull` | Pull from remote |
| `POST` | `/api/git/repos/:repo/fetch` | Fetch from remote |
| `POST` | `/api/git/repos/:repo/checkout` | Checkout branch |
| `POST` | `/api/git/repos/:repo/stash` | Stash changes |
| `POST` | `/api/git/repos/:repo/stash-pop` | Pop stash |

### WebSocket Events (Real-time Updates)

```javascript
// Server -> Client
{
  type: 'git:repo-changed',
  data: {
    repo: 'TabzChrome',
    status: 'dirty',
    changes: { staged: 2, unstaged: 5 }
  }
}

// Client -> Server
{
  type: 'git:watch-repo',
  data: { repo: 'TabzChrome' }
}
```

---

## Frontend Components

### New Dashboard Section: `extension/dashboard/sections/Git.tsx`

```
┌─────────────────────────────────────────────────────────────┐
│ Source Control                                    [⟳] [⚙]  │
├─────────────────────────────────────────────────────────────┤
│ 📁 ~/projects                                    60 repos   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ ┌─ TabzChrome ─────────────────────── main ● 3↑ ──────────┐│
│ │  ✓ Clean • Last commit: 2h ago                          ││
│ │  "Add git operations plan"                              ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ opustrator ─────────────────────── main ● ─────────────┐│
│ │  ⚠ 5 changes • 2 staged                                 ││
│ │  ├─ M src/App.tsx                                       ││
│ │  ├─ M src/hooks/useAuth.ts                              ││
│ │  └─ + src/components/NewFeature.tsx                     ││
│ │  [Stage All] [Commit] [Push]                            ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ┌─ TFE ────────────────────────────── main ● 1↓ ──────────┐│
│ │  ↓ Behind origin by 1 commit                            ││
│ │  [Pull] [Fetch]                                         ││
│ └─────────────────────────────────────────────────────────┘│
│                                                             │
│ ... (collapsible list of all 60 repos)                     │
└─────────────────────────────────────────────────────────────┘
```

### Component Hierarchy

```
extension/dashboard/sections/Git.tsx
├── components/git/
│   ├── GitRepoList.tsx          # Main list of repositories
│   ├── GitRepoCard.tsx          # Individual repo card (expandable)
│   ├── GitStatusBadge.tsx       # Clean/dirty/ahead/behind indicator
│   ├── GitChangesTree.tsx       # File tree of changes
│   ├── GitCommitForm.tsx        # Commit message input + actions
│   ├── GitCommitHistory.tsx     # Recent commits list
│   ├── GitBranchSelector.tsx    # Branch dropdown
│   └── GitDiffViewer.tsx        # Side-by-side or unified diff
├── hooks/
│   ├── useGitRepos.ts           # Fetch & cache repo list
│   ├── useGitStatus.ts          # Real-time status for single repo
│   └── useGitOperations.ts      # Commit, push, pull actions
└── contexts/
    └── GitContext.tsx           # Global git state & WebSocket
```

### Sidepanel Integration (Optional)

Add a compact git status indicator to the sidepanel header:

```
┌─────────────────────────────────────┐
│ Tabz                    [Git: 3⚠]  │  <- Click opens Git panel
├─────────────────────────────────────┤
```

---

## Implementation Phases

### Phase 1: Backend API (Core)

1. **Create `backend/routes/git.js`**
   - Repository discovery (scan for `.git` directories)
   - Status endpoint (parse `git status --porcelain`)
   - Log endpoint (parse `git log --oneline`)

2. **Add to server.js**
   ```javascript
   const gitRoutes = require('./routes/git')(wss);
   app.use('/api/git', gitRoutes);
   ```

3. **Git command helpers**
   ```javascript
   // backend/modules/git-utils.js
   async function getRepoStatus(repoPath) { ... }
   async function getRepoLog(repoPath, limit = 20) { ... }
   async function parseGitStatus(output) { ... }
   ```

### Phase 2: Frontend List View

1. **Create dashboard section**
   - `Git.tsx` - Main section with repo list
   - `GitRepoCard.tsx` - Collapsible card per repo
   - `useGitRepos.ts` - Hook to fetch repos

2. **Add to dashboard navigation**
   - New icon in sidebar
   - Route: `/dashboard/git`

### Phase 3: Git Actions

1. **Commit workflow**
   - Stage/unstage individual files
   - Commit message input
   - Commit button with validation

2. **Sync actions**
   - Push with confirmation
   - Pull with conflict detection
   - Fetch for status update

### Phase 4: Real-time Updates

1. **File watching**
   - Watch `.git` directories for changes
   - Debounce status updates (500ms)
   - WebSocket broadcast on change

2. **WebSocket integration**
   - Subscribe to repo changes
   - Optimistic UI updates

### Phase 5: Advanced Features (Future)

- Branch management (create, delete, merge)
- Stash management
- Diff viewer with syntax highlighting
- Commit graph visualization
- Multi-repo batch operations
- GitHub/GitLab integration (PR status)

---

## Technical Decisions

### Why Not Use a Git Library?

Options considered:
- **isomorphic-git**: Pure JS, but large bundle, slower than native git
- **simple-git**: Node wrapper around git CLI, good balance
- **Native git CLI**: Fastest, most reliable, already installed

**Decision**: Use native `git` CLI via `child_process.exec()` - same pattern as tmux integration.

### Caching Strategy

```javascript
// In-memory cache with TTL
const repoCache = new Map();
const CACHE_TTL = 5000; // 5 seconds

async function getRepoStatus(repoPath) {
  const cached = repoCache.get(repoPath);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  const status = await fetchGitStatus(repoPath);
  repoCache.set(repoPath, { data: status, timestamp: Date.now() });
  return status;
}
```

### Error Handling

```javascript
// Graceful degradation for non-git directories
try {
  const status = await getRepoStatus(path);
  return { type: 'git', ...status };
} catch (err) {
  if (err.message.includes('not a git repository')) {
    return { type: 'directory', path };
  }
  throw err;
}
```

---

## File Structure (New Files)

```
backend/
├── routes/
│   └── git.js                    # NEW: Git API endpoints
├── modules/
│   └── git-utils.js              # NEW: Git command helpers

extension/
├── dashboard/
│   ├── sections/
│   │   └── Git.tsx               # NEW: Git dashboard section
│   └── components/
│       └── git/
│           ├── GitRepoList.tsx   # NEW
│           ├── GitRepoCard.tsx   # NEW
│           ├── GitStatusBadge.tsx # NEW
│           ├── GitChangesTree.tsx # NEW
│           ├── GitCommitForm.tsx  # NEW
│           └── GitCommitHistory.tsx # NEW
├── hooks/
│   ├── useGitRepos.ts            # NEW
│   ├── useGitStatus.ts           # NEW
│   └── useGitOperations.ts       # NEW
└── contexts/
    └── GitContext.tsx            # NEW
```

---

## API Response Examples

### GET /api/git/repos

```json
{
  "success": true,
  "data": {
    "projectsDir": "/home/matt/projects",
    "repos": [
      {
        "name": "TabzChrome",
        "path": "/home/matt/projects/TabzChrome",
        "branch": "main",
        "status": "clean",
        "ahead": 0,
        "behind": 0,
        "lastCommit": {
          "hash": "abc1234",
          "message": "Add git operations plan",
          "author": "Matt",
          "date": "2025-12-27T13:30:00Z"
        }
      },
      {
        "name": "opustrator",
        "path": "/home/matt/projects/opustrator",
        "branch": "main",
        "status": "dirty",
        "ahead": 3,
        "behind": 0,
        "changes": {
          "staged": 2,
          "unstaged": 5,
          "untracked": 1
        }
      }
    ]
  }
}
```

### GET /api/git/repos/:repo/status

```json
{
  "success": true,
  "data": {
    "branch": "main",
    "tracking": "origin/main",
    "ahead": 3,
    "behind": 0,
    "staged": [
      { "path": "src/App.tsx", "status": "M" },
      { "path": "src/new.ts", "status": "A" }
    ],
    "unstaged": [
      { "path": "README.md", "status": "M" }
    ],
    "untracked": [
      { "path": "temp.log" }
    ]
  }
}
```

### GET /api/git/repos/:repo/log

```json
{
  "success": true,
  "data": {
    "commits": [
      {
        "hash": "abc1234",
        "shortHash": "abc1234",
        "message": "Add git operations plan",
        "author": "Matt",
        "email": "matt@example.com",
        "date": "2025-12-27T13:30:00Z",
        "refs": ["HEAD", "main", "origin/main"]
      }
    ]
  }
}
```

---

## Security Considerations

1. **Path validation** - Prevent directory traversal attacks
2. **Auth token** - Use existing `/tmp/tabz-auth-token` pattern
3. **Command sanitization** - Escape user input in git commands
4. **Rate limiting** - Prevent git command flooding

```javascript
// Example path validation
function validateRepoPath(repoName) {
  if (repoName.includes('..') || repoName.includes('/')) {
    throw new Error('Invalid repository name');
  }
  const fullPath = path.join(projectsDir, repoName);
  if (!fullPath.startsWith(projectsDir)) {
    throw new Error('Path traversal detected');
  }
  return fullPath;
}
```

---

## Testing Strategy

1. **Unit tests** - Git parsing functions
2. **Integration tests** - API endpoints with test repos
3. **E2E tests** - Full workflow (stage → commit → push)

```javascript
// Example test
describe('git-utils', () => {
  it('parses git status correctly', () => {
    const output = ' M src/App.tsx\n?? temp.log\n';
    const parsed = parseGitStatus(output);
    expect(parsed.unstaged).toHaveLength(1);
    expect(parsed.untracked).toHaveLength(1);
  });
});
```

---

## Configuration

Add to `backend/.settings.json`:

```json
{
  "git": {
    "projectsDir": "~/projects",
    "scanDepth": 1,
    "excludeDirs": ["node_modules", ".git", "dist"],
    "refreshInterval": 30000,
    "enableFileWatching": true
  }
}
```

---

## Dependencies

**Backend** (already available):
- `child_process` (Node built-in)
- `chokidar` (file watching - check if in deps)

**Frontend** (already available):
- React hooks pattern
- WebSocket integration
- Tailwind CSS

**May need to add**:
- None expected - pure git CLI approach

---

## Next Steps

1. [ ] Review this plan and adjust scope
2. [ ] Create `backend/routes/git.js` with basic `/repos` endpoint
3. [ ] Create `backend/modules/git-utils.js` with parsing helpers
4. [ ] Add route to `server.js`
5. [ ] Test API with curl
6. [ ] Create basic `Git.tsx` dashboard section
7. [ ] Iterate on UI/UX

---

## References

- [VS Code SCM API](https://code.visualstudio.com/api/extension-guides/scm-provider)
- [Git Porcelain Format](https://git-scm.com/docs/git-status#_porcelain_format_version_1)
- [TabzChrome Files Route](backend/routes/files.js) - Pattern to follow

---

*This plan is a starting point. Feel free to modify scope, add features, or simplify as needed.*
