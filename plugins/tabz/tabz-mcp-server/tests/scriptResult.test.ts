import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

vi.mock('axios', () => ({
  default: { post: vi.fn() },
  AxiosError: class MockAxiosError extends Error {}
}))

import axios from 'axios'
import { registerScriptTools } from '../src/tools/script.js'

let handler: (input: unknown) => Promise<any>

beforeEach(() => {
  vi.clearAllMocks()
  const server = {
    registerTool: vi.fn((_name, _config, toolHandler) => { handler = toolHandler })
  } as unknown as McpServer
  registerScriptTools(server, 'http://localhost:8129')
})

describe('tabz_execute_script result metadata', () => {
  it('shows the execution path and truncation warning on success', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        success: true,
        result: 'bounded result',
        executionPath: 'whitelist-fallback',
        resultTruncated: true,
        warning: 'Debugger attachment was unavailable'
      }
    })

    const result = await handler({ code: 'document.title', allFrames: false })
    expect(result.isError).toBe(false)
    expect(result.content[0].text).toContain('whitelist-fallback')
    expect(result.content[0].text).toContain('result truncated')
    expect(result.content[0].text).toContain('Debugger attachment was unavailable')
  })

  it('reports timeout uncertainty and acknowledgement without claiming cancellation', async () => {
    vi.mocked(axios.post).mockResolvedValue({
      data: {
        success: false,
        executionPath: 'debugger',
        timedOut: true,
        uncertain: true,
        terminationAttempted: true,
        terminationAcknowledged: true,
        error: 'Evaluation timed out; the page may have changed'
      }
    })

    const result = await handler({ code: 'slowMutation()', allFrames: false })
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain('Outcome uncertain:** yes')
    expect(result.content[0].text).toContain('Termination acknowledged:** yes')
    expect(result.content[0].text).not.toContain('termination confirmed')
  })
})
