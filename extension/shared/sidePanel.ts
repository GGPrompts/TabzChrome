/**
 * Let Chrome own toolbar-click side panel toggling.
 *
 * `openPanelOnActionClick` is supported by the extension's Chrome 116 minimum
 * and avoids maintaining a second, potentially stale panel-open state.
 */
export async function configureSidePanelActionToggle(): Promise<boolean> {
  if (typeof chrome?.sidePanel?.setPanelBehavior !== 'function') {
    console.warn('[SidePanel] Toolbar toggle is unavailable in this Chrome version')
    return false
  }

  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    return true
  } catch (error) {
    console.warn('[SidePanel] Could not configure toolbar toggle:', error)
    return false
  }
}
