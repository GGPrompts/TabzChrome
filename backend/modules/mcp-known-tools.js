function unique(ids) {
  return Array.from(new Set(ids));
}

// The catalog offered by Tabz before knownTools was stored. This snapshot is
// intentionally frozen: an omitted id in an old enabledTools allowlist was an
// explicit disable, while ids added after this snapshot are genuinely new.
const LEGACY_MCP_TOOL_IDS = [
  'tabz_list_tabs', 'tabz_switch_tab', 'tabz_rename_tab', 'tabz_get_page_info',
  'tabz_click', 'tabz_fill', 'tabz_screenshot', 'tabz_screenshot_full', 'tabz_download_image', 'tabz_get_element',
  'tabz_open_url', 'tabz_get_console_logs', 'tabz_execute_script',
  'tabz_enable_network_capture', 'tabz_get_network_requests', 'tabz_clear_network_requests',
  'tabz_download_file', 'tabz_get_downloads', 'tabz_cancel_download', 'tabz_save_page',
  'tabz_get_bookmark_tree', 'tabz_search_bookmarks', 'tabz_save_bookmark', 'tabz_create_folder', 'tabz_move_bookmark', 'tabz_delete_bookmark',
  'tabz_get_dom_tree', 'tabz_profile_performance', 'tabz_get_coverage',
  'tabz_list_groups', 'tabz_create_group', 'tabz_update_group', 'tabz_add_to_group', 'tabz_ungroup_tabs',
  'tabz_claude_group_add', 'tabz_claude_group_remove', 'tabz_claude_group_status',
  'tabz_list_windows', 'tabz_create_window', 'tabz_update_window', 'tabz_close_window', 'tabz_get_displays', 'tabz_tile_windows', 'tabz_popout_terminal',
  'tabz_speak', 'tabz_list_voices', 'tabz_play_audio',
  'tabz_history_search', 'tabz_history_visits', 'tabz_history_recent', 'tabz_history_delete_url', 'tabz_history_delete_range',
  'tabz_sessions_recently_closed', 'tabz_sessions_restore', 'tabz_sessions_devices',
  'tabz_cookies_get', 'tabz_cookies_list', 'tabz_cookies_set', 'tabz_cookies_delete', 'tabz_cookies_audit',
  'tabz_emulate_device', 'tabz_emulate_clear', 'tabz_emulate_geolocation', 'tabz_emulate_network', 'tabz_emulate_media', 'tabz_emulate_vision',
  'tabz_notification_show', 'tabz_notification_update', 'tabz_notification_clear', 'tabz_notification_list',
  'tabz_list_profiles', 'tabz_list_categories', 'tabz_spawn_profile', 'tabz_get_profile', 'tabz_create_profile', 'tabz_update_profile', 'tabz_delete_profile',
  'tabz_list_plugins', 'tabz_list_skills', 'tabz_get_skill', 'tabz_plugins_health', 'tabz_toggle_plugin',
  'tabz_list_terminals', 'tabz_send_keys', 'tabz_capture_terminal'
];

/**
 * Merge a saved allowlist with the current catalog.
 *
 * knownTools is the catalog snapshot from the user's last save. A catalog id
 * absent from both enabledTools and knownTools is new and is enabled once. An
 * id present in knownTools but absent from enabledTools is explicitly disabled.
 */
function mergeKnownTools({ enabledTools = [], knownTools, newTools, catalogIds = [] }) {
  const legacy = !Array.isArray(knownTools);
  const catalogSet = new Set(catalogIds);
  const inCatalog = id => catalogIds.length === 0 || catalogSet.has(id);
  const rawKnown = legacy ? LEGACY_MCP_TOOL_IDS : unique(knownTools);
  const rawEnabled = unique(enabledTools);
  const retired = unique([...rawEnabled, ...rawKnown].filter(id => !inCatalog(id)));
  const known = rawKnown.filter(inCatalog);
  const knownSet = new Set(known);
  const enabled = rawEnabled.filter(inCatalog);
  const enabledSet = new Set(enabled);

  const discovered = catalogIds.filter(id => !enabledSet.has(id) && !knownSet.has(id));
  for (const id of discovered) {
    enabled.push(id);
    enabledSet.add(id);
  }

  const carried = Array.isArray(newTools)
    ? unique(newTools).filter(id => catalogIds.includes(id))
    : [];
  const flagged = unique([...carried, ...discovered]);
  const changed =
    legacy ||
    retired.length > 0 ||
    discovered.length > 0 ||
    carried.length !== (Array.isArray(newTools) ? newTools.length : 0);

  return {
    enabledTools: enabled,
    knownTools: catalogIds.length > 0 ? [...catalogIds] : known,
    newTools: flagged,
    discovered,
    retired,
    legacy,
    changed
  };
}

module.exports = { LEGACY_MCP_TOOL_IDS, mergeKnownTools, unique };
