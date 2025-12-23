// Claude ecosystem file type detection and colors
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
  | null

export type FileFilter = 'all' | 'prompts' | 'claude' | 'favorites'

// TFE-inspired colors (dark theme optimized)
export const claudeFileColors: Record<Exclude<ClaudeFileType, null>, { light: string; dark: string; tailwind: string }> = {
  'claude-config': { light: '#D75F00', dark: '#FF8700', tailwind: 'text-orange-400' },
  'prompt':        { light: '#D7005F', dark: '#FF79C6', tailwind: 'text-pink-400' },
  'skill':         { light: '#008B8B', dark: '#50FAE9', tailwind: 'text-teal-400' },
  'agent':         { light: '#8B00FF', dark: '#BD93F9', tailwind: 'text-purple-400' },
  'hook':          { light: '#5F8700', dark: '#A6E22E', tailwind: 'text-green-400' },
  'mcp':           { light: '#0087AF', dark: '#66D9EF', tailwind: 'text-cyan-400' },
  'command':       { light: '#0087D7', dark: '#87CEEB', tailwind: 'text-sky-400' },
  'plugin':        { light: '#AF5F00', dark: '#FFAF00', tailwind: 'text-amber-400' },
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

  // .prompts directory
  if (name === '.prompts') {
    return 'prompt'
  }

  // .prompty files
  if (/\.prompty$/i.test(name)) {
    return 'prompt'
  }

  // Files inside .prompts/
  if (path.includes('/.prompts/')) {
    return 'prompt'
  }

  // plugins directory itself (not contents - those get their own types)
  if (name === 'plugins') {
    return 'plugin'
  }

  // plugin.json manifest files
  if (name === 'plugin.json' && path.includes('/plugins/')) {
    return 'plugin'
  }

  return null
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
