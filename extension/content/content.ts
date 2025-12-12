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

// ============================================
// GitHub Floating Action Button (FAB)
// ============================================

// Track dismissed repos in this session
const dismissedRepos = new Set<string>()

// Check if we're on a repo page where FAB should show (root or code pages only)
function isGitHubRepoCodePage(): boolean {
  if (window.location.hostname !== 'github.com') return false

  const path = window.location.pathname

  // Match repo root: /user/repo (exactly 2 segments)
  const segments = path.split('/').filter(s => s.length > 0)
  if (segments.length === 2) return true

  // Match code browsing: /user/repo/tree/... or /user/repo/blob/...
  if (segments.length >= 3 && (segments[2] === 'tree' || segments[2] === 'blob')) {
    return true
  }

  return false
}

// Create and inject the GitHub FAB
function setupGitHubFAB() {
  const repo = detectGitHubRepo()
  if (!repo) return

  // Only show on repo root and code pages
  if (!isGitHubRepoCodePage()) return

  // Check if already dismissed this session
  if (dismissedRepos.has(repo.fullName)) return

  // Check if FAB already exists
  if (document.getElementById('tabz-github-fab')) return

  // Create FAB container
  const fab = document.createElement('div')
  fab.id = 'tabz-github-fab'
  fab.innerHTML = `
    <div class="tabz-fab-content">
      <button class="tabz-fab-close" title="Dismiss">×</button>
      <div class="tabz-fab-repo">${repo.repo}</div>
      <div class="tabz-fab-actions">
        <button class="tabz-fab-btn tabz-fab-clone" title="Clone to terminal">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8ZM5 12.25a.25.25 0 0 1 .25-.25h3.5a.25.25 0 0 1 .25.25v3.25a.25.25 0 0 1-.4.2l-1.45-1.087a.249.249 0 0 0-.3 0L5.4 15.7a.25.25 0 0 1-.4-.2Z"/>
          </svg>
          Clone
        </button>
        <button class="tabz-fab-btn tabz-fab-fork" title="Fork repository">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M5 5.372v.878c0 .414.336.75.75.75h4.5a.75.75 0 0 0 .75-.75v-.878a2.25 2.25 0 1 1 1.5 0v.878a2.25 2.25 0 0 1-2.25 2.25h-1.5v2.128a2.251 2.251 0 1 1-1.5 0V8.5h-1.5A2.25 2.25 0 0 1 3.5 6.25v-.878a2.25 2.25 0 1 1 1.5 0ZM5 3.25a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Zm6.75.75a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm-3 8.75a.75.75 0 1 0-1.5 0 .75.75 0 0 0 1.5 0Z"/>
          </svg>
          Fork
        </button>
      </div>
    </div>
  `

  // Apply styles
  const styles = `
    #tabz-github-fab {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
    }

    .tabz-fab-content {
      background: rgba(30, 30, 30, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 12px 16px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
      display: flex;
      flex-direction: column;
      gap: 8px;
      min-width: 160px;
      position: relative;
    }

    .tabz-fab-close {
      position: absolute;
      top: 4px;
      right: 8px;
      background: none;
      border: none;
      color: rgba(255, 255, 255, 0.5);
      font-size: 18px;
      cursor: pointer;
      padding: 0;
      width: 20px;
      height: 20px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 4px;
      transition: all 0.15s ease;
    }

    .tabz-fab-close:hover {
      color: rgba(255, 255, 255, 0.9);
      background: rgba(255, 255, 255, 0.1);
    }

    .tabz-fab-repo {
      color: #fff;
      font-size: 13px;
      font-weight: 600;
      padding-right: 20px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 200px;
    }

    .tabz-fab-actions {
      display: flex;
      gap: 8px;
    }

    .tabz-fab-btn {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      padding: 8px 12px;
      border: none;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .tabz-fab-clone {
      background: linear-gradient(135deg, #238636, #2ea043);
      color: #fff;
    }

    .tabz-fab-clone:hover {
      background: linear-gradient(135deg, #2ea043, #3fb950);
      transform: translateY(-1px);
    }

    .tabz-fab-fork {
      background: rgba(255, 255, 255, 0.1);
      color: #fff;
      border: 1px solid rgba(255, 255, 255, 0.2);
    }

    .tabz-fab-fork:hover {
      background: rgba(255, 255, 255, 0.15);
      border-color: rgba(255, 255, 255, 0.3);
      transform: translateY(-1px);
    }

    .tabz-fab-btn:active {
      transform: translateY(0);
    }
  `

  // Inject styles
  const styleEl = document.createElement('style')
  styleEl.id = 'tabz-github-fab-styles'
  styleEl.textContent = styles
  document.head.appendChild(styleEl)

  // Inject FAB
  document.body.appendChild(fab)

  // Wire up event handlers
  const closeBtn = fab.querySelector('.tabz-fab-close') as HTMLButtonElement
  const cloneBtn = fab.querySelector('.tabz-fab-clone') as HTMLButtonElement
  const forkBtn = fab.querySelector('.tabz-fab-fork') as HTMLButtonElement

  closeBtn.addEventListener('click', () => {
    dismissedRepos.add(repo.fullName)
    fab.remove()
    styleEl.remove()
  })

  cloneBtn.addEventListener('click', () => {
    const command = `git clone https://github.com/${repo.fullName}.git && cd ${repo.repo}`
    chrome.runtime.sendMessage({
      type: 'QUEUE_COMMAND',
      command,
    })

    // Visual feedback
    const originalText = cloneBtn.innerHTML
    cloneBtn.innerHTML = '✓ Queued!'
    cloneBtn.style.background = '#238636'
    setTimeout(() => {
      cloneBtn.innerHTML = originalText
      cloneBtn.style.background = ''
    }, 1500)
  })

  forkBtn.addEventListener('click', () => {
    chrome.runtime.sendMessage({
      type: 'OPEN_TAB',
      url: `https://github.com/${repo.fullName}/fork`,
    })
  })
}

// Remove FAB if navigating away from code pages
function cleanupGitHubFAB() {
  if (!isGitHubRepoCodePage()) {
    const fab = document.getElementById('tabz-github-fab')
    const styles = document.getElementById('tabz-github-fab-styles')
    if (fab) fab.remove()
    if (styles) styles.remove()
  }
}

// Initialize content script
function init() {
  setupConsoleCapture()  // Browser MCP - capture console logs
  setupContextMenus()
  setupErrorMonitoring()
  detectCustomCommands()  // Custom data-terminal-command elements
  setupKeyboardShortcuts()
  setupGitHubFAB()  // GitHub repo FAB

  // Re-detect custom command elements when DOM changes
  const observer = new MutationObserver(() => {
    detectCustomCommands()
    // Re-check FAB on navigation (GitHub uses client-side routing)
    cleanupGitHubFAB()
    setupGitHubFAB()
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
