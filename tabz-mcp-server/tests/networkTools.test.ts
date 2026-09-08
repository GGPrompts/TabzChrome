import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

vi.mock('axios', () => ({
  default: {
    post: vi.fn(),
    interceptors: { request: { use: vi.fn() } }
  },
  AxiosError: class MockAxiosError extends Error {}
}))

import axios from 'axios'
import { registerNetworkTools } from '../src/tools/network.js'

describe('network tool registration', () => {
  let registeredTools: Map<string, { handler: Function; schema: unknown }>

  beforeEach(() => {
    vi.clearAllMocks()
    registeredTools = new Map()
    const server = {
      registerTool: vi.fn((name: string, config: { inputSchema: { shape: unknown } }, handler: Function) => {
        registeredTools.set(name, { handler, schema: config.inputSchema.shape })
      })
    } as unknown as McpServer
    registerNetworkTools(server)
  })

  it('registers all six network tools', () => {
    expect([...registeredTools.keys()]).toEqual([
      'tabz_enable_network_capture',
      'tabz_enable_deep_capture',
      'tabz_disable_deep_capture',
      'tabz_get_network_requests',
      'tabz_get_response_body',
      'tabz_clear_network_requests'
    ])
  })

  it('formats a paginated WebSocket body returned by the backend', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        success: true,
        requestId: 'ws-1',
        kind: 'websocket',
        text: '{"direction":"received","opcode":1,"payload":"hello","timestamp":2}',
        offset: 0,
        length: 66,
        totalLength: 80,
        hasMore: true,
        nextOffset: 66
      }
    })
    const result = await registeredTools.get('tabz_get_response_body')!.handler({
      requestId: 'ws-1',
      offset: 0,
      length: 66,
      response_format: 'markdown'
    })
    expect(result.content[0].text).toContain('# WebSocket Frames')
    expect(result.content[0].text).toContain('offset: 66')
  })
  it('awaits clear confirmation and reports backend failures', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { success: false, error: 'Refused: outside your group' } })
    const result = await registeredTools.get('tabz_clear_network_requests')!.handler({})
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Refused')
  })

  it('consults current extension capture state after reconnect and preserves read errors', async () => {
    vi.mocked(axios.post).mockRejectedValue(new Error('synthetic transport lost'))
    const result = await registeredTools.get('tabz_get_network_requests')!.handler({ method: 'all', resourceType: 'all', source: 'both', limit: 50, offset: 0, response_format: 'markdown' })
    expect(axios.post).toHaveBeenCalled()
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('transport lost')
  })

})
