# PLAN.md - TabzChrome Roadmap

**Last Updated**: December 4, 2025
**Current Version**: 2.2.0
**Status**: Preparing for Public Release

---

## Phase 1: Getting Ready to Share

### 1.1 System Requirements Documentation

**Goal**: Clear documentation so users know if TabzChrome will work for them.

**Required:**
- [ ] Document minimum requirements in README.md:
  - Chrome browser (Manifest V3 compatible)
  - WSL2 or native Linux for backend
  - Node.js (document minimum version)
  - tmux (for terminal persistence)

**Optional dependencies:**
- [ ] Nerd Fonts (for icons in terminal)
- [ ] TUI apps referenced in default profiles (lazygit, htop, etc.)

**Tasks:**
- [ ] Test minimum Node.js version
- [ ] Verify Chrome version requirements
- [ ] Add "Requirements" section to README.md
- [ ] Add troubleshooting for common setup issues

### 1.2 Codebase Cleanup Audit

**Goal**: Remove outdated docs, scripts, and personal paths before sharing.

**Documentation cleanup:**
- [ ] Audit `docs/` folder - remove internal-only planning docs
- [ ] Audit `docs/archived/` - decide what to keep vs delete
- [ ] Audit `docs/bugs/` - remove resolved investigation notes
- [ ] Remove outdated references to old project names
- [ ] Update any remaining personal paths (`~/projects/...`)

**Config cleanup:**
- [ ] Review `spawn-options.json` - remove personal paths, make generic
- [ ] Review `public/spawn-options.json` - same
- [ ] Check for hardcoded localhost assumptions

**Scripts cleanup:**
- [ ] Audit `scripts/` folder for unused/outdated scripts
- [ ] Remove development-only utilities not needed by users

**Dead code:**
- [ ] Search for TODO/FIXME comments
- [ ] Check for unused npm dependencies
- [ ] Remove code for deleted features (Commands Panel references, etc.)

### 1.3 Test Suite

**Goal**: Ensure tests run and catch regressions, especially xterm.js issues.

**Current state:**
- Tests exist in `tests/` (inherited from web app)
- May have web-app-specific tests that don't apply to Chrome extension

**Tasks:**
- [ ] Run existing test suite - see what passes/fails
- [ ] Remove/update tests for features that don't exist in Chrome extension
- [ ] Add Chrome extension-specific tests:
  - [ ] Extension loads successfully
  - [ ] Sidebar opens
  - [ ] Terminal spawns with profile
  - [ ] WebSocket connection established
  - [ ] Settings persistence (Chrome storage)
- [ ] Add xterm.js regression tests:
  - [ ] Terminal resize handling
  - [ ] Copy/paste functionality
  - [ ] Reconnection behavior
- [ ] Document how to run tests in README

### 1.4 README.md Polish

**Goal**: User-friendly documentation for new users.

- [ ] Clear "Getting Started" section
- [ ] Screenshots of the extension in action
- [ ] Feature overview
- [ ] Installation instructions (load unpacked)
- [ ] Backend setup instructions
- [ ] Troubleshooting section
- [ ] Contributing guidelines (if accepting PRs)

---

## Phase 2: Future Enhancements (Post-Release)

### Keyboard Shortcuts
- `Alt+T` - Open spawn menu
- `Alt+W` - Close active tab
- `Alt+1-9` - Jump to tab
- Blocked: Can't override Ctrl+T/W (browser reserved)

### Import/Export Profiles
- Export profiles to JSON for backup/sharing
- Import profiles from file

### Tab Context Menu
- Right-click tab for: Rename, Close, Close Others

### Chrome Web Store Publication
- Privacy policy
- Screenshots and description
- Version management

---

## Non-Goals

These are intentionally excluded from the Chrome extension:

- **Split terminals** - Sidebar is narrow, use tmux splits instead
- **Multi-window support** - Chrome has one sidebar per window by design
- **Background gradients** - Keep it simple
- **Tab drag-and-drop** - Narrow sidebar makes this awkward

---

## Technical Notes

### Terminal ID Prefixes
- `ctt-` prefix for all Chrome extension terminals
- Enables easy cleanup: `tmux ls | grep "^ctt-"`
- Distinguishes from web app terminals (`tt-`)

### State Management
- Chrome storage for UI state (profiles, settings, recent dirs)
- tmux for terminal persistence (processes survive backend restart)
- WebSocket for real-time terminal I/O

### Ports
- Backend: 8129 (WebSocket + REST API)

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

For historical planning documents and completed work, see [docs/archive/](docs/archive/).
