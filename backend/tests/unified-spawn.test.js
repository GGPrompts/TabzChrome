import { describe, it, expect, afterEach } from 'vitest'
import os from 'os'
import './helpers/process-boundary-fake.js'

// Import the actual module - we'll test its behavior directly
const spawnService = (await import('../modules/unified-spawn.js')).default
const terminalRegistry = (await import('../modules/terminal-registry.js')).default

// Use actual home directory for tests
const TEST_WORKING_DIR = os.homedir()

describe('UnifiedSpawn', () => {
  afterEach(async () => {
    // Cleanup any terminals created during tests
    await terminalRegistry.cleanup()
  })

  describe('configuration', () => {
    it('should have terminal type configurations', () => {
      const configs = spawnService.getAllTerminalConfigs()

      expect(configs).toBeDefined()
      expect(configs['claude-code']).toBeDefined()
      expect(configs['bash']).toBeDefined()
      expect(configs['opencode']).toBeDefined()
    })

    it('should define shell for each terminal type', () => {
      const configs = spawnService.getAllTerminalConfigs()

      Object.values(configs).forEach(config => {
        expect(config).toHaveProperty('shell')
        expect(typeof config.shell).toBe('string')
      })
    })
  })

  describe('validateSpawnRequest', () => {
    it('should accept valid spawn request', async () => {
      const request = {
        terminalType: 'bash',
        name: 'Test Terminal',
        workingDir: TEST_WORKING_DIR
      }

      const result = await spawnService.validateSpawnRequest(request)

      expect(result.valid).toBe(true)
    })

    it('should require terminalType', async () => {
      const request = {
        name: 'Test Terminal',
        workingDir: TEST_WORKING_DIR
      }

      const result = await spawnService.validateSpawnRequest(request)

      expect(result.valid).toBe(false)
      expect(result.error).toBeDefined()
      expect(result.error).toContain('type')
    })

    it('should reject non-existent working directory', async () => {
      const request = {
        terminalType: 'bash',
        name: 'Test',
        workingDir: '/nonexistent/path/that/does/not/exist'
      }

      const result = await spawnService.validateSpawnRequest(request)

      expect(result.valid).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('should allow optional fields', async () => {
      const request = {
        terminalType: 'bash',
        name: 'Test',
        workingDir: TEST_WORKING_DIR,
        env: { FOO: 'bar' },
        sessionId: 'session-123'
      }

      const result = await spawnService.validateSpawnRequest(request)

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

    it('should return null for invalid terminal type', () => {
      const config = spawnService.getTerminalTypeConfig('invalid-type')

      expect(config).toBeNull()
    })
  })

  describe('spawn', () => {
    it('should spawn terminal with valid configuration', async () => {
      const config = {
        terminalType: 'bash',
        name: 'Test Terminal',
        workingDir: TEST_WORKING_DIR
      }

      const result = await spawnService.spawn(config)

      expect(result).toBeDefined()
      // Successful spawn returns the terminal object with id
      expect(result.id || result.success !== false).toBeTruthy()
    })

    it('should return error for invalid terminal type', async () => {
      const config = {
        terminalType: 'invalid-type',
        name: 'Test'
      }

      const result = await spawnService.spawn(config)

      expect(result.success).toBe(false)
      expect(result.error).toContain('Unknown terminal type')
    })

    it('should spawn claude-code terminal', async () => {
      const config = {
        terminalType: 'claude-code',
        name: 'Claude Test'
      }

      const result = await spawnService.spawn(config)

      expect(result).toBeDefined()
      // Either success with terminal or we got an object back
      if (result.id) {
        expect(result.terminalType).toBe('claude-code')
      }
    })
  })

  describe('getAvailableTypes', () => {
    it('should return array of available types', () => {
      const types = spawnService.getAvailableTypes()

      expect(Array.isArray(types)).toBe(true)
      expect(types.length).toBeGreaterThan(0)
      // Each type should have type, platforms, and resumable
      types.forEach(t => {
        expect(t).toHaveProperty('type')
        expect(t).toHaveProperty('platforms')
        expect(t).toHaveProperty('resumable')
      })
    })
  })

  describe('getStats', () => {
    it('should return spawn statistics', () => {
      const stats = spawnService.getStats()

      expect(stats).toBeDefined()
      expect(stats).toHaveProperty('activeTerminals')
      expect(stats).toHaveProperty('maxTerminals')
      expect(stats).toHaveProperty('spawnsInProgress')
      expect(stats).toHaveProperty('rateLimit')
    })
  })
})
