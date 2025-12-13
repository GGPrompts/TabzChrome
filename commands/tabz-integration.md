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

---

## Summary

| Method | Auth | Use Case |
|--------|------|----------|
| `data-terminal-command` | None | Static "Run in Terminal" buttons |
| WebSocket + websocat | `/tmp/tabz-auth-token` | CLI/tmux workflows |
| WebSocket + JS | `/api/auth/token` | Prompt libraries |
| POST /api/spawn (CLI) | `/tmp/tabz-auth-token` | Programmatic terminal creation |
| POST /api/spawn (Web) | User pastes token | External launchers (GitHub Pages) |
