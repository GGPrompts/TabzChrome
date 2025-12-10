# Debug Session - Chrome Extension Terminal Display

## Current Status (Nov 15, 2025)

### ✅ What's Working

1. **Backend Running Correctly**
   - Port 8128 listening (confirmed via `lsof`)
   - WebSocket server active
   - Logs show: `[success] [Server] WebSocket client connected`
   - Active WS: 1, Terminals: 0

2. **Extension Built & Loaded**
   - All TypeScript compiles successfully
   - Extension loads in Chrome without errors
   - Popup displays 15 spawn options
   - Side panel UI renders

3. **Code Integration Complete**
   - ✅ Terminal.tsx component created (lightweight xterm.js wrapper)
   - ✅ Background worker routes TERMINAL_INPUT, TERMINAL_OUTPUT, TERMINAL_RESIZE
   - ✅ Message types added to messaging.ts
   - ✅ Side panel imports Terminal component
   - ✅ Spawn options clickable (added `value` prop to CommandItems)

### ❌ What's NOT Working

1. **Side Panel Shows "Disconnected"**
   - Badge displays red "Disconnected" instead of green "Connected"
   - Backend logs show WebSocket IS connected
   - Disconnect between backend state and UI state

2. **Spawn Options Grayed Out (Maybe)**
   - User reports options are grayed out
   - We added `value` props to fix cmdk selectability
   - May still have CSS/interaction issue

3. **No Terminal Display**
   - Clicking "Bash" doesn't spawn visible terminal
   - Terminal component never renders

## 🔍 Root Cause Hypothesis

**WebSocket Connection Timing Issue:**
- Background worker connects to backend ✅
- Backend logs confirm connection ✅
- BUT: Side panel doesn't receive `WS_CONNECTED` message ❌

**Possible causes:**
1. Side panel loads before background worker establishes connection
2. Message broadcasting isn't reaching side panel
3. Side panel message listener not set up correctly
4. Race condition between panel open and WS handshake

## 🐛 Debug Steps for Next Session

### Step 1: Verify Message Flow

**Check background worker console:**
```javascript
// Open chrome://extensions/
// Click "Service worker" under Terminal Tabs
// Look for:
console.log('📤 Sending to clients:', message)
```

**Check side panel console:**
```javascript
// Right-click side panel → Inspect
// Look for:
[Sidepanel] Message received: WS_CONNECTED
```

### Step 2: Test Direct WebSocket State

Add this to `sidepanel.tsx` to bypass message system:

```typescript
useEffect(() => {
  // Direct check - does background worker have WS connection?
  chrome.runtime.sendMessage({ type: 'GET_WS_STATUS' }, (response) => {
    console.log('[Sidepanel] Direct WS status:', response)
    setWsConnected(response?.connected || false)
  })
}, [])
```

Then add to `background.ts`:

```typescript
case 'GET_WS_STATUS':
  sendResponse({ connected: ws?.readyState === WebSocket.OPEN })
  break
```

### Step 3: Force Reconnect on Panel Open

The issue might be that side panel opens AFTER background worker connects, so it misses the initial `WS_CONNECTED` broadcast.

**Fix:** Make background worker send current status when panel requests it:

```typescript
// In sidepanel.tsx - request status on mount
useEffect(() => {
  sendMessage({ type: 'REQUEST_WS_STATUS' })
}, [])

// In background.ts - respond with current status
case 'REQUEST_WS_STATUS':
  broadcastToClients({
    type: ws?.readyState === WebSocket.OPEN ? 'WS_CONNECTED' : 'WS_DISCONNECTED'
  })
  break
```

### Step 4: Check Terminal Spawn Flow

If side panel shows "Connected" after above fixes, test spawn:

1. Click "Bash" in popup
2. Check background worker console for `SPAWN_TERMINAL` message
3. Check backend logs for spawn request
4. Check if `terminal-spawned` event is broadcast back
5. Check if side panel receives event and creates terminal

**Expected backend log:**
```
[info] Spawning terminal: bash
[info] Created tmux session: tt-bash-xxxxx
```

**Expected side panel log:**
```
[Sidepanel] Received WS_MESSAGE: terminal-spawned
[Terminal] Initializing xterm for terminal: terminal-xxxxx
```

## 📁 Key Files to Check

### Extension Files
- `extension/background/background.ts` - WebSocket handling, message routing
- `extension/sidepanel/sidepanel.tsx` - Connection status display
- `extension/components/Terminal.tsx` - xterm.js rendering
- `extension/shared/messaging.ts` - Message type definitions

### Backend Files
- `backend/server.js` - WebSocket server (lines 27-60)
- `backend/.env` - PORT=8128 configuration

## 🔧 Quick Verification Commands

```bash
# Check backend is running on correct port
lsof -i :8128 | grep LISTEN

# Watch backend logs in real-time
tail -f /tmp/extension-backend-clean.log

# Check for WebSocket activity
tail -f /tmp/extension-backend-clean.log | grep -E "WebSocket|connected|spawn"

# Verify extension build is current
ls -lt dist-extension/assets/*.js | head -5
```

## 💡 Alternative Approaches

If message broadcasting is fundamentally broken:

### Option A: Use Chrome Storage for State Sync
```typescript
// Background worker updates storage
chrome.storage.local.set({ wsConnected: true })

// Side panel watches storage
chrome.storage.onChanged.addListener((changes) => {
  if (changes.wsConnected) {
    setWsConnected(changes.wsConnected.newValue)
  }
})
```

### Option B: Use Port Connections Instead of Messages
```typescript
// Side panel creates persistent port
const port = chrome.runtime.connect({ name: 'sidepanel' })
port.onMessage.addListener((msg) => {
  if (msg.type === 'WS_CONNECTED') setWsConnected(true)
})

// Background tracks ports and sends updates
connectedPorts.forEach(port => {
  port.postMessage({ type: 'WS_CONNECTED' })
})
```

## 📊 Session Summary

**Time spent:** ~3 hours
**Lines changed:** ~500
**Files modified:** 8
**Progress:** 80% complete (backend works, frontend integration has timing issue)

**Blocker:** Message passing between background worker and side panel not working reliably for WebSocket state updates.

**Next action:** Add direct status polling mechanism (Step 2 above) to bypass message broadcasting issue.

---

## 🚀 Success Criteria

Extension is complete when:
1. ✅ Side panel shows "Connected" badge (green) when backend is running
2. ✅ Clicking "Bash" spawns terminal in side panel
3. ✅ Terminal displays xterm.js with cursor
4. ✅ Typing `ls` shows directory listing
5. ✅ Multiple terminals work (tabs switch correctly)

**We are 1-2 debug iterations away from working terminals!**

---

## 💡 Future Enhancement Ideas

### Chrome Tab Groups Integration

**Idea:** Use Chrome's [Tab Groups API](https://developer.chrome.com/docs/extensions/reference/api/tabGroups) to organize terminal sessions.

**Potential Features:**
- Auto-group terminals by type (all Claude Code sessions in one group, all Bash in another)
- Color-code groups by project/workspace
- Collapse/expand groups of related terminals
- Sync tab groups with terminal sessions (create group when spawning related terminals)

**Use Cases:**
```javascript
// Example: Group all terminals from same project
chrome.tabGroups.update(groupId, {
  title: "Tabz Development",
  color: "blue",
  collapsed: false
})

// Example: Auto-collapse background terminals
chrome.tabGroups.update(groupId, {
  title: "Background Services",
  color: "grey",
  collapsed: true
})
```

**Implementation Notes:**
- Could integrate with spawn-options.json `projects` field
- Would work great with multi-window support (groups per window)
- Could replace or complement existing tab management in side panel

**Priority:** Post-MVP (after terminal display is working)

**Reference:** https://developer.chrome.com/docs/extensions/reference/api/tabGroups

---

### Chrome Built-in AI APIs Integration

**Idea:** Use Chrome's [Built-in AI APIs](https://developer.chrome.com/docs/extensions/ai) for intelligent terminal features.

**Available APIs (on-device via Gemini Nano):**
- **Summarizer API** - Summarize terminal output, command history
- **Writer API** - Generate session descriptions, commit messages
- **Prompt API** - General LLM for error explanations, command suggestions
- **Language Detector** - Auto-detect shell type, script language
- **Rewriter API** - Improve command suggestions, refine descriptions

**Why This is Perfect for Tabz:**
- ✅ **Privacy-first**: Runs locally (Gemini Nano) - terminal output stays on your machine
- ✅ **Free**: No API keys or quotas needed
- ✅ **Fast**: On-device = instant responses
- ✅ **Offline**: Works without internet connection

**Potential Features:**

1. **Smart Session Naming**
   ```javascript
   // AI analyzes commands to generate meaningful names
   const name = await ai.writer.write({
     context: "npm install, npm run build, npm test",
     task: "Generate concise session name"
   })
   // Result: "React Build Pipeline" (instead of "bash")
   ```

2. **Error Explanations**
   ```javascript
   // Click error message → Get plain English explanation
   const help = await ai.prompt.prompt(
     `Explain this error and suggest a fix: ${errorText}`
   )
   ```

3. **Command History Semantic Search**
   ```javascript
   // Search: "when did I fix the database issue?"
   // Finds relevant commands even with different wording
   const results = await ai.searchHistory(query, terminalHistory)
   ```

4. **Session Summaries**
   ```javascript
   // "What did I do in this terminal today?"
   const summary = await ai.summarizer.summarize(sessionHistory, {
     type: "key-points",
     length: "short"
   })
   ```

5. **Natural Language to Commands**
   ```javascript
   // User types: "show all node processes"
   // AI converts to: ps aux | grep node
   const command = await ai.prompt.prompt(
     `Convert to bash: ${naturalLanguage}`
   )
   ```

**Implementation Notes:**
- Some APIs require origin trial signup
- Gemini Nano runs on-device (privacy win for terminal output)
- Could integrate with existing auto-naming from tmux
- Perfect complement to Tab Groups (AI-named groups!)

**Priority:** Post-MVP (very exciting, but after terminals work)

**Reference:** https://developer.chrome.com/docs/extensions/ai

---

### Local LLMs via Docker Integration

**Idea:** Integrate with local LLMs running in Docker containers (Ollama, LM Studio, etc.)

**How It Works:**
Most Docker LLM containers expose OpenAI-compatible REST APIs on localhost:

```javascript
// Extension connects to Docker container on localhost
const response = await fetch('http://localhost:11434/api/generate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'codellama',
    prompt: 'Explain this terminal error and suggest a fix:\n' + errorText,
    stream: false
  })
})

const result = await response.json()
// Display explanation to user
```

**Advantages Over Chrome's Built-in AI:**
- ✅ **Model Choice**: Llama 3, CodeLlama, Mistral, Deepseek, Phi, etc.
- ✅ **Specialized Models**: CodeLlama for code, Mistral for chat, Deepseek for reasoning
- ✅ **More Powerful**: Can run larger models (7B, 13B, 70B) vs Gemini Nano
- ✅ **Browser Independent**: Works in Chrome, Firefox, Edge, Brave, etc.
- ✅ **Full Control**: Adjust temperature, max_tokens, system prompts
- ✅ **Privacy**: Still 100% local (never leaves your machine)
- ✅ **Free**: No API keys or quotas

**Popular Docker LLM Options:**
1. **Ollama** - Simple CLI, huge model library, Docker Desktop integration
2. **LM Studio** - User-friendly GUI, model marketplace
3. **LocalAI** - Drop-in OpenAI replacement with GPT-4 compatible API
4. **text-generation-webui** - Advanced features, many model formats

**Example Use Cases for Tabz:**

1. **CodeLlama for Error Explanations**
   ```javascript
   // Use specialized code model
   const help = await callLocalLLM('codellama',
     `Explain and fix: ${errorMessage}`
   )
   ```

2. **Deepseek for Command Generation**
   ```javascript
   // Natural language → Bash command
   const cmd = await callLocalLLM('deepseek-coder',
     `Convert to bash: find all node processes using port 3000`
   )
   // Returns: lsof -ti:3000 | xargs kill -9
   ```

3. **Mistral for Session Summaries**
   ```javascript
   // Summarize what happened in terminal
   const summary = await callLocalLLM('mistral',
     `Summarize this terminal session:\n${commandHistory}`
   )
   ```

**Implementation Approach:**

```typescript
// Settings allow user to configure local LLM endpoint
interface LLMSettings {
  enabled: boolean
  endpoint: string  // e.g., 'http://localhost:11434'
  model: string     // e.g., 'codellama', 'llama3', 'mistral'
  provider: 'ollama' | 'lm-studio' | 'localai' | 'custom'
}

// Graceful fallback chain:
// 1. Try local Docker LLM (if configured)
// 2. Fall back to Chrome's built-in AI (if available)
// 3. Fall back to basic text processing (no LLM)
```

**Docker Desktop Integration:**
- User pulls model: `docker pull ollama/ollama && docker run -p 11434:11434 ollama/ollama`
- Extension auto-detects if endpoint is available
- Settings UI to select model and configure endpoint

**Why This is Better for Terminal Use:**
- **CodeLlama** understands code/compiler errors better than general LLMs
- **Larger context windows** for analyzing long terminal output
- **Faster** (no network round-trip like cloud APIs)
- **Works offline** for air-gapped systems

**Compatibility Note:**
- Can use **both** Chrome AI APIs and Docker LLMs
- Chrome AI for quick on-device tasks (language detection, simple summaries)
- Docker LLM for heavy lifting (complex error analysis, code generation)

**Priority:** Post-MVP (after terminal display works)

**References:**
- Ollama: https://ollama.ai
- Docker Desktop AI: https://www.docker.com/products/docker-desktop/
- OpenAI API compatibility for easy integration
