# WebSocket Communication Patterns

This document covers WebSocket patterns for terminal I/O, including message types, backend routing, and multi-window communication.

## Critical Pattern: Message Type Semantics

### The Problem

Backend WebSocket handlers often have different semantics for similar-looking message types. You must read the backend code to understand what each type does.

### Common Message Types

```javascript
// backend/server.js WebSocket handler

ws.on('message', (message) => {
  const msg = JSON.parse(message)

  switch (msg.type) {
    case 'disconnect':
      // Graceful disconnect - closes PTY connection
      // BUT keeps tmux session alive
      pty.disconnect()
      break

    case 'close':
      // DESTRUCTIVE - kills PTY AND tmux session
      pty.kill()
      execSync(`tmux kill-session -t ${sessionName}`)
      break

    case 'input':
      // Standard terminal input
      pty.write(msg.data)
      break

    case 'resize':
      // Resize PTY dimensions
      pty.resize(msg.cols, msg.rows)
      break
  }
})
```

### The Bug: Using 'close' for Detach

```typescript
// WRONG - This KILLS the tmux session permanently!
const handleDetach = () => {
  wsRef.current.send(JSON.stringify({
    type: 'close',  // ❌ DESTRUCTIVE!
    terminalId: terminal.agentId,
  }))
}

// User clicks detached tab to reattach
// Backend: "No tmux session found" - session was killed!
```

### The Fix: Use API Endpoints for Non-Destructive Operations

```typescript
// CORRECT - Use API endpoint for detach
const handleDetach = async () => {
  // Only call the API endpoint - don't send WebSocket message
  await fetch(`/api/tmux/detach/${terminal.sessionName}`, {
    method: 'POST'
  })

  // PTY disconnects naturally when client detaches
  // Tmux session stays alive

  // Clear refs and update state
  if (terminal.agentId) {
    clearProcessedAgentId(terminal.agentId)
  }
  updateTerminal(id, {
    status: 'detached',
    agentId: undefined,
  })
}

// Backend API endpoint (backend/routes/api.js)
router.post('/api/tmux/detach/:name', async (req, res) => {
  const sessionName = req.params.name
  // Non-destructive detach - session survives
  execSync(`tmux detach-client -s "${sessionName}"`)
  res.json({ success: true })
})
```

## Backend Output Routing (Multi-Window)

### The Problem

Broadcasting terminal output to all WebSocket clients causes corruption. Escape sequences meant for one terminal appear in another.

**Symptom:** Random escape sequences like `1;2c0;276;0c` appearing in terminals.

### The Solution: Terminal Ownership Tracking

```javascript
// backend/server.js

// Track which WebSocket owns which terminal
const terminalOwners = new Map()  // terminalId -> Set<WebSocket>

// On spawn/reconnect: register ownership
ws.on('message', (message) => {
  const msg = JSON.parse(message)

  if (msg.type === 'spawn' || msg.type === 'reconnect') {
    const terminalId = msg.terminalId

    // Initialize ownership set if needed
    if (!terminalOwners.has(terminalId)) {
      terminalOwners.set(terminalId, new Set())
    }

    // Add this WebSocket as owner
    terminalOwners.get(terminalId).add(ws)

    console.log(`[WS] Registered owner for terminal ${terminalId}`, {
      totalOwners: terminalOwners.get(terminalId).size
    })
  }
})

// On output: send ONLY to owners (no broadcast!)
terminalRegistry.on('output', (terminalId, data) => {
  const owners = terminalOwners.get(terminalId)

  if (!owners || owners.size === 0) {
    console.warn(`[WS] No owners for terminal ${terminalId}`)
    return
  }

  const message = JSON.stringify({
    type: 'output',
    terminalId,
    data,
  })

  // Send to each owner (NOT all clients!)
  owners.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message)
    }
  })
})

// Cleanup on disconnect
ws.on('close', () => {
  // Remove this WebSocket from all terminal ownership sets
  terminalOwners.forEach((owners, terminalId) => {
    owners.delete(ws)

    // Clean up empty ownership sets
    if (owners.size === 0) {
      terminalOwners.delete(terminalId)
    }
  })
})
```

### Defensive Cleanup for Stale Connections

Even with proper close handling, stale connections can linger. Add periodic cleanup:

```javascript
// Periodic cleanup of dead connections (every 5 seconds)
setInterval(() => {
  terminalOwners.forEach((owners, terminalId) => {
    const deadConnections = []

    owners.forEach(client => {
      // Check if connection is dead
      if (client.readyState === WebSocket.CLOSED ||
          client.readyState === WebSocket.CLOSING) {
        deadConnections.push(client)
      }
    })

    // Remove dead connections
    deadConnections.forEach(dead => {
      owners.delete(dead)
      console.log(`[WS] Cleaned up dead connection for terminal ${terminalId}`)
    })

    // Clean up empty ownership sets
    if (owners.size === 0) {
      terminalOwners.delete(terminalId)
    }
  })
}, 5000)
```

## Frontend: Window-Based Filtering

### The Problem

In multi-window setups, Window 1 can adopt terminals spawned in Window 2, creating duplicate connections to the same tmux session.

### The Solution: Check windowId Before Adding to Agents

```typescript
// src/SimpleTerminalApp.tsx

// WebSocket message handler
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)

  if (message.type === 'terminal-spawned') {
    const existingTerminal = terminals.find(t => t.id === message.terminalId)

    if (existingTerminal) {
      // CRITICAL: Check windowId BEFORE adding to agents
      const terminalWindow = existingTerminal.windowId || 'main'
      const currentWindowId = urlParams.get('window') || 'main'

      if (terminalWindow !== currentWindowId) {
        console.log('⏭️ Ignoring terminal-spawned - wrong window', {
          terminalWindow,
          currentWindowId
        })
        return  // Don't add to webSocketAgents!
      }

      // Safe to add - terminal belongs to this window
      addWebSocketAgent(message.data.id, existingTerminal)
    }
  }
}
```

### No Fallback Terminal Creation

```typescript
// OLD (broken) - Creates terminals for broadcasts from other windows
} else {
  // Terminal not found - must be from another window's spawn
  // Create new terminal to handle it
  const newTerminal = createTerminal(message.data)  // ❌ WRONG!
}

// NEW (fixed) - Don't create terminals for unmatched spawns
} else {
  // No matching terminal found - ignore
  console.warn('⏭️ Ignoring terminal-spawned - no matching terminal')
  return  // Prevents cross-window adoption
}
```

## Message Flow Patterns

### Spawn Flow

```typescript
// Frontend sends spawn request
wsRef.current.send(JSON.stringify({
  type: 'spawn',
  requestId: 'spawn-12345',  // For matching response
  terminalId: 'terminal-abc',
  config: {
    command: 'bash',
    sessionName: 'tt-bash-abc',
    useTmux: true,
  }
}))

// Backend spawns PTY and registers ownership
terminalOwners.get('terminal-abc').add(ws)

// Backend sends spawned confirmation
ws.send(JSON.stringify({
  type: 'terminal-spawned',
  requestId: 'spawn-12345',  // Matches request
  terminalId: 'terminal-abc',
  data: {
    id: 'agent-xyz',  // PTY agent ID
    sessionName: 'tt-bash-abc',
  }
}))

// Frontend matches by requestId and updates terminal
updateTerminal('terminal-abc', {
  agentId: 'agent-xyz',
  status: 'running',
})
```

### Reconnect Flow

```typescript
// Frontend sends reconnect request
wsRef.current.send(JSON.stringify({
  type: 'reconnect',
  sessionName: 'tt-bash-abc',  // Use existing session!
  terminalId: 'terminal-abc',
}))

// Backend finds existing PTY and registers ownership
terminalOwners.get('terminal-abc').add(ws)

// Backend sends reconnected confirmation with SAME agentId
ws.send(JSON.stringify({
  type: 'terminal-spawned',  // Same event as spawn!
  terminalId: 'terminal-abc',
  data: {
    id: 'agent-xyz',  // SAME agentId as before
    sessionName: 'tt-bash-abc',
  }
}))

// Frontend must allow same agentId to be processed again
// This is why we clear processedAgentIds on detach!
```

### Input Flow

```typescript
// Frontend sends user input
wsRef.current.send(JSON.stringify({
  type: 'input',
  terminalId: 'agent-xyz',  // Use agentId, not terminal ID!
  data: 'ls -la\r',  // Terminal input
}))

// Backend writes to PTY
pty.write('ls -la\r')

// PTY generates output
// Backend sends output to owners only
owners.forEach(client => {
  client.send(JSON.stringify({
    type: 'output',
    terminalId: 'agent-xyz',
    data: 'total 64\ndrwxr-xr-x...',  // Terminal output
  }))
})

// Frontend writes to xterm
xtermRef.current.write(message.data)
```

## Debugging WebSocket Issues

### Enable Debug Logging

```javascript
// Backend
ws.on('message', (message) => {
  const msg = JSON.parse(message)
  console.log('[WS] Received:', {
    type: msg.type,
    terminalId: msg.terminalId,
    ownersCount: terminalOwners.get(msg.terminalId)?.size || 0
  })
})
```

```typescript
// Frontend
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  console.log('[WS] Received:', {
    type: message.type,
    terminalId: message.terminalId,
    currentWindow: urlParams.get('window') || 'main',
    agentsCount: webSocketAgents.current.size
  })
}
```

### Common Issues and Solutions

**Issue:** Escape sequences in wrong terminal
- Check: Is backend using `terminalOwners` instead of broadcast?
- Check: Is frontend filtering by windowId?

**Issue:** Terminal output stops after popout window closes
- Check: Is backend cleaning up dead connections?
- Check: Is periodic cleanup running?

**Issue:** Detach kills tmux session
- Check: Are you sending WebSocket 'close' message?
- Fix: Use API endpoint only, don't send WebSocket message

**Issue:** Reconnect doesn't work
- Check: Is processedAgentIds cleared on detach?
- Check: Is backend returning same agentId?
- Check: Is frontend allowing same agentId to be processed?

## Files to Reference

- `backend/server.js:114-443` - WebSocket message handling and output routing
- `backend/routes/api.js:696-733` - Tmux detach API endpoint
- `src/SimpleTerminalApp.tsx:757-785` - Frontend windowId filtering
- `src/hooks/useWebSocketManager.ts` - WebSocket agent management
