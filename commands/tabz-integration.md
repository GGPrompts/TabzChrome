---
description: Integration guide for connecting projects to TabzChrome terminals
---

# TabzChrome Integration Guide

Help integrate a project with TabzChrome terminals. First, ask which integration methods are needed.

---

Use the AskUserQuestion tool with these options:

```
questions:
  - question: "Which TabzChrome integration methods do you need?"
    header: "Integration"
    multiSelect: true
    options:
      - label: "HTML Buttons"
        description: "data-terminal-command attribute for 'Run in Terminal' buttons on web pages"
      - label: "CLI/Scripts"
        description: "WebSocket API via websocat for shell scripts and tmux workflows"
      - label: "Web App JS"
        description: "JavaScript WebSocket for prompt libraries with fillable templates"
      - label: "Spawn API"
        description: "POST /api/spawn to create new terminal tabs programmatically"
```

After user selects, provide the relevant documentation from below:

---

## Method 1: HTML Data Attributes (Web Pages)

**Select this for:** Static "Run in Terminal" buttons on documentation or tool pages.

Add the `data-terminal-command` attribute to any HTML element:

```html
<!-- Simple button -->
<button data-terminal-command="npm run dev">Start Dev Server</button>

<!-- Link style -->
<a href="#" data-terminal-command="git status">Check Git Status</a>

<!-- Code block with run option -->
<code data-terminal-command="npm install express">npm install express</code>
```

**Behavior:**
1. Click opens TabzChrome sidebar and populates chat input
2. User selects which terminal tab to send the command to
3. Visual feedback: "Queued!" with green background for 1 second

**Notes:**
- No auth required (uses content script)
- Works on dynamically added elements (MutationObserver)
- Extension must be installed, backend on `localhost:8129`

---

## Method 2: WebSocket API (CLI / Scripts)

**Select this for:** Shell functions, tmux workflows, prompt engineering pipelines.

### Authentication

```bash
# Get the auth token (auto-generated on backend startup)
TOKEN=$(cat /tmp/tabz-auth-token)

# Connect with token
websocat "ws://localhost:8129?token=$TOKEN"
```

### Message Format

```json
{
  "type": "QUEUE_COMMAND",
  "command": "your command or prompt here"
}
```

### Shell Function

Add to `.bashrc` or `.zshrc`:

```bash
# Queue command/prompt to TabzChrome sidebar
tabz() {
  local cmd="$*"
  local token=$(cat /tmp/tabz-auth-token 2>/dev/null)
  if [[ -z "$token" ]]; then
    echo "Error: TabzChrome backend not running"
    return 1
  fi
  echo "{\"type\":\"QUEUE_COMMAND\",\"command\":$(echo "$cmd" | jq -Rs .)}" | \
    websocat "ws://localhost:8129?token=$token"
}

# Usage:
# tabz npm run dev
# tabz "Explain this error and suggest a fix"
```

### Multi-line Prompts

```bash
TOKEN=$(cat /tmp/tabz-auth-token)
cat <<'EOF' | jq -Rs '{type:"QUEUE_COMMAND",command:.}' | websocat "ws://localhost:8129?token=$TOKEN"
Implement a new feature that:
1. Adds user authentication
2. Uses JWT tokens
3. Includes refresh token rotation
EOF
```

---

## Method 3: Web Page JavaScript API

**Select this for:** Dynamic web apps like prompt libraries with fillable fields.

```javascript
// Connect to TabzChrome with auth
async function connectToTabz() {
  const tokenRes = await fetch('http://localhost:8129/api/auth/token');
  const { token } = await tokenRes.json();
  const ws = new WebSocket(`ws://localhost:8129?token=${token}`);
  return ws;
}

// Queue a prompt to the chat input
let ws;
async function queueToTabz(prompt) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    ws = await connectToTabz();
    await new Promise(resolve => ws.onopen = resolve);
  }
  ws.send(JSON.stringify({
    type: 'QUEUE_COMMAND',
    command: prompt
  }));
}

// Example: Send filled-in prompt template
const filledPrompt = `
Refactor the ${selectedFile} to:
- Use ${framework} patterns
- Add error handling for ${errorCases}
`;
queueToTabz(filledPrompt);
```

**Note:** `/api/auth/token` only responds to localhost requests.

---

## Method 4: Spawn API (New Terminals)

**Select this for:** Creating new terminal tabs with custom names and commands (Claude Code launcher, TUI tools).

### POST /api/spawn

```bash
# Get token first
TOKEN=$(cat /tmp/tabz-auth-token)

curl -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{
    "name": "Claude + explore",
    "workingDir": "~/projects/myapp",
    "command": "claude --agent explore --dangerously-skip-permissions"
  }'
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `X-Auth-Token` (header) | **Yes** | Auth token |
| `name` | No | Tab display name |
| `workingDir` | No | Starting directory (default: `$HOME`) |
| `command` | No | Command to run after shell ready (~1.2s delay) |

### Getting the Auth Token

| Context | Method |
|---------|--------|
| **CLI / Conductor** | `TOKEN=$(cat /tmp/tabz-auth-token)` |
| **Extension Settings** | Click "API Token" -> "Copy Token" button |
| **External web pages** | User pastes token into input field (stored in localStorage) |

### Web Page Example (External Sites like GitHub Pages)

```javascript
// Token management - user pastes token, stored in localStorage
function getToken() {
  const input = document.getElementById('authToken');
  const token = input?.value.trim() || localStorage.getItem('tabz-auth-token');
  if (token) localStorage.setItem('tabz-auth-token', token);
  return token;
}

async function spawnTerminal(name, workingDir, command) {
  const token = getToken();
  if (!token) {
    alert('Token required - get from Tabz Settings -> API Token');
    return;
  }

  const response = await fetch('http://localhost:8129/api/spawn', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Token': token
    },
    body: JSON.stringify({ name, workingDir, command })
  });
  return response.json();
}
```

**Security:** External web pages cannot auto-fetch the token. Users must consciously paste their token to authorize a site.

### Claude Code Launcher Example

Build commands dynamically instead of maintaining hundreds of profiles:

```html
<h2>Spawn Claude Code</h2>

<label>Agent:</label>
<select id="agent">
  <option value="">None</option>
  <option value="--agent explore">Explore</option>
  <option value="--agent plan">Plan</option>
</select>

<label>Voice:</label>
<select id="voice">
  <option value="">Default</option>
  <option value="--voice jenny">Jenny</option>
  <option value="--voice guy">Guy</option>
</select>

<label><input type="checkbox" id="skip" checked> Skip permissions</label>

<button onclick="spawnClaude()">Spawn</button>

<script>
function buildCommand() {
  const parts = ['claude'];
  const agent = document.getElementById('agent').value;
  const voice = document.getElementById('voice').value;
  const skip = document.getElementById('skip').checked;

  if (agent) parts.push(agent);
  if (voice) parts.push(voice);
  if (skip) parts.push('--dangerously-skip-permissions');

  return parts.join(' ');
}

function buildName() {
  const parts = ['Claude'];
  const agent = document.getElementById('agent').value;
  const voice = document.getElementById('voice').value;

  if (agent) parts.push(agent.replace('--agent ', ''));
  if (voice) parts.push(voice.replace('--voice ', ''));

  return parts.join(' + ');
}

async function spawnClaude() {
  const token = getToken();
  if (!token) {
    alert('Token required - get from Tabz Settings -> API Token');
    return;
  }
  await fetch('http://localhost:8129/api/spawn', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Token': token
    },
    body: JSON.stringify({
      name: buildName(),
      workingDir: '~/projects',
      command: buildCommand()
    })
  });
}
</script>
```

### Why Spawn API vs Profiles?

| Approach | Best For |
|----------|----------|
| **Profiles** | Static configs (Bash, Large Text, specific theme) |
| **Spawn API** | Combinatorial options (Agent x Voice x Speed x Flags) |
| **QUEUE_COMMAND** | Sending to existing terminals |

**Notes:**
- Terminal ID: `ctt-{name}-{shortId}` (e.g., `ctt-Claude + explore-a1b2c3`)
- Claude status tracking works (uses `workingDir`, not profile name)
- Tab appears automatically via WebSocket broadcast

---

## Summary

| Method | Auth | Use Case |
|--------|------|----------|
| `data-terminal-command` | None | Static "Run in Terminal" buttons |
| WebSocket + websocat | `/tmp/tabz-auth-token` | CLI/tmux workflows |
| WebSocket + JS | `/api/auth/token` | Prompt libraries |
| POST /api/spawn (CLI) | `/tmp/tabz-auth-token` | Programmatic terminal creation |
| POST /api/spawn (Web) | User pastes token | External launchers (GitHub Pages) |

---

## Architecture

### Queue Command Flow (Methods 1-3)
```
+------------------+     +------------------+     +------------------+
|   Web Page       |     |    CLI/Script    |     |   Prompt App     |
| data-terminal-   |     |   (websocat)     |     |  (ggprompts)     |
|    command       |     |                  |     |                  |
+--------+---------+     +--------+---------+     +--------+---------+
         |                        |                        |
         | content script         | WebSocket + token      | WebSocket + token
         | click handler          | from /tmp/tabz-auth    | from /api/auth/token
         v                        v                        v
+---------------------------------------------------------------------+
|                    TabzChrome Backend                               |
|                    ws://localhost:8129?token=<auth_token>           |
|                                                                     |
|  case 'QUEUE_COMMAND':                                              |
|    broadcast({ type: 'QUEUE_COMMAND', command: data.command });     |
+---------------------------------+-----------------------------------+
                                  | broadcast
                                  v
+---------------------------------------------------------------------+
|                Chrome Extension (background.ts)                     |
|                                                                     |
|  -> Opens sidebar if closed                                         |
|  -> Forwards QUEUE_COMMAND to sidepanel                             |
+---------------------------------+-----------------------------------+
                                  |
                                  v
+---------------------------------------------------------------------+
|                    Sidepanel (React)                                |
|                                                                     |
|  -> Populates chat input with command                               |
|  -> User picks terminal tab and sends                               |
+---------------------------------------------------------------------+
```

### Spawn Flow (Method 4)
```
+----------------------------------+
|   Claude Launcher Web Page       |
|   or CLI (curl)                  |
|                                  |
|   POST /api/spawn                |
|   { name, workingDir, command }  |
+-----------------+----------------+
                  | HTTP POST
                  v
+---------------------------------------------------------------------+
|                    TabzChrome Backend                               |
|                    http://localhost:8129/api/spawn                  |
|                                                                     |
|  -> Creates tmux session (ctt-{name}-{shortId})                     |
|  -> Registers terminal in registry                                  |
|  -> Executes command after shell ready (~1.2s)                      |
|  -> broadcast({ type: 'terminal-spawned', data: terminal })         |
+---------------------------------+-----------------------------------+
                                  | WebSocket broadcast
                                  v
+---------------------------------------------------------------------+
|                    Sidepanel (React)                                |
|                                                                     |
|  -> New tab appears automatically                                   |
|  -> Claude status tracking works (by workingDir)                    |
|  -> User can interact immediately                                   |
+---------------------------------------------------------------------+
```

---

## Security Considerations for HTTPS Sites

### Private Network Access (Chrome 94+)

Chrome blocks HTTPS websites from accessing localhost unless the server explicitly allows it. The TabzChrome backend includes the required header:

```
Access-Control-Allow-Private-Network: true
```

If you're building a similar integration, ensure your localhost server responds to preflight requests with this header:

```javascript
// Express middleware example
app.use((req, res, next) => {
  if (req.headers['access-control-request-private-network']) {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  next();
});
app.use(cors());
```

### Token Sanitization

HTTP headers only support ISO-8859-1 characters. Copy-paste can introduce invisible unicode characters that break requests:

```
TypeError: Failed to read 'headers': String contains non ISO-8859-1 code point
```

Always sanitize tokens before use:

```javascript
// Remove non-ASCII characters from token
const sanitizedToken = token.replace(/[^\x00-\xFF]/g, '');
```

### Token Lifecycle

- Token regenerates on every backend restart
- If spawn requests fail with 401, the user needs a fresh token
- Consider showing clear error messages when token is invalid/expired

### Remote Site Initialization Pattern

For sites deployed to HTTPS (Vercel, GitHub Pages, etc.), don't probe localhost on init:

```javascript
function isLocalhost() {
  const hostname = window.location.hostname;
  return hostname === 'localhost' || hostname === '127.0.0.1';
}

async function initTerminalConnection() {
  const storedToken = localStorage.getItem('tabz-api-token');

  if (isLocalhost()) {
    // On localhost: probe backend, auto-fetch token
    const health = await fetch('http://localhost:8129/api/health');
    if (health.ok && !storedToken) {
      const { token } = await fetch('http://localhost:8129/api/auth/token').then(r => r.json());
      localStorage.setItem('tabz-api-token', token);
    }
  } else {
    // On remote site: skip probes, use stored token only
    // Probing localhost from HTTPS causes browser permission prompts
    if (!storedToken) {
      showMessage('API token required - paste from TabzChrome Settings');
    }
  }
}
```
