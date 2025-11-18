# Fix and Reorganize Tabz Footer Controls

## Context
Tabz has tmux controls in the terminal footer (split horizontal, split vertical, new window, etc.) that were added in a previous session, but **none of the buttons are functioning**. Additionally, the tmux controls are mixed together with the customization controls (theme, transparency, font, etc.) making the footer cluttered.

## Tasks

### 1. Fix Non-Functioning Tmux Controls
**Problem:** Buttons for tmux operations don't do anything when clicked.

**Investigate:**
- Check `src/components/Terminal.tsx` footer section (around lines 1150-1300)
- Look for tmux button click handlers
- Verify WebSocket messages are being sent to backend
- Check backend tmux command handling

**Expected behavior:**
- Split Horizontal: `tmux split-window -h` in the current terminal's session
- Split Vertical: `tmux split-window -v`
- New Window: `tmux new-window`
- Kill Pane: `tmux kill-pane`
- All commands should execute in the context of the terminal's tmux session

**Testing checklist:**
- [ ] Click "Split H" creates horizontal split in current terminal's tmux session
- [ ] Click "Split V" creates vertical split
- [ ] Click "New Window" creates new window in tmux session
- [ ] Commands work for both Claude Code and Bash terminals
- [ ] Check backend logs for any errors when clicking buttons

### 2. Reorganize Footer Layout
**Problem:** Tmux controls and customization controls are mixed together.

**Goal:** Separate into two clear sections:

```
┌─────────────────────────────────────────────────────────┐
│ [Tmux Controls]              [Customization Controls]  │
│ Split H | Split V | New Win  Theme | Trans | Font | ⚙️ │
└─────────────────────────────────────────────────────────┘
```

**Implementation:**
- Group tmux controls on the left side of footer
- Group customization controls on the right side
- Add visual separator (border or spacing)
- Only show tmux controls when `useTmux` is enabled

**Code locations:**
- Footer layout: `src/components/Terminal.tsx` (lines ~1150-1300)
- Styles: `src/components/Terminal.css` (.terminal-footer)

### 3. Optional: Show Active Tmux Session Info
Display current tmux session name and window number in footer when available.

Example: `tt-bash-abc:0` or `tt-cc-xyz:1`

## Files to Check

**Frontend:**
- `src/components/Terminal.tsx` - Footer buttons and handlers
- `src/components/Terminal.css` - Footer styling
- `src/SimpleTerminalApp.tsx` - WebSocket message handling

**Backend:**
- `backend/routes/api.js` - `/api/tmux/*` endpoints
- `backend/modules/tmux-session-manager.js` - Tmux command execution
- `backend/server.js` - WebSocket message routing

## Testing After Fix

**Manual testing:**
1. Start Tabz with `./start-tmux.sh`
2. Spawn a Bash terminal
3. Click "Split H" - verify horizontal split appears
4. Click "Split V" - verify vertical split appears
5. Click "New Window" - verify new tmux window created
6. Repeat with Claude Code terminal
7. Check `tmux ls` shows expected session structure

**Check backend logs:**
```bash
tmux capture-pane -t tabz:backend -p -S -50 | grep -i tmux
```

## Expected Result

After fixing:
- ✅ All tmux control buttons work correctly
- ✅ Footer has clear separation: Tmux controls (left) | Customization (right)
- ✅ Clicking buttons executes tmux commands in correct session context
- ✅ Visual hierarchy makes it easy to distinguish control types
- ✅ No console errors or WebSocket failures

## Notes

- Tmux commands should target the specific terminal's session (e.g., `tt-bash-abc`)
- Don't break existing customization controls (theme, transparency, font)
- Keep the Settings (⚙️) button for spawn-options editing
- Consider adding a tmux toggle in the footer to show/hide tmux controls
