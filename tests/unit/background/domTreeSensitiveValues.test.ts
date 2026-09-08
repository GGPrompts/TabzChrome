import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../../extension/background/websocket', () => ({ sendToWebSocket: vi.fn() }))

import { sendToWebSocket } from '../../../extension/background/websocket'
import { handleBrowserGetDomTree, simplifyDOMNode, type DOMNode } from '../../../extension/background/browserMcp/debugger'

const SENTINEL = 'SENTINEL-SECRET-5519'

function elementNode(overrides: Partial<DOMNode> = {}): DOMNode {
  return { nodeId: 1, nodeName: 'INPUT', nodeType: 1, localName: 'input', attributes: [], ...overrides }
}

describe('simplifyDOMNode sensitive values', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('drops credential-shaped value attributes and keeps ordinary values', () => {
    expect(simplifyDOMNode(elementNode({ attributes: ['type', 'password', 'value', SENTINEL] }), 4)).not.toHaveProperty('value')
    expect(simplifyDOMNode(elementNode({ attributes: ['name', 'api-token', 'value', SENTINEL] }), 4)).not.toHaveProperty('value')
    expect(simplifyDOMNode(elementNode({ attributes: ['name', 'email', 'value', 'a@example.test'] }), 4)?.value).toBe('a@example.test')
  })

  it('drops sensitive textarea descendant text while preserving ordinary sibling text', () => {
    const root: DOMNode = {
      nodeId: 1,
      nodeName: 'FORM',
      nodeType: 1,
      localName: 'form',
      children: [
        {
          nodeId: 2,
          nodeName: 'TEXTAREA',
          nodeType: 1,
          localName: 'textarea',
          attributes: ['name', 'secret-notes'],
          children: [{ nodeId: 3, nodeName: '#text', nodeType: 3, nodeValue: SENTINEL }]
        },
        {
          nodeId: 4,
          nodeName: 'SPAN',
          nodeType: 1,
          localName: 'span',
          children: [{ nodeId: 5, nodeName: '#text', nodeType: 3, nodeValue: 'Useful label' }]
        }
      ]
    }
    const serialized = JSON.stringify(simplifyDOMNode(root, 4))
    expect(serialized).not.toContain(SENTINEL)
    expect(serialized).toContain('Useful label')
  })

  it('refuses extension pages before attaching the debugger', async () => {
    const attach = vi.fn()
    vi.stubGlobal('chrome', {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 42 }]),
        get: vi.fn().mockResolvedValue({
          id: 42,
          url: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop/dashboard/index.html'
        })
      },
      debugger: {
        attach,
        detach: vi.fn(),
        sendCommand: vi.fn()
      }
    })

    await handleBrowserGetDomTree({ requestId: 'dom-refused', tabId: 42 })

    expect(attach).not.toHaveBeenCalled()
    expect(sendToWebSocket).toHaveBeenCalledWith(expect.objectContaining({
      type: 'browser-get-dom-tree-result',
      requestId: 'dom-refused',
      success: false,
      error: expect.stringContaining('Refused')
    }))
  })
})
