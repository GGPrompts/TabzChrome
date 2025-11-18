# Next Session: xterm.js Integration for Chrome Extension

**Goal:** Integrate xterm.js terminal display into the Chrome extension's side panel and DevTools panel.

---

## 🎯 Current Status

### ✅ What's Working
- Chrome extension loads successfully
- Popup shows 15 spawn options (bundled from spawn-options.json)
- WebSocket connection to backend (port 8128) ✅ Connected
- Background service worker maintains connection
- Context menus registered
- Icons created

### ⚠️ What Needs Implementation
- **Side Panel:** Shows placeholder UI, no terminal display
- **DevTools Panel:** Shows placeholder UI, no terminal display
- **Terminal Spawning:** Backend receives spawn requests, but no terminal I/O displayed

---

## 📋 Task: Integrate xterm.js

### Reference Implementation
The main app already has a working `Terminal.tsx` component at:
```
/home/matt/projects/terminal-tabs/src/components/Terminal.tsx
```

This component:
- Uses `xterm` and `xterm-addon-fit` packages
- Connects to WebSocket for terminal I/O
- Handles resize, fit, focus
- Supports themes and transparency
- Works with tmux sessions

### Files to Update

#### 1. **Side Panel** (`extension/sidepanel/sidepanel.tsx`)
**Current state:** Placeholder with session tabs, no terminal view

**What to add:**
- Import/adapt Terminal.tsx component
- Connect to WebSocket via background worker
- Handle terminal I/O (input → backend, output → xterm)
- Support multiple terminal tabs
- Preserve existing UI (tabs, connection status, pin toggle)

**Key considerations:**
- Extension context: Use `chrome.runtime.sendMessage()` for WebSocket communication
- Background worker routes messages to/from backend
- Terminal component should be self-contained (no main app dependencies)

---

#### 2. **DevTools Panel** (`extension/devtools/panel.tsx`)
**Current state:** Network viewer + cURL generator, no terminal view

**What to add:**
- Same Terminal.tsx integration as side panel
- Split layout: Network viewer (top) + Terminal (bottom)
- Resizable divider between panels
- Copy cURL → paste to terminal functionality

**Key considerations:**
- DevTools has separate context (use `chrome.devtools.inspectedWindow`)
- Need to communicate with background worker via `chrome.runtime`

---

### Implementation Steps

#### Step 1: Copy & Adapt Terminal Component
```bash
# Copy Terminal.tsx to extension
cp src/components/Terminal.tsx extension/components/Terminal.tsx

# Modify imports:
# - Remove main app-specific imports (stores, hooks)
# - Add Chrome extension message passing
# - Keep xterm.js imports
```

**Key modifications needed:**
```typescript
// Before (main app):
import { useSimpleTerminalStore } from '../stores/simpleTerminalStore'

// After (extension):
// No zustand store - use props or local state
// Communication via chrome.runtime.sendMessage()
```

---

#### Step 2: Add xterm.js Dependencies
```bash
cd /home/matt/projects/terminal-tabs-extension
npm install xterm xterm-addon-fit xterm-addon-web-links
```

**Note:** These are likely already in package.json since it was copied from main project. Verify with:
```bash
grep xterm package.json
```

---

#### Step 3: Update Side Panel

**File:** `extension/sidepanel/sidepanel.tsx`

**Changes:**
1. Import Terminal component
2. Add state for active terminal
3. Connect to background worker WebSocket messages
4. Render Terminal component when tab is active

**Pseudo-code:**
```typescript
import Terminal from '../components/Terminal'

function SidePanelTerminal() {
  const [terminals, setTerminals] = useState<Terminal[]>([])
  const [activeTerminalId, setActiveTerminalId] = useState<string>()

  // Listen for messages from background worker
  useEffect(() => {
    const messageListener = (message: any) => {
      if (message.type === 'terminal-output') {
        // Forward to xterm terminal
        updateTerminalOutput(message.terminalId, message.data)
      }
    }
    chrome.runtime.onMessage.addListener(messageListener)
    return () => chrome.runtime.onMessage.removeListener(messageListener)
  }, [])

  // Send input to background worker → backend
  const handleTerminalInput = (terminalId: string, data: string) => {
    chrome.runtime.sendMessage({
      type: 'terminal-input',
      terminalId,
      data
    })
  }

  return (
    <div>
      {/* Tabs for switching terminals */}
      <TerminalTabs />

      {/* Active terminal display */}
      {activeTerminalId && (
        <Terminal
          terminalId={activeTerminalId}
          onInput={handleTerminalInput}
        />
      )}
    </div>
  )
}
```

---

#### Step 4: Update Background Worker Message Routing

**File:** `extension/background/background.ts`

**Current state:** Maintains WebSocket connection, routes basic messages

**Add:**
```typescript
// Listen for terminal-input from sidepanel/devtools
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'terminal-input') {
    // Forward to backend via WebSocket
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'input',
        terminalId: message.terminalId,
        data: message.data
      }))
    }
  }
})

// Listen for terminal-output from backend WebSocket
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)

  if (message.type === 'output') {
    // Broadcast to all extension pages (sidepanel, devtools, popup)
    chrome.runtime.sendMessage({
      type: 'terminal-output',
      terminalId: message.terminalId,
      data: message.data
    })
  }
}
```

---

#### Step 5: Handle Terminal Spawning

**Flow:**
1. User clicks "Bash" in popup
2. Popup sends `SPAWN_TERMINAL` message to background worker
3. Background worker sends spawn request to backend via WebSocket
4. Backend spawns terminal and returns `terminal-spawned` event
5. Background worker broadcasts to sidepanel/devtools
6. Sidepanel creates new tab with Terminal component
7. Terminal component connects to I/O stream

**Already implemented:** Popup → background worker → backend
**Need to implement:** Backend response → sidepanel terminal creation

---

### Testing Checklist

After implementation, test these scenarios:

- [ ] **Spawn Bash from popup** → Terminal appears in side panel
- [ ] **Type commands** → Input reaches backend, output displays
- [ ] **Terminal resize** → xterm.fit() adapts to container size
- [ ] **Multiple terminals** → Tabs work, switching shows correct terminal
- [ ] **Reconnect** → Refresh extension, terminals reattach to tmux sessions
- [ ] **DevTools panel** → Terminal works in DevTools tab
- [ ] **Copy cURL** → Paste into DevTools terminal, runs successfully

---

## 🐛 Common Issues & Solutions

### Issue 1: xterm.js doesn't render
**Cause:** Container has 0 width/height
**Solution:** Ensure parent div has explicit dimensions or `flex: 1`

```css
.terminal-container {
  flex: 1;
  min-height: 0; /* Important for flex layouts */
}
```

---

### Issue 2: Input not reaching backend
**Cause:** Message passing not set up correctly
**Solution:** Check background worker logs:
```javascript
// In background.ts, add:
console.log('📤 Sending to backend:', message)

// In sidepanel, add:
console.log('📨 Received from backend:', message)
```

---

### Issue 3: Terminal doesn't fit container
**Cause:** xterm-addon-fit not applied
**Solution:**
```typescript
import { FitAddon } from 'xterm-addon-fit'

const fitAddon = new FitAddon()
terminal.loadAddon(fitAddon)
fitAddon.fit()
```

---

### Issue 4: WebSocket messages not reaching extension
**Cause:** Background worker not broadcasting
**Solution:** Use `chrome.runtime.sendMessage()` to broadcast to all pages:
```typescript
// Broadcasts to popup, sidepanel, devtools
chrome.runtime.sendMessage(message)
```

---

## 📁 File Structure After Implementation

```
extension/
├── components/
│   ├── Terminal.tsx          ← NEW (adapted from main app)
│   └── ui/                   ✅ shadcn components
├── sidepanel/
│   ├── sidepanel.tsx         ← UPDATE (add Terminal component)
│   └── sidepanel.html        ✅ entry point
├── devtools/
│   ├── panel.tsx             ← UPDATE (add Terminal component)
│   ├── panel.html            ✅ entry point
│   └── devtools.ts           ✅ registration
├── background/
│   └── background.ts         ← UPDATE (route terminal I/O)
└── popup/
    └── popup.tsx             ✅ working (spawns terminals)
```

---

## 🔗 Reference Files

### Main App Terminal Implementation
- **Component:** `/home/matt/projects/terminal-tabs/src/components/Terminal.tsx`
- **Store:** `/home/matt/projects/terminal-tabs/src/stores/simpleTerminalStore.ts`
- **Spawn Service:** `/home/matt/projects/terminal-tabs/src/services/SimpleSpawnService.ts`

### Extension Files to Modify
- **Side Panel:** `/home/matt/projects/terminal-tabs-extension/extension/sidepanel/sidepanel.tsx`
- **DevTools Panel:** `/home/matt/projects/terminal-tabs-extension/extension/devtools/panel.tsx`
- **Background Worker:** `/home/matt/projects/terminal-tabs-extension/extension/background/background.ts`

### Backend (Already Running)
- **Server:** Port 8128 (extension worktree)
- **WebSocket:** `ws://localhost:8128`
- **Status:** ✅ Running and accepting connections

---

## 🚀 Success Criteria

Extension is complete when:

1. ✅ Click "Bash" in popup → Terminal spawns in side panel
2. ✅ Type `ls` → Output displays in xterm.js terminal
3. ✅ Terminal resizes with container
4. ✅ Multiple terminals work (tabs switch correctly)
5. ✅ DevTools terminal works
6. ✅ Copy cURL from network viewer → Runs in terminal
7. ✅ Extension survives reload (tmux sessions persist)

---

## 💡 Tips for Implementation

1. **Start with side panel only** - Get one working before duplicating to DevTools
2. **Use main app Terminal.tsx as reference** - It already handles all xterm edge cases
3. **Test message passing first** - Console.log messages before rendering terminal
4. **Check background worker console** - All WebSocket activity logged there
5. **Verify backend logs** - `tmux capture-pane -t tabz:backend -p -S -50`

---

## 🔧 Backend Already Configured

No backend changes needed! The backend at port 8128 is already:
- ✅ Accepting WebSocket connections
- ✅ Handling spawn requests
- ✅ Routing terminal I/O
- ✅ Managing tmux sessions

Just need to wire up the frontend extension components.

---

## 📊 Estimated Time

- **Step 1-2:** Copy Terminal.tsx + verify dependencies (15 min)
- **Step 3:** Implement side panel integration (30 min)
- **Step 4:** Update background worker routing (15 min)
- **Step 5:** Test and fix issues (30 min)
- **Bonus:** DevTools panel integration (20 min)

**Total:** ~2 hours for full xterm.js integration

---

**Ready to go!** Backend is running, extension loads, spawn options work. Just need to connect xterm.js to display the actual terminal output. 🚀
