#!/usr/bin/env node
// One synthetic task; no model, browser, user configuration or user backend.
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
let repoRoot = packageRoot
while (!existsSync(resolve(repoRoot, 'extension/shared/mcpToolCatalog.json'))) {
  const parent = dirname(repoRoot)
  if (parent === repoRoot) throw new Error('A TabzChrome checkout is required')
  repoRoot = parent
}
const catalog = JSON.parse(readFileSync(resolve(repoRoot, 'extension/shared/mcpToolCatalog.json'), 'utf8'))
const baselinePath = resolve(repoRoot, 'docs/planning/glass-catchup-2026-09-07/mcp-stdio-baseline.json')
const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'))
const page = { url: 'https://example.test/orders', title: 'Synthetic orders', tabId: 41 }
const click = { selector: '#submit', tabId: 41 }
const size = value => ({ bytes: Buffer.byteLength(JSON.stringify(value)), chars: JSON.stringify(value).length })

async function measure(mode) {
  const backendRequests = { configuration: 0, read: 0, action: 0, unexpected: 0 }
  const fixture = createServer(async (request, response) => {
    const path = new URL(request.url, 'http://127.0.0.1').pathname
    let raw = ''
    for await (const chunk of request) raw += chunk
    const input = raw ? JSON.parse(raw) : {}
    let body
    if (path === '/api/mcp-config') {
      backendRequests.configuration++
      const ids = catalog.map(tool => tool.id)
      body = { enabledTools: ids, knownTools: ids }
    } else if (path === '/api/browser/page-info') {
      backendRequests.read++
      body = page
    } else if (path === '/api/browser/read-page') {
      backendRequests.read++
      body = { ...page, success: true, text: 'Interactive elements:\n[ref:synthetic-submit] button "Submit"', nodeCount: 1, refCount: 1, truncated: false }
    } else if (path === '/api/browser/click-element' || path === '/api/browser/act') {
      if (input.selector !== click.selector || input.tabId !== click.tabId || (path.endsWith('/act') && input.action !== 'click')) {
        backendRequests.unexpected++
        response.statusCode = 400
        body = { success: false, error: 'Wrong synthetic action target' }
      } else {
        backendRequests.action++
        body = { success: true, tagName: 'BUTTON', tabId: 41, action: 'click', trusted: false, dispatched: true, verified: true }
      }
    } else {
      backendRequests.unexpected++
      response.statusCode = 404
      body = { error: 'Unexpected synthetic request' }
    }
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify(body))
  })
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve))
  const child = spawn(process.execPath, ['dist/index.js'], {
    cwd: packageRoot,
    env: { ...process.env, BACKEND_URL: `http://127.0.0.1:${fixture.address().port}`, MCP_PRESET: '',
      TABZ_AGENT_LABEL: 'synthetic-workflow-measurement', TABZ_TERMINAL_ID: '', TMUX: '', TMUX_PANE: '' },
    stdio: ['pipe', 'pipe', 'pipe']
  })
  const pending = new Map()
  let nextId = 0
  let stderr = ''
  const fail = error => { for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(error) } pending.clear() }
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000) })
  child.on('error', fail)
  child.on('exit', code => fail(new Error(`MCP exited ${code}: ${stderr}`)))
  createInterface({ input: child.stdout }).on('line', line => {
    let message
    try { message = JSON.parse(line) } catch { fail(new Error('Invalid MCP JSON')); return }
    const waiter = pending.get(message.id)
    if (!waiter) return
    pending.delete(message.id)
    clearTimeout(waiter.timer)
    if (message.error || message.result?.isError) waiter.reject(new Error(`Synthetic call failed: ${JSON.stringify(message)}`))
    else waiter.resolve(message)
  })
  const rpc = (method, params) => new Promise((resolve, reject) => {
    const id = ++nextId
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)) }, 10_000)
    pending.set(id, { resolve, reject, timer })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
  try {
    await rpc('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'synthetic-workflow', version: '1.0.0' } })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n')
    await rpc('tools/list', {})
    const calls = mode === 'legacy-current'
      ? [{ name: 'tabz_get_page_info', arguments: { response_format: 'json' } }, { name: 'tabz_click', arguments: click }]
      : [{ name: 'tabz_read_page', arguments: { tabId: 41 } }, { name: 'tabz_act', arguments: { action: 'click', ...click } }]
    const dispatched = mode === 'compact-batch' ? [{ name: 'tabz_batch', arguments: { items: calls.map(call => ({ name: call.name, input: call.arguments })) } }] : calls
    const responses = []
    for (const call of dispatched) responses.push(await rpc('tools/call', call))
    if (backendRequests.read !== 1 || backendRequests.action !== 1 || backendRequests.unexpected !== 0) throw new Error('Workflow did not perform exactly one read and one action')
    return { mode, workflowRpcRoundTrips: dispatched.length, initializationRpcRoundTrips: 2,
      backendRequests, resultPayload: size(responses.map(response => response.result)),
      responseEnvelopeBytes: responses.reduce((sum, response) => sum + size(response).bytes, 0),
      responseEnvelopeChars: responses.reduce((sum, response) => sum + size(response).chars, 0),
      protocolEvidence: { calls: dispatched, responses } }
  } finally {
    fail(new Error('Measurement complete'))
    if (child.exitCode === null && child.signalCode === null) await new Promise(resolve => {
      const timer = setTimeout(() => { child.kill('SIGKILL'); resolve() }, 1000)
      child.once('exit', () => { clearTimeout(timer); resolve() })
      child.kill()
    })
    fixture.closeAllConnections()
    await new Promise(resolve => fixture.close(resolve))
  }
}

try {
  const frozen = Object.values(baseline.protocolEvidence.syntheticToolCalls).map(call => call.response)
  const result = {
    method: 'Actual built stdio MCP protocol against an ephemeral synthetic HTTP backend. Task: read the known synthetic orders page and click #submit in tab 41 once. Compact reads also return an outline. No model or real browser calls.',
    comparisonLimits: 'Response shape and evidence differ. Schema/startup size is measured separately; batching reduces outer MCP calls, not backend actions. These are bytes and RPC counts, not model invocations, latency or billed tokens.',
    frozenBaselineSha256: createHash('sha256').update(readFileSync(baselinePath)).digest('hex'),
    frozenBaseline: { workflowRpcRoundTrips: 2, initializationRpcRoundTrips: 2, backendRequests: baseline.backendRequests,
      resultPayload: size(frozen.map(response => response.result)), responseEnvelopeBytes: frozen.reduce((sum, response) => sum + size(response).bytes, 0) },
    measurements: [await measure('legacy-current'), await measure('compact-separate'), await measure('compact-batch')]
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
} catch (error) {
  process.stderr.write(`measure-workflow: ${error.message}\n`)
  process.exitCode = 1
}
