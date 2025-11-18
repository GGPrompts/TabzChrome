# PLAN.md - Chrome Extension Roadmap

## ⚠️ IMPORTANT: PROJECT IDENTITY CLARIFICATION

**What This Project Actually Is:**
This is **TabzChrome** - a full-featured Chrome extension port of Tabz with:
- Tab-based terminal interface
- Zustand state management + localStorage
- Settings modal, spawn options editor
- Complete Tabz feature set in browser sidebar

**What This Project Was Originally Planned To Be:**
A lightweight tmux-polling sidebar (see `~/projects/TabzChrome/IMPLEMENTATION_PLAN.md`):
- Simple session list (not tabs)
- Poll tmux every 2s for sessions
- No state management (tmux is truth)
- Single terminal viewer
- 40% less code

**What Happened:**
Development started on Tabz `feat/chrome-extension` branch instead of fresh repo. This inherited all Tabz architecture (tabs, Zustand, localStorage). You built a great Chrome extension - just not the originally planned one!

**See Full Analysis:**
- `COMPARISON_PLANNED_VS_ACTUAL.md` - Detailed comparison
- `~/projects/TabzChrome/IMPLEMENTATION_PLAN.md` - Original vision
- `~/projects/TabzChrome/README.md` - Planned features

**Decision Point:**
Test current implementation to see if you prefer:
1. **Keep as-is** - Full Tabz experience in sidebar (what you have now)
2. **Refactor toward original** - Simplify to tmux-polling session list
3. **Both** - Keep this as TabzChrome, build original vision separately

**Next Session:** Test the extension, decide which direction to take.

---

## 🎯 RECOMMENDED PATH: HYBRID ARCHITECTURE

**Core Principle:** "Works great without tmux, unlocks superpowers with tmux"

### Why Hybrid?
- **Don't limit users** - Not everyone has/wants tmux
- **Unlock power features** - TUI apps (TFE, tmuxplexer), resurrect/continuum for power users
- **Best of both worlds** - Simple terminals OR polling-based session management
- **Use existing badge** - "Use Tmux" toggle already exists in UI

### Two Modes

**Standard Mode (No Tmux):**
- Simple terminal tabs (normal PTY processes)
- Basic persistence (Chrome storage)
- "Close" button kills terminal
- Works out of the box, no dependencies
- Perfect for most users

**Tmux Mode (Tmux Available):**
- Poll `tmux ls | grep "^ctt-"` every 2 seconds
- Auto-restore tabs from tmux sessions
- "Close" button detaches (session stays alive)
- Resurrect/continuum integration
- Perfect for power users with TUI apps

### Implementation Notes

```typescript
// Auto-detect tmux on extension load
const tmuxAvailable = await fetch('/api/tmux/check')
  .then(res => res.json())
  .then(data => data.tmuxAvailable);

if (tmuxAvailable) {
  // Show badge: "🚀 Tmux Mode"
  // Enable polling (useTmuxPolling hook)
  // Sessions survive browser restarts
} else {
  // Show badge: "Standard Mode"
  // Use event-based tabs
  // Store tabs in Chrome storage
}
```

### Benefits

**For Non-Tmux Users:**
- ✅ Works immediately, no setup
- ✅ No tmux learning curve
- ✅ All Chrome extension features
- ✅ Simple mental model (tabs = terminals)

**For Tmux Users (Power Users):**
- 🚀 Auto-detects tmux availability
- 🚀 Polling architecture (no state sync bugs)
- 🚀 TUI apps (TFE, tmuxplexer) work perfectly
- 🚀 Spawn from anywhere (CLI, tmuxplexer, extension)
- 🚀 True persistence with resurrect/continuum

**For Everyone:**
- ✅ Same extension for both use cases
- ✅ Upgrade path (install tmux → get superpowers)
- ✅ No forced dependencies
- ✅ Not limiting anyone

### State Management Answer

**Standard Mode:** Minimal React state (current active tab, UI state)
**Tmux Mode:** None! Polling means tmux is the only source of truth

### Next Steps
1. Test current extension with "Use Tmux" toggle
2. Add `/api/tmux/check` endpoint
3. Implement mode detection on load
4. Add polling hook for tmux mode
5. Update UI badge to show current mode
6. Document both modes in README

---

## 🚨 CURRENT STATUS - READ FIRST

**Status**: ✅ **v1.0.1 COMPLETE** - All Planned Features Shipped

**Date**: November 18, 2025
**Version**: v1.0.1
**Branch**: `feat/chrome-extension`

### What's Working 🎉
- ✅ Chrome side panel integration (sidebar persists across tabs)
- ✅ Terminal persistence (survive extension reloads)
- ✅ Tmux integration (sessions survive, auto-restore on reload)
- ✅ Session restoration (`ctt-` prefix for easy cleanup)
- ✅ Settings Modal (General + Spawn Options tabs)
- ✅ Spawn options editor (add/edit/delete in UI)
- ✅ Font family support (6 options)
- ✅ Immediate settings updates (no reload needed)
- ✅ Commands panel (spawn + clipboard commands)
- ✅ Tab names show labels (not IDs)
- ✅ Terminal auto-fit on spawn
- ✅ Global "Use Tmux" toggle

### Recent Completions (v1.0.1 - Nov 18, 2025) 🎉
- ✅ Spawn options editing in Settings UI
- ✅ Font family dropdown (JetBrains Mono, Fira Code, etc.)
- ✅ Global "Use Tmux" toggle in header
- ✅ Session persistence and restoration
- ✅ Terminal IDs with `ctt-` prefix
- ✅ Settings apply immediately (no reload)
- ✅ Terminal auto-fit with ResizeObserver
- ✅ Tab names display friendly labels
- ✅ Font family updates instantly

**For completed features, see [CHANGELOG.md](CHANGELOG.md)**

---

## 🎯 Future Work (Optional)

**Priority:** Low (Nice-to-have enhancements)
**Estimated Time:** 4-6 hours total

### 1. Keyboard Shortcuts (⌨️)

**Goal:** Add browser-safe keyboard shortcuts for common operations

**Shortcuts to Add:**
- `Alt+T` - Open spawn menu
- `Alt+W` - Close active tab
- `Alt+1-9` - Jump to tab 1-9
- `Alt+Tab` - Next tab
- `Alt+Shift+Tab` - Previous tab

**Why Alt instead of Ctrl?**
- Ctrl+T, Ctrl+W = Browser tab management (can't override)
- Alt modifier is safe and doesn't conflict

**Implementation:**
```typescript
// Create: extension/hooks/useKeyboardShortcuts.ts
// Similar to web app's keyboard shortcuts
// Use chrome.commands API for global shortcuts
```

**Estimated Time:** 2 hours

---

### 2. Import/Export Spawn Options

**Goal:** Share spawn options across extension installations

**Features:**
- Export button in Settings → Spawn Options
- Downloads JSON file with all spawn options
- Import button loads JSON and merges with existing
- Useful for:
  - Backup before extension reinstall
  - Sharing configs between machines
  - Resetting to defaults (import spawn-options.json)

**Implementation:**
```typescript
// Add to extension/components/SettingsModal.tsx
const handleExport = () => {
  const json = JSON.stringify(spawnOptions, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'spawn-options.json'
  a.click()
}

const handleImport = (file: File) => {
  const reader = new FileReader()
  reader.onload = (e) => {
    const imported = JSON.parse(e.target?.result as string)
    setSpawnOptions([...spawnOptions, ...imported])
  }
  reader.readAsText(file)
}
```

**Estimated Time:** 1 hour

---

### 3. Tab Context Menu

**Goal:** Right-click menu on tabs for quick actions

**Menu Options:**
- Rename tab (manual text input)
- Refresh terminal (refit)
- Close tab
- (Optional) Close other tabs
- (Optional) Close tabs to right

**Implementation:**
```typescript
// Create: extension/components/TabContextMenu.tsx
// Triggered by onContextMenu on tab elements
// Position near cursor, glassmorphic design
```

**Estimated Time:** 1-2 hours

---

### 4. Working Directory Persistence

**Goal:** Remember last used working directory per spawn option

**Features:**
- Commands panel remembers last working dir input
- Persists in Chrome storage
- Pre-fills on next spawn
- Per-spawn-option or global (user choice)

**Implementation:**
```typescript
// Update: extension/components/QuickCommandsPanel.tsx
// Store in chrome.storage.local:
{
  lastWorkingDirs: {
    'bash': '/home/matt/projects',
    'claude-code': '/home/matt/projects/my-app'
  }
}
```

**Estimated Time:** 30 minutes

---

## 📋 Non-Goals (Out of Scope)

These features exist in the web app but are intentionally excluded from the Chrome extension:

### ❌ Split Terminals
- **Reason:** Chrome side panel is narrow, splits would be cramped
- **Alternative:** Use tmux splits within a single terminal
- **Use web app if you need splits**

### ❌ Multi-Window Support
- **Reason:** Chrome extension has one sidebar per window (by design)
- **Alternative:** Open multiple Chrome windows if needed

### ❌ Background Gradients & Transparency
- **Reason:** Adds complexity, chrome extension should be simple
- **Alternative:** Use web app for aesthetic customization

### ❌ Per-Terminal Customization
- **Reason:** Settings apply globally (simpler UX)
- **Alternative:** Use spawn options if you need per-terminal fonts

### ❌ Project Management
- **Reason:** Chrome extension doesn't have project dropdown (yet)
- **Alternative:** Use working directory override in Commands panel

### ❌ Tab Drag-and-Drop Reordering
- **Reason:** Chrome side panel is narrow, drag targets would be tiny
- **Alternative:** Spawn terminals in desired order

---

## 🔧 Technical Debt (If Time Permits)

### Code Quality
- ✅ Settings already modular (General + Spawn Options tabs)
- ✅ Terminal component clean (uses ResizeObserver)
- ⏭️ Add JSDoc comments to components
- ⏭️ Extract clipboard commands to constants file

### Testing
- ⏭️ Add basic smoke tests (extension loads, sidebar opens)
- ⏭️ Test spawn options CRUD (add/edit/delete)
- ⏭️ Test settings persistence across reloads

### Performance
- ✅ Settings apply immediately (no reload)
- ✅ Terminal auto-fit on spawn
- ✅ ResizeObserver for auto-fit on resize

---

## 📚 Documentation Updates Needed

### CLAUDE.md
- ✅ Document `ctt-` terminal ID prefix
- ✅ Updated spawn options approach (JSON fallback + Chrome storage)
- ⏭️ Add troubleshooting section (common issues)

### README.md
- ⏭️ Update with v1.0.1 features (spawn options editor, font family)
- ⏭️ Add screenshots of Settings modal tabs
- ⏭️ Document tmux session restoration

### LESSONS_LEARNED.md
- ⏭️ Add lesson on Chrome storage vs JSON approach
- ⏭️ Document ResizeObserver pattern for terminals
- ⏭️ Document settings update flow (useEffect dependencies)

---

## 🚀 Release Checklist (v1.0.2)

When ready for next release:

- [ ] Run full test pass (manual testing)
- [ ] Update version in `manifest.json`
- [ ] Update CHANGELOG.md with new version
- [ ] Build extension: `npm run build:extension`
- [ ] Copy to Windows: `rsync` command
- [ ] Test in Chrome (load unpacked)
- [ ] Commit and tag: `git tag v1.0.2`
- [ ] Push to GitHub: `git push origin feat/chrome-extension --tags`

---

## 📊 Metrics

| Metric | Value |
|--------|-------|
| Extension Size | ~600KB (built) |
| Dependencies | Shared with web app |
| Load Time | <1s |
| Terminal Types | 18 (from spawn-options.json) |
| Clipboard Commands | 16 (hardcoded) |
| Settings Options | 3 (font size, font family, theme) |
| Spawn Options Capacity | Unlimited (Chrome storage) |

---

## 🔍 Future Considerations

### Chrome Manifest V3 Compliance
- ✅ Already using Manifest V3
- ✅ Service worker instead of background page
- ✅ Chrome storage API instead of localStorage
- ✅ Chrome runtime messaging

### Chrome Web Store Publication
If publishing to Chrome Web Store:
- Add privacy policy (no data collected)
- Add detailed description + screenshots
- Set up OAuth if needed (not required for this extension)
- Test on multiple Chrome versions

### Firefox Port
To port to Firefox:
- Replace `chrome.*` with `browser.*` (Firefox API)
- Update manifest.json format (minor differences)
- Test side panel API (may need fallback)

---

**Last Updated**: November 18, 2025
**Maintained By**: Claude Code (with human oversight)
**Repository**: https://github.com/GGPrompts/terminal-tabs-extension

---

## 📊 Quick Reference: Two Projects

| Aspect | **terminal-tabs-extension** (Current) | **TabzChrome** (Original Plan) |
|--------|---------------------------------------|-------------------------------|
| **Location** | `~/projects/terminal-tabs-extension` | `~/projects/TabzChrome` |
| **Repo** | `Tabz` (branch: feat/chrome-extension) | `TabzChrome` |
| **Architecture** | Full Tabz (tabs, Zustand, localStorage) | Tmux-polling (session list) |
| **UI Pattern** | Tab bar with multiple terminals | Session list + single viewer |
| **State** | Zustand + localStorage + Chrome storage | Poll tmux only |
| **Complexity** | Full feature set | 40% less code |
| **Port** | 8127 | 8129 |
| **Status** | ✅ Built and working | 📋 Planning docs only |

**Test Tomorrow:**
1. Use the current extension during work
2. Pay attention to:
   - Do you like having multiple terminal tabs?
   - Is state management helpful or overkill?
   - Would a simple session list be better?
3. Decide which approach to keep/pursue

**Files to Reference:**
- `COMPARISON_PLANNED_VS_ACTUAL.md` - Full analysis
- `~/projects/TabzChrome/IMPLEMENTATION_PLAN.md` - Original vision details
- `~/projects/TabzChrome/README.md` - Planned UX
