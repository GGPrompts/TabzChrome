/**
 * Chrome Context Menu integration
 * Right-click menu items for terminal integration
 */

import {
  connectedClients, broadcastToClients,
  pendingPasteCommand, pendingQueueCommand,
  setPendingPasteCommand, setPendingQueueCommand
} from './state'
import { getValidWindowId, windowsToWslPath, spawnQuickTerminal } from './utils'

/**
 * Context menu registration helper
 */
export function setupContextMenus(): void {
  console.log('Setting up context menus...')

  // Remove all existing menus first (in case of reload)
  chrome.contextMenus.removeAll(() => {
    // Check for errors after removing
    if (chrome.runtime.lastError) {
      console.error('Error removing context menus:', chrome.runtime.lastError.message)
    }

    // Simple context menu: open side panel
    chrome.contextMenus.create({
      id: 'open-sidepanel',
      title: 'Open Terminal Sidebar',
      contexts: ['all'],
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error creating open-sidepanel menu:', chrome.runtime.lastError.message)
      } else {
        console.log('Open sidebar menu created')
      }
    })

    // Context menu for selected text - paste directly into terminal
    chrome.contextMenus.create({
      id: 'paste-to-terminal',
      title: 'Paste "%s" to Terminal',
      contexts: ['selection'],
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error creating paste-to-terminal menu:', chrome.runtime.lastError.message)
      }
    })

    // Context menu for selected text - queue to chat input
    chrome.contextMenus.create({
      id: 'send-to-chat',
      title: 'Send "%s" to Chat',
      contexts: ['selection'],
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error creating send-to-chat menu:', chrome.runtime.lastError.message)
      }
    })

    // Context menu for selected text - read aloud using TTS
    chrome.contextMenus.create({
      id: 'read-aloud',
      title: 'Read "%s" Aloud',
      contexts: ['selection'],
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error creating read-aloud menu:', chrome.runtime.lastError.message)
      }
    })

    // Context menu for any element - send element info to chat
    chrome.contextMenus.create({
      id: 'send-element-to-chat',
      title: 'Send Element to Chat',
      contexts: ['all'],
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error creating send-element-to-chat menu:', chrome.runtime.lastError.message)
      }
    })

    // Context menu for page - save as MHTML
    chrome.contextMenus.create({
      id: 'save-page-mhtml',
      title: 'Save Page as MHTML',
      contexts: ['page'],
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error creating save-page-mhtml menu:', chrome.runtime.lastError.message)
      }
    })

    // Context menu for spawning a quick popout terminal
    chrome.contextMenus.create({
      id: 'spawn-quick-terminal',
      title: 'Spawn Quick Terminal',
      contexts: ['all'],
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error creating spawn-quick-terminal menu:', chrome.runtime.lastError.message)
      }
    })

    console.log('Context menus setup complete')
  })
}

/**
 * Setup context menu click handler
 */
export function setupContextMenuListener(): void {
  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    console.log('Context menu clicked:', info.menuItemId)

    const menuId = info.menuItemId as string

    // Handle both old 'toggle-sidepanel' and new 'open-sidepanel' menu IDs
    if (menuId === 'open-sidepanel' || menuId === 'toggle-sidepanel') {
      // CRITICAL: Must call sidePanel.open() synchronously - any await breaks user gesture chain
      const windowId = tab?.windowId && tab.windowId > 0 ? tab.windowId : undefined
      if (windowId) {
        chrome.sidePanel.open({ windowId }).catch(err => {
          console.warn('[Background] Sidebar open failed:', err)
        })
      } else {
        console.warn('[Background] No valid windowId from tab, cannot open sidebar')
      }
      return
    }

    if (menuId === 'paste-to-terminal' && info.selectionText) {
      // Paste directly into active terminal
      const selectedText = info.selectionText
      console.log('Pasting to terminal:', selectedText.substring(0, 50) + '...')

      // If sidebar is already open (has connected clients), broadcast immediately
      if (connectedClients.size > 0) {
        broadcastToClients({
          type: 'PASTE_COMMAND',
          command: selectedText,
        })
      } else {
        // Store for when sidebar connects, then try to open it
        setPendingPasteCommand(selectedText)
        try {
          const windowId = await getValidWindowId(tab)
          if (windowId) {
            await chrome.sidePanel.open({ windowId })
          }
        } catch (err) {
          console.debug('[Background] Could not open sidebar:', err)
        }
      }
    }

    if (menuId === 'send-to-chat' && info.selectionText) {
      // Queue to chat input bar
      const selectedText = info.selectionText
      console.log('Sending to chat:', selectedText.substring(0, 50) + '...')

      if (connectedClients.size > 0) {
        broadcastToClients({
          type: 'QUEUE_COMMAND',
          command: selectedText,
        })
      } else {
        setPendingQueueCommand(selectedText)
        try {
          const windowId = await getValidWindowId(tab)
          if (windowId) {
            await chrome.sidePanel.open({ windowId })
          }
        } catch (err) {
          console.debug('[Background] Could not open sidebar:', err)
        }
      }
    }

    // Send element info to chat for browser automation workflows
    if (menuId === 'send-element-to-chat' && tab?.id) {
      try {
        // Get element info from content script
        const response = await chrome.tabs.sendMessage(tab.id, { type: 'GET_CONTEXT_ELEMENT' })

        if (response) {
          // Format element info as code block
          const lines = ['```']
          lines.push(`Element: <${response.tag}>`)
          lines.push(`Selector: ${response.selector}`)
          if (response.id) lines.push(`ID: #${response.id}`)
          if (response.classes?.length) lines.push(`Classes: .${response.classes.join(', .')}`)
          if (response.text) lines.push(`Text: "${response.text}"`)
          // Add useful attributes
          if (response.attributes?.['data-testid']) lines.push(`data-testid: ${response.attributes['data-testid']}`)
          if (response.attributes?.['aria-label']) lines.push(`aria-label: ${response.attributes['aria-label']}`)
          if (response.attributes?.role) lines.push(`role: ${response.attributes.role}`)
          if (response.attributes?.href) lines.push(`href: ${response.attributes.href}`)
          if (response.attributes?.type) lines.push(`type: ${response.attributes.type}`)
          if (response.attributes?.name) lines.push(`name: ${response.attributes.name}`)
          if (response.attributes?.placeholder) lines.push(`placeholder: ${response.attributes.placeholder}`)
          lines.push('```')

          const formatted = lines.join('\n')
          console.log('Sending element to chat:', response.selector)

          if (connectedClients.size > 0) {
            broadcastToClients({
              type: 'QUEUE_COMMAND',
              command: formatted,
            })
          } else {
            setPendingQueueCommand(formatted)
            try {
              const windowId = await getValidWindowId(tab)
              if (windowId) {
                await chrome.sidePanel.open({ windowId })
              }
            } catch (err) {
              console.debug('[Background] Could not open sidebar:', err)
            }
          }
        }
      } catch (err) {
        console.error('Error getting element info:', err)
      }
    }

    if (menuId === 'read-aloud' && info.selectionText) {
      // Read selected text aloud using TTS
      const selectedText = info.selectionText
      console.log('Reading aloud:', selectedText.substring(0, 50) + '...')

      try {
        // Load audio settings from Chrome storage
        const result = await chrome.storage.local.get(['audioSettings'])
        const audioSettings = (result.audioSettings || {}) as {
          voice?: string
          rate?: string
          pitch?: string
          volume?: number
          contentReading?: { useGlobal: boolean; voice?: string; rate?: string; pitch?: string }
        }

        // Handle random voice selection
        const TTS_VOICE_VALUES = [
          'en-US-AndrewNeural', 'en-US-EmmaNeural', 'en-US-BrianNeural',
          'en-US-AriaNeural', 'en-US-GuyNeural', 'en-US-JennyNeural', 'en-US-ChristopherNeural', 'en-US-AvaNeural',
          'en-GB-SoniaNeural', 'en-GB-RyanNeural', 'en-AU-NatashaNeural', 'en-AU-WilliamNeural'
        ]

        // Check if contentReading has custom settings
        const useContentReading = audioSettings.contentReading && !audioSettings.contentReading.useGlobal

        let voice = useContentReading && audioSettings.contentReading?.voice
          ? audioSettings.contentReading.voice
          : (audioSettings.voice || 'en-US-AndrewNeural')
        if (voice === 'random') {
          voice = TTS_VOICE_VALUES[Math.floor(Math.random() * TTS_VOICE_VALUES.length)]
        }

        const rate = useContentReading && audioSettings.contentReading?.rate
          ? audioSettings.contentReading.rate
          : (audioSettings.rate || '+0%')
        const pitch = useContentReading && audioSettings.contentReading?.pitch
          ? audioSettings.contentReading.pitch
          : (audioSettings.pitch || '+0Hz')

        const response = await fetch('http://localhost:8129/api/audio/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: selectedText,
            voice,
            rate,
            pitch,
            volume: audioSettings.volume ?? 0.7
          })
        })
        const data = await response.json()
        if (!data.success) {
          console.error('TTS failed:', data.error)
        }
      } catch (err) {
        console.error('Failed to call TTS endpoint:', err)
      }
    }

    if (menuId === 'spawn-quick-terminal') {
      console.log('[Background] Spawn quick terminal from context menu')
      const result = await spawnQuickTerminal()
      if (!result.success) {
        console.error('[Background] Failed to spawn quick terminal:', result.error)
      }
      return
    }

    if (menuId === 'save-page-mhtml' && tab?.id) {
      // Save page as MHTML directly (no MCP/WebSocket needed)
      console.log('Saving page as MHTML:', tab.title)

      try {
        // Check if tab URL is capturable
        if (tab.url?.startsWith('chrome://') || tab.url?.startsWith('chrome-extension://')) {
          console.error('Cannot save chrome:// or extension pages')
          return
        }

        // Capture the page as MHTML
        const mhtmlBlob = await new Promise<Blob>((resolve, reject) => {
          chrome.pageCapture.saveAsMHTML({ tabId: tab.id! }, (blob) => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message))
            } else if (!blob) {
              reject(new Error('Failed to capture page'))
            } else {
              resolve(blob)
            }
          })
        })

        // Generate filename from page title
        const pageTitle = tab.title || 'page'
        const sanitizedTitle = pageTitle.replace(/[<>:"/\\|?*]/g, '-').substring(0, 100)
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19)
        const filename = `${sanitizedTitle}-${timestamp}.mhtml`

        // Convert blob to data URL (service workers don't support URL.createObjectURL)
        const arrayBuffer = await mhtmlBlob.arrayBuffer()
        const uint8Array = new Uint8Array(arrayBuffer)
        let binary = ''
        for (let i = 0; i < uint8Array.length; i++) {
          binary += String.fromCharCode(uint8Array[i])
        }
        const base64 = btoa(binary)
        const dataUrl = `data:multipart/related;base64,${base64}`

        // Download the file
        chrome.downloads.download({
          url: dataUrl,
          filename: filename,
          conflictAction: 'uniquify'
        }, (downloadId) => {
          if (chrome.runtime.lastError) {
            console.error('Download failed:', chrome.runtime.lastError.message)
          } else {
            console.log('Page saved, download ID:', downloadId)
          }
        })
      } catch (err) {
        console.error('Failed to save page:', err)
      }
    }
  })
}
