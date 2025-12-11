import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

/**
 * Unit tests for content.ts - the content script that runs on web pages
 * Tests command detection, button injection, and command cleaning logic
 */

// Mock chrome.runtime.sendMessage
const mockSendMessage = vi.fn().mockResolvedValue(undefined)
const mockChrome = {
  runtime: {
    sendMessage: mockSendMessage,
  },
}

// Set up global chrome mock before tests
vi.stubGlobal('chrome', mockChrome)

// =============================================================================
// Extract testable functions from content.ts logic
// (Since content.ts runs on load, we re-implement the pure logic for testing)
// =============================================================================

/**
 * Command patterns used to detect runnable commands in code blocks
 * Copied from content.ts for testing
 */
const commandPatterns = [
  // Package managers
  /^npm (install|run|test|start|build)/m,
  /^yarn (install|add|run|test|start|build)/m,
  /^pnpm (install|add|run|test|start|build)/m,
  /^bun (install|add|run|test|start|build)/m,
  // System package managers
  /^brew install/m,
  /^apt install/m,
  /^apt-get install/m,
  /^sudo apt/m,
  /^cargo install/m,
  /^pip install/m,
  /^pip3 install/m,
  /^go install/m,
  // Git commands
  /^git (clone|pull|push|checkout|status|log|diff|add|commit)/m,
  // Common CLI tools
  /^curl /m,
  /^wget /m,
  /^docker /m,
  /^docker-compose /m,
  /^kubectl /m,
  /^terraform /m,
  // AI CLI tools
  /^claude /m,
  /^gemini /m,
  /^codex /m,
  // TUI tools (direct invocation)
  /^(lazygit|htop|btop|yazi|ranger|k9s|lazydocker)$/m,
  // Shell commands that look runnable
  /^(cd|ls|mkdir|rm|cp|mv|cat|echo|export|source) /m,
  // Commands starting with $ or > prompt (strip the prompt)
  /^\$ .+/m,
  /^> .+/m,
]

/**
 * Check if text contains a runnable command
 */
function isRunnableCommand(text: string): boolean {
  return commandPatterns.some(pattern => pattern.test(text))
}

/**
 * Clean command text for execution
 * - Strip $ or > prompt prefixes
 * - Join multi-line commands with &&
 * - Filter out comment-only lines
 */
function cleanCommand(text: string): string {
  let command = text.trim()
  command = command.replace(/^\$\s+/, '').replace(/^>\s+/, '')
  // Convert newlines to && for multi-line commands
  // Filter out comment-only lines (# ...) but keep inline comments (cmd # comment)
  command = command.split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'))
    .join(' && ')
  return command
}

// =============================================================================
// Tests
// =============================================================================

describe('Content Script - Command Pattern Matching', () => {
  describe('npm commands', () => {
    it('should detect npm install', () => {
      expect(isRunnableCommand('npm install')).toBe(true)
      expect(isRunnableCommand('npm install lodash')).toBe(true)
      expect(isRunnableCommand('npm install --save-dev typescript')).toBe(true)
    })

    it('should detect npm run', () => {
      expect(isRunnableCommand('npm run dev')).toBe(true)
      expect(isRunnableCommand('npm run build')).toBe(true)
      expect(isRunnableCommand('npm run test:watch')).toBe(true)
    })

    it('should detect npm test/start/build', () => {
      expect(isRunnableCommand('npm test')).toBe(true)
      expect(isRunnableCommand('npm start')).toBe(true)
      expect(isRunnableCommand('npm build')).toBe(true)
    })

    it('should NOT match non-npm commands', () => {
      expect(isRunnableCommand('npm')).toBe(false)
      expect(isRunnableCommand('npm version')).toBe(false)
      expect(isRunnableCommand('npm init')).toBe(false)
    })
  })

  describe('yarn commands', () => {
    it('should detect yarn install/add', () => {
      expect(isRunnableCommand('yarn install')).toBe(true)
      expect(isRunnableCommand('yarn add lodash')).toBe(true)
    })

    it('should detect yarn run/test/start/build', () => {
      expect(isRunnableCommand('yarn run dev')).toBe(true)
      expect(isRunnableCommand('yarn test')).toBe(true)
      expect(isRunnableCommand('yarn start')).toBe(true)
      expect(isRunnableCommand('yarn build')).toBe(true)
    })
  })

  describe('pnpm commands', () => {
    it('should detect pnpm commands', () => {
      expect(isRunnableCommand('pnpm install')).toBe(true)
      expect(isRunnableCommand('pnpm add lodash')).toBe(true)
      expect(isRunnableCommand('pnpm run dev')).toBe(true)
      expect(isRunnableCommand('pnpm test')).toBe(true)
    })
  })

  describe('bun commands', () => {
    it('should detect bun commands', () => {
      expect(isRunnableCommand('bun install')).toBe(true)
      expect(isRunnableCommand('bun add lodash')).toBe(true)
      expect(isRunnableCommand('bun run dev')).toBe(true)
      expect(isRunnableCommand('bun test')).toBe(true)
    })
  })

  describe('brew commands', () => {
    it('should detect brew install', () => {
      expect(isRunnableCommand('brew install node')).toBe(true)
      expect(isRunnableCommand('brew install --cask docker')).toBe(true)
    })

    it('should NOT match other brew commands', () => {
      expect(isRunnableCommand('brew update')).toBe(false)
      expect(isRunnableCommand('brew upgrade')).toBe(false)
      expect(isRunnableCommand('brew list')).toBe(false)
    })
  })

  describe('apt commands', () => {
    it('should detect apt install', () => {
      expect(isRunnableCommand('apt install git')).toBe(true)
      expect(isRunnableCommand('apt-get install build-essential')).toBe(true)
      expect(isRunnableCommand('sudo apt install nodejs')).toBe(true)
      expect(isRunnableCommand('sudo apt-get install -y docker')).toBe(true)
    })
  })

  describe('cargo/pip/go commands', () => {
    it('should detect cargo install', () => {
      expect(isRunnableCommand('cargo install ripgrep')).toBe(true)
    })

    it('should detect pip install', () => {
      expect(isRunnableCommand('pip install requests')).toBe(true)
      expect(isRunnableCommand('pip3 install numpy')).toBe(true)
    })

    it('should detect go install', () => {
      expect(isRunnableCommand('go install github.com/user/tool@latest')).toBe(true)
    })
  })

  describe('git commands', () => {
    it('should detect git clone', () => {
      expect(isRunnableCommand('git clone https://github.com/user/repo')).toBe(true)
      expect(isRunnableCommand('git clone git@github.com:user/repo.git')).toBe(true)
    })

    it('should detect other git commands', () => {
      expect(isRunnableCommand('git pull')).toBe(true)
      expect(isRunnableCommand('git push')).toBe(true)
      expect(isRunnableCommand('git checkout main')).toBe(true)
      expect(isRunnableCommand('git status')).toBe(true)
      expect(isRunnableCommand('git log')).toBe(true)
      expect(isRunnableCommand('git diff')).toBe(true)
      expect(isRunnableCommand('git add .')).toBe(true)
      expect(isRunnableCommand('git commit -m "message"')).toBe(true)
    })

    it('should NOT match other git commands', () => {
      expect(isRunnableCommand('git branch')).toBe(false)
      expect(isRunnableCommand('git remote')).toBe(false)
      expect(isRunnableCommand('git stash')).toBe(false)
    })
  })

  describe('CLI tools', () => {
    it('should detect curl', () => {
      expect(isRunnableCommand('curl https://example.com')).toBe(true)
      expect(isRunnableCommand('curl -X POST https://api.example.com')).toBe(true)
    })

    it('should detect wget', () => {
      expect(isRunnableCommand('wget https://example.com/file.tar.gz')).toBe(true)
    })

    it('should detect docker commands', () => {
      expect(isRunnableCommand('docker run -it ubuntu')).toBe(true)
      expect(isRunnableCommand('docker-compose up -d')).toBe(true)
    })

    it('should detect kubectl', () => {
      expect(isRunnableCommand('kubectl get pods')).toBe(true)
    })

    it('should detect terraform', () => {
      expect(isRunnableCommand('terraform apply')).toBe(true)
    })
  })

  describe('AI CLI tools', () => {
    it('should detect claude', () => {
      expect(isRunnableCommand('claude --help')).toBe(true)
      expect(isRunnableCommand('claude "what is the meaning of life"')).toBe(true)
    })

    it('should detect gemini', () => {
      expect(isRunnableCommand('gemini chat')).toBe(true)
    })

    it('should detect codex', () => {
      expect(isRunnableCommand('codex explain')).toBe(true)
    })
  })

  describe('TUI tools', () => {
    it('should detect standalone TUI invocations', () => {
      expect(isRunnableCommand('lazygit')).toBe(true)
      expect(isRunnableCommand('htop')).toBe(true)
      expect(isRunnableCommand('btop')).toBe(true)
      expect(isRunnableCommand('yazi')).toBe(true)
      expect(isRunnableCommand('ranger')).toBe(true)
      expect(isRunnableCommand('k9s')).toBe(true)
      expect(isRunnableCommand('lazydocker')).toBe(true)
    })

    it('should NOT match TUI tools with arguments (they use different pattern)', () => {
      // These would be caught by other patterns or not at all
      expect(isRunnableCommand('lazygit --help')).toBe(false)
    })
  })

  describe('shell commands', () => {
    it('should detect common shell commands', () => {
      expect(isRunnableCommand('cd /path/to/dir')).toBe(true)
      expect(isRunnableCommand('ls -la')).toBe(true)
      expect(isRunnableCommand('mkdir -p new/dir')).toBe(true)
      expect(isRunnableCommand('rm -rf node_modules')).toBe(true)
      expect(isRunnableCommand('cp file1 file2')).toBe(true)
      expect(isRunnableCommand('mv old new')).toBe(true)
      expect(isRunnableCommand('cat file.txt')).toBe(true)
      expect(isRunnableCommand('echo "hello"')).toBe(true)
      expect(isRunnableCommand('export PATH=$PATH:/new/path')).toBe(true)
      expect(isRunnableCommand('source ~/.bashrc')).toBe(true)
    })
  })

  describe('prompt prefix commands', () => {
    it('should detect commands with $ prefix', () => {
      expect(isRunnableCommand('$ npm install')).toBe(true)
      expect(isRunnableCommand('$ git clone repo')).toBe(true)
    })

    it('should detect commands with > prefix', () => {
      expect(isRunnableCommand('> npm install')).toBe(true)
      expect(isRunnableCommand('> git status')).toBe(true)
    })
  })

  describe('non-matching text', () => {
    it('should NOT match plain text', () => {
      expect(isRunnableCommand('This is a paragraph of text')).toBe(false)
      expect(isRunnableCommand('Hello world')).toBe(false)
    })

    it('should NOT match code that is not a command', () => {
      expect(isRunnableCommand('const x = 5')).toBe(false)
      expect(isRunnableCommand('function foo() {}')).toBe(false)
      expect(isRunnableCommand('import React from "react"')).toBe(false)
    })

    it('should NOT match partial matches', () => {
      expect(isRunnableCommand('npm')).toBe(false)
      expect(isRunnableCommand('git')).toBe(false)
      expect(isRunnableCommand('brew')).toBe(false)
    })

    it('should NOT match commands in the middle of text', () => {
      // These should fail because patterns use ^ anchor
      expect(isRunnableCommand('Please run npm install')).toBe(false)
      expect(isRunnableCommand('Use git clone to download')).toBe(false)
    })
  })

  describe('multiline commands', () => {
    it('should detect commands even with newlines', () => {
      const multiline = `npm install
npm run build`
      expect(isRunnableCommand(multiline)).toBe(true)
    })

    it('should detect command on any line', () => {
      const textWithCommand = `This is some text
npm install lodash
More text here`
      expect(isRunnableCommand(textWithCommand)).toBe(true)
    })
  })
})

describe('Content Script - Command Cleaning', () => {
  describe('prompt prefix stripping', () => {
    it('should strip $ prefix', () => {
      expect(cleanCommand('$ npm install')).toBe('npm install')
      expect(cleanCommand('$  npm install')).toBe('npm install')
    })

    it('should strip > prefix', () => {
      expect(cleanCommand('> npm install')).toBe('npm install')
      expect(cleanCommand('>  npm install')).toBe('npm install')
    })

    it('should not strip $ or > from middle of command', () => {
      expect(cleanCommand('echo $PATH')).toBe('echo $PATH')
      expect(cleanCommand('echo foo > file.txt')).toBe('echo foo > file.txt')
    })
  })

  describe('multiline handling', () => {
    it('should join multi-line commands with &&', () => {
      expect(cleanCommand('npm install\nnpm run build')).toBe('npm install && npm run build')
    })

    it('should trim each line', () => {
      expect(cleanCommand('  npm install  \n  npm run build  ')).toBe('npm install && npm run build')
    })

    it('should filter empty lines', () => {
      expect(cleanCommand('npm install\n\nnpm run build')).toBe('npm install && npm run build')
    })
  })

  describe('comment handling', () => {
    it('should filter comment-only lines', () => {
      expect(cleanCommand('# Install dependencies\nnpm install')).toBe('npm install')
    })

    it('should keep inline comments', () => {
      expect(cleanCommand('npm install # install deps')).toBe('npm install # install deps')
    })

    it('should handle multiple comments', () => {
      const input = `# Step 1
npm install
# Step 2
npm run build`
      expect(cleanCommand(input)).toBe('npm install && npm run build')
    })
  })

  describe('complex scenarios', () => {
    it('should handle $ prefix with multiline', () => {
      const input = `$ npm install
$ npm run build`
      // Note: Only first $ is stripped since pattern only matches at start
      expect(cleanCommand(input)).toBe('npm install && $ npm run build')
    })

    it('should handle whitespace and comments', () => {
      const input = `  # Setup

  npm install
  # Build
  npm run build
  `
      expect(cleanCommand(input)).toBe('npm install && npm run build')
    })
  })
})

describe('Content Script - Button Injection (DOM)', () => {
  let container: HTMLElement

  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = ''
    container = document.createElement('div')
    document.body.appendChild(container)
    mockSendMessage.mockClear()
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  /**
   * Simulates detectPackageCommands() behavior for testing
   */
  function processCodeBlock(block: HTMLElement): boolean {
    if (block.hasAttribute('data-tabz-processed')) return false

    const text = block.textContent || ''
    if (!isRunnableCommand(text)) return false

    block.setAttribute('data-tabz-processed', 'true')

    const originalPosition = window.getComputedStyle(block).position
    // In real browsers, unstyled elements have position: static
    // In jsdom, getComputedStyle returns '' for unstyled elements
    // Check for both to handle both environments
    if (originalPosition === 'static' || originalPosition === '') {
      block.style.position = 'relative'
    }

    // Inject CSS for hover behavior (once per page)
    if (!document.getElementById('tabz-hover-styles')) {
      const style = document.createElement('style')
      style.id = 'tabz-hover-styles'
      style.textContent = `
        .tabz-code-block .terminal-tabs-run-btn {
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.2s ease-in-out;
        }
        .tabz-code-block:hover .terminal-tabs-run-btn {
          opacity: 1;
          pointer-events: auto;
        }
      `
      document.head.appendChild(style)
    }

    block.classList.add('tabz-code-block')

    const btn = document.createElement('button')
    btn.className = 'terminal-tabs-run-btn'
    btn.textContent = '▶ Send to Tabz'
    btn.onclick = (e) => {
      e.preventDefault()
      e.stopPropagation()
      const command = cleanCommand(text)
      mockChrome.runtime.sendMessage({
        type: 'QUEUE_COMMAND',
        command: command,
      })
    }

    block.appendChild(btn)
    return true
  }

  describe('button injection', () => {
    it('should inject button into code block with runnable command', () => {
      const codeBlock = document.createElement('code')
      codeBlock.textContent = 'npm install lodash'
      container.appendChild(codeBlock)

      const result = processCodeBlock(codeBlock)

      expect(result).toBe(true)
      expect(codeBlock.querySelector('.terminal-tabs-run-btn')).not.toBeNull()
      expect(codeBlock.classList.contains('tabz-code-block')).toBe(true)
    })

    it('should NOT inject button for non-command text', () => {
      const codeBlock = document.createElement('code')
      codeBlock.textContent = 'const x = 5'
      container.appendChild(codeBlock)

      const result = processCodeBlock(codeBlock)

      expect(result).toBe(false)
      expect(codeBlock.querySelector('.terminal-tabs-run-btn')).toBeNull()
    })

    it('should mark block as processed', () => {
      const codeBlock = document.createElement('code')
      codeBlock.textContent = 'npm install'
      container.appendChild(codeBlock)

      processCodeBlock(codeBlock)

      expect(codeBlock.getAttribute('data-tabz-processed')).toBe('true')
    })

    it('should NOT process already-processed blocks', () => {
      const codeBlock = document.createElement('code')
      codeBlock.textContent = 'npm install'
      codeBlock.setAttribute('data-tabz-processed', 'true')
      container.appendChild(codeBlock)

      const result = processCodeBlock(codeBlock)

      expect(result).toBe(false)
    })
  })

  describe('CSS class application', () => {
    it('should add tabz-code-block class for hover behavior', () => {
      const codeBlock = document.createElement('code')
      codeBlock.textContent = 'npm install'
      container.appendChild(codeBlock)

      processCodeBlock(codeBlock)

      expect(codeBlock.classList.contains('tabz-code-block')).toBe(true)
    })

    it('should inject hover styles once per page', () => {
      const codeBlock1 = document.createElement('code')
      codeBlock1.textContent = 'npm install'
      const codeBlock2 = document.createElement('code')
      codeBlock2.textContent = 'yarn add'
      container.appendChild(codeBlock1)
      container.appendChild(codeBlock2)

      processCodeBlock(codeBlock1)
      processCodeBlock(codeBlock2)

      const styles = document.querySelectorAll('#tabz-hover-styles')
      expect(styles.length).toBe(1)
    })

    it('should set position: relative if static or unset', () => {
      const codeBlock = document.createElement('code')
      codeBlock.textContent = 'npm install'
      container.appendChild(codeBlock)

      processCodeBlock(codeBlock)

      // In jsdom, getComputedStyle returns empty string for position, not 'static'
      // The code sets position: relative when original is 'static' or empty
      expect(codeBlock.style.position).toBe('relative')
    })

    it('should NOT override existing position', () => {
      const codeBlock = document.createElement('code')
      codeBlock.textContent = 'npm install'
      codeBlock.style.position = 'absolute'
      container.appendChild(codeBlock)

      processCodeBlock(codeBlock)

      // Should keep the existing absolute position
      expect(codeBlock.style.position).toBe('absolute')
    })
  })

  describe('button click behavior', () => {
    it('should send QUEUE_COMMAND message on click', () => {
      const codeBlock = document.createElement('code')
      codeBlock.textContent = 'npm install lodash'
      container.appendChild(codeBlock)

      processCodeBlock(codeBlock)

      const button = codeBlock.querySelector('.terminal-tabs-run-btn') as HTMLButtonElement
      button.click()

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'QUEUE_COMMAND',
        command: 'npm install lodash',
      })
    })

    it('should clean command before sending', () => {
      const codeBlock = document.createElement('code')
      codeBlock.textContent = '$ npm install'
      container.appendChild(codeBlock)

      processCodeBlock(codeBlock)

      const button = codeBlock.querySelector('.terminal-tabs-run-btn') as HTMLButtonElement
      button.click()

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'QUEUE_COMMAND',
        command: 'npm install',
      })
    })

    it('should join multiline commands', () => {
      const codeBlock = document.createElement('code')
      codeBlock.textContent = 'npm install\nnpm run build'
      container.appendChild(codeBlock)

      processCodeBlock(codeBlock)

      const button = codeBlock.querySelector('.terminal-tabs-run-btn') as HTMLButtonElement
      button.click()

      expect(mockSendMessage).toHaveBeenCalledWith({
        type: 'QUEUE_COMMAND',
        command: 'npm install && npm run build',
      })
    })
  })
})

describe('Content Script - GitHub/GitLab Detection', () => {
  const originalLocation = window.location

  beforeEach(() => {
    mockSendMessage.mockClear()
  })

  afterEach(() => {
    // Restore original location
    Object.defineProperty(window, 'location', {
      writable: true,
      value: originalLocation,
    })
  })

  /**
   * Helper to extract repo info from GitHub URL
   * Mirrors detectGitHubRepo() logic
   */
  function detectGitHubRepo(hostname: string, pathname: string) {
    if (hostname !== 'github.com') return null

    const repoMatch = pathname.match(/^\/([^/]+)\/([^/]+)/)
    if (repoMatch) {
      const [, owner, repo] = repoMatch
      const repoName = repo.replace(/\.git$/, '')
      return { owner, repo: repoName, fullName: `${owner}/${repoName}` }
    }

    return null
  }

  /**
   * Helper to extract repo info from GitLab URL
   * Mirrors detectGitLabRepo() logic
   */
  function detectGitLabRepo(hostname: string, pathname: string) {
    if (hostname !== 'gitlab.com') return null

    const repoMatch = pathname.match(/^\/([^/]+)\/([^/]+)/)
    if (repoMatch) {
      const [, owner, repo] = repoMatch
      const repoName = repo.replace(/\.git$/, '')
      return { owner, repo: repoName, fullName: `${owner}/${repoName}` }
    }

    return null
  }

  describe('GitHub detection', () => {
    it('should detect GitHub repo from URL', () => {
      const result = detectGitHubRepo('github.com', '/facebook/react')
      expect(result).toEqual({
        owner: 'facebook',
        repo: 'react',
        fullName: 'facebook/react',
      })
    })

    it('should handle .git suffix', () => {
      const result = detectGitHubRepo('github.com', '/facebook/react.git')
      expect(result).toEqual({
        owner: 'facebook',
        repo: 'react',
        fullName: 'facebook/react',
      })
    })

    it('should handle deep paths', () => {
      const result = detectGitHubRepo('github.com', '/facebook/react/tree/main/packages')
      expect(result).toEqual({
        owner: 'facebook',
        repo: 'react',
        fullName: 'facebook/react',
      })
    })

    it('should return null for non-GitHub URLs', () => {
      const result = detectGitHubRepo('gitlab.com', '/facebook/react')
      expect(result).toBeNull()
    })

    it('should return null for root path', () => {
      const result = detectGitHubRepo('github.com', '/')
      expect(result).toBeNull()
    })

    it('should return null for user-only path', () => {
      const result = detectGitHubRepo('github.com', '/facebook')
      expect(result).toBeNull()
    })
  })

  describe('GitLab detection', () => {
    it('should detect GitLab repo from URL', () => {
      const result = detectGitLabRepo('gitlab.com', '/gitlab-org/gitlab')
      expect(result).toEqual({
        owner: 'gitlab-org',
        repo: 'gitlab',
        fullName: 'gitlab-org/gitlab',
      })
    })

    it('should return null for non-GitLab URLs', () => {
      const result = detectGitLabRepo('github.com', '/gitlab-org/gitlab')
      expect(result).toBeNull()
    })
  })
})
