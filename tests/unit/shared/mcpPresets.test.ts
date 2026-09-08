import {
  ALL_TOOL_IDS,
  BUILT_IN_MCP_PRESETS,
  CORE_TOOL_IDS,
  MCP_TOOLS,
  deriveBuiltInMcpPresets,
  type McpTool,
} from '../../../extension/shared/mcpTools'

describe('built-in MCP presets', () => {
  it('uses Tabz role names and only advertises current tools', () => {
    expect(Object.keys(BUILT_IN_MCP_PRESETS)).toEqual([
      'page-agent',
      'browser-qa',
      'chrome-ops',
      'tabz-ops',
    ])

    for (const preset of Object.values(BUILT_IN_MCP_PRESETS)) {
      expect(preset.builtIn).toBe(true)
      expect(preset.readOnly).toBe(true)
      expect(preset.tools.filter(id => !ALL_TOOL_IDS.includes(id))).toEqual([])
      expect(CORE_TOOL_IDS.filter(id => !preset.tools.includes(id))).toEqual([])
    }
  })

  it('assigns current tools to roles while retaining legacy tools outside built-in presets', () => {
    const assigned = new Set(Object.values(BUILT_IN_MCP_PRESETS).flatMap(preset => preset.tools))
    expect(MCP_TOOLS.filter(tool => !assigned.has(tool.id)).map(tool => tool.id).sort()).toEqual([
      'tabz_click', 'tabz_screenshot', 'tabz_screenshot_full',
    ])
  })

  it('keeps page-agent on the currently registered page surface', () => {
    const pageAgent = BUILT_IN_MCP_PRESETS['page-agent']

    expect(pageAgent.tools).toHaveLength(20)
    expect(pageAgent.tools).toEqual(expect.arrayContaining([
      'tabz_claude_group_status',
      'tabz_docs',
      'tabz_fill',
      'tabz_open_url',
      'tabz_get_console_logs',
      'tabz_request_login',
      'tabz_secret_request',
      'tabz_secret_status',
      'tabz_fill_secret',
      'tabz_act',
      'tabz_read_page',
      'tabz_batch',
    ]))
    expect(pageAgent.tools).not.toContain('tabz_get_network_requests')
    expect(pageAgent.tools).not.toContain('tabz_get_dom_tree')
    expect(pageAgent.tools).not.toContain('tabz_list_windows')
    for (const id of ['tabz_click', 'tabz_screenshot', 'tabz_screenshot_full']) {
      expect(ALL_TOOL_IDS).toContain(id)
      expect(pageAgent.tools).not.toContain(id)
    }
  })

  it('derives category membership for later registered tools', () => {
    const tools: McpTool[] = [
      { id: 'core-tool', name: 'Core', desc: 'Core tool', tokens: 1, category: 'Core', locked: true },
      { id: 'new-network-tool', name: 'Network', desc: 'Network tool', tokens: 1, category: 'Network' },
    ]

    const presets = deriveBuiltInMcpPresets(tools)

    expect(presets['browser-qa'].tools).toContain('new-network-tool')
    expect(presets['chrome-ops'].tools).not.toContain('new-network-tool')
    expect(presets['tabz-ops'].tools).not.toContain('new-network-tool')
  })
})
