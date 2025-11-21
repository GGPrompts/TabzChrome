# Missing Features from Terminal-Tabs Web App

Comparison between `terminal-tabs` (web app) and Chrome extension.

---

## Global Defaults (Settings Modal)

### ✅ Chrome Extension HAS:
- Default Font Size (12-24px slider)
- Theme Toggle (Dark/Light only)
- Use Tmux (global toggle) - **Just added!**
- Default Working Directory (in Commands panel)

### ❌ Chrome Extension MISSING:

1. **Project Management**
   - Add/edit/delete project shortcuts
   - Quick dropdown to switch working directory
   - Stored in `spawn-options.json` under `projects: []`

2. **Default Font Family**
   - Dropdown with web fonts (JetBrains Mono, Fira Code, etc.)

3. **Default Text Color Theme**
   - Full theme system (amber, matrix, cyberpunk, etc.)
   - Chrome extension only has dark/light

4. **Default Background Gradient**
   - 14+ background gradients (carbon, holographic, amber-warmth, etc.)
   - Chrome extension has solid colors only

5. **Default Transparency**
   - Slider 0-100%
   - Chrome extension has no transparency

6. **Maintenance**
   - "Clean Up State Files" button for Claude Code
   - API call to `/api/claude-status/cleanup`

---

## Spawn Options Editing (Settings Modal)

### ✅ Chrome Extension HAS:
- Loads spawn options from `spawn-options.json`
- Displays all spawn options in Commands panel
- Custom commands (add/edit/delete clipboard commands)

### ❌ Chrome Extension MISSING:

1. **Edit Spawn Options in UI**
   - Web app has full editor for spawn options
   - Add/edit/delete spawn options without editing JSON
   - Chrome extension is read-only from JSON

2. **Drag-and-Drop Reordering**
   - Web app lets you reorder spawn options
   - Chrome extension shows in JSON order only

3. **Icon Picker**
   - Web app has icon picker with categories (Terminals, Development, Fun, etc.)
   - 50+ icons organized by category
   - Chrome extension shows icons from JSON only

4. **Per-Spawn-Option Customization**
   - Each spawn option can override:
     - Theme
     - Background gradient
     - Transparency
     - Font family
     - Font size
   - "Use Global Defaults" toggles for each setting
   - Chrome extension has no per-terminal customization

5. **Working Directory per Spawn Option**
   - Web app allows setting working dir per spawn option
   - Chrome extension supports this in JSON but not in UI

6. **Save to JSON**
   - Web app saves changes back to `spawn-options.json`
   - Chrome extension is read-only

---

## Priority System

**Web App has 3-tier priority:**
1. Per-terminal overrides (footer controls) - highest priority
2. Spawn option defaults (in spawn-options.json)
3. Global defaults (in Settings → Global Defaults)

**Chrome Extension has:**
- Font size + theme in Settings (global only)
- No per-terminal overrides
- No spawn option defaults

---

## Recommendations

### Quick Wins (High Impact, Low Effort):

1. **Add Project Management**
   - Load `projects` from `spawn-options.json`
   - Add project dropdown in Commands panel
   - Quick switch working directory

2. **Add Default Font Family**
   - Dropdown in Settings
   - Store in Chrome storage

3. **Add Default Theme Dropdown**
   - Replace Light/Dark toggle with theme dropdown
   - Use web app's theme list (amber, matrix, cyberpunk, etc.)

### Medium Effort:

4. **Add Background Gradients**
   - Port background gradient system from web app
   - Add dropdown in Settings

5. **Add Transparency Slider**
   - 0-100% slider in Settings
   - Apply to all terminals

### Heavy Lift (Future):

6. **Full Spawn Options Editor**
   - Edit spawn options in UI (not just JSON)
   - Save back to `spawn-options.json`
   - Drag-and-drop reordering
   - Icon picker

7. **Per-Terminal Customization**
   - Footer controls for theme/font/transparency
   - Override system (per-terminal > spawn option > global)

---

## What to Prioritize?

**Ask the user:**
- Which features are most important?
- Are you okay editing `spawn-options.json` manually?
- Or do you want full UI editing like the web app?

---

**Date**: November 17, 2025
**Status**: Feature Gap Analysis Complete
