import { describe, expect, it } from 'vitest'
import { ALL_TOOL_IDS, CORE_TOOL_IDS, MCP_TOOLS } from '../../../extension/shared/mcpTools'
import generatedCatalog from '../../../extension/shared/mcpToolCatalog.json'

describe('MCP tool catalog', () => {
  it('contains every current server registration exactly once', () => {
    expect(MCP_TOOLS).toHaveLength(97)
    expect(ALL_TOOL_IDS).toHaveLength(97)
    expect(new Set(ALL_TOOL_IDS).size).toBe(97)
    expect(MCP_TOOLS.every(tool => Boolean(tool.category))).toBe(true)
  })

  it('matches the server Core tools', () => {
    expect(CORE_TOOL_IDS).toEqual([
      'tabz_list_tabs',
      'tabz_switch_tab',
      'tabz_close_tab',
      'tabz_rename_tab',
      'tabz_get_page_info',
      'tabz_claude_group_status',
      'tabz_docs',
    ])
  })

  it('matches the generated backend catalog', () => {
    expect(generatedCatalog.map(tool => tool.id)).toEqual(ALL_TOOL_IDS)
    expect(generatedCatalog.map(tool => tool.category)).toEqual(MCP_TOOLS.map(tool => tool.category))
    expect(generatedCatalog.filter(tool => tool.locked).map(tool => tool.id)).toEqual(CORE_TOOL_IDS)
  })

  it('preserves legacy browser and Tabz-specific compatibility tools', () => {
    expect(ALL_TOOL_IDS).toEqual(expect.arrayContaining([
      'tabz_click',
      'tabz_screenshot',
      'tabz_screenshot_full',
      'tabz_execute_script',
      'tabz_speak',
      'tabz_list_voices',
      'tabz_play_audio',
      'tabz_list_profiles',
      'tabz_list_plugins',
      'tabz_request_login',
      'tabz_secret_request',
      'tabz_secret_status',
      'tabz_fill_secret',
      'tabz_act',
      'tabz_read_page',
      'tabz_batch',
      'tabz_enable_deep_capture',
      'tabz_disable_deep_capture',
      'tabz_get_response_body',
    ]))
  })
})
