# Security Considerations

Important security notes for HTTPS sites and external integrations.

## Private Network Access (Chrome 94+)

Chrome blocks HTTPS websites from accessing localhost unless the server explicitly allows it. The TabzChrome backend includes the required header:

```
Access-Control-Allow-Private-Network: true
```

### Server Implementation

If building a similar integration, ensure your localhost server responds to preflight requests:

```javascript
// Express middleware
app.use((req, res, next) => {
  if (req.headers['access-control-request-private-network']) {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
  }
  next();
});
app.use(cors());
```

## Token Sanitization

HTTP headers only support ISO-8859-1 characters. Copy-paste can introduce invisible unicode characters:

```
TypeError: Failed to read 'headers': String contains non ISO-8859-1 code point
```

Always sanitize tokens before use:

```javascript
// Remove non-ASCII characters from token
const sanitizedToken = token.replace(/[^\x00-\xFF]/g, '');
```

## Token Lifecycle

- Token regenerates on every backend restart
- If requests fail with 401, user needs a fresh token
- Show clear error messages for invalid/expired tokens

## Remote Site Initialization

For sites deployed to HTTPS (Vercel, GitHub Pages), don't probe localhost on init:

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
      const { token } = await fetch('http://localhost:8129/api/auth/token')
        .then(r => r.json());
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

## Token Storage Best Practices

```javascript
// Store token securely
function saveToken(token) {
  // Sanitize before storing
  const clean = token.replace(/[^\x00-\xFF]/g, '').trim();
  localStorage.setItem('tabz-api-token', clean);
}

// Retrieve with validation
function getToken() {
  const token = localStorage.getItem('tabz-api-token');
  if (!token) return null;

  // Validate format (basic check)
  if (token.length < 10 || token.length > 100) {
    localStorage.removeItem('tabz-api-token');
    return null;
  }

  return token;
}
```

## Error Handling

```javascript
async function safeSpawn(options) {
  const token = getToken();
  if (!token) {
    throw new Error('No API token - get from TabzChrome Settings');
  }

  try {
    const res = await fetch('http://localhost:8129/api/spawn', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Auth-Token': token
      },
      body: JSON.stringify(options)
    });

    if (res.status === 401) {
      localStorage.removeItem('tabz-api-token');
      throw new Error('Token expired - please re-enter');
    }

    if (!res.ok) {
      throw new Error(`Spawn failed: ${res.status}`);
    }

    return res.json();
  } catch (e) {
    if (e.name === 'TypeError') {
      throw new Error('TabzChrome backend not running');
    }
    throw e;
  }
}
```
