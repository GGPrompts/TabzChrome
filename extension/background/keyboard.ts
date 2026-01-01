/**
 * Chrome Keyboard Shortcuts (Commands) integration
 * Handles keyboard shortcuts for terminal navigation
 */

import {
  connectedClients, broadcastToClients,
  setPendingPasteCommand, setPendingQueueCommand
} from './state'
import { tryOpenSidebar, spawnQuickTerminal } from './utils'

/**
 * Setup extension icon click handler
 */
export function setupActionHandler(): void {
  chrome.action.onClicked.addListener(async (tab) => {
    console.log('Extension icon clicked')

    if (tab.windowId) {
      try {
        await chrome.sidePanel.open({ windowId: tab.windowId })
      } catch {
        // Silently ignore - may fail if sidebar already open
      }
    }
  })
}

/**
 * Setup keyboard command handler
 */
export function setupKeyboardHandler(): void {
  chrome.commands.onCommand.addListener(async (command) => {
    console.log('Keyboard command:', command)

    // Note: _execute_action command automatically triggers chrome.action.onClicked
    // which opens the sidebar - no handler needed here for it

    // Handle spawn-quick-terminal - spawns a new popout terminal
    if (command === 'spawn-quick-terminal') {
      console.log('[Background] Spawn quick terminal shortcut triggered')
      const result = await spawnQuickTerminal()
      if (!result.success) {
        console.error('[Background] Failed to spawn quick terminal:', result.error)
      }
      return
    }

    // Handle new-tab
    if (command === 'new-tab') {
      console.log('[Background] New tab shortcut triggered')
      broadcastToClients({ type: 'KEYBOARD_NEW_TAB' })
      return
    }

    // Handle close-tab
    if (command === 'close-tab') {
      console.log('[Background] Close tab shortcut triggered')
      broadcastToClients({ type: 'KEYBOARD_CLOSE_TAB' })
      return
    }

    // Handle next-tab
    if (command === 'next-tab') {
      console.log('[Background] Next tab shortcut triggered')
      broadcastToClients({ type: 'KEYBOARD_NEXT_TAB' })
      return
    }

    // Handle prev-tab
    if (command === 'prev-tab') {
      console.log('[Background] Prev tab shortcut triggered')
      broadcastToClients({ type: 'KEYBOARD_PREV_TAB' })
      return
    }

    // Handle tab-1 through tab-9
    const tabMatch = command.match(/^tab-(\d)$/)
    if (tabMatch) {
      const tabIndex = parseInt(tabMatch[1]) - 1 // Convert to 0-based index
      console.log('[Background] Switch to tab shortcut:', tabIndex)
      broadcastToClients({ type: 'KEYBOARD_SWITCH_TAB', tabIndex })
      return
    }

    // Handle paste-selection - paste directly to active terminal
    if (command === 'paste-selection') {
      console.log('[Background] Paste selection shortcut triggered')
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })

        if (activeTab?.id) {
          const results = await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: () => window.getSelection()?.toString() || ''
          })

          const selectedText = results[0]?.result
          if (selectedText) {
            console.log('[Background] Pasting to terminal:', selectedText.substring(0, 50) + '...')

            // If sidebar is already open, broadcast immediately
            if (connectedClients.size > 0) {
              broadcastToClients({
                type: 'PASTE_COMMAND',
                command: selectedText,
              })
            } else {
              // Store for when sidebar connects, then try to open it
              setPendingPasteCommand(selectedText)
              await tryOpenSidebar()
            }
          } else {
            console.log('[Background] No text selected')
          }
        }
      } catch (err) {
        console.error('[Background] Failed to get selection:', err)
      }
      return
    }

    // Handle send-to-chat - queue to chat input bar for review
    if (command === 'send-to-chat') {
      console.log('[Background] Send to chat shortcut triggered')
      try {
        const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true })

        if (activeTab?.id) {
          const results = await chrome.scripting.executeScript({
            target: { tabId: activeTab.id },
            func: () => window.getSelection()?.toString() || ''
          })

          const selectedText = results[0]?.result
          if (selectedText) {
            console.log('[Background] Sending to chat:', selectedText.substring(0, 50) + '...')

            // If sidebar is already open, broadcast immediately
            if (connectedClients.size > 0) {
              broadcastToClients({
                type: 'QUEUE_COMMAND',
                command: selectedText,
              })
            } else {
              // Store for when sidebar connects, then try to open it
              setPendingQueueCommand(selectedText)
              await tryOpenSidebar()
            }
          } else {
            console.log('[Background] No text selected')
          }
        }
      } catch (err) {
        console.error('[Background] Failed to get selection:', err)
      }
      return
    }
  })
}
