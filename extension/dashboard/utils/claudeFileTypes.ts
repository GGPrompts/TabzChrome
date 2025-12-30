// Claude ecosystem and AI-relevant file type detection and colors
// Inspired by TFE's file coloring system

export type ClaudeFileType =
  | 'claude-config'  // CLAUDE.md, .claude/, settings.json
  | 'prompt'         // .prompty, .prompts/
  | 'skill'          // .claude/skills/
  | 'agent'          // .claude/agents/, AGENTS.md
  | 'hook'           // .claude/hooks/
  | 'mcp'            // .mcp.json
  | 'command'        // .claude/commands/
  | 'plugin'         // plugins/
  // AI-relevant file types (always visible, even with showHidden=false)
  | 'obsidian-vault' // .obsidian/
  | 'docker'         // Dockerfile, docker-compose.yml
  | 'gitignore'      // .gitignore, .claudeignore, .gitattributes
  | 'env'            // .env, .env.*
  | 'secrets'        // credentials, .pem, .key files
  // Developer tool folders
  | 'ai-tool'        // .codex, .copilot, .gemini, .opencode
  | 'git-folder'     // .git folder
  | 'github'         // .github folder
  | 'vscode'         // .vscode folder
  | 'devcontainer'   // .devcontainer
  | 'node-modules'   // node_modules
  | 'docs'           // docs, documentation
  | 'source'         // src, source
  | 'test'           // test, tests, __tests__
  | 'build'          // build, dist, out
  | 'assets'         // public, static, assets
  | 'config'         // config, configs, .config
  | 'scripts'        // scripts folder
  // Special files
  | 'readme'         // README.md, README
  | 'license'        // LICENSE, LICENSE.md
  | 'makefile'       // Makefile
  | 'package-json'   // package.json
  | 'typescript-config' // tsconfig.json
  | 'go-mod'         // go.mod, go.sum
  | 'cargo'          // Cargo.toml, Cargo.lock
  | 'requirements'   // requirements.txt
  | 'gemfile'        // Gemfile
  | null

export type FileFilter = 'all' | 'prompts' | 'claude' | 'plugins' | 'favorites'

// TFE-inspired colors (dark theme optimized)
export const claudeFileColors: Record<Exclude<ClaudeFileType, null>, { light: string; dark: string; tailwind: string }> = {
  'claude-config':   { light: '#D75F00', dark: '#FF8700', tailwind: 'text-orange-400' },
  'prompt':          { light: '#D7005F', dark: '#FF79C6', tailwind: 'text-pink-400' },
  'skill':           { light: '#008B8B', dark: '#50FAE9', tailwind: 'text-teal-400' },
  'agent':           { light: '#8B00FF', dark: '#BD93F9', tailwind: 'text-purple-400' },
  'hook':            { light: '#5F8700', dark: '#A6E22E', tailwind: 'text-green-400' },
  'mcp':             { light: '#0087AF', dark: '#66D9EF', tailwind: 'text-cyan-400' },
  'command':         { light: '#0087D7', dark: '#87CEEB', tailwind: 'text-sky-400' },
  'plugin':          { light: '#AF5F00', dark: '#FFAF00', tailwind: 'text-amber-400' },
  // AI-relevant file types
  'obsidian-vault':  { light: '#7C3AED', dark: '#A78BFA', tailwind: 'text-violet-400' },
  'docker':          { light: '#0EA5E9', dark: '#38BDF8', tailwind: 'text-sky-400' },
  'gitignore':       { light: '#F97316', dark: '#FB923C', tailwind: 'text-orange-300' },
  'env':             { light: '#EAB308', dark: '#FACC15', tailwind: 'text-yellow-400' },
  'secrets':         { light: '#DC2626', dark: '#F87171', tailwind: 'text-red-400' },
  // Developer tool folders
  'ai-tool':         { light: '#8B00FF', dark: '#BD93F9', tailwind: 'text-purple-400' },  // Same as agent
  'git-folder':      { light: '#F97316', dark: '#FB923C', tailwind: 'text-orange-400' },
  'github':          { light: '#6E5494', dark: '#A78BFA', tailwind: 'text-violet-400' },
  'vscode':          { light: '#007ACC', dark: '#4FC3F7', tailwind: 'text-blue-400' },
  'devcontainer':    { light: '#0EA5E9', dark: '#38BDF8', tailwind: 'text-sky-400' },    // Same as docker
  'node-modules':    { light: '#68A063', dark: '#8BC34A', tailwind: 'text-lime-400' },
  'docs':            { light: '#0EA5E9', dark: '#38BDF8', tailwind: 'text-sky-300' },
  'source':          { light: '#22C55E', dark: '#4ADE80', tailwind: 'text-green-400' },
  'test':            { light: '#F59E0B', dark: '#FCD34D', tailwind: 'text-amber-300' },
  'build':           { light: '#8B5CF6', dark: '#A78BFA', tailwind: 'text-violet-300' },
  'assets':          { light: '#06B6D4', dark: '#22D3EE', tailwind: 'text-cyan-300' },
  'config':          { light: '#6B7280', dark: '#9CA3AF', tailwind: 'text-gray-400' },
  'scripts':         { light: '#10B981', dark: '#34D399', tailwind: 'text-emerald-400' },
  // Special files
  'readme':          { light: '#0EA5E9', dark: '#38BDF8', tailwind: 'text-sky-400' },
  'license':         { light: '#EAB308', dark: '#FACC15', tailwind: 'text-yellow-400' },
  'makefile':        { light: '#F97316', dark: '#FB923C', tailwind: 'text-orange-400' },
  'package-json':    { light: '#CB3837', dark: '#F87171', tailwind: 'text-red-400' },
  'typescript-config': { light: '#3178C6', dark: '#60A5FA', tailwind: 'text-blue-400' },
  'go-mod':          { light: '#00ADD8', dark: '#22D3EE', tailwind: 'text-cyan-400' },
  'cargo':           { light: '#F74C00', dark: '#FB923C', tailwind: 'text-orange-400' },
  'requirements':    { light: '#3776AB', dark: '#60A5FA', tailwind: 'text-blue-400' },
  'gemfile':         { light: '#CC342D', dark: '#F87171', tailwind: 'text-red-400' },
}

/**
 * Detect Claude ecosystem file type from name and path
 */
export function getClaudeFileType(name: string, path: string): ClaudeFileType {
  // CLAUDE.md and CLAUDE.local.md
  if (/^CLAUDE(\.local)?\.md$/i.test(name)) {
    return 'claude-config'
  }

  // .claude directory itself
  if (name === '.claude') {
    return 'claude-config'
  }

  // settings.json in .claude/
  if (name === 'settings.json' && path.includes('/.claude/')) {
    return 'claude-config'
  }

  // .mcp.json
  if (name === '.mcp.json') {
    return 'mcp'
  }

  // AGENTS.md
  if (name === 'AGENTS.md') {
    return 'agent'
  }

  // Files inside .claude subdirectories
  if (path.includes('/.claude/')) {
    if (path.includes('/agents/')) return 'agent'
    if (path.includes('/skills/')) return 'skill'
    if (path.includes('/hooks/')) return 'hook'
    if (path.includes('/commands/')) return 'command'
  }

  // .prompts directory itself (not contents)
  if (name === '.prompts') {
    return 'prompt'
  }

  // .prompty files get pink coloring
  if (/\.prompty$/i.test(name)) {
    return 'prompt'
  }

  // NOTE: Subfolders and other files inside .prompts/ use normal colors
  // Only the .prompts folder itself and .prompty files are pink

  // plugins directory itself (not contents - those get their own types)
  if (name === 'plugins') {
    return 'plugin'
  }

  // plugin.json manifest files
  if (name === 'plugin.json' && path.includes('/plugins/')) {
    return 'plugin'
  }

  // === AI-relevant file types (always visible) ===

  // Note: Obsidian vault detection is handled by backend via isObsidianVault flag
  // .obsidian folder itself doesn't get special type - the parent folder does

  // Docker files
  if (name === 'Dockerfile' || /^Dockerfile\./i.test(name)) {
    return 'docker'
  }
  if (/^docker-compose(\.[\w-]+)?\.ya?ml$/i.test(name)) {
    return 'docker'
  }
  if (name === '.dockerignore') {
    return 'docker'
  }

  // .gitignore and related ignore files
  if (name === '.gitignore' || name === '.claudeignore' || name === '.gitattributes' || name === '.gitmodules') {
    return 'gitignore'
  }

  // Environment files (.env, .env.local, .env.production, etc.)
  if (/^\.env(\.[\w.-]+)?$/i.test(name)) {
    return 'env'
  }

  // Secrets/credentials files (highlight for awareness)
  if (/\.(pem|key|crt|cer|pfx|p12)$/i.test(name)) {
    return 'secrets'
  }
  if (/^(credentials|secrets|\.secrets)(\.[\w.-]+)?$/i.test(name)) {
    return 'secrets'
  }

  // === Developer tool folders ===

  // AI tool folders (like .claude but for other AI assistants)
  if (name === '.codex' || name === '.copilot' || name === '.gemini' || name === '.opencode') {
    return 'ai-tool'
  }

  // Git folder
  if (name === '.git') {
    return 'git-folder'
  }

  // GitHub folder
  if (name === '.github') {
    return 'github'
  }

  // VS Code folder
  if (name === '.vscode') {
    return 'vscode'
  }

  // Dev container
  if (name === '.devcontainer') {
    return 'devcontainer'
  }

  // Node modules
  if (name === 'node_modules') {
    return 'node-modules'
  }

  // Documentation folders
  if (name === 'docs' || name === 'documentation') {
    return 'docs'
  }

  // Source folders
  if (name === 'src' || name === 'source' || name === 'lib') {
    return 'source'
  }

  // Test folders
  if (name === 'test' || name === 'tests' || name === '__tests__' || name === 'spec' || name === 'specs') {
    return 'test'
  }

  // Build/output folders
  if (name === 'build' || name === 'dist' || name === 'out' || name === 'target') {
    return 'build'
  }

  // Asset folders
  if (name === 'public' || name === 'static' || name === 'assets') {
    return 'assets'
  }

  // Config folders
  if (name === 'config' || name === 'configs' || name === '.config') {
    return 'config'
  }

  // Scripts folder
  if (name === 'scripts') {
    return 'scripts'
  }

  // === Special files ===

  // README files
  if (/^README(\.md|\.txt)?$/i.test(name)) {
    return 'readme'
  }

  // LICENSE files
  if (/^LICENSE(\.md|\.txt)?$/i.test(name)) {
    return 'license'
  }

  // Makefile
  if (name === 'Makefile' || name === 'makefile' || name === 'GNUmakefile') {
    return 'makefile'
  }

  // package.json (npm)
  if (name === 'package.json') {
    return 'package-json'
  }

  // TypeScript config
  if (name === 'tsconfig.json' || /^tsconfig\.[\w.-]+\.json$/i.test(name)) {
    return 'typescript-config'
  }

  // Go modules
  if (name === 'go.mod' || name === 'go.sum') {
    return 'go-mod'
  }

  // Rust Cargo
  if (name === 'Cargo.toml' || name === 'Cargo.lock') {
    return 'cargo'
  }

  // Python requirements
  if (name === 'requirements.txt' || name === 'pyproject.toml' || name === 'setup.py') {
    return 'requirements'
  }

  // Ruby Gemfile
  if (name === 'Gemfile' || name === 'Gemfile.lock') {
    return 'gemfile'
  }

  return null
}

/**
 * Check if a file/folder should always be visible even when showHidden=false
 * These are AI-relevant files that developers need to monitor
 */
export function shouldAlwaysShow(name: string, path: string): boolean {
  // Always show .claude and .prompts (core Claude ecosystem)
  if (name === '.claude' || name === '.prompts') return true

  // Always show .obsidian (Obsidian vault indicator)
  if (name === '.obsidian') return true

  // Always show .env files (critical for AI tools to see)
  if (/^\.env(\.[\w.-]+)?$/i.test(name)) return true

  // Always show .gitignore
  if (name === '.gitignore') return true

  // Always show .dockerignore
  if (name === '.dockerignore') return true

  // Always show secrets files (awareness)
  if (/\.(pem|key|crt|cer|pfx|p12)$/i.test(name)) return true

  return false
}

/**
 * Get emoji icon for special file types
 * Note: Obsidian vault (🧠) is handled separately via isObsidianVault flag from backend
 */
export function getSpecialFileEmoji(name: string, path: string): string | null {
  const type = getClaudeFileType(name, path)
  switch (type) {
    case 'docker': return '🐳'
    case 'env': return '🔒'
    case 'secrets': return '🔑'
    default: return null
  }
}

/**
 * Check if a file is always included in Claude's context (CLAUDE.md, AGENTS.md)
 * These files should be visually distinct as they're always read by Claude
 */
export function isAlwaysInContext(name: string): boolean {
  return /^(CLAUDE|AGENTS)(\.local)?\.md$/i.test(name)
}

/**
 * Script file detection and run command generation
 */
export interface ScriptInfo {
  type: 'shell' | 'python' | 'node' | 'typescript' | 'ruby' | 'perl' | 'php' | 'go' | 'rust' | 'make' | 'npm'
  runCommand: string
  syntaxCheckCommand?: string  // For dry-run / validation
  icon: string
}

export function getScriptInfo(fileName: string, filePath: string): ScriptInfo | null {
  const ext = fileName.split('.').pop()?.toLowerCase()
  const dir = filePath.substring(0, filePath.lastIndexOf('/'))

  // Shell scripts
  if (ext === 'sh' || ext === 'bash' || ext === 'zsh') {
    return {
      type: 'shell',
      runCommand: `bash "${filePath}"`,
      syntaxCheckCommand: `bash -n "${filePath}"`,
      icon: '🐚'
    }
  }

  // Python
  if (ext === 'py') {
    return {
      type: 'python',
      runCommand: `python "${filePath}"`,
      syntaxCheckCommand: `python -m py_compile "${filePath}"`,
      icon: '🐍'
    }
  }

  // JavaScript
  if (ext === 'js' || ext === 'mjs') {
    return {
      type: 'node',
      runCommand: `node "${filePath}"`,
      syntaxCheckCommand: `node --check "${filePath}"`,
      icon: '📦'
    }
  }

  // TypeScript
  if (ext === 'ts' || ext === 'mts') {
    return {
      type: 'typescript',
      runCommand: `npx tsx "${filePath}"`,
      syntaxCheckCommand: `npx tsc --noEmit "${filePath}"`,
      icon: '💠'
    }
  }

  // Ruby
  if (ext === 'rb') {
    return {
      type: 'ruby',
      runCommand: `ruby "${filePath}"`,
      syntaxCheckCommand: `ruby -c "${filePath}"`,
      icon: '💎'
    }
  }

  // Perl
  if (ext === 'pl') {
    return {
      type: 'perl',
      runCommand: `perl "${filePath}"`,
      syntaxCheckCommand: `perl -c "${filePath}"`,
      icon: '🐪'
    }
  }

  // PHP
  if (ext === 'php') {
    return {
      type: 'php',
      runCommand: `php "${filePath}"`,
      syntaxCheckCommand: `php -l "${filePath}"`,
      icon: '🐘'
    }
  }

  // Go (single file)
  if (ext === 'go') {
    return {
      type: 'go',
      runCommand: `go run "${filePath}"`,
      syntaxCheckCommand: `go vet "${filePath}"`,
      icon: '🐹'
    }
  }

  // Rust (single file)
  if (ext === 'rs') {
    return {
      type: 'rust',
      runCommand: `rustc "${filePath}" -o /tmp/rust_run && /tmp/rust_run`,
      syntaxCheckCommand: `rustc --emit=metadata "${filePath}"`,
      icon: '🦀'
    }
  }

  // Makefile
  if (fileName === 'Makefile' || fileName === 'makefile' || ext === 'mk') {
    return {
      type: 'make',
      runCommand: `make -f "${filePath}"`,
      syntaxCheckCommand: `make -n -f "${filePath}"`,
      icon: '🔧'
    }
  }

  // package.json - special case, show npm scripts
  if (fileName === 'package.json') {
    return {
      type: 'npm',
      runCommand: `cd "${dir}" && npm run`,  // Will list available scripts
      icon: '📦'
    }
  }

  return null
}

/**
 * Check if a file is a runnable script
 */
export function isRunnableScript(fileName: string, filePath: string): boolean {
  return getScriptInfo(fileName, filePath) !== null
}

/**
 * Get Tailwind color class for a Claude file type
 */
export function getClaudeFileColorClass(name: string, path: string): string | null {
  const fileType = getClaudeFileType(name, path)
  if (!fileType) return null
  return claudeFileColors[fileType].tailwind
}

/**
 * Get hex color for a Claude file type (for inline styles)
 */
export function getClaudeFileColor(name: string, path: string, isDark = true): string | null {
  const fileType = getClaudeFileType(name, path)
  if (!fileType) return null
  return isDark ? claudeFileColors[fileType].dark : claudeFileColors[fileType].light
}

/**
 * Check if a file matches the prompts filter
 */
export function isPromptFile(name: string, path: string): boolean {
  // .prompty files anywhere
  if (/\.prompty$/i.test(name)) return true

  // .prompts directory
  if (name === '.prompts') return true

  // Files inside .prompts/
  if (path.includes('/.prompts/')) return true

  // Command files in .claude/commands/
  if (path.includes('/.claude/commands/')) return true

  return false
}

/**
 * Check if a file matches the claude filter
 */
export function isClaudeFile(name: string, path: string): boolean {
  return getClaudeFileType(name, path) !== null
}

/**
 * Filter definitions for the file list API
 */
export const filterDefinitions = {
  prompts: {
    label: 'Prompts',
    icon: '📝',
    globalPaths: ['~/.prompts'],
    projectPaths: ['.prompts', '.claude/commands'],
    extensions: ['.prompty'],
  },
  claude: {
    label: 'Claude',
    icon: '🤖',
    globalPaths: ['~/.claude'],
    projectPaths: ['.claude', 'CLAUDE.md', 'CLAUDE.local.md', '.mcp.json', 'plugins'],
    extensions: [],
  },
  favorites: {
    label: 'Favorites',
    icon: '⭐',
    globalPaths: [],
    projectPaths: [],
    extensions: [],
  },
  plugins: {
    label: 'Plugins',
    icon: '🔌',
    globalPaths: [],
    projectPaths: [],
    extensions: [],
  },
}
