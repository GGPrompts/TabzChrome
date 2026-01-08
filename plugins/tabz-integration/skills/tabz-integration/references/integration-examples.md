# TabzChrome Integration Examples

Detailed code examples for each integration method.

---

## Method 1: HTML Data Attributes

Add `data-terminal-command` to any HTML element:

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

---

## Method 2: WebSocket API (CLI/Scripts)

### Shell Function

Add to `.bashrc` or `.zshrc`:

```bash
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

## Method 3: Web Page JavaScript

```javascript
// Connect to TabzChrome with auth
async function connectToTabz() {
  const tokenRes = await fetch('http://localhost:8129/api/auth/token');
  const { token } = await tokenRes.json();
  return new WebSocket(`ws://localhost:8129?token=${token}`);
}

// Queue a prompt to the chat input
let ws;
async function queueToTabz(prompt) {
  if (!ws || ws.readyState !== WebSocket.OPEN) {
    ws = await connectToTabz();
    await new Promise(resolve => ws.onopen = resolve);
  }
  ws.send(JSON.stringify({ type: 'QUEUE_COMMAND', command: prompt }));
}

// Example: Send filled-in prompt template
queueToTabz(`Refactor ${selectedFile} using ${framework} patterns`);
```

**Note:** `/api/auth/token` only responds to localhost requests.

---

## Method 4: Spawn API

### Basic Usage

```bash
TOKEN=$(cat /tmp/tabz-auth-token)
curl -X POST http://localhost:8129/api/spawn \
  -H "Content-Type: application/json" \
  -H "X-Auth-Token: $TOKEN" \
  -d '{
    "name": "Claude Worker",
    "workingDir": "~/projects/myapp",
    "command": "claude --dangerously-skip-permissions"
  }'
```

### Web Page with Token Input

```javascript
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

### Dynamic Command Builder

```html
<select id="agent">
  <option value="">None</option>
  <option value="--agent explore">Explore</option>
  <option value="--agent plan">Plan</option>
</select>
<button onclick="spawnClaude()">Spawn</button>

<script>
async function spawnClaude() {
  const agent = document.getElementById('agent').value;
  const cmd = `claude ${agent} --dangerously-skip-permissions`.trim();
  await spawnTerminal('Claude', '~/projects', cmd);
}
</script>
```

---

## Security Notes

### Private Network Access (Chrome 94+)

Chrome blocks HTTPS sites from accessing localhost. TabzChrome backend includes:
```
Access-Control-Allow-Private-Network: true
```

### Token Sanitization

Remove non-ASCII characters that break HTTP headers:
```javascript
const sanitizedToken = token.replace(/[^\x00-\xFF]/g, '');
```

### Remote Site Pattern

Don't probe localhost on HTTPS sites - use stored token only:
```javascript
if (!isLocalhost() && !localStorage.getItem('tabz-api-token')) {
  showMessage('API token required - paste from TabzChrome Settings');
}
```
