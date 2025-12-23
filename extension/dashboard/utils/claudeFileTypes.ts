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
  | 'gitignore'      // .gitignore
  | 'env'            // .env, .env.*
  | 'secrets'        // credentials, .pem, .key files
  | null

export type FileFilter = 'all' | 'prompts' | 'claude' | 'favorites'

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

  // .gitignore
  if (name === '.gitignore') {
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
}
