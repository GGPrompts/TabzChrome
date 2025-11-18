# Next Session: Commands Panel Enhancements

## 🎯 Project Context

This is a **Chrome extension** (side panel) for managing terminal sessions. Built with React, TypeScript, xterm.js, and a Node.js backend.

**Current working directory:** `/home/matt/projects/terminal-tabs-extension/`

**Key files:**
- Documentation: `CLAUDE.md`, `README.md`, `PLAN.md`
- Extension source: `extension/` (React components, background worker)
- Built extension: `dist-extension/` (load this in Chrome)
- Backend: `backend/` (Express + WebSocket server)

---

## 📋 Tasks to Implement

Implement the two enhancements documented in `PLAN.md`:

### 1. Commands Panel - Search/Filter (High Priority)

**Goal:** Add search input to filter commands by label, command text, description, or category.

**Requirements:**
- Search input at top of Commands panel (below header)
- Filter commands as user types
- Search across: label, command, description, category name
- Auto-expand categories with matches
- Show match count per category
- Highlight matching text (optional, nice-to-have)

**Files to modify:**
- `extension/components/QuickCommandsPanel.tsx`

**UI placement:**
```
┌─────────────────────────────────┐
│ 🖥️ Quick Commands         ⚙️   │
├─────────────────────────────────┤
│ 🔍 [Search commands...]         │  ← NEW
├─────────────────────────────────┤
│ ▼ Terminal Spawning (5)         │
│ ▼ Git (6)                        │
└─────────────────────────────────┘
```

---

### 2. Working Directory Field (Medium-High Priority)

**Goal:** Add working directory field to Commands panel + per-command working dir support.

**Requirements:**

**A. Global Override Field**
- Input field in Commands panel header
- Persists in Chrome storage
- Placeholder: `/home/user/projects/...`

**B. Per-Command Working Dir**
- Add `workingDir` field to command editor modal
- Optional field (can be empty)
- When set, command always uses this dir (never overridden)

**C. Priority Logic (CRITICAL):**
```typescript
function getWorkingDirectory(command, globalOverride) {
  // 1. If command has specific working dir, ALWAYS use it (never override)
  if (command.workingDir) {
    return command.workingDir
  }

  // 2. If global override is set, use it
  if (globalOverride) {
    return globalOverride
  }

  // 3. Otherwise use default
  return defaultWorkingDir
}
```

**Files to modify:**
- `extension/components/QuickCommandsPanel.tsx` - Add working dir override field
- `extension/components/CommandEditorModal.tsx` - Add working dir field to form
- `extension/shared/storage.ts` - Add `workingDir` to Command interface
- `extension/background/background.ts` - Implement priority logic

**Storage keys:**
- `commandsWorkingDirectory` (string) - Global override
- Custom commands: Add `workingDir?: string` to Command interface

**UI Design:**
```
┌─────────────────────────────────┐
│ 🖥️ Quick Commands         ⚙️   │
├─────────────────────────────────┤
│ 📁 Working Dir: /home/user/...  │  ← NEW (global override)
├─────────────────────────────────┤
│ 🔍 [Search commands...]         │
├─────────────────────────────────┤
│ ▼ Terminal Spawning (5)         │
└─────────────────────────────────┘
```

**Command Editor Modal:**
```
┌─────────────────────────────────┐
│ Add New Command                  │
├─────────────────────────────────┤
│ Label: [                    ]    │
│ Category: [Git          ▼]       │
│ Command: [git status        ]    │
│ Description: [Show status   ]    │
│ Working Dir: [/home/user... ]    │  ← NEW (optional)
│ Type: [○ Copy  ● Spawn]          │
└─────────────────────────────────┘
```

---

## 🔧 Implementation Order

**Suggested approach:**

1. **Start with Search/Filter** (easier, immediate value)
   - Add search state to QuickCommandsPanel
   - Filter logic for commands
   - Auto-expand matching categories
   - Test with built-in and custom commands

2. **Then Working Directory**
   - Update Command interface with `workingDir?: string`
   - Add field to CommandEditorModal
   - Add global override field to QuickCommandsPanel
   - Update background worker spawn logic with priority
   - Test priority logic thoroughly

3. **Build and Test**
   - `npm run build:extension`
   - Test in Chrome (`chrome://extensions`, reload extension)
   - Verify both features work together

---

## 📝 Testing Checklist

**Search/Filter:**
- [ ] Search filters by command label
- [ ] Search filters by command text
- [ ] Search filters by description
- [ ] Search filters by category name
- [ ] Categories with matches auto-expand
- [ ] Empty search shows all commands
- [ ] Search is case-insensitive

**Working Directory:**
- [ ] Global override field persists in Chrome storage
- [ ] Command with specific working dir uses it (ignores global override)
- [ ] Command without working dir uses global override (if set)
- [ ] Command without working dir uses default (if no override)
- [ ] Working dir field in editor is optional
- [ ] Priority logic works correctly for all 3 cases

---

## 🐛 Known Issues to Avoid

**From PLAN.md:**
- Font size changes require extension reload (known issue, not blocking)
- Theme toggle works but may need terminal reconnect

**Don't worry about:**
- Tmux session management (future enhancement)
- Command templates with variables (future enhancement)

---

## 🚀 Getting Started

1. Read `PLAN.md` for full context
2. Review `extension/components/QuickCommandsPanel.tsx` (current implementation)
3. Review `extension/components/CommandEditorModal.tsx` (command editor)
4. Implement search/filter first (simpler)
5. Then add working directory support
6. Build, test, iterate

**Build command:**
```bash
npm run build:extension
```

**Chrome extension location:**
Load from: `C:\Users\marci\Desktop\terminal-tabs-extension\dist-extension\`

---

## 📚 Reference Files

- **PLAN.md** - Full specifications for these features
- **CLAUDE.md** - Project architecture and development rules
- **README.md** - User-facing feature documentation
- **extension/components/QuickCommandsPanel.tsx** - Commands panel implementation
- **extension/components/CommandEditorModal.tsx** - Command editor modal
- **extension/shared/storage.ts** - Chrome storage helpers and interfaces

---

## 💡 Tips

- Commands panel already has category collapsing/expanding logic - reuse it
- Use React state for search and working dir override
- Chrome storage pattern already used in SettingsModal - follow same pattern
- Background worker already handles SPAWN_TERMINAL messages - extend it
- Test with both built-in commands (Terminal Spawning, Git) and custom commands

Good luck! 🎉
