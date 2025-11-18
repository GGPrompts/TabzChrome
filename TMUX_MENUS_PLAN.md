# Tmux Context Menus Implementation Plan

**Goal:** Add right-click context menus for tmux operations to the Chrome extension, similar to terminal-tabs.

**Source:** `~/projects/terminal-tabs` (fully featured web app with tmux menus)
**Target:** `~/projects/terminal-tabs-extension` (Chrome extension)

**Status:** ✅ **COMPLETE** - Tab context menus implemented, using native tmux menu for pane operations

---

## ✅ Implementation Summary (What We Actually Built)

After testing, we simplified the approach for better UX:

### ✅ **Tab Context Menu** (Right-click on tab)
- ✏️ Rename Tab - Change display name
- 📌 Detach Session - Close UI tab, keep tmux session alive (survives extension crashes!)
- ❌ Kill Session - Destroy tmux session completely

### ✅ **Terminal Context Menu** (Right-click inside terminal)
- **Uses native tmux menu** for all pane operations (split, zoom, resize, copy mode)
- **TUI tools work perfectly** (lazygit, vim, etc. can use their own context menus)
- No conflicts between React and tmux event handlers

### 🔧 Backend Fixes Applied
1. **Tmux spawning** - `resumable: true` terminals now correctly use tmux
2. **Working directory** - Defaults to `$HOME` instead of backend folder
3. **Session tracking** - Frontend tracks tmux `sessionName` for API calls

---

## 📊 Original Plan Overview

This plan originally proposed two context menu systems:

1. **Tab Context Menu** - Right-click on tab → Session management ✅ **IMPLEMENTED**
2. **Pane Context Menu** - Right-click inside terminal → Tmux pane operations ❌ **REPLACED WITH NATIVE TMUX MENU**

---

## ✅ Prerequisites (Already Complete)

- ✅ Backend has all required tmux endpoints
- ✅ Tmux splits already working (native tmux, not React)
- ✅ Terminals persist through refresh
- ✅ Chrome extension deployment working

---

## 🎯 Phase 1: Core Menus (Est. 45-60 min)

**Goal:** Add basic context menus with most-used operations.

### 1.1 Update Backend API (5 min)

**File:** `backend/routes/api.js`

**Changes:**
- Add `paneMarked` and `paneZoomed` to `/api/tmux/info/:name` response
- Update tmux display-message format string to include `#{pane_marked}` and `#{window_zoomed_flag}`

**Location:** Lines 806-877

**Before:**
```javascript
// Line 807
const info = execSync(
  `tmux display-message -t "${name}" -p "#{window_name}|#{pane_title}|#{session_windows}|#{window_index}|#{window_panes}|#{pane_current_path}"`,
  { encoding: 'utf-8' }
).trim();

// Line 811
const [windowName, paneTitle, windowCountStr, activeWindowStr, paneCountStr, currentPath] = info.split('|');
```

**After:**
```javascript
// Line 807
const info = execSync(
  `tmux display-message -t "${name}" -p "#{window_name}|#{pane_title}|#{session_windows}|#{window_index}|#{window_panes}|#{pane_current_path}|#{pane_marked}|#{window_zoomed_flag}"`,
  { encoding: 'utf-8' }
).trim();

// Line 811
const [windowName, paneTitle, windowCountStr, activeWindowStr, paneCountStr, currentPath, paneMarkedStr, paneZoomedStr] = info.split('|');
const paneMarked = paneMarkedStr === '1';
const paneZoomed = paneZoomedStr === '1';
```

**Update Response (Line 870):**
```javascript
res.json({
  success: true,
  paneTitle: displayName,
  windowCount: windowCount || 1,
  activeWindow: activeWindow || 0,
  paneCount: paneCount || 1,
  paneMarked,      // NEW
  paneZoomed,      // NEW
  sessionName: name
});
```

**Test:**
```bash
curl http://localhost:8127/api/tmux/info/tt-bash-abc
# Should return: { ..., paneMarked: false, paneZoomed: false }
```

---

### 1.2 Add Context Menu State (10 min)

**File:** `extension/sidepanel/sidepanel.tsx`

**Add State Variables (top of component):**
```typescript
// Context menu state
const [contextMenu, setContextMenu] = useState<{
  show: boolean
  x: number
  y: number
  terminalId: string | null
}>({ show: false, x: 0, y: 0, terminalId: null })

const [paneContextMenu, setPaneContextMenu] = useState<{
  show: boolean
  x: number
  y: number
  terminalId: string | null
}>({ show: false, x: 0, y: 0, terminalId: null })

// Pane state (for dynamic menu items)
const [paneMarked, setPaneMarked] = useState(false)
const [paneZoomed, setPaneZoomed] = useState(false)

// Window switcher
const [showWindowSubmenu, setShowWindowSubmenu] = useState(false)
const [tmuxWindows, setTmuxWindows] = useState<Array<{
  index: number
  name: string
  active: boolean
}>>([])
```

**Add Close on Click Effects:**
```typescript
// Close tab context menu on outside click
useEffect(() => {
  if (!contextMenu.show) return

  const handleClick = () => {
    setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
  }

  document.addEventListener('click', handleClick)
  return () => {
    document.removeEventListener('click', handleClick)
  }
}, [contextMenu.show])

// Close pane context menu on outside click
useEffect(() => {
  if (!paneContextMenu.show) return

  const handleClick = () => {
    setPaneContextMenu({ show: false, x: 0, y: 0, terminalId: null })
    setShowWindowSubmenu(false)
  }

  document.addEventListener('click', handleClick)
  return () => {
    document.removeEventListener('click', handleClick)
  }
}, [paneContextMenu.show])
```

**Reference:** `terminal-tabs/src/SimpleTerminalApp.tsx:822-861`

---

### 1.3 Add Event Handlers (15 min)

**File:** `extension/sidepanel/sidepanel.tsx`

**Add These Handler Functions:**

```typescript
// Handle right-click on tab
const handleTabContextMenu = (e: React.MouseEvent, terminalId: string) => {
  e.preventDefault()
  e.stopPropagation()
  setContextMenu({
    show: true,
    x: e.clientX,
    y: e.clientY,
    terminalId
  })
}

// Handle right-click inside terminal
const handlePaneContextMenu = async (e: React.MouseEvent, terminalId: string) => {
  e.preventDefault()
  e.stopPropagation()

  const terminal = storedTerminals.find(t => t.id === terminalId)
  console.log('[handlePaneContextMenu] Terminal:', terminal)

  // Fetch marked and zoomed status if terminal has a session
  if (terminal?.sessionName) {
    try {
      const response = await fetch(`http://localhost:8127/api/tmux/info/${terminal.sessionName}`)
      const data = await response.json()
      if (data.success) {
        setPaneMarked(data.paneMarked || false)
        setPaneZoomed(data.paneZoomed || false)
      }
    } catch (error) {
      console.error('[handlePaneContextMenu] Error fetching pane info:', error)
      setPaneMarked(false)
      setPaneZoomed(false)
    }
  } else {
    setPaneMarked(false)
    setPaneZoomed(false)
  }

  setPaneContextMenu({
    show: true,
    x: e.clientX,
    y: e.clientY,
    terminalId
  })
}

// Execute tmux command on pane
const executeTmuxPaneCommand = async (command: string, terminalId?: string) => {
  const id = terminalId || paneContextMenu.terminalId
  if (!id) return

  const terminal = storedTerminals.find(t => t.id === id)
  if (!terminal?.sessionName) return

  console.log(`[executeTmuxPaneCommand] Executing "${command}" on session: ${terminal.sessionName}`)

  try {
    const response = await fetch(`http://localhost:8127/api/tmux/sessions/${terminal.sessionName}/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ command })
    })

    const data = await response.json()
    if (!data.success) {
      console.error('Tmux command failed:', data.error)
    }

    setPaneContextMenu({ show: false, x: 0, y: 0, terminalId: null })
  } catch (error) {
    console.error('Error executing tmux command:', error)
  }
}

// Handle "Rename Tab" from tab menu
const handleContextRename = () => {
  if (!contextMenu.terminalId) return
  const terminal = storedTerminals.find(t => t.id === contextMenu.terminalId)
  if (!terminal) return

  // TODO: Add rename dialog (Phase 2)
  const newName = prompt('Enter new name:', terminal.name)
  if (newName) {
    updateTerminal(terminal.id, { customName: newName })
  }

  setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
}

// Handle "Kill Pane" from pane menu
const handleKillPane = async () => {
  if (!paneContextMenu.terminalId) return

  const terminal = storedTerminals.find(t => t.id === paneContextMenu.terminalId)
  if (!terminal?.sessionName) return

  await executeTmuxPaneCommand('kill-pane', terminal.id)

  // Close the terminal in UI
  closeTerminal(terminal.id)
  setPaneContextMenu({ show: false, x: 0, y: 0, terminalId: null })
}
```

**Reference:** `terminal-tabs/src/SimpleTerminalApp.tsx:880-1197`

---

### 1.4 Wire Up Events (5 min)

**File:** `extension/sidepanel/sidepanel.tsx`

**Add to Tab Rendering:**
```typescript
<div
  className={`tab ${isActive ? 'active' : ''}`}
  onClick={() => setActiveTerminal(terminal.id)}
  onContextMenu={(e) => handleTabContextMenu(e, terminal.id)} // ADD THIS
>
  {/* existing tab content */}
</div>
```

**Update Terminal Component:**
```typescript
<Terminal
  // ... existing props
  onContextMenu={handlePaneContextMenu} // ADD THIS
/>
```

**File:** `extension/components/Terminal.tsx`

**Add Prop Interface:**
```typescript
interface TerminalProps {
  // ... existing props
  onContextMenu?: (e: React.MouseEvent, terminalId: string) => void // ADD THIS
}
```

**Wire Up in Render:**
```typescript
<div
  ref={containerRef}
  className="terminal-container"
  onContextMenu={onContextMenu ? (e) => onContextMenu(e, terminalId) : undefined} // ADD THIS
>
  {/* existing content */}
</div>
```

**Reference:** `terminal-tabs/src/SimpleTerminalApp.tsx:2185` and `terminal-tabs/src/components/Terminal.tsx:110-130`

---

### 1.5 Add Context Menu JSX (15 min)

**File:** `extension/sidepanel/sidepanel.tsx`

**Add Before Closing `</div>` of Main Container:**

```tsx
{/* Tab Context Menu */}
{contextMenu.show && contextMenu.terminalId && (
  <div
    className="tab-context-menu"
    style={{
      position: 'fixed',
      left: `${contextMenu.x}px`,
      top: `${contextMenu.y}px`,
      zIndex: 10000,
    }}
    onClick={(e) => e.stopPropagation()}
  >
    {(() => {
      const terminal = storedTerminals.find(t => t.id === contextMenu.terminalId)
      const canKill = terminal?.sessionName && terminal?.status !== 'detached'

      return (
        <>
          <button
            className="context-menu-item"
            onClick={handleContextRename}
          >
            ✏️ Rename Tab...
          </button>
          <div className="context-menu-divider" />
          <button
            className="context-menu-item"
            onClick={() => {
              if (contextMenu.terminalId) {
                closeTerminal(contextMenu.terminalId)
                setContextMenu({ show: false, x: 0, y: 0, terminalId: null })
              }
            }}
            disabled={!canKill}
          >
            ❌ Kill Session
          </button>
        </>
      )
    })()}
  </div>
)}

{/* Pane Context Menu */}
{paneContextMenu.show && paneContextMenu.terminalId && (
  <div
    className="tab-context-menu"
    style={{
      position: 'fixed',
      left: `${paneContextMenu.x}px`,
      top: `${paneContextMenu.y}px`,
      zIndex: 10000,
    }}
    onClick={(e) => e.stopPropagation()}
  >
    {(() => {
      const terminal = storedTerminals.find(t => t.id === paneContextMenu.terminalId)
      const hasSession = terminal?.sessionName && terminal?.status !== 'detached'

      if (!hasSession) {
        return <div className="context-menu-item disabled">No tmux session</div>
      }

      return (
        <>
          <button
            className="context-menu-item"
            onClick={() => executeTmuxPaneCommand('split-window -h')}
          >
            ➗ Split Horizontally
          </button>
          <button
            className="context-menu-item"
            onClick={() => executeTmuxPaneCommand('split-window -v')}
          >
            ➖ Split Vertically
          </button>
          <div className="context-menu-divider" />
          <button
            className="context-menu-item"
            onClick={() => executeTmuxPaneCommand('resize-pane -Z')}
          >
            {paneZoomed ? '🔍 Unzoom' : '🔍 Zoom'}
          </button>
          <div className="context-menu-divider" />
          <button
            className="context-menu-item"
            onClick={handleKillPane}
          >
            ❌ Kill Pane
          </button>
        </>
      )
    })()}
  </div>
)}
```

**Reference:** `terminal-tabs/src/SimpleTerminalApp.tsx:2703-2936`

---

### 1.6 Add CSS Styles (10 min)

**File:** `extension/sidepanel/sidepanel.css`

**Add at Bottom:**

```css
/* Context Menu Styles */
.tab-context-menu {
  background: rgba(30, 30, 30, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 4px;
  min-width: 200px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.context-menu-item {
  display: block;
  width: 100%;
  padding: 8px 12px;
  background: transparent;
  border: none;
  color: #ffffff;
  text-align: left;
  cursor: pointer;
  border-radius: 4px;
  font-size: 13px;
  transition: background-color 0.15s ease;
}

.context-menu-item:hover:not(.disabled) {
  background: rgba(255, 255, 255, 0.1);
}

.context-menu-item.disabled {
  color: #666;
  cursor: not-allowed;
  opacity: 0.5;
}

.context-menu-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
  margin: 4px 0;
}

/* Submenu Styles (for Phase 2 - window switcher) */
.context-menu-submenu {
  position: relative;
}

.context-submenu-panel {
  position: absolute;
  left: 100%;
  top: 0;
  margin-left: 4px;
  background: rgba(30, 30, 30, 0.98);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 4px;
  min-width: 150px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(10px);
}
```

**Reference:** Check `terminal-tabs/src/styles/` for full styles

---

### Phase 1 Completion Checklist

- [ ] Backend: `/api/tmux/info` returns `paneMarked` and `paneZoomed`
- [ ] Frontend: Context menu state added
- [ ] Frontend: Event handlers implemented
- [ ] Frontend: `onContextMenu` wired to tabs and terminals
- [ ] Frontend: Tab menu renders and shows rename + kill
- [ ] Frontend: Pane menu renders and shows split H/V + zoom + kill
- [ ] CSS: Context menus styled properly
- [ ] Test: Right-click on tab shows menu
- [ ] Test: Right-click in terminal shows pane menu
- [ ] Test: Split horizontally creates tmux split
- [ ] Test: Split vertically creates tmux split
- [ ] Test: Zoom toggles pane zoom
- [ ] Test: Kill pane removes pane

---

## 🎯 Phase 2: Advanced Features (Est. 30-45 min)

**Goal:** Add advanced tmux operations for power users.

### 2.1 Add Mark/Unmark Pane (10 min)

**Update Pane Menu to Include:**
```tsx
{paneMarked ? (
  <button
    className="context-menu-item"
    onClick={() => executeTmuxPaneCommand('select-pane -M')}
  >
    📍 Unmark
  </button>
) : (
  <button
    className="context-menu-item"
    onClick={() => executeTmuxPaneCommand('select-pane -m')}
  >
    📌 Mark
  </button>
)}
<button
  className="context-menu-item"
  onClick={() => executeTmuxPaneCommand('swap-pane -s \'{marked}\'')}
>
  ↔️ Swap with Marked
</button>
```

**Reference:** `terminal-tabs/src/SimpleTerminalApp.tsx:2868-2888`

---

### 2.2 Add Swap Pane Operations (5 min)

**Add to Pane Menu:**
```tsx
<button
  className="context-menu-item"
  onClick={() => executeTmuxPaneCommand('swap-pane -U')}
>
  ⬆️ Swap Up
</button>
<button
  className="context-menu-item"
  onClick={() => executeTmuxPaneCommand('swap-pane -D')}
>
  ⬇️ Swap Down
</button>
```

**Reference:** `terminal-tabs/src/SimpleTerminalApp.tsx:2855-2866`

---

### 2.3 Add Respawn Pane (5 min)

**Add to Pane Menu:**
```tsx
<button
  className="context-menu-item"
  onClick={() => executeTmuxPaneCommand('respawn-pane -k')}
>
  🔄 Respawn
</button>
```

**Reference:** `terminal-tabs/src/SimpleTerminalApp.tsx:2913-2918`

---

### 2.4 Add Window Switcher (15 min)

**Add Fetch Function:**
```typescript
const fetchTmuxWindows = async (sessionName: string) => {
  try {
    const response = await fetch(`http://localhost:8127/api/tmux/sessions/${sessionName}/windows`)
    const data = await response.json()

    if (data.success && data.windows) {
      setTmuxWindows(data.windows)
      setShowWindowSubmenu(true)
    }
  } catch (error) {
    console.error('Error fetching tmux windows:', error)
  }
}
```

**Add to Both Menus (if windowCount > 1):**
```tsx
{windowCount > 1 && (
  <div
    className="context-menu-submenu"
    onMouseEnter={() => fetchTmuxWindows(terminal.sessionName!)}
  >
    <button className="context-menu-item">
      🪟 Switch Window ▶
    </button>
    {showWindowSubmenu && tmuxWindows.length > 0 && (
      <div className="context-submenu-panel">
        {tmuxWindows.map(win => (
          <button
            key={win.index}
            className="context-menu-item"
            onClick={() => executeTmuxPaneCommand(`select-window -t :${win.index}`)}
          >
            {win.name} {win.active ? '✓' : ''}
          </button>
        ))}
      </div>
    )}
  </div>
)}
```

**Reference:** `terminal-tabs/src/SimpleTerminalApp.tsx:2729-2759, 2890-2911`

---

### 2.5 Add Rename Dialog (Optional)

Replace `prompt()` with a proper modal dialog.

**Reference:** `terminal-tabs/src/SimpleTerminalApp.tsx:2938-3000`

---

### Phase 2 Completion Checklist

- [ ] Mark/Unmark pane works
- [ ] Swap with marked pane works
- [ ] Swap up/down works
- [ ] Respawn pane works
- [ ] Window switcher appears when windowCount > 1
- [ ] Switching windows works correctly
- [ ] (Optional) Rename dialog implemented

---

## 🎯 Phase 3: Keyboard Shortcuts & Polish (Est. 30 min)

**Goal:** Add keyboard shortcuts for common operations.

### 3.1 Add Keyboard Shortcuts

**Common Shortcuts:**
- `Alt+H` - Split horizontally
- `Alt+V` - Split vertically
- `Alt+Z` - Toggle zoom
- `Alt+X` - Kill pane
- `Alt+M` - Mark pane
- `Alt+R` - Respawn pane

**Implementation:**
```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    // Only handle if Alt key is pressed
    if (!e.altKey) return

    const terminal = storedTerminals.find(t => t.id === activeTerminalId)
    if (!terminal?.sessionName) return

    const executeCommand = async (command: string) => {
      await fetch(`http://localhost:8127/api/tmux/sessions/${terminal.sessionName}/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command })
      })
    }

    switch (e.key.toLowerCase()) {
      case 'h':
        e.preventDefault()
        executeCommand('split-window -h')
        break
      case 'v':
        e.preventDefault()
        executeCommand('split-window -v')
        break
      case 'z':
        e.preventDefault()
        executeCommand('resize-pane -Z')
        break
      case 'x':
        e.preventDefault()
        if (confirm('Kill current pane?')) {
          executeCommand('kill-pane')
        }
        break
      case 'm':
        e.preventDefault()
        executeCommand('select-pane -m')
        break
      case 'r':
        e.preventDefault()
        executeCommand('respawn-pane -k')
        break
    }
  }

  document.addEventListener('keydown', handleKeyDown)
  return () => {
    document.removeEventListener('keydown', handleKeyDown)
  }
}, [activeTerminalId, storedTerminals])
```

**Reference:** `terminal-tabs/src/SimpleTerminalApp.tsx:550-650` (approximate)

---

### 3.2 Add Keyboard Shortcuts Help

Add a help overlay showing available shortcuts (Ctrl+? or F1).

---

### 3.3 Polish Context Menu Styling

- Add hover animations
- Add icons/emojis consistently
- Match glassmorphic theme
- Add dividers in logical places

---

### Phase 3 Completion Checklist

- [ ] Alt+H splits horizontally
- [ ] Alt+V splits vertically
- [ ] Alt+Z toggles zoom
- [ ] Alt+X kills pane (with confirmation)
- [ ] Alt+M marks pane
- [ ] Alt+R respawns pane
- [ ] (Optional) Help overlay shows shortcuts
- [ ] Context menus have polished styling
- [ ] All animations smooth

---

## 📝 Testing Checklist

### Basic Functionality
- [ ] Right-click on tab shows menu at cursor position
- [ ] Right-click in terminal shows pane menu at cursor position
- [ ] Clicking outside menu closes it
- [ ] Menu items are not cut off at screen edges

### Tab Menu Operations
- [ ] Rename tab updates tab name
- [ ] Kill session closes terminal and kills tmux session
- [ ] Window switcher appears only when windowCount > 1
- [ ] Switching windows changes active tmux window

### Pane Menu Operations
- [ ] Split horizontally creates left/right panes
- [ ] Split vertically creates top/bottom panes
- [ ] Zoom toggles between zoomed and normal
- [ ] Kill pane removes the pane
- [ ] Mark pane enables marked state
- [ ] Unmark clears marked state
- [ ] Swap with marked exchanges panes
- [ ] Swap up/down reorders panes
- [ ] Respawn restarts pane process

### Edge Cases
- [ ] Menu shows "No tmux session" for non-tmux terminals
- [ ] Menu items disabled when operation not available
- [ ] Multiple rapid right-clicks don't break UI
- [ ] Menu closes when clicking menu item
- [ ] Backend errors don't crash frontend

### Integration
- [ ] Works with existing terminal spawning
- [ ] Works with Commands panel
- [ ] Works with Settings modal
- [ ] No conflicts with existing keyboard shortcuts
- [ ] Extension reload preserves functionality

---

## 📚 Reference Files

### Source (terminal-tabs)
- `src/SimpleTerminalApp.tsx:822-3000` - Context menu implementation
- `src/components/Terminal.tsx:110-130` - onContextMenu wiring
- `backend/routes/api.js:789-885` - /api/tmux/info endpoint

### Target (terminal-tabs-extension)
- `extension/sidepanel/sidepanel.tsx` - Main UI component
- `extension/components/Terminal.tsx` - Terminal component
- `backend/routes/api.js` - Tmux API endpoints
- `extension/sidepanel/sidepanel.css` - Styles

---

## 🚀 Implementation Order

1. **Start:** Phase 1.1 (Backend update) - Foundation
2. **Then:** Phase 1.2-1.3 (State + handlers) - Core logic
3. **Then:** Phase 1.4-1.5 (Wiring + JSX) - UI integration
4. **Then:** Phase 1.6 (CSS) - Visual polish
5. **Test:** Verify Phase 1 works end-to-end
6. **Next:** Phase 2 (Advanced features) - One by one
7. **Test:** Verify Phase 2 additions
8. **Finally:** Phase 3 (Shortcuts) - If desired
9. **Complete:** Full testing checklist

---

## 📊 Progress Tracking

**Phase 1 (Core):** ⬜ Not Started
**Phase 2 (Advanced):** ⬜ Not Started
**Phase 3 (Polish):** ⬜ Not Started

**Estimated Total Time:** 2-3 hours
**MVP Time (Phase 1 only):** 45-60 minutes

---

## 💡 Notes

- Keep it simple - copy working code from terminal-tabs
- Test each phase before moving to next
- Backend already has everything we need
- Focus on Phase 1 first - it's 80% of the value
- Phase 2 and 3 are optional enhancements
- All operations use existing `/api/tmux/sessions/:name/command` endpoint
- No React split logic needed - tmux handles all split management

---

**Ready to start Phase 1? Let's do it!** 🚀
