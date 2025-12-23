/**
 * Chrome Omnibox API integration
 * Provides address bar commands for quick terminal access
 */

import { broadcastToClients } from './state'

// Allowed URL patterns for omnibox navigation (path is optional)
const ALLOWED_URL_PATTERNS = [
  /^https?:\/\/(www\.)?github\.com(\/.*)?$/i,
  /^https?:\/\/(www\.)?gitlab\.com(\/.*)?$/i,
  /^https?:\/\/localhost(:\d+)?(\/.*)?$/i,
  /^https?:\/\/127\.0\.0\.1(:\d+)?(\/.*)?$/i,
  /^https?:\/\/[\w-]+\.vercel\.app(\/.*)?$/i,  // Vercel preview/production
  /^https?:\/\/[\w.-]+\.vercel\.com(\/.*)?$/i, // Vercel alternative domain
]

/**
 * Check if text looks like a URL and is allowed
 */
function isAllowedUrl(text: string): { allowed: boolean; url?: string } {
  let url = text.trim()

  // Add https:// if no protocol specified
  if (!url.match(/^https?:\/\//i)) {
    // Check if it looks like a domain (with or without www.)
    if (url.match(/^(www\.)?(github\.com|gitlab\.com|localhost|127\.0\.0\.1)/i)) {
      url = `https://${url}`
    }
    // Check for Vercel domains (e.g., my-app.vercel.app)
    else if (url.match(/^[\w-]+\.vercel\.(app|com)/i)) {
      url = `https://${url}`
    } else {
      return { allowed: false }
    }
  }

  // Check against allowed patterns
  for (const pattern of ALLOWED_URL_PATTERNS) {
    if (pattern.test(url)) {
      return { allowed: true, url }
    }
  }

  return { allowed: false }
}

/**
 * Setup omnibox integration
 */
export function setupOmnibox(): void {
  // Set default suggestion when user types "term "
  chrome.omnibox.setDefaultSuggestion({
    description: 'Run command in terminal: <match>%s</match> (or type "profile:name", "new", "help", or a URL)'
  })

  // Provide suggestions as user types
  chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
    const suggestions: chrome.omnibox.SuggestResult[] = []
    const lowerText = text.toLowerCase().trim()

    // Check if input looks like a URL
    const urlCheck = isAllowedUrl(text)
    if (urlCheck.allowed && urlCheck.url) {
      suggestions.push({
        content: `url:${urlCheck.url}`,
        description: `<match>Open URL:</match> ${urlCheck.url} <dim>(in new tab)</dim>`
      })
    }

    // Profile suggestions - show when typing "p", "pr", "profile:", or any profile name
    try {
      const result = await chrome.storage.local.get(['profiles', 'globalWorkingDir'])
      const profiles = (result.profiles || []) as Array<{ id: string; name: string; workingDir?: string }>
      const globalWorkingDir = (result.globalWorkingDir as string) || '~'

      // Extract search term: either after "profile:" or the raw input
      const profileSearch = lowerText.startsWith('profile:')
        ? lowerText.substring(8).trim()
        : lowerText

      // Filter profiles by name match (or show all if just "p"/"pr"/"profile:")
      const showAll = lowerText === 'p' || lowerText === 'pr' || lowerText === 'profile:'
      const matchingProfiles = profiles.filter(profile =>
        showAll || profile.name.toLowerCase().includes(profileSearch)
      )

      for (const profile of matchingProfiles) {
        const displayDir = profile.workingDir || globalWorkingDir
        // Escape XML special chars for omnibox description
        const escapeXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        suggestions.push({
          content: `profile:${profile.id}`,
          description: `<match>Profile:</match> ${escapeXml(profile.name)} <dim>(${escapeXml(displayDir)})</dim>`
        })
      }
    } catch (err) {
      console.error('Failed to get profiles for omnibox:', err)
    }

    // Built-in commands
    if ('new'.startsWith(lowerText) || lowerText === '') {
      suggestions.push({
        content: 'new',
        description: '<match>new</match> - Open new terminal with default profile'
      })
    }

    if ('help'.startsWith(lowerText)) {
      suggestions.push({
        content: 'help',
        description: '<match>help</match> - Show available commands'
      })
    }

    // Common commands suggestions
    const commonCommands = [
      { cmd: 'git status', desc: 'Check git repository status' },
      { cmd: 'git pull', desc: 'Pull latest changes' },
      { cmd: 'npm install', desc: 'Install npm dependencies' },
      { cmd: 'npm run dev', desc: 'Start development server' },
      { cmd: 'docker ps', desc: 'List running containers' },
    ]

    for (const { cmd, desc } of commonCommands) {
      if (cmd.toLowerCase().includes(lowerText) && lowerText.length > 1) {
        suggestions.push({
          content: cmd,
          description: `<match>${cmd}</match> <dim>- ${desc}</dim>`
        })
      }
    }

    suggest(suggestions.slice(0, 5)) // Max 5 suggestions
  })

  // Handle command execution when user presses Enter
  chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
    console.log('Omnibox command:', text, 'disposition:', disposition)

    const lowerText = text.toLowerCase().trim()

    // Handle URL opening (url:https://... format from suggestions)
    if (text.startsWith('url:')) {
      const url = text.substring(4)
      console.log('Opening URL from omnibox:', url)

      // Respect the disposition (currentTab, newForegroundTab, newBackgroundTab)
      if (disposition === 'currentTab') {
        chrome.tabs.update({ url })
      } else {
        chrome.tabs.create({
          url,
          active: disposition === 'newForegroundTab'
        })
      }
      return
    }

    // Check if direct URL input (without url: prefix)
    const urlCheck = isAllowedUrl(text)
    if (urlCheck.allowed && urlCheck.url) {
      console.log('Opening URL from omnibox (direct):', urlCheck.url)

      if (disposition === 'currentTab') {
        chrome.tabs.update({ url: urlCheck.url })
      } else {
        chrome.tabs.create({
          url: urlCheck.url,
          active: disposition === 'newForegroundTab'
        })
      }
      return
    }

    // Get current window for opening sidebar (for terminal commands)
    const windows = await chrome.windows.getAll({ windowTypes: ['normal'] })
    const currentWindow = windows.find(w => w.focused) || windows[0]

    // Try to open sidebar - may fail if Chrome doesn't consider omnibox a "user gesture"
    if (currentWindow?.id) {
      try {
        await chrome.sidePanel.open({ windowId: currentWindow.id })
      } catch {
        // Chrome sometimes rejects sidePanel.open() from omnibox as "not a user gesture"
        // This is fine - the terminal spawns anyway, user can click extension icon to see it
      }
    }

    // Handle special commands
    if (lowerText === 'new') {
      // Spawn new terminal with default profile
      broadcastToClients({ type: 'KEYBOARD_NEW_TAB' })
      return
    }

    if (lowerText === 'help') {
      // Show help notification
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon128.png',
        title: 'Terminal Tabs - Omnibox Commands',
        message: 'Commands: "new" (new tab), "profile:name" (spawn profile), GitHub/GitLab URLs (open in new tab), or type any bash command to run it.',
        priority: 1
      })
      return
    }

    // Handle profile:name
    if (lowerText.startsWith('profile:')) {
      const profileId = text.substring(8).trim()
      try {
        const result = await chrome.storage.local.get(['profiles'])
        const profiles = (result.profiles || []) as Array<{ id: string; name: string; workingDir?: string }>
        const profile = profiles.find((p) => p.id === profileId || p.name.toLowerCase() === profileId.toLowerCase())

        if (profile) {
          // Small delay to let sidebar open
          setTimeout(() => {
            broadcastToClients({
              type: 'OMNIBOX_SPAWN_PROFILE',
              profile: profile
            } as any)
          }, 300)
        } else {
          chrome.notifications.create({
            type: 'basic',
            iconUrl: 'icons/icon128.png',
            title: 'Profile Not Found',
            message: `No profile found with name or ID: ${profileId}`,
            priority: 1
          })
        }
      } catch (err) {
        console.error('Failed to spawn profile from omnibox:', err)
      }
      return
    }

    // Otherwise, treat as a command to run in a new terminal
    // Small delay to let sidebar open
    setTimeout(() => {
      broadcastToClients({
        type: 'OMNIBOX_RUN_COMMAND',
        command: text
      } as any)
    }, 300)
  })
}
