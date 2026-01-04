import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import React from 'react'

// Mock the context with hoisted functions
const mockLoadPlugins = vi.fn()
const mockLoadPluginHealth = vi.fn()
const mockTogglePlugin = vi.fn()
const mockUpdatePlugin = vi.fn()
const mockUpdateAllPlugins = vi.fn()
const mockPruneCache = vi.fn()
const mockOpenFile = vi.fn()

// Default mock data
const defaultPluginsData = {
  marketplaces: {
    'test-marketplace': [
      {
        id: 'plugin-1',
        name: 'Test Plugin',
        marketplace: 'test-marketplace',
        enabled: true,
        scope: 'user',
        version: '1.0.0',
        installPath: '/path/to/plugin',
        installedAt: '2024-01-01',
        isLocal: false,
        components: ['skill'],
        componentFiles: { skills: [{ name: 'test.md', path: '/path/skill.md' }] },
      },
    ],
  },
  totalPlugins: 1,
  enabledCount: 1,
  disabledCount: 0,
  componentCounts: { skill: 1 },
  scopeCounts: { user: 1 },
}

// Default health data
const defaultHealthData = {
  outdated: [],
  current: 1,
  unknown: 0,
  cache: { totalSize: 1024, totalVersions: 2, byMarketplace: {} },
}

// Context value holder that can be modified per test
let mockContextValue = {
  pluginsData: defaultPluginsData,
  pluginsLoading: false,
  loadPlugins: mockLoadPlugins,
  togglePlugin: mockTogglePlugin,
  openFile: mockOpenFile,
  pluginHealth: defaultHealthData,
  pluginHealthLoading: false,
  loadPluginHealth: mockLoadPluginHealth,
  updatePlugin: mockUpdatePlugin,
  updateAllPlugins: mockUpdateAllPlugins,
  pruneCache: mockPruneCache,
}

// Mock the FilesContext
vi.mock('../../../extension/dashboard/contexts/FilesContext', () => ({
  useFilesContext: () => mockContextValue,
}))

// Import after mocks
import { PluginList } from '../../../extension/dashboard/components/files/PluginList'

describe('PluginList', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Reset to default values
    mockContextValue = {
      pluginsData: defaultPluginsData,
      pluginsLoading: false,
      loadPlugins: mockLoadPlugins,
      togglePlugin: mockTogglePlugin,
      openFile: mockOpenFile,
      pluginHealth: defaultHealthData,
      pluginHealthLoading: false,
      loadPluginHealth: mockLoadPluginHealth,
      updatePlugin: mockUpdatePlugin,
      updateAllPlugins: mockUpdateAllPlugins,
      pruneCache: mockPruneCache,
    }
  })

  describe('health check auto-load on mount', () => {
    it('should call loadPlugins on mount', async () => {
      render(<PluginList />)

      await waitFor(() => {
        expect(mockLoadPlugins).toHaveBeenCalledTimes(1)
      })
    })

    it('should call loadPluginHealth on mount', async () => {
      render(<PluginList />)

      await waitFor(() => {
        expect(mockLoadPluginHealth).toHaveBeenCalledTimes(1)
      })
    })

    it('should call both loadPlugins and loadPluginHealth on initial render', async () => {
      render(<PluginList />)

      await waitFor(() => {
        expect(mockLoadPlugins).toHaveBeenCalled()
        expect(mockLoadPluginHealth).toHaveBeenCalled()
      })
    })
  })

  describe('loading state', () => {
    it('should show loading text when plugins are loading', () => {
      mockContextValue.pluginsLoading = true

      render(<PluginList />)

      expect(screen.getByText('Loading...')).toBeInTheDocument()
    })

    it('should show no plugins message when data is empty', () => {
      mockContextValue.pluginsData = null

      render(<PluginList />)

      expect(screen.getByText('No plugins installed')).toBeInTheDocument()
    })
  })

  describe('canUpdatePlugin helper function', () => {
    it('should allow update for user-scoped plugin', async () => {
      // Set up outdated plugin with user scope
      mockContextValue.pluginHealth = {
        ...defaultHealthData,
        outdated: [
          {
            pluginId: 'user-plugin',
            name: 'User Plugin',
            marketplace: 'test',
            scope: 'user',
            installedSha: 'abc123',
            currentSha: 'def456',
            lastUpdated: '2024-01-01',
          },
        ],
      }

      render(<PluginList />)

      // Click the health check button to show health panel
      const healthButton = screen.getByTitle('1 outdated')
      healthButton.click()

      await waitFor(() => {
        // The update button should be present and NOT have opacity-30 (disabled style)
        const updateButtons = screen.getAllByTitle('Update plugin')
        expect(updateButtons[0]).not.toHaveClass('opacity-30')
      })
    })

    it('should allow update for project-scoped plugin WITH projectPath', async () => {
      mockContextValue.pluginHealth = {
        ...defaultHealthData,
        outdated: [
          {
            pluginId: 'project-plugin-with-path',
            name: 'Project Plugin With Path',
            marketplace: 'test',
            scope: 'project',
            projectPath: '/home/user/myproject',
            installedSha: 'abc123',
            currentSha: 'def456',
            lastUpdated: '2024-01-01',
          },
        ],
      }

      render(<PluginList />)

      // Click the health check button
      const healthButton = screen.getByTitle('1 outdated')
      healthButton.click()

      await waitFor(() => {
        // Button should show "Update from /home/user/myproject" tooltip
        const updateButton = screen.getByTitle('Update from /home/user/myproject')
        expect(updateButton).not.toHaveClass('opacity-30')
      })
    })

    it('should disable update for project-scoped plugin WITHOUT projectPath', async () => {
      mockContextValue.pluginHealth = {
        ...defaultHealthData,
        outdated: [
          {
            pluginId: 'project-plugin-no-path',
            name: 'Project Plugin No Path',
            marketplace: 'test',
            scope: 'project',
            // No projectPath
            installedSha: 'abc123',
            currentSha: 'def456',
            lastUpdated: '2024-01-01',
          },
        ],
      }

      render(<PluginList />)

      // Click health button
      const healthButton = screen.getByTitle('1 outdated')
      healthButton.click()

      await waitFor(() => {
        // Button should have disabled styling and cannot update tooltip
        const updateButton = screen.getByTitle('Cannot update project-scoped plugin (no project path)')
        expect(updateButton).toHaveClass('opacity-30')
        expect(updateButton).toHaveClass('cursor-not-allowed')
      })
    })
  })

  describe('Update All count logic', () => {
    it('should count only updatable plugins (user-scoped or with projectPath)', async () => {
      // Set up 3 outdated plugins:
      // 1. user-scoped (updatable)
      // 2. project-scoped with projectPath (updatable)
      // 3. project-scoped without projectPath (NOT updatable)
      mockContextValue.pluginHealth = {
        ...defaultHealthData,
        outdated: [
          {
            pluginId: 'user-plugin',
            name: 'User Plugin',
            marketplace: 'test',
            scope: 'user',
            installedSha: 'abc123',
            currentSha: 'def456',
            lastUpdated: '2024-01-01',
          },
          {
            pluginId: 'project-with-path',
            name: 'Project With Path',
            marketplace: 'test',
            scope: 'project',
            projectPath: '/home/user/project',
            installedSha: 'abc123',
            currentSha: 'def456',
            lastUpdated: '2024-01-01',
          },
          {
            pluginId: 'project-no-path',
            name: 'Project No Path',
            marketplace: 'test',
            scope: 'project',
            // No projectPath - should NOT be counted
            installedSha: 'abc123',
            currentSha: 'def456',
            lastUpdated: '2024-01-01',
          },
        ],
      }

      render(<PluginList />)

      // Click health button
      const healthButton = screen.getByTitle('3 outdated')
      healthButton.click()

      await waitFor(() => {
        // Update All should show (2) - only the updatable ones
        expect(screen.getByText('Update All (2)')).toBeInTheDocument()
      })
    })

    it('should show Update All (0) when no plugins are updatable', async () => {
      // Only project-scoped plugin without projectPath
      mockContextValue.pluginHealth = {
        ...defaultHealthData,
        outdated: [
          {
            pluginId: 'project-no-path',
            name: 'Project No Path',
            marketplace: 'test',
            scope: 'project',
            installedSha: 'abc123',
            currentSha: 'def456',
            lastUpdated: '2024-01-01',
          },
        ],
      }

      render(<PluginList />)

      // Click health button
      const healthButton = screen.getByTitle('1 outdated')
      healthButton.click()

      await waitFor(() => {
        // Update All should show (0)
        expect(screen.getByText('Update All (0)')).toBeInTheDocument()
      })
    })

    it('should disable Update All button when updatableCount is 0', async () => {
      mockContextValue.pluginHealth = {
        ...defaultHealthData,
        outdated: [
          {
            pluginId: 'project-no-path',
            name: 'Project No Path',
            marketplace: 'test',
            scope: 'project',
            installedSha: 'abc123',
            currentSha: 'def456',
            lastUpdated: '2024-01-01',
          },
        ],
      }

      render(<PluginList />)

      // Click health button
      const healthButton = screen.getByTitle('1 outdated')
      healthButton.click()

      await waitFor(() => {
        const updateAllButton = screen.getByText('Update All (0)').closest('button')
        expect(updateAllButton).toBeDisabled()
      })
    })

    it('should enable Update All button when updatableCount > 0', async () => {
      mockContextValue.pluginHealth = {
        ...defaultHealthData,
        outdated: [
          {
            pluginId: 'user-plugin',
            name: 'User Plugin',
            marketplace: 'test',
            scope: 'user',
            installedSha: 'abc123',
            currentSha: 'def456',
            lastUpdated: '2024-01-01',
          },
        ],
      }

      render(<PluginList />)

      // Click health button
      const healthButton = screen.getByTitle('1 outdated')
      healthButton.click()

      await waitFor(() => {
        const updateAllButton = screen.getByText('Update All (1)').closest('button')
        expect(updateAllButton).not.toBeDisabled()
      })
    })
  })

  describe('isPluginOutdated helper function', () => {
    it('should find outdated plugin by ID', async () => {
      const outdatedPlugin = {
        pluginId: 'outdated-plugin-id',
        name: 'Outdated Plugin',
        marketplace: 'test',
        scope: 'user',
        installedSha: 'old123',
        currentSha: 'new456',
        lastUpdated: '2024-01-01',
      }

      mockContextValue.pluginHealth = {
        ...defaultHealthData,
        outdated: [outdatedPlugin],
      }

      render(<PluginList />)

      // Click health button
      const healthButton = screen.getByTitle('1 outdated')
      healthButton.click()

      await waitFor(() => {
        // Plugin name should appear in the health panel
        expect(screen.getByText('Outdated Plugin')).toBeInTheDocument()
        // SHA info should be shown
        expect(screen.getByText('old123 → new456')).toBeInTheDocument()
      })
    })
  })

  describe('health status display', () => {
    it('should show green checkmark when no outdated plugins', () => {
      mockContextValue.pluginHealth = {
        ...defaultHealthData,
        outdated: [],
        current: 5,
      }

      render(<PluginList />)

      // Should show green checkmark with "All plugins current" tooltip
      const healthButton = screen.getByTitle('All plugins current')
      expect(healthButton).toBeInTheDocument()
    })

    it('should show amber warning when plugins are outdated', () => {
      mockContextValue.pluginHealth = {
        ...defaultHealthData,
        outdated: [
          {
            pluginId: 'test',
            name: 'Test',
            marketplace: 'test',
            scope: 'user',
            installedSha: 'a',
            currentSha: 'b',
            lastUpdated: '2024-01-01',
          },
        ],
      }

      render(<PluginList />)

      const healthButton = screen.getByTitle('1 outdated')
      expect(healthButton).toBeInTheDocument()
    })

    it('should show loading spinner when health is loading', () => {
      mockContextValue.pluginHealthLoading = true
      mockContextValue.pluginHealth = null

      render(<PluginList />)

      const healthButton = screen.getByTitle('Checking...')
      expect(healthButton).toBeInTheDocument()
    })
  })
})
