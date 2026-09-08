#!/usr/bin/env node
// Isolated stdio measurement: no Chrome or user backend access.
import { createServer } from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import { createInterface } from 'node:readline'
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const packageRoot = process.argv[2] ? resolve(process.argv[2]) : resolve(dirname(fileURLToPath(import.meta.url)), '..')
let repoRoot = packageRoot
while (!existsSync(resolve(repoRoot, 'extension/shared/mcpToolCatalog.json'))) {
  const parent = dirname(repoRoot)
  if (parent === repoRoot) throw new Error('Run this measurement from a TabzChrome checkout')
  repoRoot = parent
}
const catalog = JSON.parse(readFileSync(resolve(repoRoot, 'extension/shared/mcpToolCatalog.json'), 'utf8'))
const definitions = JSON.parse(readFileSync(resolve(repoRoot, 'extension/shared/mcpPresetDefinitions.json'), 'utf8'))
const ids = catalog.map(tool => tool.id)
const presets = Object.fromEntries(Object.entries(definitions).map(([id, definition]) => [id, {
  name: definition.name,
  tools: catalog.filter(tool => definition.categories.includes(tool.category)).map(tool => tool.id)
}]))
const sizes = text => ({ chars: text.length, bytes: Buffer.byteLength(text), estimatedTokensCharsDiv4: Math.ceil(text.length / 4) })
const jsonSizes = value => sizes(JSON.stringify(value))
const sha256 = file => createHash('sha256').update(readFileSync(file)).digest('hex')
const hashText = text => createHash('sha256').update(text).digest('hex')
function withoutDescriptions(value) {
  if (Array.isArray(value)) return value.map(withoutDescriptions)
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== 'description').map(([key, child]) => [key, withoutDescriptions(child)]))
  return value
}
function descriptionChars(value) {
  if (Array.isArray(value)) return value.reduce((sum, child) => sum + descriptionChars(child), 0)
  if (!value || typeof value !== 'object') return 0
  return Object.entries(value).reduce((sum, [key, child]) => sum +
    (key === 'description' && typeof child === 'string' ? child.length : descriptionChars(child)), 0)
}

async function measure(preset) {
  const requests = { configuration: 0, presets: 0, unexpected: 0 }
  const fixture = createServer((request, response) => {
    const path = new URL(request.url, 'http://127.0.0.1').pathname
    let body
    if (path === '/api/mcp-config') {
      requests.configuration++
      body = { enabledTools: ids, knownTools: ids }
    } else if (path === '/api/mcp-presets') {
      requests.presets++
      body = { presets }
    } else {
      requests.unexpected++
      response.statusCode = 404
      body = { error: 'Unexpected synthetic request' }
    }
    response.setHeader('content-type', 'application/json')
    response.end(JSON.stringify(body))
  })
  await new Promise(resolve => fixture.listen(0, '127.0.0.1', resolve))
  const child = spawn(process.execPath, ['dist/index.js'], {
    cwd: packageRoot,
    env: { ...process.env, BACKEND_URL: `http://127.0.0.1:${fixture.address().port}`, MCP_PRESET: preset ?? '',
      TABZ_AGENT_LABEL: 'synthetic-catalog-measurement', TABZ_TERMINAL_ID: '', TMUX: '', TMUX_PANE: '' },
    stdio: ['pipe', 'pipe', 'pipe']
  })
  const pending = new Map()
  let stderr = ''
  let roundTrips = 0
  const failPending = error => {
    for (const waiter of pending.values()) { clearTimeout(waiter.timer); waiter.reject(error) }
    pending.clear()
  }
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-4000) })
  child.on('error', failPending)
  child.on('exit', code => failPending(new Error(`MCP exited ${code}: ${stderr}`)))
  createInterface({ input: child.stdout }).on('line', line => {
    let message
    try { message = JSON.parse(line) } catch { failPending(new Error('Invalid MCP JSON output')); return }
    const waiter = pending.get(message.id)
    if (!waiter) return
    pending.delete(message.id)
    clearTimeout(waiter.timer)
    roundTrips++
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)))
    else waiter.resolve(message)
  })
  const rpc = (id, method, params) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error(`${method} timeout: ${stderr}`))
    }, 10_000)
    pending.set(id, { resolve, reject, timer })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
  try {
    const initialize = await rpc(1, 'initialize', {
      protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'tabz-isolated-measurement', version: '1.0.0' }
    })
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n')
    const listed = await rpc(2, 'tools/list', {})
    if (listed.result.nextCursor) throw new Error('Unexpected pagination; measurement would be incomplete')
    const tools = listed.result.tools
    const expected = preset ? presets[preset].tools : ids
    if (JSON.stringify(tools.map(tool => tool.name).sort()) !== JSON.stringify([...expected].sort())) {
      throw new Error('Actual published tools differ from requested catalog/preset')
    }
    if (requests.unexpected) throw new Error('Unexpected backend request during measurement')
    const instructions = initialize.result.instructions ?? ''
    const catalogSize = jsonSizes(tools)
    return {
      preset: preset ?? 'full-compatibility', toolCount: tools.length,
      publishedToolNames: tools.map(tool => tool.name).sort(),
      catalog: catalogSize,
      payloadHashes: { toolsSha256: hashText(JSON.stringify(tools)), instructionsSha256: hashText(instructions) },
      descriptionOverhead: {
        topLevelChars: tools.reduce((sum, tool) => sum + (tool.description ?? '').length, 0),
        recursiveInputSchemaChars: tools.reduce((sum, tool) => sum + descriptionChars(tool.inputSchema), 0),
        structureWithoutDescriptions: jsonSizes(withoutDescriptions(tools))
      },
      initializeInstructions: { text: instructions, ...sizes(instructions) },
      combinedPublishedContent: sizes(JSON.stringify(tools) + instructions),
      protocolResponseSizes: { initialize: jsonSizes(initialize), toolsList: jsonSizes(listed) },
      perTool: tools.map(tool => ({ name: tool.name, fullPublishedEntry: jsonSizes(tool),
        inputSchema: jsonSizes(tool.inputSchema), description: sizes(tool.description ?? '') })),
      stdioRoundTrips: roundTrips, backendRequests: requests,
      protocolEvidence: { initializeResponse: initialize, toolsListResponse: listed }
    }
  } finally {
    failPending(new Error('Measurement complete'))
    if (child.exitCode === null && child.signalCode === null) {
      await new Promise(resolve => {
        const timeout = setTimeout(() => { child.kill('SIGKILL'); resolve() }, 1000)
        child.once('exit', () => { clearTimeout(timeout); resolve() })
        child.kill()
      })
    }
    fixture.closeAllConnections()
    await new Promise(resolve => fixture.close(resolve))
  }
}

try {
  const result = {
    revision: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim(),
    worktreeMeasurement: true,
    method: 'Built stdio server against an ephemeral synthetic loopback backend. Complete tools/list entries plus initialize instructions. No live endpoint, browser, user configuration or credential store.',
    tokenEstimateMethod: 'ceil(UTF-16 JavaScript string length / 4); heuristic, not a tokenizer or billed-token measurement. Byte counts use UTF-8.',
    buildHashes: Object.fromEntries(['dist/server.js', 'dist/register.js'].map(file => [file, sha256(resolve(packageRoot, file))])),
    measurements: [await measure(null), await measure('page-agent')]
  }
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')
} catch (error) {
  process.stderr.write(`measure-tools: ${error.message}\n`)
  process.exitCode = 1
}
