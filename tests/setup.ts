import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Cleanup after each test
afterEach(() => {
  cleanup()
})

// Mock WebSocket globally
class MockWebSocket {
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  static CLOSED = 3

  readyState = MockWebSocket.CONNECTING
  url: string
  onopen: ((event: Event) => void) | null = null
  onclose: ((event: CloseEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onmessage: ((event: MessageEvent) => void) | null = null

  constructor(url: string) {
    this.url = url
    // Simulate async connection
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN
      if (this.onopen) {
        this.onopen(new Event('open'))
      }
    }, 0)
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    // Mock implementation
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED
    if (this.onclose) {
      this.onclose(new CloseEvent('close'))
    }
  }
}

global.WebSocket = MockWebSocket as any

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString()
    },
    removeItem: (key: string) => {
      delete store[key]
    },
    clear: () => {
      store = {}
    },
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

// Mock window.matchMedia
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(), // deprecated
    removeListener: vi.fn(), // deprecated
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})

// Mock ResizeObserver (used by xterm.js and layout components)
global.ResizeObserver = class ResizeObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

// Mock IntersectionObserver (may be needed for some components)
global.IntersectionObserver = class IntersectionObserver {
  observe = vi.fn()
  unobserve = vi.fn()
  disconnect = vi.fn()
}

// Mock fetch for API calls - returns Promise with proper .catch() support
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({ success: true, data: {} }),
    text: () => Promise.resolve(''),
  } as Response)
)

// Mock Chrome APIs
const chromeStorageData: Record<string, any> = {}
const storageChangeListeners: ((changes: { [key: string]: chrome.storage.StorageChange }) => void)[] = []

const mockChromeStorage = {
  local: {
    get: vi.fn((keys: string | string[] | null, callback?: (result: Record<string, any>) => void) => {
      const result: Record<string, any> = {}
      if (keys === null) {
        Object.assign(result, chromeStorageData)
      } else {
        const keyArray = Array.isArray(keys) ? keys : [keys]
        keyArray.forEach(key => {
          if (key in chromeStorageData) {
            result[key] = chromeStorageData[key]
          }
        })
      }
      if (callback) {
        callback(result)
      }
      return Promise.resolve(result)
    }),
    set: vi.fn((items: Record<string, any>, callback?: () => void) => {
      const changes: { [key: string]: chrome.storage.StorageChange } = {}
      Object.entries(items).forEach(([key, newValue]) => {
        const oldValue = chromeStorageData[key]
        chromeStorageData[key] = newValue
        changes[key] = { oldValue, newValue }
      })
      // Notify listeners
      storageChangeListeners.forEach(listener => listener(changes))
      if (callback) {
        callback()
      }
      return Promise.resolve()
    }),
    remove: vi.fn((keys: string | string[], callback?: () => void) => {
      const keyArray = Array.isArray(keys) ? keys : [keys]
      const changes: { [key: string]: chrome.storage.StorageChange } = {}
      keyArray.forEach(key => {
        if (key in chromeStorageData) {
          changes[key] = { oldValue: chromeStorageData[key], newValue: undefined }
          delete chromeStorageData[key]
        }
      })
      // Notify listeners
      if (Object.keys(changes).length > 0) {
        storageChangeListeners.forEach(listener => listener(changes))
      }
      if (callback) {
        callback()
      }
      return Promise.resolve()
    }),
    clear: vi.fn((callback?: () => void) => {
      const changes: { [key: string]: chrome.storage.StorageChange } = {}
      Object.keys(chromeStorageData).forEach(key => {
        changes[key] = { oldValue: chromeStorageData[key], newValue: undefined }
        delete chromeStorageData[key]
      })
      // Notify listeners
      if (Object.keys(changes).length > 0) {
        storageChangeListeners.forEach(listener => listener(changes))
      }
      if (callback) {
        callback()
      }
      return Promise.resolve()
    }),
    // Chrome 93+ API - onChanged at local level
    onChanged: {
      addListener: vi.fn((listener: (changes: { [key: string]: chrome.storage.StorageChange }) => void) => {
        storageChangeListeners.push(listener)
      }),
      removeListener: vi.fn((listener: (changes: { [key: string]: chrome.storage.StorageChange }) => void) => {
        const index = storageChangeListeners.indexOf(listener)
        if (index > -1) {
          storageChangeListeners.splice(index, 1)
        }
      }),
    },
  },
  onChanged: {
    addListener: vi.fn((listener: (changes: { [key: string]: chrome.storage.StorageChange }) => void) => {
      storageChangeListeners.push(listener)
    }),
    removeListener: vi.fn((listener: (changes: { [key: string]: chrome.storage.StorageChange }) => void) => {
      const index = storageChangeListeners.indexOf(listener)
      if (index > -1) {
        storageChangeListeners.splice(index, 1)
      }
    }),
  },
}

const mockChromeRuntime = {
  getURL: vi.fn((path: string) => `chrome-extension://mock-id/${path}`),
  sendMessage: vi.fn(() => {
    // Return a proper Promise that has .catch() method
    return Promise.resolve(undefined)
  }),
  onMessage: {
    addListener: vi.fn(),
    removeListener: vi.fn(),
  },
  connect: vi.fn(() => ({
    onMessage: { addListener: vi.fn() },
    onDisconnect: { addListener: vi.fn() },
    postMessage: vi.fn(),
    disconnect: vi.fn(),
  })),
}

// Create global chrome object
;(global as any).chrome = {
  storage: mockChromeStorage,
  runtime: mockChromeRuntime,
}

// Helper to reset chrome storage between tests
export function resetChromeStorage() {
  Object.keys(chromeStorageData).forEach(key => delete chromeStorageData[key])
  storageChangeListeners.length = 0
}

// Helper to set initial storage data for tests
export function setChromeStorageData(data: Record<string, any>) {
  Object.assign(chromeStorageData, data)
}

// Helper to get current storage data
export function getChromeStorageData() {
  return { ...chromeStorageData }
}

// Clear chrome storage after each test
afterEach(() => {
  resetChromeStorage()
})
