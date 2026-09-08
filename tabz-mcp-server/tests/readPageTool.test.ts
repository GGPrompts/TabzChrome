import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import http, { type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

let backend: Server
let client: Client
const posts: Record<string, unknown>[] = []
let nextRead: Record<string, unknown> | null = null

function listen(server: Server): Promise<number> {
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve((server.address() as AddressInfo).port)))
}

beforeAll(async () => {
  backend = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    res.setHeader('Content-Type', 'application/json')
    if (url.pathname === '/api/mcp-config') {
      res.end('{}')
      return
    }
    let body = ''
    req.on('data', chunk => { body += chunk })
    req.on('end', () => {
      posts.push(body ? JSON.parse(body) : {})
      if (nextRead) {
        const response = nextRead
        nextRead = null
        res.end(JSON.stringify(response))
        return
      }
      res.end(JSON.stringify({
        success: true,
        tabId: 42,
        text: '## Page: Fixture\nURL: https://example.test\n\nInteractive elements:\n- button "Save" [ref=ref_fixture_1_1]',
        nodeCount: 1,
        refCount: 1,
        truncated: false
      }))
    })
  })
  const port = await listen(backend)
  process.env.BACKEND_URL = `http://127.0.0.1:${port}`
  const serverModule = await import('../src/server.js')
  const instance = await serverModule.createTabzServer({ backendUrl: process.env.BACKEND_URL })
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  client = new Client({ name: 'readPageTool.test', version: '0.0.0' })
  await Promise.all([client.connect(clientTransport), instance.server.connect(serverTransport)])
})

afterAll(async () => {
  await client.close()
  await new Promise<void>(resolve => backend.close(() => resolve()))
})

describe('tabz_read_page', () => {
  it('returns the bounded outline and forwards the session agent', async () => {
    posts.length = 0
    const result = await client.callTool({
      name: 'tabz_read_page',
      arguments: { tabId: 42, maxChars: 1200 }
    })
    const text = (result.content as Array<{ type: string; text?: string }>)[0].text ?? ''

    expect(result.isError).toBe(false)
    expect(text).toContain('button "Save" [ref=ref_fixture_1_1]')
    // One tab line replaces the outline's own two-line page header (ogl-cha).
    expect(text.split('\n')[0]).toBe('Tab 42 "Fixture" https://example.test')
    expect(text).not.toContain('## Page:')
    expect(result.structuredContent).toEqual({
      status: 'completed',
      success: true,
      outline: text,
      tabId: 42,
      title: 'Fixture',
      url: 'https://example.test',
      nodeCount: 1,
      refCount: 1,
      truncated: false,
      text
    })
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({ tabId: 42, maxChars: 1200, agent: expect.any(String) })
  })

  it('keeps the schema strict and maxChars bounded', async () => {
    for (const arguments_ of [
      { maxChars: 499 },
      { maxChars: 20_001 },
      { maxChars: 1000, depth: 4 }
    ]) {
      posts.length = 0
      const result = await client.callTool({ name: 'tabz_read_page', arguments: arguments_ })
      expect(result.isError).toBe(true)
      expect(posts).toHaveLength(0)
    }
  })

  it('can be dispatched through tabz_batch in the same preset', async () => {
    posts.length = 0
    const result = await client.callTool({
      name: 'tabz_batch',
      arguments: { items: [{ name: 'tabz_read_page', input: { maxChars: 900 } }] }
    })
    const content = result.content as Array<{ type: string; text?: string }>

    expect(result.isError).not.toBe(true)
    expect(content.map(block => block.text ?? '').join('\n')).toContain('[ref=ref_fixture_1_1]')
    expect(posts).toHaveLength(1)
    expect(posts[0]).toMatchObject({ maxChars: 900, agent: expect.any(String) })
  })

  it('does not invent a successful empty outline from malformed producer data', async () => {
    posts.length = 0
    nextRead = { success: true }

    const result = await client.callTool({ name: 'tabz_read_page', arguments: {} })
    expect(result.isError).toBe(true)
    expect(result.structuredContent).toMatchObject({ status: 'failed', success: false })
    expect(JSON.stringify(result.content)).toContain('incomplete page outline')
  })
})
