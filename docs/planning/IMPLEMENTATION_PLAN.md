# Chrome Extension Terminal Manager - Implementation Plan

**Branch**: `feat/chrome-extension`
**Goal**: Portable terminal manager as Chrome/Edge extension with unique browser integrations

## Philosophy

Transform terminal-tabs into a browser extension that:
- Lives in your browser toolbar, DevTools, and side panel
- Integrates with web pages (context menus, URL parsing)
- Syncs sessions across devices (Chrome Storage API)
- Provides developer-focused features (network → cURL, console → terminal)

## Extension Architecture

### Manifest V3 Structure

```json
{
  "manifest_version": 3,
  "name": "Terminal Tabs - Browser Edition",
  "version": "1.0.0",
  "description": "Full-featured terminal manager in your browser",
  "permissions": [
    "storage",
    "contextMenus",
    "tabs",
    "sidePanel"
  ],
  "background": {
    "service_worker": "background.js",
    "type": "module"
  },
  "action": {
    "default_popup": "popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "side_panel": {
    "default_path": "sidepanel.html"
  },
  "devtools_page": "devtools.html",
  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"]
    }
  ]
}
```

## Components to Build

### 1. ExtensionPopup Component (popup.html/tsx)
**Purpose**: Quick launcher from browser toolbar
**UI Framework**: shadcn/ui Command palette

**Features**:
- Command palette interface (Cmd+K style)
- Recent sessions (last 5)
- Quick spawn options (from spawn-options.json)
- Settings gear → Options page
- Badge showing active sessions count

**shadcn/ui Components**:
- `Command` - Command palette
- `CommandInput` - Search input
- `CommandList` - Suggestions list
- `CommandGroup` - Categorized commands
- `Badge` - Active sessions indicator
- `Separator` - Visual dividers

**Implementation**:
```typescript
// popup.tsx
import { Command, CommandInput, CommandList, CommandGroup, CommandItem } from '@/components/ui/command';

export function ExtensionPopup() {
  const [recentSessions, setRecentSessions] = useState<Session[]>([]);

  useEffect(() => {
    // Load from chrome.storage.local
    chrome.storage.local.get(['recentSessions'], (result) => {
      setRecentSessions(result.recentSessions || []);
    });
  }, []);

  const handleSessionSelect = (sessionName: string) => {
    // Open side panel with session
    chrome.runtime.sendMessage({
      type: 'OPEN_SESSION',
      sessionName,
    });
    window.close(); // Close popup
  };

  return (
    <Command className="w-80">
      <CommandInput placeholder="Search sessions..." />
      <CommandList>
        <CommandGroup heading="Recent Sessions">
          {recentSessions.map(session => (
            <CommandItem key={session.name} onSelect={() => handleSessionSelect(session.name)}>
              <TerminalIcon className="mr-2 h-4 w-4" />
              {session.name}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandGroup heading="Quick Spawn">
          <CommandItem onSelect={() => handleSpawn('bash')}>
            Bash Terminal
          </CommandItem>
          <CommandItem onSelect={() => handleSpawn('claude-code')}>
            Claude Code
          </CommandItem>
          <CommandItem onSelect={() => handleSpawn('lazygit')}>
            LazyGit
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
```

### 2. DevToolsPanel Component (devtools.html/tsx)
**Purpose**: Full terminal interface in Chrome DevTools
**UI Framework**: Adapted from main terminal-tabs UI

**Features**:
- Tab-based terminal sessions (like main app)
- Network request → cURL command converter
- Console output bridge (pipe console.log to terminal)
- Element inspector → DOM query generator
- Performance profiling shortcuts

**Unique DevTools Features**:
```typescript
// Network → cURL converter
chrome.devtools.network.onRequestFinished.addListener((request) => {
  const curlCommand = generateCurlCommand(request);
  // Offer to paste into terminal
  showToast(`Copy cURL: ${curlCommand}`);
});

// Console bridge
chrome.devtools.panels.create(
  'Terminal',
  'icons/icon16.png',
  'devtools-panel.html',
  (panel) => {
    // Panel created
  }
);
```

**shadcn/ui Components**:
- `Tabs` - Session tabs
- `ResizablePanel` - Split layout (terminal + network viewer)
- `ScrollArea` - Terminal output
- `Button` - Copy cURL, clear console
- `ContextMenu` - Right-click actions

### 3. BackgroundServiceWorker (background.js/ts)
**Purpose**: Persistent WebSocket connection & message routing
**Type**: Module-based Service Worker (Manifest V3)

**Features**:
- Maintain WebSocket to backend (with reconnection)
- Handle messages from popup, devtools, content scripts
- Sync session state to chrome.storage.sync (cross-device)
- Badge updates (active sessions count)
- Context menu registration

**Key Implementation**:
```typescript
// background.ts
let ws: WebSocket | null = null;

// Persistent WebSocket connection
function connectWebSocket() {
  ws = new WebSocket('ws://localhost:8127');

  ws.onopen = () => {
    console.log('Background WS connected');
    updateBadge();
  };

  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    // Route to appropriate extension page
    chrome.runtime.sendMessage(message);
  };

  ws.onclose = () => {
    console.log('WS closed, reconnecting...');
    setTimeout(connectWebSocket, 5000);
  };
}

// Context menu: "Open in Terminal"
chrome.contextMenus.create({
  id: 'open-url-in-terminal',
  title: 'Open URL in Terminal',
  contexts: ['link'],
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'open-url-in-terminal') {
    const url = info.linkUrl;
    // Parse URL and spawn terminal in appropriate directory
    const path = parseUrlToPath(url); // e.g., github.com/user/repo → ~/projects/repo
    spawnTerminal({ cwd: path, command: `echo "Opened from: ${url}"` });
  }
});

// Badge update
function updateBadge() {
  chrome.storage.local.get(['activeSessions'], (result) => {
    const count = result.activeSessions?.length || 0;
    chrome.action.setBadgeText({ text: count > 0 ? String(count) : '' });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
  });
}

// Initialize
connectWebSocket();
```

### 4. SidePanelTerminal Component (sidepanel.html/tsx)
**Purpose**: Always-accessible terminal in Chrome Side Panel (v114+)
**UI Framework**: Full terminal-tabs UI (tabs, splits)

**Features**:
- Pin/unpin to keep panel open
- Drag-to-resize width
- Synchronized with popup/devtools sessions
- Quick switch between sessions (dropdown)
- Theme matches browser (light/dark)

**shadcn/ui Components**:
- `Tabs` - Session switcher
- `ResizablePanel` - Panel resizing
- `Select` - Session dropdown
- `Switch` - Pin toggle
- `DropdownMenu` - Session actions

**Chrome Side Panel API**:
```typescript
// sidepanel.tsx
export function SidePanelTerminal() {
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    // Listen for messages from background
    chrome.runtime.onMessage.addListener((message) => {
      if (message.type === 'OPEN_SESSION') {
        attachToSession(message.sessionName);
      }
    });
  }, []);

  return (
    <div className="h-screen flex flex-col">
      <div className="flex items-center justify-between p-2 border-b">
        <Select>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="Select session" />
          </SelectTrigger>
          <SelectContent>
            {sessions.map(s => (
              <SelectItem key={s.name} value={s.name}>{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Switch checked={pinned} onCheckedChange={setPinned}>
          <Pin className="h-4 w-4" />
        </Switch>
      </div>

      <div className="flex-1">
        <TerminalView sessionName={currentSession} />
      </div>
    </div>
  );
}
```

### 5. ContentScript Integration (content.js/ts)
**Purpose**: Inject context menu, page parsing
**Scope**: Runs on all web pages

**Features**:
- Right-click on GitHub repo → Clone in terminal
- Right-click on file path → `cd` to path
- Detect error messages → Suggest terminal commands
- Parse package manager commands (npm, yarn) → Run in terminal

**Implementation**:
```typescript
// content.ts
// Detect GitHub repo pages
if (window.location.hostname === 'github.com') {
  const repoMatch = window.location.pathname.match(/^\/([^/]+)\/([^/]+)/);
  if (repoMatch) {
    const [, owner, repo] = repoMatch;

    // Add custom context menu
    document.addEventListener('contextmenu', (e) => {
      chrome.runtime.sendMessage({
        type: 'ADD_CONTEXT_MENU',
        items: [
          {
            id: 'clone-repo',
            title: `Clone ${owner}/${repo}`,
            action: () => {
              chrome.runtime.sendMessage({
                type: 'SPAWN_TERMINAL',
                command: `git clone https://github.com/${owner}/${repo}.git`,
              });
            },
          },
        ],
      });
    });
  }
}

// Detect error messages
const errorPatterns = [
  /command not found: (.+)/,
  /npm ERR! (.+)/,
  /Error: (.+)/,
];

// Listen to console
const originalConsoleError = console.error;
console.error = (...args) => {
  originalConsoleError(...args);

  const errorText = args.join(' ');
  for (const pattern of errorPatterns) {
    const match = errorText.match(pattern);
    if (match) {
      // Show notification with terminal suggestion
      chrome.runtime.sendMessage({
        type: 'SHOW_ERROR_SUGGESTION',
        error: match[0],
        suggestion: generateSuggestion(match[0]),
      });
    }
  }
};
```

## Extension-Specific Features

### 1. Chrome Storage Sync
**Purpose**: Sync sessions across devices

```typescript
// Sync session metadata (not full terminal state)
interface SyncedSession {
  name: string;
  created: Date;
  lastActive: Date;
  spawnOption: string;
  workingDir: string;
}

// Save to sync storage (100KB limit)
chrome.storage.sync.set({
  sessions: syncedSessions,
});

// Listen for changes
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.sessions) {
    // Refresh UI
    refreshSessions();
  }
});
```

### 2. Context Menu Integration
**Purpose**: Right-click actions on web pages

```typescript
// Register context menus in background.ts
chrome.contextMenus.create({
  id: 'terminal-actions',
  title: 'Terminal Tabs',
  contexts: ['all'],
});

chrome.contextMenus.create({
  id: 'copy-as-curl',
  parentId: 'terminal-actions',
  title: 'Copy as cURL',
  contexts: ['link'],
});

chrome.contextMenus.create({
  id: 'run-command',
  parentId: 'terminal-actions',
  title: 'Run in Terminal',
  contexts: ['selection'],
});
```

### 3. DevTools Network → cURL
**Purpose**: Convert network requests to cURL commands

```typescript
function generateCurlCommand(request: chrome.devtools.network.Request): string {
  let curl = `curl '${request.request.url}'`;

  // Add method
  if (request.request.method !== 'GET') {
    curl += ` -X ${request.request.method}`;
  }

  // Add headers
  request.request.headers.forEach(header => {
    curl += ` -H '${header.name}: ${header.value}'`;
  });

  // Add body
  if (request.request.postData) {
    curl += ` -d '${request.request.postData.text}'`;
  }

  return curl;
}
```

## Implementation Steps

### Phase 1: Extension Setup (10 min)
1. Create extension manifest (manifest.json)
2. Set up build system:
   ```bash
   # Use Vite with extension plugin
   npm install vite-plugin-web-extension
   ```
3. Configure separate entry points:
   - popup.html → popup.tsx
   - sidepanel.html → sidepanel.tsx
   - devtools.html → devtools.tsx
   - background.js → background.ts
4. Install shadcn/ui (shared across all pages)

### Phase 2: Popup + Background (15 min)
1. Build ExtensionPopup component
   - Command palette with search
   - Recent sessions from storage
   - Quick spawn buttons
2. Build background service worker
   - WebSocket connection with reconnect
   - Message routing
   - Context menu registration
   - Badge updates

### Phase 3: Side Panel (15 min)
1. Build SidePanelTerminal component
   - Full terminal UI (reuse from main app)
   - Session switcher dropdown
   - Pin/unpin toggle
2. Test Chrome Side Panel API (Chrome 114+)
3. Sync state with popup/background

### Phase 4: DevTools Panel (10 min)
1. Create DevTools panel registration (devtools.html)
2. Build DevToolsPanel component
   - Terminal tabs
   - Network request viewer
   - cURL generator button
3. Integrate with chrome.devtools API

### Phase 5: Content Script (10 min)
1. Build content script injections
   - GitHub repo detection
   - Error message parsing
   - Context menu triggers
2. Test on various websites
3. Add site-specific integrations (GitHub, GitLab, etc.)

## File Structure

```
extension/
├── manifest.json
├── popup/
│   ├── popup.html
│   └── popup.tsx (ExtensionPopup)
├── sidepanel/
│   ├── sidepanel.html
│   └── sidepanel.tsx (SidePanelTerminal)
├── devtools/
│   ├── devtools.html
│   ├── devtools.tsx (DevToolsPanel)
│   └── panel.html
├── background/
│   └── background.ts (Service Worker)
├── content/
│   └── content.ts (Content Script)
├── components/
│   └── ui/ (shadcn/ui components)
├── shared/
│   ├── storage.ts (Chrome Storage helpers)
│   ├── messaging.ts (Message types)
│   └── utils.ts
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## Testing Checklist

- [ ] Load unpacked extension in chrome://extensions
- [ ] Popup opens from toolbar
- [ ] Side panel opens and stays pinned
- [ ] DevTools panel shows terminals
- [ ] Background service worker maintains WebSocket
- [ ] Context menu appears on web pages
- [ ] cURL generation works for network requests
- [ ] Chrome Storage sync works (test on 2+ devices)
- [ ] Badge shows active session count
- [ ] Extension survives browser restart

## Chrome Web Store Preparation

```json
// package.json
{
  "scripts": {
    "build:extension": "vite build --mode extension",
    "zip": "zip -r terminal-tabs-extension.zip dist/"
  }
}
```

## Notes for Claude Code

When implementing:
1. **Use Chrome Extension APIs** - chrome.storage, chrome.runtime, chrome.tabs
2. **Manifest V3 only** - Service workers, not background pages
3. **Security**: Use Content Security Policy, avoid eval()
4. **Size limit**: Keep under 100KB for sync storage
5. **Test on Chrome + Edge** - Both support Manifest V3

## Expected Outcome

A fully functional Chrome extension that:
- ✅ Works offline (local WebSocket)
- ✅ Syncs across devices (Chrome Storage)
- ✅ Integrates with DevTools
- ✅ Accessible from toolbar, side panel, DevTools
- ✅ Context menu on all pages
- ✅ <1MB total size (for Chrome Web Store)

Ready to build a terminal in your browser! 🌐
