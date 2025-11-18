/**
 * Terminal Configuration Constants
 *
 * Centralized configuration for terminal themes, backgrounds, and type mappings.
 * Used across SimpleTerminalApp, SplitLayout, and Terminal components.
 */

/**
 * Theme-to-background gradient mapping
 * Maps terminal color themes to their corresponding background gradients
 */
export const THEME_BACKGROUNDS: Record<string, string> = {
  default: 'dark-neutral',
  amber: 'amber-warmth',
  matrix: 'matrix-depths',
  dracula: 'dracula-purple',
  monokai: 'monokai-brown',
  'solarized-dark': 'solarized-dark',
  'github-dark': 'github-dark',
  cyberpunk: 'cyberpunk-neon',
  holographic: 'ocean-depths',
  vaporwave: 'vaporwave-dream',
  retro: 'amber-warmth',
  synthwave: 'synthwave-sunset',
  aurora: 'aurora-borealis',
  green: 'matrix-code',
  purple: 'cyberpunk-neon',
  pink: 'vaporwave-dreams',
  blue: 'holographic',
  ocean: 'deep-ocean',
  dark: 'dark-neutral',
}

/**
 * Terminal type abbreviations for tmux session names
 * Used to generate short session names like "tt-cc-a3k" (Tabz - Claude Code - random)
 */
export const TERMINAL_TYPE_ABBREVIATIONS: Record<string, string> = {
  'claude-code': 'cc',
  'opencode': 'oc',
  'codex': 'cx',
  'gemini': 'gm',
  'bash': 'bash',
  'tui-tool': 'tui',
  'default': 'term',
}

/**
 * Command-specific abbreviations for special tools
 * These override the terminal type when the command matches
 */
export const COMMAND_ABBREVIATIONS: Record<string, string> = {
  'tfe': 'tfe',
  'lazygit': 'lg',
  'micro': 'micro',
}

/**
 * Default terminal configuration values
 */
export const DEFAULT_TERMINAL_CONFIG = {
  TRANSPARENCY: 100,
  FONT_SIZE: 14,
  FONT_FAMILY: 'monospace',
  BACKGROUND: 'dark-neutral',
  THEME: 'default',
} as const
