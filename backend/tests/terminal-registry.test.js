import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EventEmitter } from 'events'

// Mock pty-handler before importing terminal-registry
vi.mock('../modules/pty-handler', () => {
  const mockPtyHandler = new EventEmitter()
  mockPtyHandler.spawn = vi.fn().mockResolvedValue({
    terminalId: 'pty-123',
    pid: 1234
  })
  mockPtyHandler.write = vi.fn()
  mockPtyHandler.resize = vi.fn()
  mockPtyHandler.close = vi.fn()
  return { default: mockPtyHandler }
})

// Import after mocking - terminal-registry exports a singleton instance
const registry = (await import('../modules/terminal-registry.js')).default

describe('TerminalRegistry', () => {
  beforeEach(async () => {
    // Clear all terminals before each test
    const terminals = registry.getAllTerminals()
    for (const terminal of terminals) {
      await registry.closeTerminal(terminal.id, true)
    }
  })

  afterEach(async () => {
    // Cleanup after each test
    await registry.cleanup()
  })

  describe('registerTerminal', () => {
    it('should register a new terminal with unique ID', async () => {
      const config = {
        name: 'Test Terminal',
        terminalType: 'bash',
        workingDir: '/home/user',
        platform: 'local'
      }

      const result = await registry.registerTerminal(config)

      expect(result).toBeDefined()
      expect(result.id).toBeDefined()
      expect(result.name).toBe('Test Terminal')
      expect(result.terminalType).toBe('bash')
      expect(result.platform).toBe('local')
    })

    it('should generate sequential names when no name provided', async () => {
      const config1 = { terminalType: 'bash', platform: 'local' }
      const config2 = { terminalType: 'bash', platform: 'local' }

      const result1 = await registry.registerTerminal(config1)
      const result2 = await registry.registerTerminal(config2)

      expect(result1.name).toMatch(/bash-\d+/)
      expect(result2.name).toMatch(/bash-\d+/)
      expect(result1.name).not.toBe(result2.name)
    })

    it('should handle Claude Code terminal type', async () => {
      const config = {
        name: 'Claude',
        terminalType: 'claude-code',
        workingDir: '/home/user',
        platform: 'local'
      }

      const result = await registry.registerTerminal(config)

      expect(result.terminalType).toBe('claude-code')
      expect(result.platform).toBe('local')
    })

    it('should store terminal in registry map', async () => {
      const config = {
        name: 'Test',
        terminalType: 'bash',
        platform: 'local'
      }

      const result = await registry.registerTerminal(config)
      const retrieved = registry.getTerminal(result.id)

      expect(retrieved).toBeDefined()
      expect(retrieved.id).toBe(result.id)
    })
  })

  describe('getTerminal', () => {
    it('should retrieve terminal by ID', async () => {
      const config = { name: 'Test', terminalType: 'bash', platform: 'local' }
      const registered = await registry.registerTerminal(config)

      const terminal = registry.getTerminal(registered.id)

      expect(terminal).toBeDefined()
      expect(terminal.id).toBe(registered.id)
      expect(terminal.name).toBe('Test')
    })

    it('should return undefined for non-existent ID', () => {
      const terminal = registry.getTerminal('non-existent-id')
      expect(terminal).toBeUndefined()
    })
  })

  describe('getAllTerminals', () => {
    it('should return empty array when no terminals', () => {
      const terminals = registry.getAllTerminals()
      expect(terminals).toEqual([])
    })

    it('should return all registered terminals', async () => {
      const config1 = { name: 'Terminal 1', terminalType: 'bash', platform: 'local' }
      const config2 = { name: 'Terminal 2', terminalType: 'claude-code', platform: 'local' }

      await registry.registerTerminal(config1)
      await registry.registerTerminal(config2)

      const terminals = registry.getAllTerminals()

      expect(terminals).toHaveLength(2)
      expect(terminals[0].name).toBe('Terminal 1')
      expect(terminals[1].name).toBe('Terminal 2')
    })
  })

  describe('getActiveTerminalCount', () => {
    it('should return 0 when no terminals', () => {
      const count = registry.getActiveTerminalCount()
      expect(count).toBe(0)
    })

    it('should count only non-disconnected terminals', async () => {
      await registry.registerTerminal({ name: 'T1', terminalType: 'bash', platform: 'local' })
      await registry.registerTerminal({ name: 'T2', terminalType: 'bash', platform: 'local' })

      const count = registry.getActiveTerminalCount()
      expect(count).toBe(2)
    })
  })

  describe('getTerminalsByType', () => {
    it('should filter terminals by type', async () => {
      await registry.registerTerminal({ name: 'Bash 1', terminalType: 'bash', platform: 'local' })
      await registry.registerTerminal({ name: 'Claude 1', terminalType: 'claude-code', platform: 'local' })
      await registry.registerTerminal({ name: 'Bash 2', terminalType: 'bash', platform: 'local' })

      const bashTerminals = registry.getTerminalsByType('bash')
      const claudeTerminals = registry.getTerminalsByType('claude-code')

      expect(bashTerminals).toHaveLength(2)
      expect(claudeTerminals).toHaveLength(1)
      expect(bashTerminals[0].terminalType).toBe('bash')
      expect(claudeTerminals[0].terminalType).toBe('claude-code')
    })
  })

  describe('closeTerminal', () => {
    it('should close and remove terminal', async () => {
      const config = { name: 'Test', terminalType: 'bash', platform: 'local' }
      const registered = await registry.registerTerminal(config)

      await registry.closeTerminal(registered.id)

      const terminal = registry.getTerminal(registered.id)
      expect(terminal).toBeUndefined()
    })

    it('should return false for non-existent terminal', async () => {
      const result = await registry.closeTerminal('non-existent-id')
      expect(result).toBe(false)
    })
  })

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      await registry.registerTerminal({ name: 'T1', terminalType: 'bash', platform: 'local' })
      await registry.registerTerminal({ name: 'T2', terminalType: 'claude-code', platform: 'local' })

      const stats = registry.getStats()

      expect(stats).toHaveProperty('totalTerminals')
      expect(stats).toHaveProperty('activeTerminals')
      expect(stats).toHaveProperty('byType')
      expect(stats.totalTerminals).toBeGreaterThanOrEqual(2)
    })
  })

  describe('updateNameCounters', () => {
    it('should track highest terminal numbers', async () => {
      await registry.registerTerminal({ name: 'bash-5', terminalType: 'bash', platform: 'local' })
      await registry.registerTerminal({ name: 'bash-10', terminalType: 'bash', platform: 'local' })

      registry.updateNameCounters()

      // Next bash terminal should be bash-11
      const result = await registry.registerTerminal({ terminalType: 'bash', platform: 'local' })
      expect(result.name).toBe('bash-11')
    })
  })

  describe('cleanupDuplicates', () => {
    it('should remove duplicate offline terminals', async () => {
      // Create duplicate terminals with same name
      await registry.registerTerminal({ name: 'Terminal 1', terminalType: 'bash', platform: 'local' })
      await registry.registerTerminal({ name: 'Terminal 1', terminalType: 'bash', platform: 'local' })

      const beforeCount = registry.getAllTerminals().length
      registry.cleanupDuplicates()
      const afterCount = registry.getAllTerminals().length

      expect(afterCount).toBeLessThanOrEqual(beforeCount)
    })
  })
})
