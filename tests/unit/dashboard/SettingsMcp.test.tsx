import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import SettingsMcp from '../../../extension/dashboard/sections/SettingsMcp'
import { ALL_TOOL_IDS } from '../../../extension/shared/mcpTools'

vi.mock('../../../extension/dashboard/hooks/useDashboard', () => ({
  spawnTerminal: vi.fn(),
}))

let postBodies: Array<Record<string, unknown>>
let deleteUrls: string[]
let screenshotStorage: Record<string, unknown>
let saveScreenshotStorage: ReturnType<typeof vi.fn>

function mockBackend(config: Record<string, unknown>, presets: Record<string, unknown> = {}) {
  postBodies = []
  deleteUrls = []
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === 'POST') {
      postBodies.push(JSON.parse(String(init.body)))
      return { ok: true, json: async () => ({ success: true }) }
    }
    if (init?.method === 'DELETE') {
      deleteUrls.push(String(url))
      return { ok: true, json: async () => ({ success: true }) }
    }
    if (String(url).includes('/api/mcp-config')) {
      return { ok: true, json: async () => config }
    }
    if (String(url).includes('/api/mcp/inspector-command')) {
      return { ok: true, json: async () => ({ data: { command: 'npx inspector', inspectorUrl: 'http://localhost:6274' } }) }
    }
    return { ok: true, json: async () => ({ presets }) }
  }) as unknown as typeof fetch)
}

beforeEach(() => {
  screenshotStorage = {}
  saveScreenshotStorage = vi.fn(async (values: Record<string, unknown>) => { Object.assign(screenshotStorage, values) })
  vi.stubGlobal('chrome', {
    ...(globalThis as any).chrome,
    tabs: { create: vi.fn() },
    storage: { local: {
      get: vi.fn(async () => ({ ...screenshotStorage })),
      set: saveScreenshotStorage,
    } },
  })
})

describe('screenshot location settings', () => {
  it('preserves an upgrade default without writing storage or enabling connection folders', async () => {
    mockBackend({ enabledTools: ['tabz_list_tabs'] })
    render(<SettingsMcp />)
    await waitFor(() => expect(screen.getByLabelText('Screenshot folder')).toBeEnabled())
    expect(screen.getByLabelText('Give each agent connection its own subfolder')).not.toBeChecked()
    expect(screen.getByText('Downloads/tabz/screenshots/screenshot-example.png')).toBeInTheDocument()
    expect(saveScreenshotStorage).not.toHaveBeenCalled()
  })

  it('loads existing settings and saves only explicitly chosen valid screenshot settings', async () => {
    screenshotStorage = { screenshotFolder: 'existing/shots', screenshotPerConnection: true, unrelated: 'keep' }
    mockBackend({ enabledTools: ['tabz_list_tabs'] })
    render(<SettingsMcp />)
    await waitFor(() => expect(screen.getByLabelText('Screenshot folder')).toHaveValue('existing/shots'))
    expect(screen.getByLabelText('Give each agent connection its own subfolder')).toBeChecked()
    fireEvent.change(screen.getByLabelText('Screenshot folder'), { target: { value: 'work//captures' } })
    fireEvent.click(screen.getByLabelText('Give each agent connection its own subfolder'))
    expect(saveScreenshotStorage).not.toHaveBeenCalled()
    fireEvent.click(screen.getByText('Save screenshot settings'))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Screenshot settings saved'))
    expect(saveScreenshotStorage).toHaveBeenCalledWith({ screenshotFolder: 'work/captures', screenshotPerConnection: false })
    expect(screenshotStorage.unrelated).toBe('keep')
    expect(postBodies).toEqual([])
  })

  it('refuses invalid folders and can reset to the legacy default', async () => {
    mockBackend({ enabledTools: ['tabz_list_tabs'] })
    render(<SettingsMcp />)
    await waitFor(() => expect(screen.getByLabelText('Screenshot folder')).toBeEnabled())
    fireEvent.change(screen.getByLabelText('Screenshot folder'), { target: { value: '../outside' } })
    expect(screen.getByText('Save screenshot settings')).toBeDisabled()
    expect(screen.getByRole('alert')).toHaveTextContent('not allowed')
    expect(saveScreenshotStorage).not.toHaveBeenCalled()
    fireEvent.change(screen.getByLabelText('Screenshot folder'), { target: { value: '' } })
    fireEvent.click(screen.getByText('Save screenshot settings'))
    await waitFor(() => expect(saveScreenshotStorage).toHaveBeenCalledWith({ screenshotFolder: 'tabz/screenshots', screenshotPerConnection: false }))
  })

  it('reports storage failure instead of claiming the settings were saved', async () => {
    saveScreenshotStorage.mockRejectedValueOnce(new Error('synthetic storage failure'))
    mockBackend({ enabledTools: ['tabz_list_tabs'] })
    render(<SettingsMcp />)
    await waitFor(() => expect(screen.getByLabelText('Screenshot folder')).toBeEnabled())
    fireEvent.change(screen.getByLabelText('Screenshot folder'), { target: { value: 'work/shots' } })
    fireEvent.click(screen.getByText('Save screenshot settings'))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Could not save screenshot settings'))
    expect(screen.queryByText('Screenshot settings saved')).not.toBeInTheDocument()
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('MCP Settings catalog upgrades', () => {
  it('keeps legacy allowlist omissions disabled while acknowledging a discovered tool', async () => {
    mockBackend({
      enabledTools: ['tabz_list_tabs', 'tabz_close_tab'],
      newTools: ['tabz_close_tab'],
    })
    render(<SettingsMcp />)

    await waitFor(() => expect(screen.getByText(/Save to acknowledge/)).toBeInTheDocument())
    fireEvent.click(screen.getByText('Save Config'))

    await waitFor(() => expect(postBodies).toHaveLength(1))
    expect(postBodies[0].enabledTools).toEqual(['tabz_list_tabs', 'tabz_close_tab'])
    expect(postBodies[0].enabledTools).not.toContain('tabz_fill')
    expect(postBodies[0].knownTools).toEqual(ALL_TOOL_IDS)
  })

  it('saves the current catalog snapshot while preserving disabled known tools', async () => {
    mockBackend({
      enabledTools: ['tabz_list_tabs', 'tabz_fill'],
      knownTools: ALL_TOOL_IDS,
      newTools: [],
    })
    render(<SettingsMcp />)

    await waitFor(() => expect(screen.getByText('tabz_fill')).toBeInTheDocument())
    fireEvent.click(screen.getByText('tabz_fill'))
    fireEvent.click(screen.getByText('Save Config'))

    await waitFor(() => expect(postBodies).toHaveLength(1))
    expect(postBodies[0].knownTools).toEqual(ALL_TOOL_IDS)
    expect(postBodies[0].enabledTools).not.toContain('tabz_fill')
  })

  it('marks newly discovered tools and allows acknowledging them without another edit', async () => {
    const newTool = 'tabz_close_tab'
    mockBackend({
      enabledTools: ['tabz_list_tabs', newTool],
      knownTools: ALL_TOOL_IDS.filter(id => id !== newTool),
      newTools: [newTool],
    })
    render(<SettingsMcp />)

    await waitFor(() => expect(screen.getAllByText('New since your last save')).not.toHaveLength(0))
    expect(screen.getByText(/Save to acknowledge/)).toBeInTheDocument()
    fireEvent.click(screen.getByText('Save Config'))

    await waitFor(() => expect(postBodies).toHaveLength(1))
    expect(postBodies[0].enabledTools).toContain(newTool)
    expect(postBodies[0].knownTools).toEqual(ALL_TOOL_IDS)
    await waitFor(() => expect(screen.queryAllByText('New since your last save')).toHaveLength(0))
  })

  it('renders built-in presets as read-only while retaining custom presets', async () => {
    mockBackend(
      { enabledTools: ['tabz_list_tabs'], knownTools: ALL_TOOL_IDS, newTools: [] },
      {
        'page-agent': {
          name: 'Page Agent',
          description: 'Browser page tools',
          categories: ['Core', 'Interaction'],
          tools: ['tabz_list_tabs', 'tabz_fill'],
          builtIn: true,
          readOnly: true,
        },
        'my-tools': {
          name: 'My Tools',
          description: 'Custom tools',
          tools: ['tabz_list_tabs'],
          updatedAt: '2026-09-07T00:00:00.000Z',
        },
      }
    )
    render(<SettingsMcp />)

    await waitFor(() => expect(screen.getByText('Page Agent')).toBeInTheDocument())
    expect(screen.getByText('My Tools')).toBeInTheDocument()
    expect(screen.getByText('Read-only')).toBeInTheDocument()
    expect(screen.getAllByTitle('Delete preset')).toHaveLength(1)
    expect(screen.getByText(/Estimates use complete published schema characters divided by four/)).toBeInTheDocument()
  })

  it('deletes a colliding custom preset through its displayed alias and keeps the built-in', async () => {
    mockBackend(
      { enabledTools: ['tabz_list_tabs'], knownTools: ALL_TOOL_IDS, newTools: [] },
      {
        'page-agent': {
          name: 'Page Agent',
          description: 'Built in',
          categories: ['Core'],
          tools: ['tabz_list_tabs'],
          builtIn: true,
          readOnly: true,
        },
        'page-agent-custom': {
          name: 'Old Page Agent',
          description: 'Saved custom preset',
          tools: ['tabz_list_tabs'],
          shadowedBuiltIn: 'page-agent',
        },
      }
    )
    render(<SettingsMcp />)

    await waitFor(() => expect(screen.getByText('Old Page Agent')).toBeInTheDocument())
    fireEvent.click(screen.getByTitle('Delete preset'))

    await waitFor(() => expect(deleteUrls).toEqual(['http://localhost:8129/api/mcp-presets/page-agent-custom']))
    expect(screen.getByText('Page Agent')).toBeInTheDocument()
    expect(screen.queryByText('Old Page Agent')).not.toBeInTheDocument()
  })
})
