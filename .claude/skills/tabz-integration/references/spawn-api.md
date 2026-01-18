# Spawn API

Create new terminal tabs programmatically.

## POST /api/spawn

```bash
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

## Parameters

| Parameter | Required | Description |
|-----------|----------|-------------|
| `X-Auth-Token` (header) | **Yes** | Auth token |
| `name` | No | Tab display name |
| `workingDir` | No | Starting directory (default: `$HOME`) |
| `command` | No | Command to run after shell ready (~1.2s delay) |

## Getting the Auth Token

| Context | Method |
|---------|--------|
| CLI / Scripts | `TOKEN=$(cat /tmp/tabz-auth-token)` |
| Extension Settings | Click "API Token" → "Copy Token" |
| External web pages | User pastes token (stored in localStorage) |

## JavaScript (External Sites)

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
    alert('Token required - get from Tabz Settings → API Token');
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

## Claude Code Launcher Example

Build commands dynamically instead of maintaining hundreds of profiles:

```html
<select id="agent">
  <option value="">None</option>
  <option value="--agent explore">Explore</option>
  <option value="--agent plan">Plan</option>
</select>

<select id="voice">
  <option value="">Default</option>
  <option value="--voice jenny">Jenny</option>
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

async function spawnClaude() {
  const token = getToken();
  if (!token) return alert('Token required');

  await fetch('http://localhost:8129/api/spawn', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Auth-Token': token
    },
    body: JSON.stringify({
      name: 'Claude + ' + document.getElementById('agent').value.replace('--agent ', ''),
      workingDir: '~/projects',
      command: buildCommand()
    })
  });
}
</script>
```

## Spawn vs Profiles vs Queue

| Approach | Best For |
|----------|----------|
| **Profiles** | Static configs (Bash, Large Text, specific theme) |
| **Spawn API** | Combinatorial options (Agent × Voice × Flags) |
| **QUEUE_COMMAND** | Sending to existing terminals |

## Notes

- Terminal ID: `ctt-{name}-{shortId}` (e.g., `ctt-Claude + explore-a1b2c3`)
- Claude status tracking works (uses `workingDir`, not profile name)
- Tab appears automatically via WebSocket broadcast
