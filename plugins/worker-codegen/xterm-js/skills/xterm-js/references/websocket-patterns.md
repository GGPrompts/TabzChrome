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
  }
})

// On output: send ONLY to owners (no broadcast!)
terminalRegistry.on('output', (terminalId, data) => {
  const owners = terminalOwners.get(terminalId)

  if (!owners || owners.size === 0) {
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

## Debugging WebSocket Issues

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
