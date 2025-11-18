import { vi } from 'vitest'
import type { StateCreator, StoreApi } from 'zustand'

/**
 * Utilities for mocking Zustand stores in tests
 *
 * Usage:
 * ```typescript
 * import { createMockStore } from './mocks/mockStore'
 * import { useSimpleTerminalStore } from '@/stores/simpleTerminalStore'
 *
 * // In test:
 * const mockStore = createMockStore(useSimpleTerminalStore, {
 *   terminals: [],
 *   activeTerminalId: null,
 * })
 *
 * // Use the mock
 * mockStore.setState({ activeTerminalId: 'terminal-123' })
 * ```
 */

/**
 * Create a mock Zustand store for testing
 */
export function createMockStore<T extends object>(
  useStore: (selector?: any) => any,
  initialState: Partial<T> = {}
): {
  setState: (partial: Partial<T>) => void
  getState: () => T
  subscribe: (listener: (state: T) => void) => () => void
  destroy: () => void
} {
  let state = { ...initialState } as T
  const listeners = new Set<(state: T) => void>()

  const setState = (partial: Partial<T>) => {
    state = { ...state, ...partial }
    listeners.forEach((listener) => listener(state))
  }

  const getState = () => state

  const subscribe = (listener: (state: T) => void) => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  const destroy = () => {
    listeners.clear()
  }

  // Mock the store hook
  vi.mocked(useStore).mockImplementation((selector?: any) => {
    if (typeof selector === 'function') {
      return selector(state)
    }
    return state
  })

  return { setState, getState, subscribe, destroy }
}

/**
 * Reset all Zustand stores to their initial state
 * Useful in afterEach() hooks
 */
export function resetAllStores(): void {
  // This will be implemented when we know which stores exist
  // For now, it's a placeholder
}

/**
 * Create a mock store with persistence (simulates Zustand persist middleware)
 */
export function createMockPersistedStore<T extends object>(
  useStore: (selector?: any) => any,
  initialState: Partial<T> = {},
  storageKey: string = 'test-storage'
): {
  setState: (partial: Partial<T>) => void
  getState: () => T
  subscribe: (listener: (state: T) => void) => () => void
  destroy: () => void
  clearStorage: () => void
} {
  const mockStore = createMockStore(useStore, initialState)

  // Override setState to also write to localStorage
  const originalSetState = mockStore.setState
  mockStore.setState = (partial: Partial<T>) => {
    originalSetState(partial)
    const state = mockStore.getState()
    localStorage.setItem(storageKey, JSON.stringify(state))
  }

  // Load from localStorage if available
  const stored = localStorage.getItem(storageKey)
  if (stored) {
    try {
      const parsedState = JSON.parse(stored)
      mockStore.setState(parsedState)
    } catch (error) {
      console.error('Failed to parse stored state:', error)
    }
  }

  const clearStorage = () => {
    localStorage.removeItem(storageKey)
  }

  return {
    ...mockStore,
    clearStorage,
  }
}

/**
 * Wait for store state to match a condition
 * Useful for testing async state updates
 */
export function waitForStoreState<T extends object>(
  getState: () => T,
  condition: (state: T) => boolean,
  timeout = 5000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now()

    const checkCondition = () => {
      const state = getState()

      if (condition(state)) {
        resolve(state)
        return
      }

      if (Date.now() - startTime > timeout) {
        reject(new Error('Timeout waiting for store state condition'))
        return
      }

      setTimeout(checkCondition, 50)
    }

    checkCondition()
  })
}

/**
 * Create a spy on store actions
 * Useful for testing that certain actions were called
 */
export function spyOnStoreAction<T extends object>(
  store: { setState: (partial: Partial<T>) => void },
  actionName: keyof T
): ReturnType<typeof vi.fn> {
  const spy = vi.fn()
  const originalSetState = store.setState

  store.setState = (partial: Partial<T>) => {
    if (actionName in partial) {
      spy(partial[actionName])
    }
    originalSetState(partial)
  }

  return spy
}
