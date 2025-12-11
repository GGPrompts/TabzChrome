// Content script - Runs on all web pages
// Provides page-specific integrations (GitHub, error detection, etc.)

console.log('Terminal Tabs content script loaded')

// Detect GitHub repository pages
function detectGitHubRepo() {
  if (window.location.hostname !== 'github.com') return null

  const repoMatch = window.location.pathname.match(/^\/([^/]+)\/([^/]+)/)
  if (repoMatch) {
    const [, owner, repo] = repoMatch
    // Remove .git suffix if present
    const repoName = repo.replace(/\.git$/, '')
    return { owner, repo: repoName, fullName: `${owner}/${repoName}` }
  }

  return null
}

// Detect GitLab repository pages
function detectGitLabRepo() {
  if (window.location.hostname !== 'gitlab.com') return null

  const repoMatch = window.location.pathname.match(/^\/([^/]+)\/([^/]+)/)
  if (repoMatch) {
    const [, owner, repo] = repoMatch
    const repoName = repo.replace(/\.git$/, '')
    return { owner, repo: repoName, fullName: `${owner}/${repoName}` }
  }

  return null
}

// Add custom context menu items based on page content
function setupContextMenus() {
  const githubRepo = detectGitHubRepo()
  const gitlabRepo = detectGitLabRepo()

  if (githubRepo) {
    console.log('GitHub repo detected:', githubRepo.fullName)

    // Add clone action to context menu
    document.addEventListener('contextmenu', (e) => {
      chrome.runtime.sendMessage({
        type: 'ADD_CONTEXT_MENU',
        items: [
          {
            id: 'clone-github-repo',
            title: `Clone ${githubRepo.fullName}`,
            action: () => {
              chrome.runtime.sendMessage({
                type: 'SPAWN_TERMINAL',
                command: `git clone https://github.com/${githubRepo.fullName}.git`,
                cwd: '~/projects',
              })
            },
          },
        ],
      })
    })
  }

  if (gitlabRepo) {
    console.log('GitLab repo detected:', gitlabRepo.fullName)

    document.addEventListener('contextmenu', (e) => {
      chrome.runtime.sendMessage({
        type: 'ADD_CONTEXT_MENU',
        items: [
          {
            id: 'clone-gitlab-repo',
            title: `Clone ${gitlabRepo.fullName}`,
            action: () => {
              chrome.runtime.sendMessage({
                type: 'SPAWN_TERMINAL',
                command: `git clone https://gitlab.com/${gitlabRepo.fullName}.git`,
                cwd: '~/projects',
              })
            },
          },
        ],
      })
    })
  }
}

// Error patterns to detect and suggest fixes
const errorPatterns = [
  {
    pattern: /command not found: (.+)/,
    getSuggestion: (match: RegExpMatchArray) => {
      const cmd = match[1]
      return `Install ${cmd} using: sudo apt install ${cmd} or brew install ${cmd}`
    },
  },
  {
    pattern: /npm ERR! (.+)/,
    getSuggestion: () => 'Try: npm install or npm cache clean --force',
  },
  {
    pattern: /yarn error (.+)/,
    getSuggestion: () => 'Try: yarn install or rm -rf node_modules && yarn',
  },
  {
    pattern: /Permission denied/,
    getSuggestion: () => 'Try running with sudo or check file permissions',
  },
  {
    pattern: /ENOENT: no such file or directory/,
    getSuggestion: (match: RegExpMatchArray) => 'File or directory not found - check the path',
  },
  {
    pattern: /Port \d+ is already in use/,
    getSuggestion: (match: RegExpMatchArray) => {
      const portMatch = match[0].match(/Port (\d+)/)
      if (portMatch) {
        const port = portMatch[1]
        return `Port ${port} in use. Find process: lsof -ti:${port} | xargs kill -9`
      }
      return 'Port already in use - kill the process using it'
    },
  },
]

// ============================================
// BROWSER MCP - Console Log Capture
// ============================================

// Capture all console methods and forward to background worker
function setupConsoleCapture() {
  const consoleMethods = ['log', 'info', 'warn', 'error', 'debug'] as const

  for (const level of consoleMethods) {
    const originalMethod = console[level]

    console[level] = (...args: unknown[]) => {
      // Call original method first
      originalMethod.apply(console, args)

      // Format message for capture
      const message = args.map(arg => {
        if (typeof arg === 'string') return arg
        if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack || ''}`
        try {
          return JSON.stringify(arg, null, 2)
        } catch {
          return String(arg)
        }
      }).join(' ')

      // Get stack trace for errors
      let stack: string | undefined
      if (level === 'error') {
        const err = args.find(arg => arg instanceof Error) as Error | undefined
        stack = err?.stack || new Error().stack
      }

      // Send to background worker (fire and forget)
      try {
        chrome.runtime.sendMessage({
          type: 'CONSOLE_LOG',
          entry: {
            level,
            message,
            timestamp: Date.now(),
            url: window.location.href,
            tabId: -1, // Will be filled in by background worker
            stack,
          }
        }).catch(() => {
          // Ignore errors - background may not be ready
        })
      } catch {
        // Ignore - extension context may be invalid
      }
    }
  }
}

// Monitor console errors for pattern-based suggestions
function setupErrorMonitoring() {
  const originalConsoleError = console.error
  console.error = (...args: unknown[]) => {
    originalConsoleError.apply(console, args)

    const errorText = args.map(arg =>
      typeof arg === 'string' ? arg : JSON.stringify(arg)
    ).join(' ')

    // Check against error patterns
    for (const { pattern, getSuggestion } of errorPatterns) {
      const match = errorText.match(pattern)
      if (match) {
        const suggestion = getSuggestion(match)

        // Send error suggestion to extension
        chrome.runtime.sendMessage({
          type: 'SHOW_ERROR_SUGGESTION',
          error: match[0],
          suggestion,
        }).catch(() => {})

        break
      }
    }
  }
}

// Detect elements with data-terminal-command attribute
// Allows custom pages to define clickable elements that run commands
// Usage: <button data-terminal-command="npm run dev">Start Dev</button>
function detectCustomCommands() {
  const elements = document.querySelectorAll('[data-terminal-command]')

  elements.forEach(element => {
    // Skip if already processed
    if (element.hasAttribute('data-terminal-command-attached')) return

    const command = element.getAttribute('data-terminal-command')
    if (!command) return

    // Mark as processed
    element.setAttribute('data-terminal-command-attached', 'true')

    // Add visual indicator (optional play icon)
    const htmlElement = element as HTMLElement
    const originalCursor = htmlElement.style.cursor
    htmlElement.style.cursor = 'pointer'

    // Add click handler
    element.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()

      // Queue command to chat input
      chrome.runtime.sendMessage({
        type: 'QUEUE_COMMAND',
        command: command.trim(),
      })

      // Visual feedback
      const original = htmlElement.textContent
      const originalBg = htmlElement.style.backgroundColor
      htmlElement.style.backgroundColor = '#4CAF50'
      htmlElement.textContent = '✓ Queued!'

      setTimeout(() => {
        htmlElement.textContent = original
        htmlElement.style.backgroundColor = originalBg
      }, 1000)
    })

    // Add hover effect
    element.addEventListener('mouseenter', () => {
      htmlElement.style.opacity = '0.8'
    })
    element.addEventListener('mouseleave', () => {
      htmlElement.style.opacity = '1'
    })
  })
}


// Setup keyboard shortcut listener (Cmd/Ctrl+K to open popup)
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Cmd+K (Mac) or Ctrl+K (Windows/Linux)
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault()
      chrome.runtime.sendMessage({ type: 'OPEN_POPUP' })
    }
  })
}

// Initialize content script
function init() {
  setupConsoleCapture()  // Browser MCP - capture console logs
  setupContextMenus()
  setupErrorMonitoring()
  detectCustomCommands()  // Custom data-terminal-command elements
  setupKeyboardShortcuts()

  // Re-detect custom command elements when DOM changes
  const observer = new MutationObserver(() => {
    detectCustomCommands()
  })

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  })

  console.log('✅ Terminal Tabs content script initialized')
}

// Run initialization when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init)
} else {
  init()
}
