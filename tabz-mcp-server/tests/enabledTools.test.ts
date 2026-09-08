import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { ALL_TOOL_IDS, createTabzServer, getEnabledTools } from '../src/server.js'

const NEW_TOOL = ALL_TOOL_IDS[ALL_TOOL_IDS.length - 1]
const DISABLED_TOOL = 'tabz_fill'

function mockConfig(config: Record<string, unknown>): void {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => config })) as unknown as typeof fetch)
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('getEnabledTools knownTools upgrades', () => {
  it('enables a current tool absent from both enabledTools and knownTools', async () => {
    mockConfig({
      enabledTools: ['tabz_list_tabs'],
      knownTools: ALL_TOOL_IDS.filter(id => id !== NEW_TOOL)
    })
    const tools = await getEnabledTools(undefined, 'http://backend.test')
    expect(tools.has(NEW_TOOL)).toBe(true)
    expect(tools.has('tabz_list_tabs')).toBe(true)
    expect(tools.has(DISABLED_TOOL)).toBe(false)
  })

  it('keeps explicit disables when knownTools covers the catalog', async () => {
    mockConfig({ enabledTools: ['tabz_list_tabs'], knownTools: ALL_TOOL_IDS })
    expect([...await getEnabledTools(undefined, 'http://backend.test')]).toEqual(['tabz_list_tabs'])
  })

  it('takes a legacy allowlist as-is when no knownTools snapshot is returned', async () => {
    mockConfig({ enabledTools: ['tabz_list_tabs'] })
    expect([...await getEnabledTools(undefined, 'http://backend.test')]).toEqual(['tabz_list_tabs'])
  })

  it('never advertises tool IDs this build does not register', async () => {
    mockConfig({ enabledTools: ['tabz_list_tabs', 'tabz_future_tool'], knownTools: ALL_TOOL_IDS })
    const tools = await getEnabledTools(undefined, 'http://backend.test')
    expect([...tools]).toEqual(['tabz_list_tabs'])
  })
})

describe('strict MCP registration', () => {
  async function withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
    mockConfig({ enabledTools: ['tabz_docs', 'tabz_list_voices'], knownTools: ALL_TOOL_IDS })
    const { server } = await createTabzServer({ preset: null, backendUrl: 'http://backend.test' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'enabledTools.test', version: '0.0.0' })
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
    try {
      return await run(client)
    } finally {
      await client.close()
      await server.close()
    }
  }

  it('publishes additionalProperties:false for authored strict schemas', async () => {
    await withClient(async client => {
      const tools = await client.listTools()
      const docs = tools.tools.find(tool => tool.name === 'tabz_docs')
      const voices = tools.tools.find(tool => tool.name === 'tabz_list_voices')
      expect(docs?.inputSchema.additionalProperties).toBe(false)
      expect(voices?.inputSchema.additionalProperties).toBe(false)
    })
  })

  it('publishes all current tools through the strict registration seam', async () => {
    mockConfig({ enabledTools: ALL_TOOL_IDS, knownTools: ALL_TOOL_IDS })
    const { server } = await createTabzServer({ preset: null, backendUrl: 'http://backend.test' })
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const client = new Client({ name: 'all-tools-strict.test', version: '0.0.0' })
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)])
    try {
      const listed = (await client.listTools()).tools
      expect(listed).toHaveLength(ALL_TOOL_IDS.length)
      expect(new Set(listed.map(tool => tool.name))).toEqual(new Set(ALL_TOOL_IDS))
      expect(listed.every(tool => tool.inputSchema.additionalProperties === false)).toBe(true)
    } finally {
      await client.close()
      await server.close()
    }
  })

  it('rejects unknown argument names and identifies valid arguments', async () => {
    await withClient(async client => {
      const result = await client.callTool({
        name: 'tabz_docs',
        arguments: { tool_name: 'tabz_list_tabs', tool_nam: 'typo' }
      })
      expect(result.isError).toBe(true)
      const text = JSON.stringify(result.content)
      expect(text).toContain("Unknown argument 'tool_nam'")
      expect(text).toContain('Valid arguments: tool_name')
    })
  })

  it('preserves valid legacy empty and optional input shapes', async () => {
    await withClient(async client => {
      const voices = await client.callTool({ name: 'tabz_list_voices', arguments: {} })
      expect(voices.isError).not.toBe(true)
      const docs = await client.callTool({ name: 'tabz_docs', arguments: { tool_name: 'tabz_list_tabs' } })
      expect(docs.isError).not.toBe(true)
    })
  })
})
