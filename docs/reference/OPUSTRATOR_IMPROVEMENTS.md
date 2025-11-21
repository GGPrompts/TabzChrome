# Improvements from Opustrator to Port to Terminal-Tabs

**Date:** November 12, 2025
**Source:** ~/workspace/opustrator (v3.14.2)
**Target:** ~/projects/terminal-tabs (Tabz v1.1.0)

---

## 🎯 Summary

After comparing Opustrator (the parent project) with Terminal-Tabs (simplified version), here are the key improvements that would benefit Terminal-Tabs without adding unnecessary complexity.

---

## ✅ High Priority - Should Port

### 1. **ErrorBoundary Component** (HIGH PRIORITY)
**File:** `opustrator/frontend/src/components/ErrorBoundary.tsx` (99 lines)

**What it does:**
- React Error Boundary to catch and display component errors gracefully
- Shows error details in dev mode with collapsible stack traces
- "Try Again" button to reset error state
- Named boundaries for different sections (e.g., "Sidebar", "Terminal Grid")

**Why we need it:**
- Terminal-tabs has NO error boundary currently
- Errors in one terminal/component crash the entire app
- Makes debugging much easier with detailed error info in dev mode
- Production users see friendly error instead of blank page

**Implementation:**
```tsx
// Wrap sections of App.tsx:
<ErrorBoundary name="Terminal Display">
  <Terminal ... />
</ErrorBoundary>

<ErrorBoundary name="Tab Bar">
  <div className="tab-bar">...</div>
</ErrorBoundary>
```

**Effort:** Low (1 file, ~100 lines)
**Impact:** HIGH - Prevents app crashes, better UX

---

### 2. **Tmux Session Manager** (MEDIUM PRIORITY)
**File:** `opustrator/backend/modules/tmux-session-manager.js` (650 lines)

**What it does:**
- Rich tmux session listing with metadata (working dir, git branch, AI tool detection)
- Session operations: list, attach, kill, send commands
- Detects Claude Code/AI sessions and parses statuslines
- Captures pane content for previews
- Distinguishes Opustrator-managed vs external sessions

**Why we need it (partially):**
- Terminal-tabs currently has NO session management UI
- Users can't see/kill orphaned tmux sessions
- After crashes, tmux sessions pile up
- No visibility into what's running in background

**What to port:**
- Session listing API (`GET /api/tmux/sessions`)
- Session kill API (`DELETE /api/tmux/session/:name`)
- Basic metadata (name, windows, attached, created)
- Opustrator pattern detection (filter for `tt-*` sessions)

**What NOT to port:**
- Canvas-specific features (position, layout)
- Claude statusline parsing (overly complex)
- Pane content capture (not needed for tabs)

**Effort:** Medium (300 lines, new API endpoints)
**Impact:** MEDIUM - Better session management, cleanup

---

### 3. **WebSocket Reconnection Logic** (MEDIUM PRIORITY)
**File:** `opustrator/backend/server.js` (lines 198-216)

**What it does:**
- Explicit `reconnect` WebSocket message type
- Backend cancels pending disconnects during reconnection
- Returns reconnected terminal data or failure message
- Handles tmux session reconnection explicitly

**Current Terminal-Tabs approach:**
- Automatic reconnection via `terminal-spawned` matching
- No explicit reconnect message type
- Works but less explicit

**Opustrator advantage:**
- Clearer intent in logs/debugging
- Backend can optimize for reconnection vs new spawn
- Client knows immediately if reconnection succeeded

**Example:**
```typescript
// Client sends explicit reconnect:
ws.send(JSON.stringify({
  type: 'reconnect',
  terminalId: terminal.agentId,
  sessionName: terminal.sessionName
}))

// Backend responds:
{ type: 'terminal-reconnected', data: { ... } }
// OR
{ type: 'reconnect-failed', terminalId: '...' }
```

**Effort:** Medium (backend + frontend changes)
**Impact:** MEDIUM - Clearer reconnection semantics

---

### 4. **Spawn Options: defaultSize** (LOW PRIORITY)
**File:** `opustrator/spawn-options.json`

**What it has:**
```json
{
  "label": "Claude Code",
  "defaultSize": { "width": 1200, "height": 800 },
  "defaultTheme": "amber",
  "defaultTransparency": 100
}
```

**Terminal-tabs currently:**
- No defaultSize (terminals spawn with arbitrary sizes)
- Has defaultTheme, defaultTransparency, defaultFontSize

**Why add it:**
- Consistent terminal sizes for different tools
- Claude Code benefits from larger default (1200x800)
- Bash can be smaller (800x600)

**Effort:** Low (just add to spawn options schema)
**Impact:** LOW - Nice UX improvement

---

### 5. **Tmux Disconnect Skipping** (LOW PRIORITY)
**File:** `opustrator/backend/modules/terminal-registry.js` (lines 371-382)

**What it does:**
```javascript
disconnectTerminal(id) {
  const terminal = this.terminals.get(id);

  // CRITICAL: Don't disconnect tmux-backed terminals
  // Tmux sessions persist across WebSocket reconnections (e.g., Vite HMR)
  if (terminal.sessionId || terminal.sessionName) {
    console.log('✅ Skipping disconnect for tmux-backed terminal');
    console.log('✅ Tmux sessions persist across WebSocket reconnections');
    return;
  }

  // Only disconnect non-tmux terminals
  // ...
}
```

**Why this matters:**
- When WebSocket disconnects (HMR, network blip), don't kill PTY processes
- Tmux sessions survive disconnection anyway
- Faster reconnection without re-spawning

**Terminal-tabs currently:**
- Doesn't have explicit disconnect handling
- Might be cleaning up PTY processes unnecessarily

**Effort:** Low (add check in disconnect handler)
**Impact:** LOW - Slightly faster reconnections

---

## ❌ Low Priority / Don't Port

### 6. **Canvas/Drag-and-Drop Patterns**
**Files:** DraggableTerminal.tsx, canvasStore.ts

**What it has:**
- Infinite canvas with zoom/pan
- react-draggable with zoom compensation
- Mouse coordinate transformation for canvas
- Fullscreen/maximize modal toggles

**Why NOT to port:**
- Terminal-tabs is intentionally tab-based (simpler)
- Canvas complexity was the reason for creating Terminal-tabs
- Would undo the core simplification goal

---

### 7. **Layout Manager**
**File:** `opustrator/backend/modules/layout-manager.js`

**What it does:**
- Saves/loads canvas layouts to JSON files
- Persists terminal positions, sizes, z-indexes

**Why NOT to port:**
- Terminal-tabs uses Zustand localStorage (simpler)
- No need for file-based layouts (tabs auto-persist)
- Layout manager is canvas-specific

---

### 8. **Drawing Layer**
**Files:** DrawingLayerEnhanced.tsx, DrawingToolbar.tsx

**What it does:**
- Annotation layer for canvas (arrows, boxes, text)
- Freehand drawing

**Why NOT to port:**
- Canvas-specific feature
- Not relevant to tab-based interface
- Adds significant complexity

---

## 📊 Recommended Priority Order

**Phase 1 (Next Sprint):**
1. ✅ **ErrorBoundary** - Immediate benefit, prevents crashes
2. ✅ **Spawn Options: defaultSize** - Easy win, better UX

**Phase 2 (Later):**
3. ✅ **Tmux Session Manager** (basic version) - Session cleanup
4. ✅ **WebSocket Reconnection** - Explicit reconnect messages

**Phase 3 (Optional):**
5. ✅ **Tmux Disconnect Skipping** - Optimization

---

## 🚀 Implementation Plan

### Step 1: ErrorBoundary (Immediate)
```bash
# Copy component
cp ~/workspace/opustrator/frontend/src/components/ErrorBoundary.tsx \
   ~/projects/terminal-tabs/src/components/

# Wrap critical sections in SimpleTerminalApp.tsx
<ErrorBoundary name="Terminal Display">
  {/* Terminal rendering */}
</ErrorBoundary>

<ErrorBoundary name="Tab Bar">
  {/* Tab bar */}
</ErrorBoundary>
```

### Step 2: Spawn Options defaultSize
```typescript
// Add to spawn-options.json schema
interface SpawnOption {
  // ... existing fields
  defaultSize?: { width: number; height: number };
}

// Use in spawning logic
const initialWidth = option.defaultSize?.width || 800;
const initialHeight = option.defaultSize?.height || 600;
```

### Step 3: Basic Tmux Session Manager
```javascript
// Add to backend/modules/tmux-session-manager.js
class TmuxSessionManager {
  listSessions() {
    // Return filtered list of tt-* sessions
  }

  killSession(sessionName) {
    // Kill specific session
  }

  killOrphanedSessions() {
    // Kill sessions not in terminal-tabs store
  }
}

// Add API endpoints
GET /api/tmux/sessions
DELETE /api/tmux/session/:name
POST /api/tmux/cleanup-orphans
```

---

## 🔍 Key Differences (Terminal-Tabs vs Opustrator)

| Feature | Opustrator | Terminal-Tabs | Winner |
|---------|-----------|---------------|---------|
| **Architecture** | Infinite canvas + dragging | Tab-based | Tabs (simpler) |
| **State** | Zustand + Jotai (dual) | Zustand only | Tabs (simpler) |
| **Error Handling** | ErrorBoundary everywhere | None | Opustrator ⚠️ |
| **Session Management** | Full tmux manager | Basic reconnect | Opustrator |
| **Spawn Options** | defaultSize included | Missing defaultSize | Opustrator |
| **Persistence** | File-based layouts | localStorage | Tabs (simpler) |
| **WebSocket** | Explicit reconnect | Auto-matching | Tie |
| **Complexity** | ~5,000 LOC components | ~1,500 LOC | Tabs (goal!) |

---

## 📝 Notes

**What Terminal-Tabs does BETTER:**
- ✅ Simpler architecture (no canvas complexity)
- ✅ Better multi-window support (window isolation)
- ✅ Split terminals (native, not tmux panes)
- ✅ Cleaner state management (single store)
- ✅ More focused feature set

**What Opustrator does BETTER:**
- ✅ Error boundaries (prevents crashes)
- ✅ Session management (visibility + cleanup)
- ✅ Explicit reconnection (clearer semantics)
- ✅ More spawn option metadata

**Philosophy:**
- Port only what improves robustness/UX without adding complexity
- Avoid canvas-specific features (that's why we created Terminal-tabs!)
- Keep Terminal-tabs focused on tab-based simplicity

---

## 🎯 Success Metrics

**After porting these improvements:**
- [ ] App no longer crashes on component errors (ErrorBoundary)
- [ ] Users can see and cleanup orphaned tmux sessions
- [ ] Terminals spawn with appropriate default sizes
- [ ] Clearer reconnection messages in logs
- [ ] Still significantly simpler than Opustrator (~50% LOC)

---

**Created:** November 12, 2025
**Status:** Ready for implementation
