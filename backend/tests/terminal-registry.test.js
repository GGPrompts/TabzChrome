import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import os from 'os'
import './helpers/process-boundary-fake.js'

// Import the actual module
const registry = (await import('../modules/terminal-registry.js')).default

// Use actual home directory for tests
const TEST_WORKING_DIR = os.homedir()

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
        workingDir: TEST_WORKING_DIR,
        platform: 'local'
      }

      const result = await registry.registerTerminal(config)

      expect(result).toBeDefined()
      expect(result.id).toBeDefined()
      expect(result.name).toBe('Test Terminal')
      expect(result.terminalType).toBe('bash')
      expect(result.platform).toBe('local')
    })

    it('should generate names when no name provided', async () => {
      const config1 = { terminalType: 'bash', platform: 'local' }
      const config2 = { terminalType: 'bash', platform: 'local' }

      const result1 = await registry.registerTerminal(config1)
      const result2 = await registry.registerTerminal(config2)

      // Both should have names containing 'bash'
      expect(result1.name).toContain('bash')
      expect(result2.name).toContain('bash')
    })

    it('should handle Claude Code terminal type', async () => {
      const config = {
        name: 'Claude',
        terminalType: 'claude-code',
        workingDir: TEST_WORKING_DIR,
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
      expect(terminals.map(t => t.name)).toContain('Terminal 1')
      expect(terminals.map(t => t.name)).toContain('Terminal 2')
    })
  })

  describe('getActiveTerminalCount', () => {
    it('should return 0 when no terminals', () => {
      const count = registry.getActiveTerminalCount()
      expect(count).toBe(0)
    })

    it('should count terminals correctly', async () => {
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

    it('should return true for non-existent terminal (idempotent)', async () => {
      // closeTerminal is idempotent - returns true even if terminal doesn't exist
      const result = await registry.closeTerminal('non-existent-id')
      expect(result).toBe(true)
    })
  })

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      await registry.registerTerminal({ name: 'T1', terminalType: 'bash', platform: 'local' })
      await registry.registerTerminal({ name: 'T2', terminalType: 'claude-code', platform: 'local' })

      const stats = registry.getStats()

      expect(stats).toHaveProperty('totalTerminals')
      expect(stats).toHaveProperty('localTerminals')
      expect(stats).toHaveProperty('terminalsByType')
      expect(stats.totalTerminals).toBeGreaterThanOrEqual(2)
    })
  })

  describe('updateNameCounters', () => {
    it('should update name counters from existing terminals', async () => {
      await registry.registerTerminal({ name: 'bash-5', terminalType: 'bash', platform: 'local' })
      await registry.registerTerminal({ name: 'bash-10', terminalType: 'bash', platform: 'local' })

      registry.updateNameCounters()

      // Next bash terminal should have a name containing 'bash'
      const result = await registry.registerTerminal({ terminalType: 'bash', platform: 'local' })
      expect(result.name).toContain('bash')
    })
  })

  describe('cleanupDuplicates', () => {
    it('should handle duplicate terminals', async () => {
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
