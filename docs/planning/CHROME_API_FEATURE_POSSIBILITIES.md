# Chrome Extension API Feature Possibilities

**Date**: November 21, 2025
**Purpose**: Explore unique features enabled by Chrome Extension APIs for TabzChrome

---

## 🎯 Overview

This document explores the unique capabilities that Chrome Extension APIs unlock for TabzChrome. Unlike a standard web app, being a Chrome extension gives us access to powerful browser APIs that can create truly innovative terminal experiences.

**Current Permissions**: storage, contextMenus, tabs, sidePanel, clipboardRead, clipboardWrite, notifications
**Available (not yet used)**: devtools, scripting, downloads, bookmarks, history, sessions, omnibox, alarms, tabGroups, identity, webNavigation

---

## 🌟 High-Impact Features (Quick Wins)

### 1. **Tab-Aware Terminals** ⭐⭐⭐⭐⭐
**APIs**: `tabs`, `webNavigation`, `sidePanel`
**Effort**: Medium

Spawn terminals that know about the current browser tab:

**Features**:
- Auto-detect current page's git repository URL
- Extract current page URL/domain for context
- Spawn terminal in current page's directory (if localhost dev site)
- Per-tab terminal sessions (terminal follows the tab)
- Quick commands for current page (curl, wget, screenshotting)

**Example**:
```javascript
// Detect GitHub repo from current tab
chrome.tabs.query({ active: true }, (tabs) => {
  const url = new URL(tabs[0].url);
  if (url.hostname === 'github.com') {
    const [_, owner, repo] = url.pathname.split('/');
    // Spawn terminal with: git clone https://github.com/{owner}/{repo}
  }
});
```

**Use Cases**:
- Browsing GitHub → Quick "Clone this repo" terminal button
- On localhost:3000 → Terminal auto-opens in project directory
- Reading docs → Terminal with library pre-installed in working dir

---

### 2. **Omnibox Integration** ⭐⭐⭐⭐
**APIs**: `omnibox`
**Effort**: Low

Type commands directly in Chrome's address bar:

**Features**:
- Type `term ls` in address bar → Opens terminal sidebar with `ls` running
- Type `term git status` → Quick git commands
- Autocomplete suggestions from command history
- Launch terminals with pre-filled commands

**Example**:
```javascript
chrome.omnibox.onInputEntered.addListener((text) => {
  // text = "git status"
  chrome.runtime.sendMessage({
    type: 'SPAWN_TERMINAL',
    command: text,
    focus: true
  });
  chrome.sidePanel.open({ windowId: currentWindow.id });
});
```

**Use Cases**:
- `term npminstall` → Instantly spawn npm install
- `term docker ps` → Quick Docker commands
- `term serve .` → Start dev server in current project

---

### 3. **Sessions & Workspace Restoration** ⭐⭐⭐⭐⭐
**APIs**: `sessions`, `storage`, `tabs`, `windows`
**Effort**: Medium

Restore terminal sessions when Chrome restarts:

**Features**:
- Save terminal sessions per Chrome window
- Restore all terminals when reopening browser
- "Recently closed terminals" menu (like recently closed tabs)
- Per-project workspace sessions (save/restore terminal layouts)

**Example**:
```javascript
// Save session on close
chrome.sessions.getRecentlyClosed((sessions) => {
  // Map terminal sessions to browser sessions
  // Restore terminals when user reopens window
});

// Workspace profiles
const workspace = {
  name: "MyProject",
  terminals: [
    { command: "npm run dev", cwd: "/projects/myapp" },
    { command: "git status", cwd: "/projects/myapp" },
    { command: "docker-compose up", cwd: "/projects/myapp/docker" }
  ]
};
```

**Use Cases**:
- Close browser, reopen → All terminals restore automatically
- Switch between project workspaces (Frontend, Backend, DevOps)
- Share workspace configs with team

---

### 4. **DevTools Integration** ⭐⭐⭐⭐
**APIs**: `devtools.panels`, `devtools.inspectedWindow`, `devtools.network`
**Effort**: Medium-High

Add terminal as a DevTools panel:

**Features**:
- Terminal appears in Chrome DevTools (F12)
- Execute commands in context of inspected page
- Network request monitoring from terminal (curl matching)
- Console logs piped to terminal
- DOM inspection commands from terminal

**Example**:
```javascript
chrome.devtools.panels.create(
  "Terminal",
  "icons/icon16.png",
  "devtools/terminal-panel.html",
  (panel) => {
    // Terminal now appears in DevTools!
    // Can interact with inspected window
    chrome.devtools.inspectedWindow.eval('document.title');
  }
);

// Monitor network requests
chrome.devtools.network.onRequestFinished.addListener((request) => {
  // Show curl command to replicate request
  terminalOutput(`curl -X ${request.request.method} ${request.request.url}`);
});
```

**Use Cases**:
- Debug API calls from terminal (see network requests as curl commands)
- Run scripts in page context from terminal
- Monitor console errors in terminal
- Quick DOM queries from terminal

---

### 5. **Downloads Integration** ⭐⭐⭐
**APIs**: `downloads`
**Effort**: Low

Download files from terminal commands:

**Features**:
- `wget` and `curl` commands trigger Chrome downloads
- Monitor download progress in terminal
- Download to specific directories from terminal
- Quick download current page assets

**Example**:
```javascript
// Terminal command: wget https://example.com/file.zip
chrome.downloads.download({
  url: 'https://example.com/file.zip',
  filename: 'file.zip',
  saveAs: false
}, (downloadId) => {
  // Monitor progress in terminal
  chrome.downloads.onChanged.addListener((delta) => {
    if (delta.state?.current === 'complete') {
      terminalOutput('✅ Download complete!');
    }
  });
});
```

**Use Cases**:
- Download files without leaving terminal
- Batch downloads from terminal scripts
- Monitor large downloads with progress bars

---

## 🚀 Medium-Impact Features

### 6. **Bookmarks as Quick Commands** ⭐⭐⭐
**APIs**: `bookmarks`
**Effort**: Low

Use Chrome bookmarks to save common terminal commands:

**Features**:
- Bookmark folders = command categories
- Bookmark URLs = shell scripts or commands
- Quick access to frequent commands
- Share command bookmarks across team

**Example**:
```javascript
chrome.bookmarks.search({ title: 'Terminal Commands' }, (results) => {
  // Show bookmarked commands in terminal menu
  results.forEach(bookmark => {
    // bookmark.url = "command://npm run dev"
    showQuickCommand(bookmark.title, bookmark.url);
  });
});
```

---

### 7. **History-Based Autocomplete** ⭐⭐⭐
**APIs**: `history`, `storage`
**Effort**: Medium

Use Chrome history to suggest commands:

**Features**:
- Auto-suggest commands based on current page
- Domain-specific command history
- Frequently used commands per site
- Smart suggestions ("You ran this last time on GitHub")

**Example**:
```javascript
chrome.tabs.query({ active: true }, (tabs) => {
  const domain = new URL(tabs[0].url).hostname;

  // Get command history for this domain
  const commandHistory = getHistoryForDomain(domain);
  // Show: "Last time on github.com, you ran: git clone..."
});
```

---

### 8. **Scheduled Tasks with Alarms** ⭐⭐⭐
**APIs**: `alarms`
**Effort**: Low

Cron-like scheduled commands:

**Features**:
- Schedule periodic terminal commands
- Reminder notifications from terminal
- Background job monitoring
- Time-based automation

**Example**:
```javascript
// Terminal command: schedule "npm run build" every 1h
chrome.alarms.create('build-job', {
  delayInMinutes: 60,
  periodInMinutes: 60
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'build-job') {
    spawnTerminal({ command: 'npm run build' });
  }
});
```

---

### 9. **Tab Groups Integration** ⭐⭐⭐
**APIs**: `tabGroups`, `tabs`
**Effort**: Low

Organize terminals by Chrome tab groups:

**Features**:
- Terminal groups match Chrome tab groups
- Color-code terminals by project/category
- Collapse/expand terminal groups
- Group-specific profiles

**Example**:
```javascript
chrome.tabGroups.query({}, (groups) => {
  groups.forEach(group => {
    // Create terminal group matching tab group
    createTerminalGroup({
      name: group.title,
      color: group.color,
      collapsed: group.collapsed
    });
  });
});
```

---

### 10. **Identity & OAuth Integration** ⭐⭐
**APIs**: `identity`
**Effort**: High

Authenticate with cloud services from terminal:

**Features**:
- GitHub CLI authentication via Chrome
- AWS/GCP/Azure auth from terminal
- Single sign-on for terminal commands
- Secure credential storage

**Example**:
```javascript
// Terminal command: gh auth login
chrome.identity.launchWebAuthFlow({
  url: 'https://github.com/login/oauth/authorize?...',
  interactive: true
}, (redirectUrl) => {
  // Extract OAuth token
  const token = new URL(redirectUrl).searchParams.get('code');
  // Store and use for GitHub CLI
});
```

---

## 💡 Advanced/Future Features

### 11. **Page Scripting from Terminal** ⭐⭐⭐⭐
**APIs**: `scripting`, `tabs`
**Effort**: Medium

Execute JavaScript on current page from terminal:

**Features**:
- Run scripts on any webpage from terminal
- Inject CSS from terminal
- DOM manipulation via terminal
- Automated testing from terminal

**Example**:
```javascript
// Terminal command: inject "document.body.style.background = 'red'"
chrome.scripting.executeScript({
  target: { tabId: currentTab.id },
  func: (code) => eval(code),
  args: ["document.body.style.background = 'red'"]
});
```

---

### 12. **Multi-Window Terminal Management** ⭐⭐⭐
**APIs**: `windows`, `sessions`
**Effort**: Medium

Manage terminals across multiple Chrome windows:

**Features**:
- Window-specific terminal sessions
- Move terminals between windows
- Sync terminals across monitors
- Per-window profiles

---

### 13. **Screenshot & Page Capture Commands** ⭐⭐
**APIs**: `tabs.captureVisibleTab`, `pageCapture`
**Effort**: Low

Capture screenshots from terminal:

**Features**:
- `screenshot current-tab` command
- Save page as MHTML from terminal
- Automated screenshot workflows
- Visual regression testing

---

### 14. **Reading List Integration** ⭐
**APIs**: `readingList`
**Effort**: Low

Manage reading list from terminal:

**Features**:
- Add current page to reading list via terminal
- List reading items in terminal
- Open reading list items from terminal

---

## 🤖 Chrome Built-in AI APIs (NEW - 2024/2025)

Chrome is introducing on-device AI capabilities via Gemini Nano. These APIs are **only available for extensions** on Windows, macOS, and Linux.

### 15. **Prompt API** ⭐⭐⭐⭐⭐
**APIs**: `chrome.aiOriginTrial.languageModel` (experimental)
**Effort**: Medium
**Status**: Extensions-only, Origin Trial

General-purpose LLM interactions using on-device Gemini Nano:

**Features**:
- Natural language command suggestions
- Error message explanation
- Code snippet generation
- Context-aware help

**Example**:
```javascript
// Explain terminal error to user
const session = await chrome.aiOriginTrial.languageModel.create();
const explanation = await session.prompt(
  `Explain this terminal error in simple terms: ${errorOutput}`
);
showNotification(explanation);
```

**Use Cases**:
- "Explain this error" button next to failed commands
- AI-powered command autocomplete
- Natural language to bash translation ("delete all node_modules" → `find . -name node_modules -type d -exec rm -rf {} +`)

---

### 16. **Summarizer API** ⭐⭐⭐⭐
**APIs**: `chrome.aiOriginTrial.summarizer`
**Effort**: Low
**Status**: Available in Chrome stable

Condense long terminal output:

**Features**:
- Summarize build logs
- Extract key errors from verbose output
- Create digest of long-running command output

**Example**:
```javascript
// Summarize npm install output
const summarizer = await chrome.aiOriginTrial.summarizer.create();
const summary = await summarizer.summarize(terminalOutput);
// "Installed 234 packages. 2 vulnerabilities found (1 moderate, 1 high)."
```

**Use Cases**:
- One-click "Summarize output" for build logs
- Auto-summarize when output exceeds threshold
- Summary notifications for background tasks

---

### 17. **Translator API** ⭐⭐⭐
**APIs**: `chrome.aiOriginTrial.translator`
**Effort**: Low
**Status**: Chrome 138+

On-device translation for international users:

**Features**:
- Translate error messages to user's language
- Translate documentation snippets
- Multi-language terminal output

**Example**:
```javascript
// Translate Chinese error message to English
const translator = await chrome.aiOriginTrial.translator.create({
  sourceLanguage: 'zh',
  targetLanguage: 'en'
});
const translated = await translator.translate(chineseError);
```

---

### 18. **Writer & Rewriter APIs** ⭐⭐
**APIs**: `chrome.aiOriginTrial.writer`, `chrome.aiOriginTrial.rewriter`
**Effort**: Medium
**Status**: Origin Trial

Content creation and improvement:

**Features**:
- Generate commit messages from diff
- Rewrite verbose commands to be more concise
- Generate documentation from command history

**Example**:
```javascript
// Generate commit message from staged changes
const writer = await chrome.aiOriginTrial.writer.create();
const commitMsg = await writer.write(
  `Generate a concise commit message for these changes: ${gitDiff}`
);
```

---

### AI API Availability Matrix

| API | Status | Chrome Version | Platform |
|-----|--------|----------------|----------|
| Prompt API | Origin Trial | 128+ | Win/Mac/Linux |
| Summarizer | Stable | 131+ | Win/Mac/Linux |
| Translator | Stable | 138+ | Win/Mac/Linux |
| Writer | Origin Trial | 131+ | Win/Mac/Linux |
| Rewriter | Origin Trial | 131+ | Win/Mac/Linux |
| Language Detector | Stable | 131+ | Win/Mac/Linux |

**Requirements**:
- Gemini Nano must be downloaded (~1.5GB, automatic)
- Device needs sufficient RAM/storage
- Some APIs require origin trial registration

**Documentation**: https://developer.chrome.com/docs/ai/built-in

---

## 📋 Implementation Priorities

### Phase 1: Quick Wins (This Week) ✅
1. ✅ Keyboard shortcuts (Alt+T, Alt+W, tab switching)
2. 🔄 Omnibox integration (type commands in address bar)
3. 🔄 Alarms API for WebSocket reliability

### Phase 2: Core Enhancements (Next 2 Weeks)
4. Tab-aware terminals (extract URL, domain, GitHub repos)
5. Downloads integration (wget/curl downloads)
6. Sessions & workspace restoration
7. Display shortcuts in Settings modal

### Phase 3: Medium-Term Features
8. DevTools panel improvements
9. History-based autocomplete
10. Tab groups integration
11. Bookmarks as quick commands

### Phase 4: Advanced/Experimental
12. Built-in AI APIs (when stable)
13. Identity & OAuth integration
14. Page scripting from terminal
15. Multi-window management

---

## 🎨 Feature Combinations (Power User Flows)

### Developer Workflow
1. Browse GitHub repo → Right-click → "Clone in Terminal"
2. Terminal opens with `git clone` pre-filled
3. After clone, terminal auto-cds into repo
4. Workspace profile loads (npm install, git status, code .)
5. Tab groups organize frontend/backend terminals
6. DevTools terminal shows API requests as curl commands
7. Scheduled alarm runs tests every 30 minutes

### DevOps Workflow
1. Omnibox: `term docker ps` → Quick container check
2. Terminal command: `wget https://releases.com/binary.tar.gz`
3. Download progress shown in terminal
4. Bookmark saved: "Deploy Production" → `kubectl apply -f`
5. Scheduled alarm monitors uptime every 5 minutes
6. Notifications on deployment failures

### Content Creation Workflow
1. Screenshot current tab from terminal
2. Reading list managed via terminal commands
3. Bookmarked research commands
4. Session restoration for research projects

---

## 🔧 Technical Considerations

### Permission Requirements
```json
{
  "permissions": [
    "tabs",           // Tab awareness
    "webNavigation",  // Page navigation events
    "downloads",      // File downloads
    "bookmarks",      // Command bookmarks
    "history",        // Command suggestions
    "sessions",       // Session restoration
    "alarms",         // Scheduled tasks
    "identity",       // OAuth integration
    "scripting",      // Page scripting
    "tabGroups"       // Tab group integration
  ],
  "optional_permissions": [
    "devtools"        // DevTools panel (separate page)
  ]
}
```

### API Limitations
- **Omnibox**: Only one keyword per extension (suggest: `term`)
- **Downloads**: Requires user gesture for some operations
- **Identity**: OAuth flow requires interactive mode
- **Scripting**: Host permissions needed for target pages
- **DevTools**: Separate devtools_page required

### Performance Impact
- Minimal for most features (Chrome handles heavy lifting)
- Sessions API may slow down with 100+ terminals
- DevTools panel runs in separate process (isolated)

---

## 🚦 Feasibility Matrix

| Feature | Impact | Effort | Dependencies | Priority |
|---------|--------|--------|--------------|----------|
| Tab-aware terminals | ⭐⭐⭐⭐⭐ | Medium | tabs, webNavigation | P0 |
| Omnibox integration | ⭐⭐⭐⭐ | Low | omnibox | P0 |
| Sessions restoration | ⭐⭐⭐⭐⭐ | Medium | sessions, storage | P1 |
| DevTools panel | ⭐⭐⭐⭐ | High | devtools | P1 |
| Downloads integration | ⭐⭐⭐ | Low | downloads | P1 |
| Bookmarks commands | ⭐⭐⭐ | Low | bookmarks | P2 |
| History autocomplete | ⭐⭐⭐ | Medium | history | P2 |
| Alarms/scheduling | ⭐⭐⭐ | Low | alarms | P2 |
| Tab groups | ⭐⭐⭐ | Low | tabGroups | P2 |
| OAuth integration | ⭐⭐ | High | identity | P3 |
| Page scripting | ⭐⭐⭐⭐ | Medium | scripting | P3 |
| Multi-window mgmt | ⭐⭐⭐ | Medium | windows, sessions | P3 |
| Screenshots | ⭐⭐ | Low | tabs | P4 |
| Reading list | ⭐ | Low | readingList | P4 |

---

## 🎯 Recommended Next Steps

1. **Immediate (This Week)**:
   - Add `tabs` and `webNavigation` permissions
   - Implement tab-aware terminal spawning
   - Add "Clone this repo" context menu for GitHub

2. **Short-term (Next 2 Weeks)**:
   - Add `omnibox` permission and keyword registration
   - Implement address bar command launching
   - Add `downloads` integration for wget/curl

3. **Medium-term (Next Month)**:
   - Implement sessions API for workspace restoration
   - Create DevTools panel for terminal
   - Add tab groups integration

4. **Long-term (Next Quarter)**:
   - OAuth/Identity integration for cloud CLIs
   - Advanced scripting capabilities
   - Multi-window synchronization

---

## 📚 Additional Resources

- [Chrome Extensions API Reference](https://developer.chrome.com/docs/extensions/reference/)
- [Chrome Extension Samples](https://github.com/GoogleChrome/chrome-extensions-samples)
- [Manifest V3 Migration Guide](https://developer.chrome.com/docs/extensions/mv3/intro/)
- [Chrome Extension Best Practices](https://developer.chrome.com/docs/extensions/mv3/best_practices/)

---

**Next Action**: Review this document and select 2-3 features to implement in the next sprint!
