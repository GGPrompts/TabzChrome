# Next Session: Debug Context Menu & Terminal Persistence

**Date**: November 21, 2025
**Status**: Two issues need investigation

---

## 🐛 Issue 1: Context Menu Not Appearing

### Problem
User cannot see the "Paste to Terminal" context menu when selecting text on webpages.

### Expected Behavior
1. Select text on any webpage
2. Right-click
3. See "Paste '[selected text]' to Terminal" in context menu

### What Was Implemented
- **File**: `extension/background/background.ts` (lines 289-320)
- Context menu registered with `chrome.contextMenus.create()`
- Menu ID: `paste-to-terminal`
- Contexts: `['selection']`
- Title: `'Paste "%s" to Terminal'` (%s = selected text)

### Debugging Steps

#### 1. Check Service Worker Console
```bash
# In Chrome:
# 1. Go to chrome://extensions
# 2. Find "Terminal Tabs - Browser Edition"
# 3. Click "Inspect views: service worker"
# 4. Check console for:
#    - "Setting up context menus..."
#    - "✅ Context menus created"
```

#### 2. Verify Context Menus Were Created
```javascript
// In service worker console, run:
chrome.contextMenus.getAll((menus) => {
  console.log('Registered context menus:', menus);
});

// Expected output:
// [
//   { id: 'toggle-sidepanel', title: 'Toggle Terminal Sidebar', contexts: ['all'] },
//   { id: 'paste-to-terminal', title: 'Paste "%s" to Terminal', contexts: ['selection'] }
// ]
```

#### 3. Check for Errors
```javascript
// In service worker console, look for:
chrome.runtime.lastError
// Should be null/undefined if no errors
```

#### 4. Verify Permissions
Check `extension/manifest.json`:
```json
{
  "permissions": [
    "contextMenus",  // ✅ Required for context menus
    "storage",
    "tabs",
    // ...
  ]
}
```

#### 5. Test Context Menu Registration Timing
The code calls `setupContextMenus()` on service worker startup (line 320).

**Potential Issue**: Service worker might not be ready yet.

**Fix to Try**:
```typescript
// In background.ts, wrap in chrome.runtime.onStartup:
chrome.runtime.onStartup.addListener(() => {
  console.log('Service worker started');
  setupContextMenus();
});

// And keep the immediate call:
setupContextMenus();
```

#### 6. Check if Context Menu Click Handler Works
Add logging to click handler (line 323):
```typescript
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  console.log('🎯 Context menu clicked!', {
    menuItemId: info.menuItemId,
    selectionText: info.selectionText,
    tabId: tab?.id,
    windowId: tab?.windowId
  });

  // Rest of handler...
});
```

### Common Causes

1. **Service worker not running**
   - Extensions can sleep/wake up
   - Context menus need to be re-registered each wake

2. **Manifest V3 limitations**
   - Context menus may need `activeTab` permission
   - Try adding: `"permissions": ["activeTab"]`

3. **Context type mismatch**
   - `contexts: ['selection']` only shows when text is selected
   - Try changing to `['all']` temporarily to test

4. **Extension reload didn't work**
   - Try **removing and re-adding** the extension instead
   - Hard reload: Disable → Re-enable

### Quick Test
```typescript
// Simplest possible test - add to background.ts:
chrome.contextMenus.create({
  id: 'test-menu',
  title: 'TEST MENU - ALWAYS VISIBLE',
  contexts: ['all']  // Shows everywhere
});

// If this doesn't show, problem is deeper (permissions, manifest, etc.)
```

---

## 🐛 Issue 2: Terminals Not Persisting

### Problem
Terminals disappear when closing and reopening the sidebar.

### Expected Behavior
1. Spawn terminal in sidebar
2. Close sidebar (extension icon or click away)
3. Reopen sidebar
4. Terminal should still be there (tmux session survives)

### Current Architecture

**Terminal Lifecycle**:
```
1. User spawns terminal
   ↓
2. Backend creates tmux session
   - Session name: "Bash", "Projects", etc.
   - Terminal ID: ctt-<uuid>
   ↓
3. Frontend stores session in state (sessions array)
   - NOT in Chrome storage (only profiles are stored)
   ↓
4. User closes sidebar
   - Component unmounts
   - State is lost ❌
   - Tmux session survives ✅
   ↓
5. User reopens sidebar
   - New component instance
   - State is empty (no sessions)
   - Tmux sessions still running but not shown
```

### Root Cause
**Terminals are NOT persisted to Chrome storage**, only kept in React state.

When the sidebar closes, React component unmounts and state is lost.

### Files to Check

#### 1. `extension/sidepanel/sidepanel.tsx`
Look for Chrome storage persistence:
```typescript
// Check if sessions are saved to chrome.storage.local
useEffect(() => {
  // Should save sessions when they change
  chrome.storage.local.set({ sessions });
}, [sessions]);

// Should load sessions on mount
useEffect(() => {
  chrome.storage.local.get(['sessions'], (result) => {
    if (result.sessions) {
      setSessions(result.sessions);
    }
  });
}, []);
```

**Current Status**: Check if this exists. If not, that's the problem.

#### 2. Backend Terminal Registry
Check `backend/modules/terminal-registry.js`:
```javascript
// Backend should track active tmux sessions
// When frontend reconnects, it should send terminal list

// Look for WebSocket message handler:
case 'list-terminals':
  // Should return all active ctt-* sessions
```

#### 3. WebSocket Reconnection
Check `extension/background/background.ts`:
```typescript
ws.onopen = () => {
  console.log('✅ Background WebSocket connected');
  // Should request terminal list here:
  sendToWebSocket({ type: 'list-terminals' });
};
```

### Debugging Steps

#### 1. Check if Tmux Sessions Survive
```bash
# In terminal, after closing sidebar:
tmux ls | grep "^ctt-"

# Should show:
# ctt-<uuid>: 1 windows (created ...)
# Bash: 1 windows (created ...)
```

If tmux sessions exist but UI doesn't show them → persistence issue.
If tmux sessions are gone → backend is killing them on disconnect.

#### 2. Check Chrome Storage
```javascript
// In sidebar console (F12 on sidebar):
chrome.storage.local.get(null, (data) => {
  console.log('All stored data:', data);
});

// Should include:
// - profiles: [...]
// - sessions: [...] ← Check if this exists
```

#### 3. Check WebSocket Messages
```javascript
// In service worker console:
// Look for 'terminals' message after reconnect:
// { type: 'terminals', data: [...] }
```

### Likely Solution

**Add session persistence to `sidepanel.tsx`**:

```typescript
// Load sessions from storage on mount
useEffect(() => {
  chrome.storage.local.get(['sessions'], (result) => {
    if (result.sessions) {
      console.log('📥 Restored sessions from storage:', result.sessions);
      setSessions(result.sessions);
    }
  });
}, []);

// Save sessions to storage when they change
useEffect(() => {
  if (sessions.length > 0) {
    chrome.storage.local.set({ sessions });
    console.log('💾 Saved sessions to storage:', sessions);
  }
}, [sessions]);
```

**Alternative**: Request terminal list from backend on connect:

```typescript
// In sidepanel.tsx, when WS connects:
if (message.type === 'WS_CONNECTED') {
  setWsConnected(true);

  // Request terminal list from backend
  sendMessage({ type: 'REFRESH_TERMINALS' });
}
```

Then backend sends back active terminals and UI restores them.

---

## 🔍 Investigation Priority

### Priority 1: Context Menu (Blocking)
This is a **new feature that should work** but isn't showing up.

**Quick test**:
1. Change `contexts: ['selection']` to `contexts: ['all']`
2. Rebuild & reload
3. Right-click anywhere - should see menu
4. If it shows → problem is with `'selection'` context
5. If it doesn't → deeper issue (permissions, registration, etc.)

### Priority 2: Terminal Persistence (Regression?)
Need to determine if this **ever worked** or is a new issue.

**Quick test**:
1. Spawn terminal
2. Check Chrome storage: `chrome.storage.local.get(['sessions'])`
3. If sessions are stored → problem is loading
4. If not stored → need to add persistence

---

## 🚀 Quick Fixes to Try First

### Fix 1: Force Context Menu to Show (Debug)
```typescript
// In background.ts, change contexts:
chrome.contextMenus.create({
  id: 'paste-to-terminal',
  title: 'Paste to Terminal (DEBUG)',
  contexts: ['all']  // ← Changed from ['selection']
});
```

### Fix 2: Add Session Persistence
```typescript
// In sidepanel.tsx, after line 27:
const [pasteCommand, setPasteCommand] = useState<string | null>(null)

// Add these effects:

// Load sessions on mount
useEffect(() => {
  chrome.storage.local.get(['terminalSessions'], (result) => {
    if (result.terminalSessions) {
      console.log('📥 Restored sessions:', result.terminalSessions)
      setSessions(result.terminalSessions)
    }
  })
}, [])

// Save sessions when they change
useEffect(() => {
  if (sessions.length > 0) {
    chrome.storage.local.set({ terminalSessions: sessions })
  }
}, [sessions])
```

---

## 📋 Files to Review

1. **extension/background/background.ts** (lines 289-340)
   - Context menu registration
   - Click handler

2. **extension/sidepanel/sidepanel.tsx** (lines 19-100)
   - Session state management
   - Chrome storage integration

3. **extension/manifest.json**
   - Permissions (contextMenus, activeTab?)

4. **backend/modules/terminal-registry.js**
   - Terminal list endpoint
   - Session tracking

---

## 🎯 Success Criteria

### Context Menu Working:
- ✅ Select text on webpage
- ✅ Right-click shows "Paste to Terminal"
- ✅ Click menu → Sidebar opens
- ✅ Text appears in terminal input

### Terminal Persistence Working:
- ✅ Spawn terminal
- ✅ Close sidebar
- ✅ Reopen sidebar
- ✅ Terminal still visible and connected
- ✅ Tmux session still running

---

## 📝 Current State

**Backend**: Running on port 8129 ✅
**Extension**: Built and deployed to Windows ✅
**Build Output**: `dist-extension/` ✅

**Context Menu Code**: Implemented ✅ (but not showing)
**Paste Handler**: Implemented ✅
**Terminal Persistence**: Unknown (needs investigation)

---

## 🛠️ Quick Start Commands

```bash
# Rebuild extension
npm run build:extension

# Copy to Windows
rsync -av --delete dist-extension/ /mnt/c/Users/marci/Desktop/terminal-tabs-extension/dist-extension/

# Check tmux sessions
tmux ls | grep "^ctt-"

# Start backend (if not running)
cd backend && npm start
```

---

**Next Session Goal**: Get context menu showing and terminal persistence working.
