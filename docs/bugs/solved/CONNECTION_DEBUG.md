# Next Session: Chrome Extension Connection Debug

**Date:** 2025-11-17
**Status:** Extension builds successfully, backend connects, but sidepanel shows "Disconnected"

---

## 🎯 Current Problem

**Symptom:** Sidepanel shows "Disconnected" badge despite backend WebSocket being connected.

**What Works:**
- ✅ Extension builds without errors (`npm run build:extension`)
- ✅ Backend runs on port 8128 (`./start-backend.sh`)
- ✅ Backend WebSocket connects successfully
- ✅ Backend logs show: "✅ Background WebSocket connected"
- ✅ Backend receives messages: "📨 WS message received: terminals", "memory-stats"
- ✅ No more "Could not create options page" error (was fixed)

**What Doesn't Work:**
- ❌ Sidepanel badge shows "Disconnected" instead of "Connected"
- ❌ Sidepanel may not be receiving `INITIAL_STATE` message from background worker

---

## 🔧 What Was Fixed This Session

### 1. **Port Isolation** ✅
- Extension backend uses port **8128** (not 8127)
- Main app uses port **8127**
- No conflicts between apps

**Files:**
- `backend/.env` - `PORT=8128`
- `extension/background/background.ts:9` - `WS_URL = 'ws://localhost:8128'`

### 2. **Messaging Architecture** ✅
- Changed from one-time messaging to port-based messaging
- Added `connectToBackground()` helper in `extension/shared/messaging.ts`
- Background worker broadcasts to connected ports

**Files:**
- `extension/shared/messaging.ts:127-142` - `connectToBackground()` helper
- `extension/sidepanel/sidepanel.tsx:34` - Uses port connection
- `extension/components/Terminal.tsx:129` - Uses port connection

### 3. **Race Condition Fix** ✅
- Added `INITIAL_STATE` message type
- Background worker sends current WebSocket state when port connects
- Sidepanel should receive status immediately on mount

**Files:**
- `extension/shared/messaging.ts:4` - Added `INITIAL_STATE` to MessageType
- `extension/shared/messaging.ts:99-102` - `InitialStateMessage` interface
- `extension/background/background.ts:214-221` - Sends INITIAL_STATE on port connection
- `extension/sidepanel/sidepanel.tsx:38-40` - Handles INITIAL_STATE

**Critical Code (background.ts:210-232):**
```typescript
chrome.runtime.onConnect.addListener((port) => {
  console.log('🔌 Client connected:', port.name)
  connectedClients.add(port)

  // ✅ IMMEDIATELY send current WebSocket state to newly connected client
  const currentState = ws?.readyState === WebSocket.OPEN
  console.log('📤 Sending initial state to', port.name, '- WebSocket:', currentState ? 'connected' : 'disconnected')
  port.postMessage({
    type: 'INITIAL_STATE',
    wsConnected: currentState,
  })
  // ...
})
```

### 4. **Vite Build Paths** ✅
- Changed from absolute paths (`/assets/...`) to relative paths (`../assets/...`)
- Fixed "Could not load script" errors

**Files:**
- `vite.config.extension.ts:10` - Added `base: './'`

**Verification:**
```bash
# Check built HTML has relative paths
cat dist-extension/sidepanel/sidepanel.html
# Should show: <script src="../assets/sidepanel.html-*.js">
# NOT: <script src="/assets/sidepanel.html-*.js">
```

### 5. **Window ID Fixes** ✅
- Fixed popup using `WINDOW_ID_CURRENT` (doesn't work in popups)
- Fixed background using `WINDOW_ID_CURRENT` (doesn't work in service workers)
- Both now use `chrome.windows.getAll({ windowTypes: ['normal'] })`

**Files:**
- `extension/popup/popup.tsx:85, 105` - Fixed window selection
- `extension/background/background.ts:120-126` - Fixed window selection

### 6. **Spawn Message Format** ✅
- Backend expects `{ type: 'spawn', config: {...} }`
- Extension was sending wrong format
- Fixed in background worker spawn handler

**Files:**
- `extension/background/background.ts:139-152` - Correct spawn format

---

## 🔍 Debugging Steps for Next Session

### Step 1: Verify Backend is Running

```bash
# Check if backend is running on port 8128
lsof -i :8128

# Expected output:
# node    12345 matt   21u  IPv6 ... TCP *:8128 (LISTEN)

# If not running, start it:
cd ~/projects/terminal-tabs-extension
./start-backend.sh
```

### Step 2: Check Background Worker Console

1. Go to `chrome://extensions`
2. Find "Terminal Tabs - Browser Edition"
3. Click **"service worker"** (blue link)
4. Look for these logs:

**Expected logs when sidepanel opens:**
```
🔌 Client connected: sidepanel
📤 Sending initial state to sidepanel - WebSocket: connected
```

**If missing:**
- Port connection may not be establishing
- Check for errors in service worker console

### Step 3: Check Sidepanel Console

1. Open sidepanel (right-click extension icon → "Open Side Panel")
2. Right-click in sidepanel → "Inspect"
3. Look for these logs:

**Expected logs:**
```
[Sidepanel] Connecting to background worker...
[Sidepanel] Message received: INITIAL_STATE
[Sidepanel] 📥 Received initial state - WebSocket: connected
```

**If you see:**
```
[Sidepanel] Connecting to background worker...
// Nothing else
```

**Then:** Port connection is not establishing or message is not being sent.

**If you see:**
```
[Sidepanel] Connecting to background worker...
[Sidepanel] Message received: INITIAL_STATE
[Sidepanel] 📥 Received initial state - WebSocket: disconnected
```

**Then:** Background worker thinks WebSocket is disconnected (check backend status).

### Step 4: Verify Message Flow

**Add temporary debug logging to background worker:**

Edit `extension/background/background.ts:218-221`:
```typescript
const currentState = ws?.readyState === WebSocket.OPEN
console.log('📤 DEBUG:', {
  portName: port.name,
  wsExists: !!ws,
  wsReadyState: ws?.readyState,
  wsOpen: WebSocket.OPEN,
  currentState: currentState,
})
port.postMessage({
  type: 'INITIAL_STATE',
  wsConnected: currentState,
})
```

**Rebuild and check output:**
```bash
npm run build:extension
# Reload extension
# Open sidepanel
# Check service worker console for DEBUG output
```

### Step 5: Test Port Communication Directly

**Add test to sidepanel.tsx after line 34:**
```typescript
const port = connectToBackground('sidepanel', (message) => {
  console.log('[Sidepanel] ⚠️ RAW MESSAGE:', message)
  console.log('[Sidepanel] Message type:', message.type)
  console.log('[Sidepanel] Message keys:', Object.keys(message))
  // ... rest of handler
})
```

This will show if messages are being received at all.

---

## 🐛 Potential Issues to Investigate

### Issue 1: Port Connection Not Establishing

**Symptom:** Background logs "🔌 Client connected" but sidepanel doesn't receive messages

**Possible Causes:**
1. `connectToBackground()` helper has a bug
2. Port name mismatch (sidepanel vs terminal-*)
3. Message serialization issue (can't serialize certain types)

**Debug:**
```typescript
// In extension/shared/messaging.ts:127-142
export function connectToBackground(name, onMessageCallback) {
  console.log('[Messaging] Connecting port:', name) // Add this
  const port = chrome.runtime.connect({ name });

  port.onMessage.addListener((message) => {
    console.log('[Messaging] Received on port', name, ':', message) // Add this
    onMessageCallback(message);
  });

  return port;
}
```

### Issue 2: WebSocket State Check Timing

**Symptom:** Background sends INITIAL_STATE before WebSocket is actually connected

**Possible Causes:**
1. `ws?.readyState === WebSocket.OPEN` evaluates incorrectly
2. WebSocket connects AFTER sidepanel opens
3. Race condition in WebSocket connection establishment

**Debug:**
```typescript
// In extension/background/background.ts:27-31
ws.onopen = () => {
  console.log('✅ Background WebSocket connected')
  console.log('   ReadyState:', ws.readyState, '=== OPEN?', ws.readyState === WebSocket.OPEN)
  updateBadge()
  broadcastToClients({ type: 'WS_CONNECTED' })
}
```

### Issue 3: Message Type Not Recognized

**Symptom:** Sidepanel receives message but doesn't handle INITIAL_STATE

**Debug:**
Check sidepanel.tsx:38 - ensure if statement is correct:
```typescript
if (message.type === 'INITIAL_STATE') {
  console.log('[Sidepanel] ✅ INITIAL_STATE handler fired!')
  console.log('[Sidepanel] wsConnected value:', message.wsConnected)
  setWsConnected(message.wsConnected)
}
```

### Issue 4: React State Not Updating

**Symptom:** `setWsConnected(true)` is called but badge still shows "Disconnected"

**Possible Causes:**
1. React state update batching
2. Component re-render issue
3. Badge reading from wrong state

**Debug:**
```typescript
// In sidepanel.tsx after line 40:
if (message.type === 'INITIAL_STATE') {
  console.log('[Sidepanel] Current wsConnected state:', wsConnected)
  setWsConnected(message.wsConnected)
  console.log('[Sidepanel] After setState:', message.wsConnected)

  // Check if state actually updates on next render
  setTimeout(() => {
    console.log('[Sidepanel] State after 100ms:', wsConnected)
  }, 100)
}
```

---

## 📁 Key Files Reference

### Configuration
- `backend/.env` - Backend port (8128)
- `vite.config.extension.ts` - Build config (base: './')
- `extension/manifest.json` - Extension manifest

### Messaging
- `extension/shared/messaging.ts` - Message types, connectToBackground()
- `extension/background/background.ts` - Service worker, WebSocket, port handler
- `extension/sidepanel/sidepanel.tsx` - UI, port connection, state management

### Build Output
- `dist-extension/manifest.json` - Check service worker path
- `dist-extension/sidepanel/sidepanel.html` - Check script paths (should be relative)
- `dist-extension/assets/background.ts-*.js` - Compiled background worker

---

## 🔬 Advanced Debugging: Manual Message Test

If all else fails, test the port communication manually:

**1. Open sidepanel**

**2. In sidepanel console, run:**
```javascript
// Test if we can receive messages from background
const testPort = chrome.runtime.connect({ name: 'test-port' });
testPort.onMessage.addListener((msg) => {
  console.log('TEST PORT RECEIVED:', msg);
});
console.log('Test port connected:', testPort);
```

**3. In background worker console, run:**
```javascript
// Send test message to all connected clients
connectedClients.forEach(port => {
  console.log('Sending test to:', port.name);
  port.postMessage({ type: 'TEST', data: 'Hello from background!' });
});
```

**4. Check sidepanel console for "TEST PORT RECEIVED"**

If this works → Port communication is fine, issue is in INITIAL_STATE handling
If this fails → Port communication is broken, issue is in Chrome extension API usage

---

## 🚀 Quick Start Commands

```bash
# Start backend (if not running)
cd ~/projects/terminal-tabs-extension
./start-backend.sh

# Rebuild extension
npm run build:extension

# Load in Chrome
# 1. chrome://extensions
# 2. Enable Developer mode
# 3. Click "Load unpacked"
# 4. Select dist-extension/
# OR just click reload button if already loaded

# Check logs
# 1. chrome://extensions → "service worker" → background logs
# 2. Right-click sidepanel → Inspect → sidepanel logs
```

---

## 📊 Success Criteria

Extension is working when:
- ✅ Backend shows "WebSocket Server ready" on port 8128
- ✅ Background worker shows "✅ Background WebSocket connected"
- ✅ Background worker shows "🔌 Client connected: sidepanel"
- ✅ Background worker shows "📤 Sending initial state to sidepanel - WebSocket: connected"
- ✅ Sidepanel shows "[Sidepanel] 📥 Received initial state - WebSocket: connected"
- ✅ Sidepanel badge shows "Connected" (green)
- ✅ Clicking "New Terminal" spawns a terminal
- ✅ Terminal shows xterm.js interface with cursor
- ✅ Typing commands shows output

---

## 🎯 Recommended Next Steps

1. **First:** Run all debugging steps above to identify WHERE the connection is failing
2. **Check:** Background worker console for port connection and INITIAL_STATE sending
3. **Check:** Sidepanel console for message receipt
4. **If messages not received:** Debug `connectToBackground()` helper
5. **If messages received but not handled:** Debug message type matching
6. **If state updates but badge doesn't change:** Debug React component rendering

---

## 💡 Alternative Approaches (If Current Approach Fails)

### Option A: Use Chrome Storage for State Sync

Instead of port messaging, use Chrome Storage API:

```typescript
// Background worker
chrome.storage.local.set({ wsConnected: true });

// Sidepanel
chrome.storage.local.get(['wsConnected'], (result) => {
  setWsConnected(result.wsConnected || false);
});

chrome.storage.onChanged.addListener((changes) => {
  if (changes.wsConnected) {
    setWsConnected(changes.wsConnected.newValue);
  }
});
```

### Option B: Request-Response Pattern

Instead of broadcasting, have sidepanel REQUEST status:

```typescript
// Sidepanel
chrome.runtime.sendMessage({ type: 'GET_STATUS' }, (response) => {
  setWsConnected(response.wsConnected);
});

// Background
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_STATUS') {
    sendResponse({ wsConnected: ws?.readyState === WebSocket.OPEN });
  }
  return true;
});
```

---

## 📝 Files Modified This Session

1. `extension/shared/messaging.ts` - Added INITIAL_STATE, connectToBackground()
2. `extension/background/background.ts` - Send INITIAL_STATE on port connect, fixed window selection
3. `extension/sidepanel/sidepanel.tsx` - Handle INITIAL_STATE, use port connection
4. `extension/components/Terminal.tsx` - Handle INITIAL_STATE
5. `extension/popup/popup.tsx` - Fixed window selection for side panel
6. `vite.config.extension.ts` - Added base: './'
7. `start-backend.sh` - New script for backend startup

---

**Good luck with the next session! The extension is very close to working.** 🚀
