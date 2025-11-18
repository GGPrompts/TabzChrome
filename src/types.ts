// Terminal Types and Constants

export interface Agent {
  id: string
  name: string
  terminalType: string
  status?: string
  pid?: number
  color?: string
  position?: { x: number; y: number }
  size?: { width: number; height: number }
  sessionName?: string
  embedded?: boolean
  toolName?: string
}

export const TERMINAL_TYPES = [
  { value: 'claude-code', label: 'Claude Code', icon: '🤖', color: '#ff6b35', category: 'agent' },
  { value: 'opencode', label: 'OpenCode', icon: '💻', color: '#9333ea', category: 'agent' },
  { value: 'codex', label: 'Codex', icon: '📚', color: '#06b6d4', category: 'agent' },
  { value: 'orchestrator', label: 'Orchestrator', icon: '🎭', color: '#fbbf24', category: 'agent' },
  { value: 'bash', label: 'Bash', icon: '🐚', color: '#737373', category: 'utility' },
  { value: 'gemini', label: 'Gemini', icon: '✨', color: '#8b5cf6', category: 'agent' },
  { value: 'python', label: 'Python', icon: '🐍', color: '#3776ab', category: 'utility' },
  { value: 'script', label: 'Script', icon: '📜', color: '#a3a3a3', category: 'utility' },
  { value: 'tui-tool', label: 'TUI Tool', icon: '🖥️', color: '#3b82f6', category: 'utility' },
] as const

// Helper functions to filter terminal types
export const AGENT_TYPES = TERMINAL_TYPES.filter(t => t.category === 'agent')
export const UTILITY_TYPES = TERMINAL_TYPES.filter(t => t.category === 'utility')
