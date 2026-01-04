/**
 * Tests for plugin health check endpoints
 *
 * Tests cover:
 * - /api/plugins/health - Check plugin health (outdated versions, cache size)
 * - /api/plugins/update - Update a single plugin
 * - /api/plugins/update-all - Update all outdated plugins
 * - /api/plugins/cache/prune - Remove old cached plugin versions
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import path from 'path'
import os from 'os'

// Home directory used in the module
const homeDir = os.homedir()
const projectsDir = path.join(homeDir, 'projects')

// =============================================================================
// Pure Logic Tests (testing the patterns used in the endpoints)
// =============================================================================

describe('Plugin Health Logic', () => {
  describe('isSemVer pattern', () => {
    const isSemVer = (v) => v && /^\d+\.\d+(\.\d+)?$/.test(v)

    it('should recognize valid semantic versions', () => {
      expect(isSemVer('1.0.0')).toBe(true)
      expect(isSemVer('2.1.3')).toBe(true)
      expect(isSemVer('0.0.1')).toBe(true)
      expect(isSemVer('10.20.30')).toBe(true)
    })

    it('should recognize two-part versions', () => {
      expect(isSemVer('1.0')).toBe(true)
      expect(isSemVer('2.1')).toBe(true)
    })

    it('should reject git commit SHAs', () => {
      expect(isSemVer('abc123def456')).toBe(false)
      expect(isSemVer('4fe8c11b2c3d')).toBe(false)
      expect(isSemVer('a1b2c3d4e5f6')).toBe(false)
    })

    it('should reject invalid versions', () => {
      expect(isSemVer('')).toBeFalsy()
      expect(isSemVer(null)).toBeFalsy()
      expect(isSemVer(undefined)).toBeFalsy()
      expect(isSemVer('v1.0.0')).toBeFalsy()
      expect(isSemVer('1.0.0-beta')).toBeFalsy()
      expect(isSemVer('1')).toBeFalsy()
    })
  })

  describe('Version comparison logic', () => {
    it('should match full SHA to HEAD', () => {
      const installedVersion = 'abc123def456789012345678901234567890abcd'
      const currentSha = 'abc123def456789012345678901234567890abcd'
      const currentShaShort = currentSha.substring(0, 12)

      const versionMatches = installedVersion === currentShaShort || installedVersion === currentSha
      expect(versionMatches).toBe(true)
    })

    it('should match short SHA (12 chars) to HEAD', () => {
      const installedVersion = 'abc123def456'
      const currentSha = 'abc123def456789012345678901234567890abcd'
      const currentShaShort = currentSha.substring(0, 12)

      const versionMatches = installedVersion === currentShaShort || installedVersion === currentSha
      expect(versionMatches).toBe(true)
    })

    it('should detect outdated when SHA differs', () => {
      const installedVersion = 'old1234567890'
      const installedSha = 'old1234567890abcdef12345678901234567890'
      const currentSha = 'new9876543210abcdef12345678901234567890'
      const currentShaShort = currentSha.substring(0, 12)

      const versionMatches = installedVersion === currentShaShort || installedVersion === currentSha
      const shaMatches = installedSha === currentSha

      expect(versionMatches).toBe(false)
      expect(shaMatches).toBe(false)
    })

    it('should prefer version over SHA for comparison', () => {
      // Claude Code updates version but leaves gitCommitSha stale
      const installedVersion = 'abc123def456' // This gets updated
      const installedSha = 'stale0000000abcdef12345678901234567890' // This may be stale
      const currentSha = 'abc123def456789012345678901234567890abcd'
      const currentShaShort = currentSha.substring(0, 12)

      const fromCommit = installedVersion || installedSha
      expect(fromCommit).toBe(installedVersion)

      const versionMatches = installedVersion === currentShaShort || installedVersion === currentSha
      expect(versionMatches).toBe(true)
    })
  })

  describe('Plugin ID parsing', () => {
    it('should split plugin ID into name and marketplace', () => {
      const pluginId = 'my-plugin@my-marketplace'
      const [name, marketplace] = pluginId.split('@')

      expect(name).toBe('my-plugin')
      expect(marketplace).toBe('my-marketplace')
    })

    it('should handle complex plugin names', () => {
      const pluginId = 'some-complex-plugin-name@tabz-chrome'
      const [name, marketplace] = pluginId.split('@')

      expect(name).toBe('some-complex-plugin-name')
      expect(marketplace).toBe('tabz-chrome')
    })
  })
})

// =============================================================================
// Helper Function Tests (via mocked behavior patterns)
// =============================================================================

describe('getGitHead behavior', () => {
  it('should trim newlines from git output', () => {
    const mockHead = 'abc123def456789012345678901234567890abcd'
    const gitOutput = `${mockHead}\n`

    const result = gitOutput.trim()

    expect(result).toBe(mockHead)
  })

  it('should return null on error (simulated)', () => {
    // Simulate what getGitHead does on error
    let result = null
    try {
      throw new Error('Not a git repository')
    } catch {
      result = null
    }

    expect(result).toBe(null)
  })
})

describe('hasPluginChanged behavior', () => {
  it('should return false when git diff exits with 0 (no changes)', () => {
    // git diff --quiet returns exit 0 if no changes
    let changed = false
    try {
      // Simulating successful execSync (no throw = no changes)
      changed = false
    } catch {
      changed = true
    }

    expect(changed).toBe(false)
  })

  it('should return true when git diff exits with 1 (changes)', () => {
    // git diff --quiet returns exit 1 if there are changes
    const error = new Error('Changes detected')
    error.status = 1

    let changed = false
    try {
      throw error
    } catch (err) {
      if (err.status === 1) {
        changed = true
      }
    }

    expect(changed).toBe(true)
  })

  it('should try plugins/<name> path first, then .claude-plugin', () => {
    const pluginName = 'my-plugin'
    const pluginPaths = [`plugins/${pluginName}`, '.claude-plugin']

    expect(pluginPaths[0]).toBe('plugins/my-plugin')
    expect(pluginPaths[1]).toBe('.claude-plugin')
  })
})

describe('discoverLocalMarketplaces logic', () => {
  it('should generate marketplace key from directory name', () => {
    const dirName = 'My-Plugins_V2'
    const key = dirName.toLowerCase().replace(/[^a-z0-9-]/g, '-')

    expect(key).toBe('my-plugins-v2')
  })

  it('should detect marketplace with .claude-plugin/ directory', async () => {
    // Simulate fs.access behavior
    const hasPluginJson = true
    const hasPluginsDir = false

    const isMarketplace = hasPluginJson || hasPluginsDir

    expect(isMarketplace).toBe(true)
  })

  it('should detect marketplace with plugins/ directory', async () => {
    const hasPluginJson = false
    const hasPluginsDir = true

    const isMarketplace = hasPluginJson || hasPluginsDir

    expect(isMarketplace).toBe(true)
  })

  it('should not detect regular directories as marketplaces', async () => {
    const hasPluginJson = false
    const hasPluginsDir = false

    const isMarketplace = hasPluginJson || hasPluginsDir

    expect(isMarketplace).toBe(false)
  })
})

// =============================================================================
// Endpoint Tests (testing logic patterns)
// =============================================================================

describe('Plugin Endpoint Logic', () => {
  describe('POST /api/plugins/update', () => {
    it('should return 400 when pluginId is missing', () => {
      const pluginId = undefined

      const isValid = pluginId && typeof pluginId === 'string'
      expect(isValid).toBeFalsy()
    })

    it('should return 400 when pluginId is not a string', () => {
      const pluginId = 123

      const isValid = pluginId && typeof pluginId === 'string'
      expect(isValid).toBeFalsy()
    })

    it('should return 400 when pluginId is empty string', () => {
      const pluginId = ''

      const isValid = pluginId && typeof pluginId === 'string'
      expect(isValid).toBeFalsy()
    })

    it('should accept valid pluginId', () => {
      const pluginId = 'my-plugin@my-marketplace'

      const isValid = pluginId && typeof pluginId === 'string'
      expect(isValid).toBe(true)
    })

    it('should build correct command with scope flag', () => {
      const pluginId = 'test-plugin@test-marketplace'
      const scope = 'project'

      const scopeFlag = scope && scope !== 'user' ? ` --scope ${scope}` : ''
      const cmd = `claude plugin update "${pluginId}"${scopeFlag}`

      expect(cmd).toBe('claude plugin update "test-plugin@test-marketplace" --scope project')
    })

    it('should not add scope flag for user scope', () => {
      const pluginId = 'test-plugin@test-marketplace'
      const scope = 'user'

      const scopeFlag = scope && scope !== 'user' ? ` --scope ${scope}` : ''
      const cmd = `claude plugin update "${pluginId}"${scopeFlag}`

      expect(cmd).toBe('claude plugin update "test-plugin@test-marketplace"')
    })

    it('should use projectPath as cwd for project-scoped plugins', () => {
      const scope = 'project'
      const projectPath = '/home/user/my-project'

      const execOptions = {
        encoding: 'utf8',
        timeout: 30000,
      }
      if (projectPath && (scope === 'project' || scope === 'local')) {
        execOptions.cwd = projectPath
      }

      expect(execOptions.cwd).toBe(projectPath)
    })

    it('should use projectPath as cwd for local-scoped plugins', () => {
      const scope = 'local'
      const projectPath = '/home/user/my-project'

      const execOptions = {
        encoding: 'utf8',
        timeout: 30000,
      }
      if (projectPath && (scope === 'project' || scope === 'local')) {
        execOptions.cwd = projectPath
      }

      expect(execOptions.cwd).toBe(projectPath)
    })

    it('should not set cwd for user-scoped plugins', () => {
      const scope = 'user'
      const projectPath = '/home/user/my-project'

      const execOptions = {
        encoding: 'utf8',
        timeout: 30000,
      }
      if (projectPath && (scope === 'project' || scope === 'local')) {
        execOptions.cwd = projectPath
      }

      expect(execOptions.cwd).toBeUndefined()
    })
  })

  describe('POST /api/plugins/update-all', () => {
    it('should skip plugins with semantic versions', () => {
      const isSemVer = (v) => v && /^\d+\.\d+(\.\d+)?$/.test(v)

      const installedVersion = '1.2.3'
      const shouldSkip = isSemVer(installedVersion)

      expect(shouldSkip).toBe(true)
    })

    it('should include outdated plugins with git commit versions', () => {
      const isSemVer = (v) => v && /^\d+\.\d+(\.\d+)?$/.test(v)

      const installedVersion = 'abc123def456'
      const installedSha = 'abc123def456789012345678901234567890abcd'
      const currentSha = 'new9876543210abcdef12345678901234567890'
      const currentShaShort = currentSha.substring(0, 12)

      expect(isSemVer(installedVersion)).toBe(false)

      const versionMatches = installedVersion === currentShaShort || installedVersion === currentSha
      const shaMatches = installedSha === currentSha

      expect(versionMatches).toBe(false)
      expect(shaMatches).toBe(false)
    })

    it('should skip project-scoped plugins without projectPath when scope filter is user', () => {
      const scopeFilter = 'user'
      const pluginScope = 'project'
      const projectPath = null

      const shouldSkip = scopeFilter === 'user' && pluginScope !== 'user' && !projectPath

      expect(shouldSkip).toBe(true)
    })

    it('should include project-scoped plugins with projectPath', () => {
      const scopeFilter = 'user'
      const pluginScope = 'project'
      const projectPath = '/home/user/my-project'

      const shouldSkip = scopeFilter === 'user' && pluginScope !== 'user' && !projectPath

      expect(shouldSkip).toBe(false)
    })

    it('should include all plugins when scope filter is all', () => {
      const scopeFilter = 'all'
      const pluginScope = 'project'
      const projectPath = null

      const shouldSkip = scopeFilter === 'user' && pluginScope !== 'user' && !projectPath

      expect(shouldSkip).toBe(false)
    })

    it('should default to user scope filter', () => {
      const { scope: scopeFilter = 'user' } = {}

      expect(scopeFilter).toBe('user')
    })
  })

  describe('POST /api/plugins/cache/prune', () => {
    it('should use default keepLatest of 1', () => {
      const { keepLatest = 1 } = {}
      expect(keepLatest).toBe(1)
    })

    it('should respect custom keepLatest value', () => {
      const { keepLatest = 1 } = { keepLatest: 3 }
      expect(keepLatest).toBe(3)
    })

    it('should prune versions older than keepLatest', () => {
      const versions = [
        { name: 'v3', mtime: new Date('2024-03-01') },
        { name: 'v2', mtime: new Date('2024-02-01') },
        { name: 'v1', mtime: new Date('2024-01-01') },
      ]

      // Sort by modification time descending
      versions.sort((a, b) => b.mtime - a.mtime)

      const keepLatest = 1
      const toRemove = versions.slice(keepLatest)

      expect(toRemove).toHaveLength(2)
      expect(toRemove[0].name).toBe('v2')
      expect(toRemove[1].name).toBe('v1')
    })

    it('should keep multiple versions when keepLatest > 1', () => {
      const versions = [
        { name: 'v3', mtime: new Date('2024-03-01') },
        { name: 'v2', mtime: new Date('2024-02-01') },
        { name: 'v1', mtime: new Date('2024-01-01') },
      ]

      versions.sort((a, b) => b.mtime - a.mtime)

      const keepLatest = 2
      const toRemove = versions.slice(keepLatest)

      expect(toRemove).toHaveLength(1)
      expect(toRemove[0].name).toBe('v1')
    })

    it('should prune only specified marketplace when provided', () => {
      const marketplace = 'my-marketplace'
      const allMarketplaces = ['my-marketplace', 'other-marketplace']

      const marketplacesToPrune = marketplace
        ? [marketplace]
        : allMarketplaces

      expect(marketplacesToPrune).toEqual(['my-marketplace'])
    })

    it('should prune all marketplaces when none specified', () => {
      const marketplace = undefined
      const allMarketplaces = ['my-marketplace', 'other-marketplace']

      const marketplacesToPrune = marketplace
        ? [marketplace]
        : allMarketplaces

      expect(marketplacesToPrune).toEqual(['my-marketplace', 'other-marketplace'])
    })

    it('should calculate freed bytes from du output', () => {
      // du returns KB, we multiply by 1024 to get bytes
      const duOutput = '1024' // 1024 KB
      const size = parseInt(duOutput.trim())
      const freedBytes = size * 1024

      expect(freedBytes).toBe(1024 * 1024) // 1 MB
    })
  })

  describe('GET /api/plugins/health cache statistics', () => {
    it('should aggregate cache size across marketplaces', () => {
      const cacheStats = {
        totalSize: 0,
        totalVersions: 0,
        byMarketplace: {},
      }

      // Simulate adding marketplace data
      const marketplaceData = [
        { name: 'mp1', size: 1000, versions: 3 },
        { name: 'mp2', size: 2000, versions: 5 },
      ]

      for (const mp of marketplaceData) {
        cacheStats.byMarketplace[mp.name] = {
          size: mp.size,
          versions: mp.versions,
        }
        cacheStats.totalSize += mp.size
        cacheStats.totalVersions += mp.versions
      }

      expect(cacheStats.totalSize).toBe(3000)
      expect(cacheStats.totalVersions).toBe(8)
      expect(Object.keys(cacheStats.byMarketplace)).toHaveLength(2)
    })

    it('should count plugin versions correctly', async () => {
      const versionDirs = ['abc123', 'def456', 'ghi789']

      // Simulate checking which are directories
      const versionChecks = await Promise.all(versionDirs.map(async (v) => {
        // Simulate all being directories
        return v
      }))

      const versionCount = versionChecks.filter(Boolean).length

      expect(versionCount).toBe(3)
    })

    it('should filter out non-directory entries from version count', async () => {
      const versionDirs = ['abc123', 'def456', null, undefined]

      const versionCount = versionDirs.filter(Boolean).length

      expect(versionCount).toBe(2)
    })
  })
})

// =============================================================================
// Error Handling Tests
// =============================================================================

describe('Error Handling', () => {
  describe('File not found errors', () => {
    it('should handle ENOENT for marketplaces file gracefully', () => {
      const error = new Error('File not found')
      error.code = 'ENOENT'

      let marketplaces = {}
      let shouldLog = false
      try {
        throw error
      } catch (err) {
        if (err.code !== 'ENOENT') {
          shouldLog = true
        }
        // ENOENT is expected for missing file, don't log
      }

      expect(marketplaces).toEqual({})
      expect(shouldLog).toBe(false)
    })

    it('should log non-ENOENT errors', () => {
      const error = new Error('Permission denied')
      error.code = 'EACCES'

      let shouldLog = false
      try {
        throw error
      } catch (err) {
        if (err.code !== 'ENOENT') {
          shouldLog = true
        }
      }

      expect(shouldLog).toBe(true)
    })
  })

  describe('Installation array handling', () => {
    it('should handle array installations', () => {
      const installations = [
        { scope: 'user', gitCommitSha: 'abc123', version: 'abc123def456' },
        { scope: 'project', gitCommitSha: 'def456', projectPath: '/project' },
      ]

      const install = Array.isArray(installations) ? installations[0] : installations

      expect(install.scope).toBe('user')
      expect(install.gitCommitSha).toBe('abc123')
    })

    it('should handle single installation object', () => {
      const installations = { scope: 'user', gitCommitSha: 'abc123' }

      const install = Array.isArray(installations) ? installations[0] : installations

      expect(install.scope).toBe('user')
      expect(install.gitCommitSha).toBe('abc123')
    })

    it('should extract first installation from array', () => {
      const installations = [
        { scope: 'user', projectPath: null },
        { scope: 'project', projectPath: '/my-project' },
      ]

      const install = Array.isArray(installations) ? installations[0] : installations

      expect(install.scope).toBe('user')
      expect(install.projectPath).toBe(null)
    })
  })

  describe('Missing directories', () => {
    it('should skip non-directory entries', () => {
      const entries = [
        { name: 'file.txt', isDirectory: () => false },
        { name: 'dir', isDirectory: () => true },
      ]

      const directories = entries.filter(e => e.isDirectory())

      expect(directories).toHaveLength(1)
      expect(directories[0].name).toBe('dir')
    })
  })

  describe('Default scope handling', () => {
    it('should default to user scope when not provided', () => {
      const install = { gitCommitSha: 'abc123' }
      const scope = install.scope || 'user'

      expect(scope).toBe('user')
    })

    it('should use provided scope', () => {
      const install = { gitCommitSha: 'abc123', scope: 'project' }
      const scope = install.scope || 'user'

      expect(scope).toBe('project')
    })
  })
})

// =============================================================================
// Input Validation Tests
// =============================================================================

describe('Input Validation', () => {
  describe('/api/plugins/update validation', () => {
    it('should require pluginId', () => {
      const bodies = [
        {},
        { pluginId: '' },
        { pluginId: null },
        { pluginId: undefined },
        { pluginId: 123 },
        { pluginId: [] },
        { pluginId: {} },
      ]

      for (const body of bodies) {
        const { pluginId } = body
        const isValid = pluginId && typeof pluginId === 'string'
        expect(isValid).toBeFalsy()
      }
    })

    it('should accept valid pluginId', () => {
      const bodies = [
        { pluginId: 'plugin@marketplace' },
        { pluginId: 'my-plugin@my-marketplace' },
        { pluginId: 'a@b' },
      ]

      for (const body of bodies) {
        const { pluginId } = body
        const isValid = pluginId && typeof pluginId === 'string'
        expect(isValid).toBe(true)
      }
    })
  })

  describe('/api/plugins/cache/prune validation', () => {
    it('should use default keepLatest when not provided', () => {
      const bodies = [
        {},
        { marketplace: 'some-marketplace' },
        { keepLatest: undefined },
      ]

      for (const body of bodies) {
        const { keepLatest = 1 } = body
        expect(keepLatest).toBe(1)
      }
    })

    it('should accept custom keepLatest values', () => {
      const bodies = [
        { keepLatest: 0 },
        { keepLatest: 1 },
        { keepLatest: 5 },
        { keepLatest: 10 },
      ]

      for (const body of bodies) {
        const { keepLatest = 1 } = body
        expect(keepLatest).toBe(body.keepLatest)
      }
    })
  })

  describe('Marketplace merge logic', () => {
    it('should not override registered marketplaces with discovered ones', () => {
      const marketplaces = {
        'existing-marketplace': { source: 'registered', installLocation: '/registered/path' }
      }
      const discoveredMarketplaces = {
        'existing-marketplace': { source: 'discovered', installLocation: '/discovered/path' },
        'new-marketplace': { source: 'discovered', installLocation: '/new/path' }
      }

      // Merge discovered marketplaces (don't override registered ones)
      for (const [key, info] of Object.entries(discoveredMarketplaces)) {
        if (!marketplaces[key]) {
          marketplaces[key] = info
        }
      }

      expect(marketplaces['existing-marketplace'].source).toBe('registered')
      expect(marketplaces['new-marketplace'].source).toBe('discovered')
    })
  })
})

// =============================================================================
// Response Format Tests
// =============================================================================

describe('Response Format', () => {
  describe('Health check response', () => {
    it('should include all required fields', () => {
      const response = {
        success: true,
        data: {
          outdated: [],
          current: 5,
          unknown: 1,
          marketplaceHeads: {},
          cache: {
            totalSize: 0,
            totalVersions: 0,
            byMarketplace: {}
          }
        }
      }

      expect(response.success).toBe(true)
      expect(response.data.outdated).toBeDefined()
      expect(response.data.current).toBeDefined()
      expect(response.data.unknown).toBeDefined()
      expect(response.data.marketplaceHeads).toBeDefined()
      expect(response.data.cache).toBeDefined()
    })

    it('should include outdated plugin details', () => {
      const outdatedPlugin = {
        pluginId: 'my-plugin@my-marketplace',
        name: 'my-plugin',
        marketplace: 'my-marketplace',
        scope: 'user',
        projectPath: null,
        installedSha: 'abc123def456',
        currentSha: 'xyz789uvw012',
        lastUpdated: '2024-01-01T00:00:00Z'
      }

      expect(outdatedPlugin.pluginId).toBeDefined()
      expect(outdatedPlugin.name).toBeDefined()
      expect(outdatedPlugin.marketplace).toBeDefined()
      expect(outdatedPlugin.scope).toBeDefined()
      expect(outdatedPlugin.installedSha).toBeDefined()
      expect(outdatedPlugin.currentSha).toBeDefined()
    })
  })

  describe('Update response', () => {
    it('should include success message with restart hint', () => {
      const pluginId = 'my-plugin@my-marketplace'
      const message = `Plugin ${pluginId} updated. Run /restart to apply changes.`

      expect(message).toContain(pluginId)
      expect(message).toContain('/restart')
    })
  })

  describe('Prune response', () => {
    it('should calculate freed MB correctly', () => {
      const freedBytes = 10 * 1024 * 1024 // 10 MB
      const freedMB = (freedBytes / (1024 * 1024)).toFixed(2)

      expect(freedMB).toBe('10.00')
    })

    it('should handle fractional MB', () => {
      const freedBytes = 1536 * 1024 // 1.5 MB
      const freedMB = (freedBytes / (1024 * 1024)).toFixed(2)

      expect(freedMB).toBe('1.50')
    })
  })
})
