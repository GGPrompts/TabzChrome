// Content script - Runs on all web pages
// Provides page-specific integrations (GitHub, error detection, etc.)

// Guard for extension context validity
function isExtensionValid(): boolean {
  return !!(chrome.runtime?.id)
}

// ============================================
// Element Capture for "Send Element to Chat"
// ============================================

// Track the element that was right-clicked
let lastContextMenuTarget: Element | null = null

// ============================================
// MCP Tool Visual Feedback - Element Highlighting
// ============================================

// Inject highlight styles once
let highlightStylesInjected = false

function injectHighlightStyles() {
  if (highlightStylesInjected) return
  highlightStylesInjected = true

  const style = document.createElement('style')
  style.id = 'tabz-highlight-styles'
  style.textContent = `
    @keyframes tabz-glow-pulse {
      0%, 100% {
        box-shadow: 0 0 8px 2px rgba(139, 92, 246, 0.6),
                    0 0 16px 4px rgba(139, 92, 246, 0.4),
                    inset 0 0 4px rgba(139, 92, 246, 0.2);
      }
      50% {
        box-shadow: 0 0 12px 4px rgba(139, 92, 246, 0.8),
                    0 0 24px 8px rgba(139, 92, 246, 0.5),
                    inset 0 0 8px rgba(139, 92, 246, 0.3);
      }
    }

    .tabz-highlight {
      outline: 2px solid rgba(139, 92, 246, 0.9) !important;
      outline-offset: 2px !important;
      animation: tabz-glow-pulse 0.8s ease-in-out 2 !important;
      transition: outline 0.2s ease-out !important;
    }

    .tabz-highlight-click {
      outline-color: rgba(34, 197, 94, 0.9) !important;
      animation-name: tabz-glow-click !important;
    }

    @keyframes tabz-glow-click {
      0%, 100% {
        box-shadow: 0 0 8px 2px rgba(34, 197, 94, 0.6),
                    0 0 16px 4px rgba(34, 197, 94, 0.4);
      }
      50% {
        box-shadow: 0 0 12px 4px rgba(34, 197, 94, 0.8),
                    0 0 24px 8px rgba(34, 197, 94, 0.5);
      }
    }

    .tabz-highlight-fill {
      outline-color: rgba(59, 130, 246, 0.9) !important;
      animation-name: tabz-glow-fill !important;
    }

    @keyframes tabz-glow-fill {
      0%, 100% {
        box-shadow: 0 0 8px 2px rgba(59, 130, 246, 0.6),
                    0 0 16px 4px rgba(59, 130, 246, 0.4);
      }
      50% {
        box-shadow: 0 0 12px 4px rgba(59, 130, 246, 0.8),
                    0 0 24px 8px rgba(59, 130, 246, 0.5);
      }
    }
  `
  document.head.appendChild(style)
}

// Highlight an element with a glowing effect
function highlightElement(selector: string, type: 'inspect' | 'click' | 'fill' = 'inspect', duration = 1600) {
  injectHighlightStyles()

  const el = document.querySelector(selector)
  if (!el) return false

  // Remove any existing highlight
  document.querySelectorAll('.tabz-highlight').forEach(e => {
    e.classList.remove('tabz-highlight', 'tabz-highlight-click', 'tabz-highlight-fill')
  })

  // Add highlight class
  el.classList.add('tabz-highlight')
  if (type === 'click') el.classList.add('tabz-highlight-click')
  if (type === 'fill') el.classList.add('tabz-highlight-fill')

  // Scroll into view smoothly
  el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })

  // Remove after duration
  setTimeout(() => {
    el.classList.remove('tabz-highlight', 'tabz-highlight-click', 'tabz-highlight-fill')
  }, duration)

  return true
}

document.addEventListener("contextmenu", (e) => {
  lastContextMenuTarget = e.target as Element
})

// Generate a unique CSS selector for an element
function generateUniqueSelector(el: Element): string {
  // If element has an ID, use it
  if (el.id) return `#${el.id}`

  const path: string[] = []
  let current: Element | null = el

  while (current && current !== document.body) {
    let selector = current.tagName.toLowerCase()

    // If we find an ID, prepend and stop
    if (current.id) {
      selector = `#${current.id}`
      path.unshift(selector)
      break
    }

    // Add meaningful classes (skip dynamic/generated ones)
    if (current.className && typeof current.className === "string") {
      const classes = current.className
        .trim()
        .split(/\s+/)
        .filter(c => c && !c.includes(":") && !c.match(/^[a-z]{1,2}-[a-f0-9]+$/i)) // Skip hash-like classes
        .slice(0, 2)
      if (classes.length) {
        selector += `.${classes.join(".")}`
      }
    }

    // Add :nth-of-type if there are siblings of the same type
    const parent = current.parentElement
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        child => child.tagName === current!.tagName
      )
      if (siblings.length > 1) {
        const index = siblings.indexOf(current) + 1
        selector += `:nth-of-type(${index})`
      }
    }

    path.unshift(selector)
    current = current.parentElement
  }

  // Return last 4-5 parts for reasonable specificity
  return path.slice(-5).join(" > ")
}

// Listen for messages from background script
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  // Highlight element for MCP tool visual feedback
  if (msg.type === "HIGHLIGHT_ELEMENT") {
    const success = highlightElement(msg.selector, msg.highlightType || 'inspect', msg.duration || 1600)
    sendResponse({ success })
    return true
  }

  // Get context menu element info
  if (msg.type === "GET_CONTEXT_ELEMENT") {
    if (lastContextMenuTarget) {
      const el = lastContextMenuTarget
      const response = {
        tag: el.tagName.toLowerCase(),
        id: el.id || null,
        classes: Array.from(el.classList).slice(0, 5),
        text: el.textContent?.trim().slice(0, 100) || null,
        selector: generateUniqueSelector(el),
        attributes: {
          href: el.getAttribute("href"),
          src: el.getAttribute("src"),
          type: el.getAttribute("type"),
          name: el.getAttribute("name"),
          placeholder: el.getAttribute("placeholder"),
          "data-testid": el.getAttribute("data-testid"),
          "aria-label": el.getAttribute("aria-label"),
          role: el.getAttribute("role"),
        }
      }
      sendResponse(response)
    } else {
      sendResponse(null)
    }
    return true // Keep channel open for async response
  }
})

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
      if (!isExtensionValid()) return
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
      if (!isExtensionValid()) return
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
      if (!isExtensionValid()) return
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
    if (!isExtensionValid()) return
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
        <button class="tabz-fab-btn tabz-fab-star" title="Star repository">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/>
          </svg>
          Star
        </button>
        <button class="tabz-fab-btn tabz-fab-clone" title="Fork & clone (or just clone if your repo)">
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

    .tabz-fab-star {
      background: linear-gradient(135deg, #b08800, #d4a017);
      color: #fff;
    }

    .tabz-fab-star:hover {
      background: linear-gradient(135deg, #d4a017, #e6b800);
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
  const starBtn = fab.querySelector('.tabz-fab-star') as HTMLButtonElement
  const cloneBtn = fab.querySelector('.tabz-fab-clone') as HTMLButtonElement
  const forkBtn = fab.querySelector('.tabz-fab-fork') as HTMLButtonElement

  // Helper to check if repo is currently starred
  const isRepoStarred = (): boolean => {
    // GitHub shows .starred container when starred, .unstarred when not
    const starredContainer = document.querySelector('.js-toggler-container .starred') as HTMLElement | null
    const unstarredContainer = document.querySelector('.js-toggler-container .unstarred') as HTMLElement | null

    if (starredContainer && unstarredContainer) {
      // Both exist - check which is visible (GitHub toggles display)
      const starredVisible = getComputedStyle(starredContainer).display !== 'none'
      return starredVisible
    }
    return false
  }

  // Helper to update star button appearance
  const updateStarButton = (isStarred: boolean) => {
    const starIcon = '<svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.751.751 0 0 1-1.088.791L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.194L.818 6.374a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z"/></svg>'
    if (isStarred) {
      starBtn.innerHTML = `${starIcon} Starred`
      starBtn.title = 'Unstar repository'
    } else {
      starBtn.innerHTML = `${starIcon} Star`
      starBtn.title = 'Star repository'
    }
  }

  // Set initial star button state
  updateStarButton(isRepoStarred())

  closeBtn.addEventListener('click', () => {
    dismissedRepos.add(repo.fullName)
    fab.remove()
    styleEl.remove()
  })

  starBtn.addEventListener('click', () => {
    // Find GitHub's star/unstar buttons - both exist, check which is visible
    const starForm = document.querySelector(`form[action="/${repo.fullName}/star"]`) as HTMLFormElement | null
    const unstarForm = document.querySelector(`form[action="/${repo.fullName}/unstar"]`) as HTMLFormElement | null
    const starParent = starForm?.closest('.unstarred') as HTMLElement | null
    const unstarParent = unstarForm?.closest('.starred') as HTMLElement | null

    const starVisible = starParent && getComputedStyle(starParent).display !== 'none'
    const unstarVisible = unstarParent && getComputedStyle(unstarParent).display !== 'none'

    if (starVisible) {
      // Not starred - click to star
      const btn = starForm?.querySelector('button[type="submit"]') as HTMLButtonElement
      btn?.click()
      starBtn.innerHTML = '⭐ Starred!'
      setTimeout(() => updateStarButton(true), 1500)
    } else if (unstarVisible) {
      // Already starred - click to unstar
      const btn = unstarForm?.querySelector('button[type="submit"]') as HTMLButtonElement
      btn?.click()
      starBtn.innerHTML = '⭐ Unstarred!'
      setTimeout(() => updateStarButton(false), 1500)
    }
  })

  cloneBtn.addEventListener('click', () => {
    if (!isExtensionValid()) return
    // Smart clone: fork+clone for others' repos, regular clone for own repos
    // gh repo fork --clone --remote handles:
    // - Others' repo: forks, clones fork, sets origin=fork upstream=original
    // - Already forked: clones existing fork with proper remotes
    // - Own repo: fails, fallback to git clone
    const command = `cd ~/projects && (gh repo fork ${repo.fullName} --clone --remote 2>/dev/null || git clone https://github.com/${repo.fullName}.git) && cd ${repo.repo}`
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
    if (!isExtensionValid()) return
    chrome.runtime.sendMessage({
      type: 'OPEN_TAB',
      url: `https://github.com/${repo.fullName}/fork`,
    })
  })
}

// Remove FAB if navigating away from code pages or to a different repo
function cleanupGitHubFAB() {
  const fab = document.getElementById('tabz-github-fab')
  const styles = document.getElementById('tabz-github-fab-styles')

  // Always remove if not on a code page
  if (!isGitHubRepoCodePage()) {
    if (fab) fab.remove()
    if (styles) styles.remove()
    return
  }

  // Remove if repo changed (FAB shows different repo than current URL)
  if (fab) {
    const currentRepo = detectGitHubRepo()
    const fabRepoEl = fab.querySelector('.tabz-fab-repo')
    const fabRepoName = fabRepoEl?.textContent || ''
    // Compare just the repo name (without owner) since that's what's displayed
    if (currentRepo && currentRepo.repo !== fabRepoName) {
      fab.remove()
      if (styles) styles.remove()
    }
  }
}

// Initialize content script
function init() {
  if (!isExtensionValid()) {
    console.log('Terminal Tabs: Extension context invalid, skipping init')
    return
  }
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
