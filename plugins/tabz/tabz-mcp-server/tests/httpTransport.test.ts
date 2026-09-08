/**
 * Streamable HTTP transport: initialize + tools/list against a plain node:http
 * server that delegates to the tabz handler, group binding through the
 * X-Tabz-Agent header, and the loopback guards.
 *
 * A fake backend stands in for the Node backend so tool calls have somewhere
 * to send their browser requests. The configured session URL deliberately
 * differs from the module-level BACKEND_URL so both config and tool traffic
 * prove that the HTTP mount's live port wins.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import http, { type IncomingHttpHeaders, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

interface RecordedRequest { path: string; agent: string | null; method: string }

const recorded: RecordedRequest[] = []
const lifecycleLogs: string[] = []

function listen(server: Server): Promise<number> {
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port))
  })
}

function closeServer(server: Server): Promise<void> {
  return new Promise(resolve => server.close(() => resolve()))
}

let backend: Server
let backendUrl: string
let mcpServer: Server
let mcpUrl: URL
let handler: import('../src/http.js').TabzMcpHandler
let httpModule: typeof import('../src/http.js')

beforeAll(async () => {
  backend = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname === '/api/mcp-config') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ enabledTools: ['tabz_list_tabs', 'tabz_claude_group_status', 'tabz_docs'] }))
      return
    }
    if (url.pathname === '/api/mcp-presets') {
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ presets: {
        tabs: { name: 'Tabs', tools: ['tabz_list_tabs', 'tabz_docs'] },
        status: { name: 'Status', tools: ['tabz_claude_group_status', 'tabz_docs'] }
      } }))
      return
    }
    if (url.pathname.startsWith('/api/browser/')) {
      let agent = url.searchParams.get('agent')
      if (req.method === 'POST') {
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(Buffer.from(chunk))
        const body = Buffer.concat(chunks).toString('utf8')
        const parsed = body ? JSON.parse(body) as { agent?: string } : {}
        agent = parsed.agent ?? agent
      }
      recorded.push({ path: url.pathname, agent, method: req.method ?? 'GET' })
      res.setHeader('Content-Type', 'application/json')
      if (url.pathname === '/api/browser/tabs') {
        res.end(JSON.stringify({ success: true, tabs: [{ tabId: 7, url: 'https://example.test', title: 'Example', active: true }] }))
      } else {
        res.end(JSON.stringify({ success: true, exists: false, groupId: null, tabCount: 0 }))
      }
      return
    }
    res.statusCode = 404
    res.end()
  })
  const backendPort = await listen(backend)
  backendUrl = `http://127.0.0.1:${backendPort}`
  process.env.BACKEND_URL = 'http://127.0.0.1:1'

  httpModule = await import('../src/http.js')
  handler = httpModule.createTabzMcpHandler({
    log: message => lifecycleLogs.push(message),
    backendUrl,
    sweepIntervalMs: 10
  })
  mcpServer = http.createServer((req: IncomingMessage, res: ServerResponse) => {
    void handler.handle(req, res)
  })
  const mcpPort = await listen(mcpServer)
  mcpUrl = new URL(`http://127.0.0.1:${mcpPort}/mcp`)
})

afterAll(async () => {
  await handler.close()
  await closeServer(mcpServer)
  await closeServer(backend)
})

async function connectClient(
  agentHeader?: string,
  presetHeader?: string,
  url: URL = mcpUrl
): Promise<{ client: Client; transport: StreamableHTTPClientTransport }> {
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: agentHeader || presetHeader ? { headers: {
      ...(agentHeader ? { 'X-Tabz-Agent': agentHeader } : {}),
      ...(presetHeader ? { 'X-Tabz-Preset': presetHeader } : {})
    } } : undefined
  })
  const client = new Client({ name: 'httpTransport.test', version: '0.0.0' })
  await client.connect(transport)
  return { client, transport }
}

async function rawRequest(
  method: string,
  headers: Record<string, string>,
  body?: unknown
): Promise<{ status: number; body: string; headers: IncomingHttpHeaders }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: Number(mcpUrl.port), path: '/mcp', method, headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...headers } },
      res => {
        let text = ''
        res.setEncoding('utf8')
        res.on('data', chunk => { text += chunk })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: text, headers: res.headers }))
      }
    )
    req.on('error', reject)
    if (body !== undefined) req.write(JSON.stringify(body))
    req.end()
  })
}

async function openRawSession(agent: string): Promise<{ sessionId: string; session: import('../src/http.js').TabzMcpSession }> {
  const init = await rawRequest(
    'POST',
    { 'X-Tabz-Agent': agent },
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } }
    }
  )
  expect(init.status).toBe(200)
  const sessionId = String(init.headers['mcp-session-id'])
  return { sessionId, session: handler.sessions.get(sessionId)! }
}

describe('tabz MCP over Streamable HTTP', () => {
  it('completes initialize and lists the enabled tools', async () => {
    const { client, transport } = await connectClient('smoke')
    try {
      expect(transport.sessionId).toBeTruthy()
      expect(client.getInstructions()).toContain('X-Tabz-Agent')
      const { tools } = await client.listTools()
      const names = tools.map(tool => tool.name).sort()
      expect(names).toEqual(['tabz_claude_group_status', 'tabz_docs', 'tabz_list_tabs'])
      expect(handler.sessions.get(transport.sessionId!)?.agentId).toBe('smoke')
    } finally {
      await transport.terminateSession()
      await client.close()
    }
    expect(handler.sessions.has(transport.sessionId!)).toBe(false)
  })

  it('binds each session to its X-Tabz-Agent header on outgoing browser requests', async () => {
    recorded.length = 0
    const one = await connectClient('qa-one')
    const two = await connectClient('qa-two')
    try {
      await one.client.callTool({ name: 'tabz_list_tabs', arguments: {} })
      await two.client.callTool({ name: 'tabz_list_tabs', arguments: {} })
      await one.client.callTool({ name: 'tabz_claude_group_status', arguments: {} })
      const agents = recorded
        .filter(entry => entry.path !== '/api/browser/claude-group/release')
        .map(entry => entry.agent)
      expect(agents).toEqual(['qa-one', 'qa-two', 'qa-one'])
    } finally {
      await one.transport.terminateSession()
      await two.transport.terminateSession()
      await one.client.close()
      await two.client.close()
    }
  })

  it('fixes each session preset and identity at initialization', async () => {
    recorded.length = 0
    const tabs = await connectClient('fixed-tabs', 'tabs')
    const status = await connectClient('fixed-status', 'status')
    try {
      expect((await tabs.client.listTools()).tools.map(tool => tool.name).sort())
        .toEqual(['tabz_docs', 'tabz_list_tabs'])
      expect((await status.client.listTools()).tools.map(tool => tool.name).sort())
        .toEqual(['tabz_claude_group_status', 'tabz_docs'])

      const response = await rawRequest(
        'POST',
        { 'Mcp-Session-Id': tabs.transport.sessionId!, 'X-Tabz-Agent': 'spoofed', 'X-Tabz-Preset': 'status' },
        { jsonrpc: '2.0', id: 9, method: 'tools/call', params: { name: 'tabz_list_tabs', arguments: {} } }
      )
      expect(response.status).toBe(200)
      expect(recorded.find(entry => entry.path === '/api/browser/tabs')?.agent).toBe('fixed-tabs')
      expect(handler.sessions.get(tabs.transport.sessionId!)?.preset).toBe('tabs')
    } finally {
      await tabs.transport.terminateSession()
      await status.transport.terminateSession()
      await tabs.client.close()
      await status.client.close()
    }
  })

  it('falls back to the session id when no header is sent', async () => {
    recorded.length = 0
    const { client, transport } = await connectClient()
    try {
      await client.callTool({ name: 'tabz_list_tabs', arguments: {} })
      expect(recorded.find(entry => entry.path === '/api/browser/tabs')?.agent).toBe(transport.sessionId)
      expect(handler.sessions.get(transport.sessionId!)?.agentLabel).toBeUndefined()
    } finally {
      await transport.terminateSession()
      await client.close()
    }
  })

  it('keeps bare HTTP sessions on mcp-config even when the backend process has MCP_PRESET', async () => {
    process.env.MCP_PRESET = 'unknown-process-preset'
    const { client, transport } = await connectClient()
    try {
      const { tools } = await client.listTools()
      expect(tools.map(tool => tool.name)).toContain('tabz_claude_group_status')
      expect(handler.sessions.get(transport.sessionId!)?.preset).toBeUndefined()
    } finally {
      await transport.terminateSession()
      await client.close()
      delete process.env.MCP_PRESET
    }
  })

  it('rejects unknown sessions and session-less non-initialize requests', async () => {
    const unknown = await rawRequest('POST', { 'Mcp-Session-Id': 'nope' }, { jsonrpc: '2.0', id: 1, method: 'tools/list' })
    expect(unknown.status).toBe(404)
    const missing = await rawRequest('POST', {}, { jsonrpc: '2.0', id: 1, method: 'tools/list' })
    expect(missing.status).toBe(400)
    expect(handler.sessions.size).toBe(0)
  })

  it('reaps an idle session through its server and transport close path', async () => {
    expect(httpModule.SESSION_IDLE_TIMEOUT_MS).toBe(30 * 60 * 1000)
    lifecycleLogs.length = 0
    recorded.length = 0
    const { sessionId, session } = await openRawSession('idle-client')
    const serverClose = vi.spyOn(session.server, 'close')
    const transportClose = vi.spyOn(session.transport, 'close')

    session.lastSeen = Date.now() - httpModule.SESSION_IDLE_TIMEOUT_MS - 1
    await vi.waitFor(() => {
      expect(handler.sessions.has(sessionId)).toBe(false)
      expect(serverClose).toHaveBeenCalledTimes(1)
      expect(transportClose).toHaveBeenCalledTimes(1)
    }, { timeout: 1000, interval: 5 })

    expect(recorded).toContainEqual({
      path: '/api/browser/claude-group/release',
      agent: 'idle-client',
      method: 'POST'
    })
    expect(lifecycleLogs.some(line => line.includes(sessionId) && /after \d+ms idle/.test(line))).toBe(true)

    const reaped = await rawRequest(
      'POST',
      { 'Mcp-Session-Id': sessionId },
      { jsonrpc: '2.0', id: 1, method: 'tools/list' }
    )
    expect(reaped.status).toBe(404)
    expect(JSON.parse(reaped.body).error.message).toBe('Session not found')
  })

  it('releases the agent group before an explicit session DELETE completes', async () => {
    recorded.length = 0
    const { sessionId, session } = await openRawSession('deleted-client')
    const releaseAgentGroup = vi.spyOn(session, 'releaseAgentGroup')

    const closed = await rawRequest('DELETE', { 'Mcp-Session-Id': sessionId })

    expect(closed.status).toBe(200)
    expect(releaseAgentGroup).toHaveBeenCalledTimes(1)
    expect(recorded).toContainEqual({
      path: '/api/browser/claude-group/release',
      agent: 'deleted-client',
      method: 'POST'
    })
    expect(handler.sessions.has(sessionId)).toBe(false)
  })

  it('refreshes lastSeen and preserves a session that keeps serving requests', async () => {
    const { sessionId, session } = await openRawSession('active-client')
    session.lastSeen = Date.now() - httpModule.SESSION_IDLE_TIMEOUT_MS + 1000
    const staleLastSeen = session.lastSeen

    const active = await rawRequest(
      'POST',
      { 'Mcp-Session-Id': sessionId },
      { jsonrpc: '2.0', id: 2, method: 'tools/list' }
    )
    expect(active.status).toBe(200)
    expect(session.lastSeen).toBeGreaterThan(staleLastSeen)
    await new Promise(resolve => setTimeout(resolve, 30))
    expect(handler.sessions.has(sessionId)).toBe(true)

    const closed = await rawRequest('DELETE', { 'Mcp-Session-Id': sessionId })
    expect(closed.status).toBe(200)
  })

  it('unrefs its sweep timer and clears it on shutdown', async () => {
    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval')
    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval')
    try {
      const lifecycleHandler = httpModule.createTabzMcpHandler({ log: () => {}, backendUrl })
      const timer = setIntervalSpy.mock.results.at(-1)?.value as NodeJS.Timeout
      expect(timer).toBeTruthy()
      expect(timer.hasRef()).toBe(false)

      await lifecycleHandler.close()
      expect(clearIntervalSpy).toHaveBeenCalledWith(timer)
    } finally {
      setIntervalSpy.mockRestore()
      clearIntervalSpy.mockRestore()
    }
  })

  it('refuses malformed hosts and every browser Origin', async () => {
    const init = { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } } }
    const badHost = await rawRequest('POST', { Host: 'glass.example.test:8130' }, init)
    expect(badHost.status).toBe(403)
    const malformedHost = await rawRequest('POST', { Host: 'evil@localhost' }, init)
    expect(malformedHost.status).toBe(403)
    const pathHost = await rawRequest('POST', { Host: 'localhost/path' }, init)
    expect(pathHost.status).toBe(403)
    const badOrigin = await rawRequest('POST', { Origin: 'https://evil.example.test' }, init)
    expect(badOrigin.status).toBe(403)
    const localOrigin = await rawRequest('POST', { Origin: 'http://localhost:5173' }, init)
    expect(localOrigin.status).toBe(403)
    const nullOrigin = await rawRequest('POST', { Origin: 'null' }, init)
    expect(nullOrigin.status).toBe(403)
    const extensionOrigin = await rawRequest('POST', { Origin: 'chrome-extension://abcdefghijklmnop' }, init)
    expect(extensionOrigin.status).toBe(403)
    expect(handler.sessions.size).toBe(0)
  })

  it('rejects the reserved explicit agent header before creating a session', async () => {
    const init = {
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 't', version: '0' } }
    }
    const response = await rawRequest('POST', { 'X-Tabz-Agent': '__default__' }, init)
    expect(response.status).toBe(400)
    expect(JSON.parse(response.body).error.message).toContain('reserved for legacy unlabeled requests')
    expect(handler.sessions.size).toBe(0)
  })

  it('removes a partially initialized session after protocol validation fails', async () => {
    const before = handler.sessions.size
    const response = await rawRequest('POST', { 'X-Tabz-Agent': 'bad-init' }, {
      jsonrpc: '2.0', id: 1, method: 'initialize', params: {}
    })
    expect(response.status).toBeGreaterThanOrEqual(400)
    expect(handler.sessions.size).toBe(before)
  })

  it('closes idempotently within the backend mount budget', async () => {
    const local = httpModule.createTabzMcpHandler({ log: () => {}, backendUrl })
    const started = Date.now()
    const first = local.close()
    const second = local.close()
    expect(second).toBe(first)
    await first
    expect(Date.now() - started).toBeLessThan(2_000)
  })

  it('routes concurrent handlers to their own backend and agent', async () => {
    const hits: string[] = []
    const makeBackend = (name: string) => http.createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      res.setHeader('Content-Type', 'application/json')
      if (url.pathname === '/api/mcp-config') {
        res.end(JSON.stringify({ enabledTools: ['tabz_list_tabs', 'tabz_docs'] }))
        return
      }
      if (url.pathname === '/api/browser/tabs') {
        hits.push(`${name}:${url.searchParams.get('agent')}`)
        res.end(JSON.stringify({ success: true, tabs: [] }))
        return
      }
      if (url.pathname === '/api/browser/claude-group/release') {
        res.end(JSON.stringify({ success: true }))
        return
      }
      res.statusCode = 404
      res.end('{}')
    })
    const backendOne = makeBackend('one')
    const backendTwo = makeBackend('two')
    const handlerOne = httpModule.createTabzMcpHandler({ log: () => {}, backendUrl: `http://127.0.0.1:${await listen(backendOne)}` })
    const handlerTwo = httpModule.createTabzMcpHandler({ log: () => {}, backendUrl: `http://127.0.0.1:${await listen(backendTwo)}` })
    const endpointOne = http.createServer((req, res) => { void handlerOne.handle(req, res) })
    const endpointTwo = http.createServer((req, res) => { void handlerTwo.handle(req, res) })
    const oneUrl = new URL(`http://127.0.0.1:${await listen(endpointOne)}/mcp`)
    const twoUrl = new URL(`http://127.0.0.1:${await listen(endpointTwo)}/mcp`)
    const one = await connectClient('agent-one', undefined, oneUrl)
    const two = await connectClient('agent-two', undefined, twoUrl)
    try {
      await Promise.all([
        one.client.callTool({ name: 'tabz_list_tabs', arguments: {} }),
        two.client.callTool({ name: 'tabz_list_tabs', arguments: {} })
      ])
      expect(hits.sort()).toEqual(['one:agent-one', 'two:agent-two'])
    } finally {
      await one.transport.terminateSession()
      await two.transport.terminateSession()
      await one.client.close()
      await two.client.close()
      await Promise.all([handlerOne.close(), handlerTwo.close()])
      await Promise.all([closeServer(endpointOne), closeServer(endpointTwo), closeServer(backendOne), closeServer(backendTwo)])
    }
  })
})

describe('loopback guards', () => {
  it('accepts loopback hosts with or without ports', () => {
    for (const host of ['localhost', 'localhost:8130', '127.0.0.1:8130', '[::1]:8130']) {
      expect(httpModule.isLoopbackHost(host)).toBe(true)
    }
    for (const host of [undefined, '', 'glass.example.test', '10.0.0.5:8130', 'localhost.evil.test', 'evil@localhost', 'localhost/path', 'localhost:99999']) {
      expect(httpModule.isLoopbackHost(host)).toBe(false)
    }
  })

  it('accepts only requests without an Origin header', () => {
    expect(httpModule.isAllowedOrigin(undefined)).toBe(true)
    expect(httpModule.isAllowedOrigin('http://localhost:5173')).toBe(false)
    expect(httpModule.isAllowedOrigin('http://127.0.0.1:8130')).toBe(false)
    expect(httpModule.isAllowedOrigin('null')).toBe(false)
    expect(httpModule.isAllowedOrigin('https://evil.example.test')).toBe(false)
    expect(httpModule.isAllowedOrigin('chrome-extension://abcdefghijklmnop')).toBe(false)
  })

  it('requires the TCP peer to be loopback, including mapped IPv4', () => {
    expect(httpModule.isLoopbackRemoteAddress('127.0.0.1')).toBe(true)
    expect(httpModule.isLoopbackRemoteAddress('127.5.4.3')).toBe(true)
    expect(httpModule.isLoopbackRemoteAddress('::1')).toBe(true)
    expect(httpModule.isLoopbackRemoteAddress('::ffff:127.0.0.1')).toBe(true)
    expect(httpModule.isLoopbackRemoteAddress(undefined)).toBe(false)
    expect(httpModule.isLoopbackRemoteAddress('10.0.0.5')).toBe(false)
    expect(httpModule.isLoopbackRemoteAddress('::ffff:10.0.0.5')).toBe(false)
  })

  it('derives the connection identity from the header, else the session id', () => {
    expect(httpModule.resolveHttpAgentIdentity(' qa ', 'sid')).toEqual({ agentId: 'qa', agentLabel: 'qa' })
    expect(httpModule.resolveHttpAgentIdentity(undefined, 'sid')).toEqual({ agentId: 'sid' })
    expect(httpModule.resolveHttpAgentIdentity('   ', 'sid')).toEqual({ agentId: 'sid' })
    expect(() => httpModule.resolveHttpAgentIdentity('__default__', 'sid')).toThrow('reserved')
  })
})
