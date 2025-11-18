# Commands Panel Audit & Improvements

## Context

This is the **Chrome extension version** of Terminal Tabs. The Commands panel allows users to:
- Spawn terminals from predefined spawn options
- Execute or copy shell commands
- Add custom commands with categories

**Reference implementation:** `~/projects/terminal-tabs` (web app version)

---

## Tasks

### 1. 🔍 Audit: Missing Edit Button in Commands Panel

**Issue:** The "edit" button/icon isn't showing up in the Commands panel for custom commands.

**Expected Behavior:**
- Custom commands should have an edit icon/button
- Clicking edit should open the CommandEditorModal with the command pre-filled
- User can modify and save the command

**Files to Check:**
- `extension/components/QuickCommandsPanel.tsx` - Main commands panel
- `extension/components/CommandEditorModal.tsx` - Edit modal (if exists)

**Tasks:**
- [ ] Find where commands are rendered (map over command list)
- [ ] Check if edit button exists in the JSX
- [ ] Compare with `~/projects/terminal-tabs/src/components/QuickCommandsPanel.tsx` to see reference implementation
- [ ] If missing, add edit button with proper handler
- [ ] Test: Add custom command → Edit icon appears → Click → Modal opens with command data

---

### 2. 🎚️ Add "Use Tmux" Toggle to Header

**Goal:** Add a global toggle in the sidebar header to control whether new terminals use tmux.

**Reference:** `~/projects/terminal-tabs` has this toggle in the header.

**Current Behavior:**
- Each terminal type has `resumable: true/false` in `spawn-options.json`
- This controls whether that specific type uses tmux

**Proposed Behavior:**
- **Global toggle in header**: "Use Tmux" slider/checkbox
- When **ON**: Override all terminals to use tmux (even if `resumable: false`)
- When **OFF**: Respect individual terminal's `resumable` setting
- Store state in Chrome storage (`chrome.storage.local`)

**Implementation:**
1. Add toggle UI to sidebar header (`extension/sidepanel/sidepanel.tsx`)
2. Store state: `{ settings: { globalUseTmux: boolean } }`
3. When spawning terminal, check global override:
   ```typescript
   const shouldUseTmux = globalUseTmux || spawnOption.resumable
   ```
4. Pass this to backend as `useTmux: shouldUseTmux`

**Files to Modify:**
- `extension/sidepanel/sidepanel.tsx` - Add toggle to header
- `extension/shared/storage.ts` - Store/retrieve setting
- Background worker or spawn logic - Apply global override

**UI Placement:**
- Header section, near Settings icon
- Use same styling as Settings/Refresh buttons
- Label: "Use Tmux" with toggle switch

---

### 3. 📋 Evaluate: JSON File vs Hardcoded Spawn Options

**Current Implementation (Chrome Extension):**
- Spawn options are **hardcoded** in `QuickCommandsPanel.tsx`
- Example:
  ```typescript
  const defaultCommands: Command[] = [
    { label: 'Claude Code', command: 'claude-code', ... },
    { label: 'Bash Terminal', command: 'bash', ... },
  ]
  ```

**Reference Implementation (Terminal-tabs web app):**
- Uses `public/spawn-options.json` file
- Fetched via HTTP at runtime
- Easier to customize without rebuilding

**Question:** Should the Chrome extension use a JSON file approach?

**Pros of JSON File:**
- ✅ Users can customize spawn options without rebuilding extension
- ✅ Easier to add new terminal types
- ✅ Consistent with web app version
- ✅ Could be bundled in extension and edited via settings UI

**Cons of JSON File:**
- ❌ Chrome extensions need special handling for local file access
- ❌ Would need to bundle JSON in `dist-extension/`
- ❌ Requires rebuild anyway if editing bundled file

**Investigation Tasks:**
- [ ] Check if `public/spawn-options.json` already exists in this project
- [ ] Look at how `~/projects/terminal-tabs` loads spawn options
- [ ] Evaluate: Can we fetch from bundled JSON in Chrome extension?
- [ ] Consider: Settings UI to edit spawn options (store in Chrome storage?)

**Recommendation Decision Tree:**
1. **If bundled JSON is easy** → Use JSON file approach (better UX for power users)
2. **If requires complex loading** → Keep hardcoded but add settings UI to customize
3. **If neither is critical** → Document current approach and defer

---

## Success Criteria

### Task 1: Edit Button
- [ ] Edit icon appears on custom commands
- [ ] Clicking edit opens modal with command data
- [ ] Can modify and save command
- [ ] Changes persist in Chrome storage

### Task 2: Tmux Toggle
- [ ] Toggle appears in header
- [ ] State persists across sidebar close/reopen
- [ ] Overrides individual terminal `resumable` settings when ON
- [ ] New terminals spawn with correct tmux setting

### Task 3: Spawn Options Evaluation
- [ ] Documented pros/cons analysis
- [ ] Clear recommendation with reasoning
- [ ] If implemented: JSON file loading works in extension context
- [ ] If deferred: Note added to PLAN.md for future consideration

---

## Reference Files

### Chrome Extension (Current Project)
- `extension/components/QuickCommandsPanel.tsx` - Commands panel UI
- `extension/components/CommandEditorModal.tsx` - Edit modal (check if exists)
- `extension/sidepanel/sidepanel.tsx` - Main sidebar with header
- `extension/shared/storage.ts` - Chrome storage helpers

### Terminal-tabs Web App (Reference)
- `~/projects/terminal-tabs/src/components/QuickCommandsPanel.tsx` - Reference implementation
- `~/projects/terminal-tabs/public/spawn-options.json` - JSON spawn config

### Backend
- `backend/modules/unified-spawn.js` - Handles `useTmux` flag
- `backend/modules/pty-handler.js` - Creates PTY with tmux if `useTmux: true`

---

## Testing Checklist

After implementing:

**Edit Button:**
1. Open Commands panel
2. Add custom command
3. Verify edit icon appears
4. Click edit → Modal opens with data
5. Modify command → Save
6. Verify changes persist

**Tmux Toggle:**
1. Toggle ON in header
2. Spawn bash terminal (normally `resumable: false`)
3. Check `tmux ls` - session should exist
4. Toggle OFF
5. Spawn bash again - should NOT use tmux
6. Close/reopen sidebar - toggle state persists

**Spawn Options (if implemented):**
1. Verify JSON file loads in extension
2. Modify JSON (add new terminal type)
3. Reload extension
4. New terminal appears in Commands panel

---

## Notes

- The extension uses **Manifest V3** (Chrome's latest extension format)
- Chrome storage is async: Use `chrome.storage.local.get/set`
- Bundled files go to `dist-extension/` via Vite build
- Backend is shared with terminal-tabs web app (same API)

---

**Priority:** Medium
**Estimated Time:** 1-2 hours
**Difficulty:** Easy-Medium
