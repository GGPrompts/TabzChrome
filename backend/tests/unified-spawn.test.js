import { describe, it, expect, beforeEach, vi } from 'vitest'
import { EventEmitter } from 'events'

// Mock dependencies
vi.mock('../modules/terminal-registry', () => {
  const mockRegistry = new EventEmitter()
  mockRegistry.registerTerminal = vi.fn().mockResolvedValue({
    id: 'term-123',
    name: 'Test Terminal',
    terminalType: 'bash',
    pid: 1234
  })
  mockRegistry.getTerminal = vi.fn()
  mockRegistry.getAllTerminals = vi.fn().mockReturnValue([])
  mockRegistry.getActiveTerminalCount = vi.fn().mockReturnValue(0)
  return { default: mockRegistry }
})

vi.mock('../modules/pty-handler', () => {
  const mockPtyHandler = new EventEmitter()
  mockPtyHandler.spawn = vi.fn().mockResolvedValue({
    terminalId: 'pty-123',
    pid: 1234
  })
  return { default: mockPtyHandler }
})

vi.mock('../modules/agent-config', () => ({
  default: {
    loadAgentTemplates: vi.fn().mockResolvedValue([]),
    getAgentTemplate: vi.fn()
  }
}))

// Import after mocking - unified-spawn exports a singleton instance
const spawnService = (await import('../modules/unified-spawn.js')).default

describe('UnifiedSpawn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('configuration', () => {
    it('should have terminal type configurations', () => {
      const configs = spawnService.getTerminalTypeConfigs()

      expect(configs).toBeDefined()
      expect(configs['claude-code']).toBeDefined()
      expect(configs['bash']).toBeDefined()
      expect(configs['opencode']).toBeDefined()
    })

    it('should define shell for each terminal type', () => {
      const configs = spawnService.getTerminalTypeConfigs()

      Object.values(configs).forEach(config => {
        expect(config).toHaveProperty('shell')
        expect(typeof config.shell).toBe('string')
      })
    })
  })

  describe('validateSpawnRequest', () => {
    it('should accept valid spawn request', () => {
      const request = {
        terminalType: 'bash',
        name: 'Test Terminal',
        workingDir: '/home/user'
      }

      const result = spawnService.validateSpawnRequest(request)

      expect(result.valid).toBe(true)
      expect(result.errors).toBeUndefined()
    })

    it('should require terminalType', () => {
      const request = {
        name: 'Test Terminal',
        workingDir: '/home/user'
      }

      const result = spawnService.validateSpawnRequest(request)

      expect(result.valid).toBe(false)
      expect(result.errors).toBeDefined()
      expect(result.errors.some(e => e.includes('terminalType'))).toBe(true)
    })

    it('should validate supported terminal types', () => {
      const request = {
        terminalType: 'invalid-type',
        name: 'Test Terminal'
      }

      const result = spawnService.validateSpawnRequest(request)

      expect(result.valid).toBe(false)
      expect(result.errors).toBeDefined()
    })

    it('should allow optional fields', () => {
      const request = {
        terminalType: 'bash',
        name: 'Test',
        workingDir: '/home/user',
        env: { FOO: 'bar' },
        sessionId: 'session-123'
      }

      const result = spawnService.validateSpawnRequest(request)

      expect(result.valid).toBe(true)
    })
  })

  describe('getTerminalTypeConfig', () => {
    it('should return config for valid terminal type', () => {
      const config = spawnService.getTerminalTypeConfig('claude-code')

      expect(config).toBeDefined()
      expect(config.icon).toBe('🤖')
      expect(config.resumable).toBe(true)
    })

    it('should return undefined for invalid terminal type', () => {
      const config = spawnService.getTerminalTypeConfig('invalid-type')

      expect(config).toBeUndefined()
    })
  })

  describe('spawn', () => {
    it('should spawn terminal with valid configuration', async () => {
      const config = {
        terminalType: 'bash',
        name: 'Test Terminal',
        workingDir: '/home/user'
      }

      const result = await spawnService.spawn(config)

      expect(result).toBeDefined()
      expect(result.id).toBe('term-123')
      expect(result.name).toBe('Test Terminal')
    })

    it('should reject invalid terminal type', async () => {
      const config = {
        terminalType: 'invalid-type',
        name: 'Test'
      }

      await expect(spawnService.spawn(config)).rejects.toThrow()
    })

    it('should apply default environment variables', async () => {
      const config = {
        terminalType: 'claude-code',
        name: 'Claude Test'
      }

      await spawnService.spawn(config)

      // Should have called registerTerminal with environment
      const terminalRegistry = await import('../modules/terminal-registry')
      expect(terminalRegistry.default.registerTerminal).toHaveBeenCalled()
    })

    it('should merge custom env with defaults', async () => {
      const config = {
        terminalType: 'bash',
        name: 'Test',
        env: { CUSTOM: 'value' }
      }

      await spawnService.spawn(config)

      const terminalRegistry = await import('../modules/terminal-registry')
      const callArgs = terminalRegistry.default.registerTerminal.mock.calls[0][0]
      expect(callArgs.env).toBeDefined()
      expect(callArgs.env.CUSTOM).toBe('value')
    })
  })

  describe('getSupportedTerminalTypes', () => {
    it('should return array of supported types', () => {
      const types = spawnService.getSupportedTerminalTypes()

      expect(Array.isArray(types)).toBe(true)
      expect(types).toContain('bash')
      expect(types).toContain('claude-code')
      expect(types).toContain('opencode')
    })

    it('should return unique terminal types', () => {
      const types = spawnService.getSupportedTerminalTypes()
      const uniqueTypes = [...new Set(types)]

      expect(types.length).toBe(uniqueTypes.length)
    })
  })

  describe('getStats', () => {
    it('should return spawn statistics', () => {
      const stats = spawnService.getStats()

      expect(stats).toBeDefined()
      expect(stats).toHaveProperty('supportedTypes')
      expect(Array.isArray(stats.supportedTypes)).toBe(true)
    })
  })
})
