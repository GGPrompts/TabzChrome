# JavaScript WebSocket API

Dynamic web apps like prompt libraries with fillable fields.

## Basic Connection

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
```

## Example: Prompt Template

```javascript
// Send filled-in prompt template
const filledPrompt = `
Refactor the ${selectedFile} to:
- Use ${framework} patterns
- Add error handling for ${errorCases}
`;
queueToTabz(filledPrompt);
```

## Connection Management

```javascript
class TabzConnection {
  constructor() {
    this.ws = null;
    this.reconnectAttempts = 0;
  }

  async connect() {
    try {
      const tokenRes = await fetch('http://localhost:8129/api/auth/token');
      const { token } = await tokenRes.json();

      this.ws = new WebSocket(`ws://localhost:8129?token=${token}`);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        console.log('Connected to TabzChrome');
      };

      this.ws.onclose = () => {
        if (this.reconnectAttempts < 3) {
          setTimeout(() => this.connect(), 1000);
          this.reconnectAttempts++;
        }
      };

      return new Promise((resolve, reject) => {
        this.ws.onopen = () => resolve();
        this.ws.onerror = reject;
      });
    } catch (e) {
      console.error('TabzChrome not available:', e);
    }
  }

  queue(command) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'QUEUE_COMMAND', command }));
      return true;
    }
    return false;
  }
}

// Usage
const tabz = new TabzConnection();
await tabz.connect();
tabz.queue('npm run dev');
```

## React Hook

```javascript
function useTabzConnection() {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);

  useEffect(() => {
    const connect = async () => {
      try {
        const { token } = await fetch('http://localhost:8129/api/auth/token')
          .then(r => r.json());

        wsRef.current = new WebSocket(`ws://localhost:8129?token=${token}`);
        wsRef.current.onopen = () => setConnected(true);
        wsRef.current.onclose = () => setConnected(false);
      } catch (e) {
        setConnected(false);
      }
    };

    connect();
    return () => wsRef.current?.close();
  }, []);

  const queue = useCallback((command) => {
    wsRef.current?.send(JSON.stringify({ type: 'QUEUE_COMMAND', command }));
  }, []);

  return { connected, queue };
}
```

## Notes

- `/api/auth/token` only responds to localhost requests
- For external sites, see `spawn-api.md` token handling
