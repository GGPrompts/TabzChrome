# Test Infrastructure

Comprehensive testing setup for the Tabz terminal project using Vitest and React Testing Library.

## Directory Structure

```
tests/
├── setup.ts                    # Global test setup and mocks
├── smoke.test.ts              # Infrastructure smoke test (delete after adding real tests)
├── mocks/
│   ├── MockWebSocket.ts       # WebSocket mock for testing
│   └── mockStore.ts           # Zustand store testing utilities
├── unit/
│   ├── hooks/                 # Unit tests for React hooks
│   ├── stores/                # Unit tests for Zustand stores
│   └── utils/                 # Unit tests for utility functions
└── integration/               # Integration tests
    ├── split-operations.test.ts    # Split creation/close tests
    ├── terminal-spawning.test.ts   # Terminal spawning tests
    └── detach-reattach.test.ts     # Detach/reattach tests (15 tests)
```

## Running Tests

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with UI
npm run test:ui

# Run tests with coverage report
npm run test:coverage
```

## Configuration

- **Test framework**: Vitest v4.0.8
- **Environment**: jsdom (for React component testing)
- **Coverage provider**: v8
- **Coverage thresholds**: 70%+ for hooks
- **Global timeout**: 10 seconds

## Writing Tests

### Unit Test Example (Hook)

```typescript
import { renderHook, waitFor } from '@testing-library/react'
import { describe, it, expect, beforeEach } from 'vitest'
import { useWebSocketManager } from '@/hooks/useWebSocketManager'
import { MockWebSocket } from '../mocks/MockWebSocket'

describe('useWebSocketManager', () => {
  beforeEach(() => {
    // Setup before each test
  })

  it('should connect to WebSocket', async () => {
    const { result } = renderHook(() => useWebSocketManager())

    await waitFor(() => {
      expect(result.current.connected).toBe(true)
    })
  })
})
```

### Store Test Example

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { createMockStore } from '../mocks/mockStore'
import { useSimpleTerminalStore } from '@/stores/simpleTerminalStore'

describe('simpleTerminalStore', () => {
  let mockStore: ReturnType<typeof createMockStore>

  beforeEach(() => {
    mockStore = createMockStore(useSimpleTerminalStore, {
      terminals: [],
      activeTerminalId: null,
    })
  })

  it('should add terminal', () => {
    mockStore.setState({
      terminals: [{ id: 'test-1', name: 'Test' }]
    })

    expect(mockStore.getState().terminals).toHaveLength(1)
  })
})
```

### Integration Test Example

```typescript
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { SimpleTerminalApp } from '@/SimpleTerminalApp'

describe('Terminal Spawning', () => {
  it('should spawn a new terminal', async () => {
    render(<SimpleTerminalApp />)

    const spawnButton = screen.getByText('Spawn')
    fireEvent.click(spawnButton)

    expect(await screen.findByText('Bash')).toBeInTheDocument()
  })
})
```

## Available Mocks

### Global Mocks (setup.ts)

The following are mocked globally and available in all tests:

- **WebSocket**: Mock WebSocket class with send/receive simulation
- **localStorage**: In-memory localStorage implementation
- **window.matchMedia**: Mock for media query testing
- **ResizeObserver**: Mock for layout testing
- **IntersectionObserver**: Mock for visibility testing
- **fetch**: Mock for API calls (via vi.fn())

### Custom Mocks

#### MockWebSocket

Full-featured WebSocket mock for testing WebSocket-dependent code:

```typescript
import { MockWebSocket } from './mocks/MockWebSocket'

const ws = new MockWebSocket('ws://localhost:8127')
ws.simulateOpen()
ws.simulateMessage({ type: 'terminal-spawned', id: 'test-1' })
ws.simulateClose()
```

#### mockStore

Utilities for testing Zustand stores:

```typescript
import { createMockStore, waitForStoreState } from './mocks/mockStore'

// Create mock store
const mockStore = createMockStore(useMyStore, initialState)

// Wait for async state updates
await waitForStoreState(
  mockStore.getState,
  (state) => state.loading === false
)
```

## Coverage Reports

Coverage reports are generated in the `coverage/` directory:

- `coverage/index.html` - Interactive HTML report
- `coverage/lcov.info` - LCOV format for CI tools
- `coverage/coverage-final.json` - JSON format

## Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| vitest | ^4.0.8 | Test framework |
| @testing-library/react | ^16.3.0 | React testing utilities |
| @testing-library/jest-dom | ^6.9.1 | DOM matchers |
| @testing-library/user-event | ^14.6.1 | User interaction simulation |
| @vitest/ui | ^4.0.8 | Test UI dashboard |
| @vitest/coverage-v8 | ^4.0.8 | Coverage reporter |
| jsdom | ^27.2.0 | DOM environment |
| happy-dom | ^20.0.10 | Alternative DOM environment |

## Test Coverage

### Integration Tests

#### detach-reattach.test.ts (15 tests)

Tests the complete detach/reattach workflow, covering critical bugs fixed in Nov 13, 2025:

**Bug Fix #1**: Detach no longer kills tmux sessions
- Verifies no WebSocket 'close' messages sent
- Checks /api/tmux/detach endpoint called correctly
- Tests tmux session preservation

**Bug Fix #2**: processedAgentIds cleared on detach
- Verifies clearProcessedAgentId() called
- Tests reconnection with same agentId works
- Prevents "Already processed" errors

**Bug Fix #3**: Reattaching pane tab restores whole split
- Tests clicking detached pane tab finds container
- Verifies all panes reconnect
- Ensures split layout fully restored

**Test Categories**:
- Split container detach (all panes)
- Single pane detach from split
- Split container reattach
- Pane tab reattach (bug fix #3)
- processedAgentIds management
- Edge cases (missing sessions, unknown types)
- localStorage persistence

**Run specific test suite**:
```bash
npm test -- tests/integration/detach-reattach.test.ts
```

## Notes

- Delete `smoke.test.ts` once real tests are added
- Coverage thresholds are set to 70%+ for hooks (configured in vitest.config.ts)
- Tests use the same path aliases as the main app (`@/...`)
- All tests run in jsdom environment for React component testing
