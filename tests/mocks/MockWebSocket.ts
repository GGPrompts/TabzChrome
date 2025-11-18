/**
 * Mock WebSocket for testing
 *
 * Usage:
 * ```typescript
 * import { MockWebSocket } from './mocks/MockWebSocket'
 *
 * // In test:
 * const ws = new MockWebSocket('ws://localhost:8127')
 * ws.simulateMessage({ type: 'terminal-spawned', ... })
 * ws.simulateClose()
 * ```
 */

export class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  url: string
  protocol: string = ''
  extensions: string = ''
  bufferedAmount: number = 0
  binaryType: BinaryType = 'blob'

  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null

  private sentMessages: Array<string | ArrayBufferLike | Blob | ArrayBufferView> = []

  constructor(url: string, protocols?: string | string[]) {
    this.url = url
    if (typeof protocols === 'string') {
      this.protocol = protocols
    } else if (Array.isArray(protocols) && protocols.length > 0) {
      this.protocol = protocols[0]
    }
  }

  /**
   * Simulate opening the WebSocket connection
   */
  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN
    if (this.onopen) {
      this.onopen(new Event('open'))
    }
  }

  /**
   * Simulate receiving a message
   */
  simulateMessage(data: any): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open')
    }

    const messageData = typeof data === 'string' ? data : JSON.stringify(data)
    const event = new MessageEvent('message', { data: messageData })

    if (this.onmessage) {
      this.onmessage(event)
    }
  }

  /**
   * Simulate closing the connection
   */
  simulateClose(code = 1000, reason = ''): void {
    this.readyState = MockWebSocket.CLOSING
    setTimeout(() => {
      this.readyState = MockWebSocket.CLOSED
      if (this.onclose) {
        this.onclose(new CloseEvent('close', { code, reason }))
      }
    }, 0)
  }

  /**
   * Simulate an error
   */
  simulateError(): void {
    if (this.onerror) {
      this.onerror(new Event('error'))
    }
  }

  /**
   * Send data (mock implementation)
   */
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open')
    }
    this.sentMessages.push(data)
  }

  /**
   * Close the connection
   */
  close(code?: number, reason?: string): void {
    this.simulateClose(code, reason)
  }

  /**
   * Get all sent messages
   */
  getSentMessages(): Array<string | ArrayBufferLike | Blob | ArrayBufferView> {
    return [...this.sentMessages]
  }

  /**
   * Get last sent message
   */
  getLastSentMessage(): string | ArrayBufferLike | Blob | ArrayBufferView | undefined {
    return this.sentMessages[this.sentMessages.length - 1]
  }

  /**
   * Clear sent messages
   */
  clearSentMessages(): void {
    this.sentMessages = []
  }

  /**
   * addEventListener mock
   */
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    // Simple implementation for testing
    if (type === 'open') this.onopen = listener as any
    if (type === 'close') this.onclose = listener as any
    if (type === 'error') this.onerror = listener as any
    if (type === 'message') this.onmessage = listener as any
  }

  /**
   * removeEventListener mock
   */
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
    if (type === 'open') this.onopen = null
    if (type === 'close') this.onclose = null
    if (type === 'error') this.onerror = null
    if (type === 'message') this.onmessage = null
  }

  /**
   * dispatchEvent mock
   */
  dispatchEvent(event: Event): boolean {
    return true
  }
}
