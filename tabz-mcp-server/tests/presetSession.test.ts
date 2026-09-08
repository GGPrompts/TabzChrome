import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import http, { type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

let backend: Server
let backendUrl: string
let serverModule: typeof import('../src/server.js')
let httpModule: typeof import('../src/http.js')

function listen(server: Server): Promise<number> {
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)))
}

async function listToolNames(preset?: string | null): Promise<string[]> {
  const { server } = await serverModule.createTabzServer({ preset, backendUrl })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'presetSession.test', version: '0.0.0' })
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
  try {
    return (await client.listTools()).tools.map(tool => tool.name).sort()
  } finally {
    await client.close()
    await server.close()
  }
}

beforeAll(async () => {
  backend = http.createServer((req, res) => {
    const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname
    res.setHeader('Content-Type', 'application/json')
    if (path === '/api/mcp-presets') {
      res.end(JSON.stringify({ presets: {
        narrow: { name: 'Narrow', tools: ['tabz_list_tabs', 'tabz_docs'] },
        capture: { name: 'Capture', tools: ['tabz_enable_deep_capture', 'tabz_disable_deep_capture', 'tabz_get_response_body', 'tabz_docs'] },
        audio: { name: 'Audio', tools: ['tabz_speak', 'tabz_list_voices', 'tabz_play_audio', 'tabz_docs'] },
        mixed: { name: 'Mixed', tools: ['tabz_list_tabs', 'tabz_future_tool', 'tabz_docs'] }
      } }))
      return
    }
    if (path === '/api/mcp-config') {
      res.end(JSON.stringify({ enabledTools: ['tabz_list_tabs', 'tabz_get_dom_tree', 'tabz_docs'] }))
      return
    }
    res.statusCode = 404
    res.end('{}')
  })
  backendUrl = `http://127.0.0.1:${await listen(backend)}`
  serverModule = await import('../src/server.js')
  httpModule = await import('../src/http.js')
})

afterAll(async () => {
  await new Promise<void>(resolve => backend.close(() => resolve()))
})

describe('createTabzServer preset isolation', () => {
  it('retains the complete current 97-tool catalog including compact, capture, login, audio, and legacy tools', () => {
    expect(serverModule.ALL_TOOL_IDS).toHaveLength(97)
    expect(serverModule.ALL_TOOL_IDS).toEqual(expect.arrayContaining([
      'tabz_act', 'tabz_read_page', 'tabz_batch',
      'tabz_enable_deep_capture', 'tabz_disable_deep_capture', 'tabz_get_response_body',
      'tabz_request_login', 'tabz_secret_request', 'tabz_secret_status', 'tabz_fill_secret',
      'tabz_speak', 'tabz_play_audio', 'tabz_screenshot', 'tabz_open_url', 'tabz_capture_terminal'
    ]))
  })

  it('publishes exactly a resolved preset tool set', async () => {
    expect(await listToolNames('audio')).toEqual([
      'tabz_docs', 'tabz_list_voices', 'tabz_play_audio', 'tabz_speak'
    ])
  })

  it('publishes deep capture tools through the actual filtered server', async () => {
    expect(await listToolNames('capture')).toEqual([
      'tabz_disable_deep_capture', 'tabz_docs', 'tabz_enable_deep_capture', 'tabz_get_response_body'
    ])
  })

  it('fails an unknown named preset closed to Core', async () => {
    const names = await listToolNames('missing')
    expect(names).toEqual([...serverModule.CORE_TOOL_IDS].sort())
    expect(names).not.toContain('tabz_get_dom_tree')
    expect(names).not.toContain('tabz_speak')
  })

  it('omits unavailable IDs from custom presets instead of advertising them', async () => {
    expect(await listToolNames('mixed')).toEqual(['tabz_docs', 'tabz_list_tabs'])
    const built = await serverModule.createTabzServer({ preset: 'mixed', backendUrl })
    expect([...built.enabledTools].sort()).toEqual(['tabz_docs', 'tabz_list_tabs'])
    await built.server.close()
  })

  it('uses mcp-config for an explicit null preset independent of MCP_PRESET', async () => {
    process.env.MCP_PRESET = 'audio'
    try {
      expect(await listToolNames(null)).toEqual(['tabz_docs', 'tabz_get_dom_tree', 'tabz_list_tabs'])
      expect(await listToolNames(undefined)).toEqual([
        'tabz_docs', 'tabz_list_voices', 'tabz_play_audio', 'tabz_speak'
      ])
    } finally {
      delete process.env.MCP_PRESET
    }
  })

  it('reports applied, unknown, and no-preset decisions', async () => {
    const applied = await serverModule.createTabzServer({ preset: 'narrow', backendUrl })
    expect(applied.presetStatus).toBe('applied')
    expect(applied.preset).toBe('narrow')
    await applied.server.close()

    const unknown = await serverModule.createTabzServer({ preset: 'missing', backendUrl })
    expect(unknown.presetStatus).toBe('unknown')
    expect(unknown.enabledTools).toEqual(new Set(serverModule.CORE_TOOL_IDS))
    await unknown.server.close()

    const none = await serverModule.createTabzServer({ preset: null, backendUrl })
    expect(none.presetStatus).toBe('none')
    expect(none.preset).toBeUndefined()
    await none.server.close()
  })
})

describe('HTTP preset resolution', () => {
  it('reads one decoded segment after the mount path', () => {
    expect(httpModule.resolvePresetFromPath('/mcp/narrow')).toBe('narrow')
    expect(httpModule.resolvePresetFromPath('/mcp/nar%72ow')).toBe('narrow')
    expect(httpModule.resolvePresetFromPath('/mcp')).toBeUndefined()
    expect(httpModule.resolvePresetFromPath('/mcp-test/narrow')).toBeUndefined()
  })

  it('uses route, path, header, then mount default precedence', () => {
    expect(httpModule.resolveSessionPreset({ routePreset: 'route', pathPreset: 'path', headerPreset: 'header', defaultPreset: 'default' })).toBe('route')
    expect(httpModule.resolveSessionPreset({ pathPreset: 'path', headerPreset: 'header', defaultPreset: 'default' })).toBe('path')
    expect(httpModule.resolveSessionPreset({ headerPreset: 'header', defaultPreset: 'default' })).toBe('header')
    expect(httpModule.resolveSessionPreset({ defaultPreset: 'default' })).toBe('default')
    expect(httpModule.resolveSessionPreset({ headerPreset: '  ' })).toBeUndefined()
  })
})
