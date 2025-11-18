# Quick Start - Writing Your First Test

This guide will help you write your first test for the Tabz project.

## Step 1: Choose What to Test

Start with the simplest, most isolated code:

1. **Utility functions** (easiest) - Pure functions with no dependencies
2. **Zustand stores** (medium) - State management logic
3. **React hooks** (harder) - Require React Testing Library
4. **Components** (hardest) - Full integration tests

## Step 2: Create a Test File

Example: Testing the `debounce` utility function

```bash
# Create the test file
touch tests/unit/utils/debounce.test.ts
```

## Step 3: Write a Basic Test

```typescript
// tests/unit/utils/debounce.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { debounce } from '@/utils/debounce'

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should debounce function calls', () => {
    const mockFn = vi.fn()
    const debouncedFn = debounce(mockFn, 100)

    // Call multiple times
    debouncedFn()
    debouncedFn()
    debouncedFn()

    // Should not have called yet
    expect(mockFn).not.toHaveBeenCalled()

    // Fast-forward time
    vi.advanceTimersByTime(100)

    // Should have called once
    expect(mockFn).toHaveBeenCalledTimes(1)
  })

  it('should pass arguments to debounced function', () => {
    const mockFn = vi.fn()
    const debouncedFn = debounce(mockFn, 100)

    debouncedFn('arg1', 'arg2')
    vi.advanceTimersByTime(100)

    expect(mockFn).toHaveBeenCalledWith('arg1', 'arg2')
  })
})
```

## Step 4: Run Your Test

```bash
# Run in watch mode (recommended for development)
npm run test:watch

# Or run once
npm test

# Or run with UI
npm run test:ui
```

## Step 5: Check Coverage

```bash
npm run test:coverage
```

This will show:
- Which lines are covered by tests
- Which branches are covered
- Overall coverage percentage
- HTML report in `coverage/index.html`

## Example: Testing a Zustand Store

```typescript
// tests/unit/stores/simpleTerminalStore.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { useSimpleTerminalStore } from '@/stores/simpleTerminalStore'
import type { Terminal } from '@/types'

describe('simpleTerminalStore', () => {
  beforeEach(() => {
    // Clear the store before each test
    useSimpleTerminalStore.setState({
      terminals: [],
      activeTerminalId: null,
    })
  })

  afterEach(() => {
    // Clean up localStorage
    localStorage.clear()
  })

  it('should add a terminal', () => {
    const terminal: Terminal = {
      id: 'test-1',
      name: 'Test Terminal',
      type: 'bash',
      agentId: null,
      windowId: 'main',
    }

    useSimpleTerminalStore.getState().addTerminal(terminal)

    const { terminals } = useSimpleTerminalStore.getState()
    expect(terminals).toHaveLength(1)
    expect(terminals[0]).toEqual(terminal)
  })

  it('should remove a terminal', () => {
    const terminal: Terminal = {
      id: 'test-1',
      name: 'Test Terminal',
      type: 'bash',
      agentId: null,
      windowId: 'main',
    }

    useSimpleTerminalStore.getState().addTerminal(terminal)
    expect(useSimpleTerminalStore.getState().terminals).toHaveLength(1)

    useSimpleTerminalStore.getState().removeTerminal('test-1')
    expect(useSimpleTerminalStore.getState().terminals).toHaveLength(0)
  })

  it('should set active terminal', () => {
    const terminal: Terminal = {
      id: 'test-1',
      name: 'Test Terminal',
      type: 'bash',
      agentId: null,
      windowId: 'main',
    }

    useSimpleTerminalStore.getState().addTerminal(terminal)
    useSimpleTerminalStore.getState().setActiveTerminal('test-1')

    expect(useSimpleTerminalStore.getState().activeTerminalId).toBe('test-1')
  })
})
```

## Example: Testing a React Hook

```typescript
// tests/unit/hooks/useWebSocketManager.test.ts
import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { useWebSocketManager } from '@/hooks/useWebSocketManager'
import { MockWebSocket } from '../../mocks/MockWebSocket'

describe('useWebSocketManager', () => {
  let mockWs: MockWebSocket

  beforeEach(() => {
    // Create a fresh mock WebSocket for each test
    mockWs = new MockWebSocket('ws://localhost:8127')
    global.WebSocket = MockWebSocket as any
  })

  it('should connect to WebSocket', async () => {
    const wsRef = { current: null }
    const { result } = renderHook(() =>
      useWebSocketManager(wsRef, [], () => {}, 'main')
    )

    // Simulate WebSocket opening
    mockWs.simulateOpen()

    await waitFor(() => {
      expect(wsRef.current).not.toBeNull()
    })
  })

  it('should handle terminal-spawned message', async () => {
    const wsRef = { current: null }
    const onSpawnedMock = vi.fn()

    renderHook(() =>
      useWebSocketManager(wsRef, [], onSpawnedMock, 'main')
    )

    mockWs.simulateOpen()
    mockWs.simulateMessage({
      type: 'terminal-spawned',
      agentId: 'test-agent',
      terminalId: 'test-1',
    })

    await waitFor(() => {
      expect(onSpawnedMock).toHaveBeenCalledWith({
        type: 'terminal-spawned',
        agentId: 'test-agent',
        terminalId: 'test-1',
      })
    })
  })
})
```

## Common Testing Patterns

### 1. Testing Async Behavior

```typescript
import { waitFor } from '@testing-library/react'

it('should handle async operation', async () => {
  const { result } = renderHook(() => useMyHook())

  // Trigger async operation
  result.current.doSomething()

  // Wait for state to update
  await waitFor(() => {
    expect(result.current.data).toBeDefined()
  })
})
```

### 2. Testing Timers

```typescript
import { vi } from 'vitest'

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.restoreAllMocks()
})

it('should use timer', () => {
  // Your test code
  vi.advanceTimersByTime(1000)
  // Assertions
})
```

### 3. Testing API Calls

```typescript
import { vi } from 'vitest'

beforeEach(() => {
  global.fetch = vi.fn()
})

it('should fetch data', async () => {
  vi.mocked(fetch).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ data: 'test' }),
  } as Response)

  // Your test code that calls fetch
  // Assertions
})
```

### 4. Testing WebSocket Messages

```typescript
import { MockWebSocket } from '../../mocks/MockWebSocket'

it('should handle WebSocket message', () => {
  const mockWs = new MockWebSocket('ws://localhost:8127')
  mockWs.simulateOpen()
  mockWs.simulateMessage({ type: 'test', data: 'hello' })

  // Assertions
})
```

## Tips for Success

1. **Start simple** - Test the easiest things first (utils, then stores, then hooks)
2. **One thing at a time** - Each test should verify one behavior
3. **Use descriptive names** - `it('should add terminal to store')` not `it('works')`
4. **Clean up** - Use `beforeEach`/`afterEach` to reset state
5. **Mock dependencies** - Use the mocks in `tests/mocks/`
6. **Check coverage** - Aim for 70%+ on new code
7. **Watch mode** - Use `npm run test:watch` while developing

## Next Steps

1. Delete `tests/smoke.test.ts` once you have real tests
2. Start with utility function tests (easiest)
3. Move on to store tests
4. Then hook tests
5. Finally integration tests

## Resources

- [Vitest Docs](https://vitest.dev/)
- [React Testing Library](https://testing-library.com/docs/react-testing-library/intro/)
- [Testing Library Queries](https://testing-library.com/docs/queries/about)
- [Mock Functions](https://vitest.dev/api/vi.html#vi-fn)
