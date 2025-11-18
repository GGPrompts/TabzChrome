# Tmux Migration Plan: Custom Splits → Native Tmux Splits

## Project Status: Phase 1 Complete ✅

### Completed (November 11, 2025)
- ✅ **Phase 1**: Added tmux-resurrect and tmux-continuum plugins
  - Installed TPM (Tmux Plugin Manager)
  - Configured auto-save every 15 minutes
  - Configured auto-restore on tmux start
  - Added process restoration (Claude, TFE, LazyGit, etc.)
  - Added scrollback restoration
  - Symlinked config to `~/.tmux-terminal-tabs.conf`

## Migration Overview

**Goal**: Replace ~1000+ lines of custom split code with tmux's native split functionality while maintaining excellent UX through context menu integration.

**Benefits**:
- Simpler codebase (remove complex split state management)
- More powerful (full tmux capabilities: nested splits, windows, etc.)
- Better persistence (tmux-resurrect survives system restarts)
- Proven reliability (tmux is battle-tested)
- Easier maintenance (no custom split bugs)

---

## Remaining Phases

### Phase 2: Add Tmux Split API Endpoints

**File**: `backend/routes/api.js`

Add these endpoints:

```javascript
// Split current pane horizontally
router.post('/api/tmux/split-horizontal/:sessionName', async (req, res) => {
  const { sessionName } = req.params;
  const { command } = req.body; // Optional: command to run in new pane

  try {
    const cmd = command
      ? `tmux split-window -h -t "${sessionName}" "${command}"`
      : `tmux split-window -h -t "${sessionName}"`;

    execSync(cmd);
    res.json({ success: true, message: 'Split horizontal created' });
  } catch (error) {
    console.error('Error splitting horizontal:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Split current pane vertically
router.post('/api/tmux/split-vertical/:sessionName', async (req, res) => {
  const { sessionName } = req.params;
  const { command } = req.body; // Optional: command to run in new pane

  try {
    const cmd = command
      ? `tmux split-window -v -t "${sessionName}" "${command}"`
      : `tmux split-window -v -t "${sessionName}"`;

    execSync(cmd);
    res.json({ success: true, message: 'Split vertical created' });
  } catch (error) {
    console.error('Error splitting vertical:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Close current pane
router.post('/api/tmux/close-pane/:sessionName', async (req, res) => {
  const { sessionName } = req.params;

  try {
    execSync(`tmux kill-pane -t "${sessionName}"`);
    res.json({ success: true, message: 'Pane closed' });
  } catch (error) {
    console.error('Error closing pane:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Navigate to pane (left/right/up/down)
router.post('/api/tmux/select-pane/:sessionName/:direction', async (req, res) => {
  const { sessionName, direction } = req.params;

  const directionMap = {
    'left': '-L',
    'right': '-R',
    'up': '-U',
    'down': '-D'
  };

  const flag = directionMap[direction];
  if (!flag) {
    return res.status(400).json({ success: false, error: 'Invalid direction' });
  }

  try {
    execSync(`tmux select-pane -t "${sessionName}" ${flag}`);
    res.json({ success: true, message: `Moved to ${direction} pane` });
  } catch (error) {
    console.error('Error selecting pane:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Resize pane
router.post('/api/tmux/resize-pane/:sessionName/:direction', async (req, res) => {
  const { sessionName, direction } = req.params;
  const { cells = 5 } = req.body; // Default resize by 5 cells

  const directionMap = {
    'left': '-L',
    'right': '-R',
    'up': '-U',
    'down': '-D'
  };

  const flag = directionMap[direction];
  if (!flag) {
    return res.status(400).json({ success: false, error: 'Invalid direction' });
  }

  try {
    execSync(`tmux resize-pane -t "${sessionName}" ${flag} ${cells}`);
    res.json({ success: true, message: `Resized ${direction} by ${cells} cells` });
  } catch (error) {
    console.error('Error resizing pane:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create new tmux window in session
router.post('/api/tmux/new-window/:sessionName', async (req, res) => {
  const { sessionName } = req.params;
  const { name, command } = req.body;

  try {
    let cmd = `tmux new-window -t "${sessionName}"`;
    if (name) cmd += ` -n "${name}"`;
    if (command) cmd += ` "${command}"`;

    execSync(cmd);
    res.json({ success: true, message: 'New window created' });
  } catch (error) {
    console.error('Error creating window:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// List all panes in session
router.get('/api/tmux/list-panes/:sessionName', async (req, res) => {
  const { sessionName } = req.params;

  try {
    const output = execSync(`tmux list-panes -t "${sessionName}" -F "#{pane_id} #{pane_active} #{pane_width}x#{pane_height}"`).toString();
    const panes = output.trim().split('\n').map(line => {
      const [id, active, dimensions] = line.split(' ');
      return { id, active: active === '1', dimensions };
    });

    res.json({ success: true, panes });
  } catch (error) {
    console.error('Error listing panes:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});
```

**Testing**:
- Test each endpoint via curl or Postman
- Verify splits are created in tmux sessions
- Check error handling

---

### Phase 3: Update Context Menu with Tmux Options

**File**: `src/SimpleTerminalApp.tsx`

**Update context menu items** (around line 1660-1700):

```typescript
// Add these handlers
const handleTmuxSplitHorizontal = async () => {
  if (!contextMenu.terminalId) return;
  const terminal = storedTerminals.find(t => t.id === contextMenu.terminalId);
  if (!terminal || !terminal.sessionName) return;

  try {
    const response = await fetch(`/api/tmux/split-horizontal/${terminal.sessionName}`, {
      method: 'POST',
    });
    const result = await response.json();
    if (result.success) {
      console.log('[SimpleTerminalApp] ✓ Split horizontal created');
    }
  } catch (error) {
    console.error('[SimpleTerminalApp] Error splitting horizontal:', error);
  }
  setContextMenu({ show: false, x: 0, y: 0, terminalId: null });
};

const handleTmuxSplitVertical = async () => {
  if (!contextMenu.terminalId) return;
  const terminal = storedTerminals.find(t => t.id === contextMenu.terminalId);
  if (!terminal || !terminal.sessionName) return;

  try {
    const response = await fetch(`/api/tmux/split-vertical/${terminal.sessionName}`, {
      method: 'POST',
    });
    const result = await response.json();
    if (result.success) {
      console.log('[SimpleTerminalApp] ✓ Split vertical created');
    }
  } catch (error) {
    console.error('[SimpleTerminalApp] Error splitting vertical:', error);
  }
  setContextMenu({ show: false, x: 0, y: 0, terminalId: null });
};

const handleTmuxClosePane = async () => {
  if (!contextMenu.terminalId) return;
  const terminal = storedTerminals.find(t => t.id === contextMenu.terminalId);
  if (!terminal || !terminal.sessionName) return;

  try {
    const response = await fetch(`/api/tmux/close-pane/${terminal.sessionName}`, {
      method: 'POST',
    });
    const result = await response.json();
    if (result.success) {
      console.log('[SimpleTerminalApp] ✓ Pane closed');
    }
  } catch (error) {
    console.error('[SimpleTerminalApp] Error closing pane:', error);
  }
  setContextMenu({ show: false, x: 0, y: 0, terminalId: null });
};

// Update context menu JSX
{contextMenu.show && (
  <div className="context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
    {/* Keep existing options: Detach, Pop out, etc. */}

    {/* Add new tmux split options */}
    <div className="context-menu-divider" />
    <div className="context-menu-section-title">Tmux Splits</div>

    <button className="context-menu-item" onClick={handleTmuxSplitHorizontal}>
      Split Horizontal (|)
    </button>

    <button className="context-menu-item" onClick={handleTmuxSplitVertical}>
      Split Vertical (—)
    </button>

    <button className="context-menu-item" onClick={handleTmuxClosePane}>
      Close Pane
    </button>

    {/* Remove old "Unsplit" option - no longer needed */}
  </div>
)}
```

**Testing**:
- Right-click on tab → verify new options appear
- Test "Split Horizontal" → verify tmux creates horizontal split
- Test "Split Vertical" → verify tmux creates vertical split
- Test "Close Pane" → verify pane closes in tmux

---

### Phase 4: Remove Custom Split Code

**This is the BIG cleanup phase - removes ~1000+ lines!**

#### 4.1 Remove Split Types from Store

**File**: `src/stores/simpleTerminalStore.ts`

**Remove these interfaces**:
```typescript
// DELETE:
export interface SplitPane { ... }
export interface SplitLayout { ... }

// In Terminal interface, DELETE:
splitLayout?: SplitLayout;
isHidden?: boolean;
```

**Remove split-related state**:
```typescript
// DELETE:
focusedTerminalId: string | null;
setFocusedTerminal: (id: string | null) => void;

// Keep only:
terminals: Terminal[];
activeTerminalId: string | null;
addTerminal, removeTerminal, updateTerminal, setActiveTerminal, clearAllTerminals, reorderTerminals
```

#### 4.2 Remove Split Logic from Main App

**File**: `src/SimpleTerminalApp.tsx`

**DELETE these sections**:
- `splitTabInfo` calculation (lines ~304-334)
- `handlePopOutPane` function (lines ~721-772)
- `handleContextUnsplit` function (lines ~602-622)
- All split-related filtering logic in tab bar (lines ~1112-1132)
- All split cleanup in `handleCloseTerminal` (lines ~639-682)
- All split cleanup in `handleContextDetach` (lines ~639-682)
- Split-related props passed to SortableTab: `isSplitActive`, `splitPosition`
- Context menu "Unsplit" option

**KEEP**:
- Basic terminal lifecycle (spawn, close, detach, reattach)
- Simple terminal rendering (one tab = one tmux session)
- Context menu for tmux operations

#### 4.3 Simplify/Remove Drag and Drop

**File**: `src/hooks/useDragDrop.ts`

**Options**:
1. **Keep basic tab reordering** - Remove split detection/blocking, keep center-zone reorder
2. **Remove entirely** - If you don't need drag-to-reorder tabs

**If keeping tab reordering, DELETE**:
- `isTerminalPartOfSplit()` helper
- All edge zone detection for splits
- All blocking logic for split panes
- `handleMerge` function (entire split creation logic)

**Keep only**:
- Basic tab reordering (moving tabs left/right)
- Simple drag state management

#### 4.4 Simplify/Remove SplitLayout Component

**File**: `src/components/SplitLayout.tsx`

**Option 1**: Remove entirely - Each terminal just renders the full tmux session

**Option 2**: Simplify to just render single terminal (no pane logic)

```typescript
// Simplified version - just renders the terminal, tmux handles splits internally
export function SplitLayout({ terminal, terminals, agents, ... }) {
  const agent = agents.find(a => a.id === terminal.agentId);

  if (!agent) return null;

  return (
    <Terminal
      terminal={terminal}
      agent={agent}
      wsRef={wsRef}
      // ... other props
    />
  );
}
```

#### 4.5 Remove Split CSS

**File**: `src/SimpleTerminalApp.css`

**DELETE**:
- `.split-left`, `.split-right`, `.split-middle` styles
- `.split-active` styles
- `.locked` cursor styles (lines ~410-417)
- Split arrow separator styles
- Any other split-specific CSS

---

### Phase 5: Simplify Terminal Rendering

**File**: `src/SimpleTerminalApp.tsx`

**Current complex filtering** (DELETE):
```typescript
visibleTerminals.filter(terminal => {
  const isHidden = terminal.isHidden === true;
  if (isHidden) return false;

  const splitInfo = splitTabInfo.get(terminal.id);
  if (splitInfo && splitInfo.position !== 'single') return true;

  const hasSplitLayout = terminal.splitLayout && terminal.splitLayout.type !== 'single';
  if (hasSplitLayout) return false;

  return true;
})
```

**New simple approach**:
```typescript
// Just render all terminals - each is a standalone tmux session
visibleTerminals.map(terminal => {
  const agent = agents.find(a => a.id === terminal.agentId);

  return (
    <div key={terminal.id} style={{ display: terminal.id === activeTerminalId ? 'block' : 'none' }}>
      <Terminal terminal={terminal} agent={agent} {...props} />
    </div>
  );
})
```

**Result**: One tab = one tmux session. Tmux handles all panes/splits internally.

---

### Phase 6: Update Documentation

#### 6.1 Update CLAUDE.md

**Add section**:
```markdown
## Tmux-Based Architecture

### One Tab = One Tmux Session
- Each terminal tab is a full tmux session
- Tmux handles all splits, panes, and windows internally
- Context menu provides tmux operations (split, navigate, resize)

### Tmux Keybindings
Prefix: `Ctrl+A`

- `Ctrl+A %` - Split horizontal
- `Ctrl+A "` - Split vertical
- `Ctrl+A arrow` - Navigate between panes
- `Ctrl+A x` - Close current pane
- `Ctrl+A c` - New window
- `Ctrl+A n/p` - Next/previous window

### Persistence via tmux-resurrect
- Auto-saves every 15 minutes
- Auto-restores on tmux start
- Survives system restarts
- Manual save: `Ctrl+A Ctrl+S`
- Manual restore: `Ctrl+A Ctrl+R`
```

**Remove**:
- All documentation about custom split implementation
- splitLayout state management details

#### 6.2 Update README.md

Add tmux features to feature list:
```markdown
✅ **Tmux-Powered Terminals** - Full tmux functionality in every tab
✅ **Persistent Splits** - Survive refresh and system restarts via tmux-resurrect
✅ **Context Menu Splits** - Easy split creation without memorizing keybindings
```

#### 6.3 Archive CONTINUATION_PROMPT.md

Move custom split implementation details to an archive:
```bash
mv CONTINUATION_PROMPT.md docs/archive/CUSTOM_SPLITS_IMPLEMENTATION.md
```

Create new CONTINUATION_PROMPT.md with tmux-based architecture.

---

## Testing Checklist

### Tmux Persistence Testing
- [ ] Create tmux split (Ctrl+A %)
- [ ] Wait 15 min OR manual save (Ctrl+A Ctrl+S)
- [ ] Refresh page - splits should persist
- [ ] Kill tmux server (`tmux kill-server`)
- [ ] Restart tmux - splits should auto-restore
- [ ] Reboot system - splits should survive via resurrect

### Context Menu Testing
- [ ] Right-click tab → "Split Horizontal" works
- [ ] Right-click tab → "Split Vertical" works
- [ ] Right-click tab → "Close Pane" works
- [ ] Verify no old "Unsplit" option appears
- [ ] Test with multiple panes (nested splits)

### Terminal Lifecycle Testing
- [ ] Spawn new terminal - creates tmux session
- [ ] Close terminal - cleans up properly
- [ ] Detach terminal - tmux session persists
- [ ] Re-attach terminal - reconnects to session
- [ ] Type `exit` - tab auto-closes (existing functionality)

### Regression Testing
- [ ] No leftover split state bugs
- [ ] No references to `splitLayout` in console errors
- [ ] Tab reordering still works (if kept)
- [ ] Multi-window support still works
- [ ] All terminal types work (Claude Code, TFE, Bash, etc.)

---

## Rollback Plan

**Before starting Phase 4 (removal)**:

```bash
# Create backup branch
git checkout -b backup/custom-splits
git push origin backup/custom-splits

# Return to master
git checkout master
```

If issues arise, you can always:
```bash
git checkout backup/custom-splits
```

---

## Estimated Impact

| Metric | Before | After | Change |
|--------|--------|-------|--------|
| Lines of Code | ~10,000 | ~9,000 | -1,000 (-10%) |
| Split-related files | 5 files | 0 files | -5 files |
| Complexity | High | Low | Much simpler |
| Features | Custom splits | Full tmux | More powerful |
| Persistence | localStorage | tmux-resurrect | System restart proof |
| Maintenance | Complex | Simple | Easier |

---

## Next Steps

1. **Test tmux-resurrect** - Verify persistence works
2. **Phase 2** - Add API endpoints
3. **Phase 3** - Update context menu
4. **Phase 4** - Remove custom code
5. **Phase 5** - Simplify rendering
6. **Phase 6** - Update docs
7. **Test thoroughly**
8. **Commit and push**

---

## Notes

- This migration aligns with "Simplicity Over Features" philosophy in CLAUDE.md
- Reduces maintenance burden significantly
- Unlocks full tmux power (windows, nested splits, etc.)
- Better persistence than localStorage
- Industry-standard tool (tmux) instead of custom implementation

**Status**: Ready to continue with Phase 2 after testing Phase 1!
