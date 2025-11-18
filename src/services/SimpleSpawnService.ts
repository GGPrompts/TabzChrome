/**
 * SimpleSpawnService - Minimal spawning for tab-based terminals
 */

interface SpawnConfig {
  terminalType: string
  command?: string
  commands?: string[]  // Array of commands to execute (like opustrator)
  startCommand?: string  // For reconnection
  toolName?: string  // For TUI tools
  name?: string
  workingDir?: string
  theme?: string
  transparency?: number
  size?: { width: number; height: number }
  useTmux?: boolean  // Whether to spawn via tmux
  sessionName?: string  // Tmux session name for persistence
}

class SimpleSpawnService {
  private static instance: SimpleSpawnService
  private wsRef: React.MutableRefObject<WebSocket | null> | null = null

  static getInstance(): SimpleSpawnService {
    if (!SimpleSpawnService.instance) {
      SimpleSpawnService.instance = new SimpleSpawnService()
    }
    return SimpleSpawnService.instance
  }

  initialize(wsRef: React.MutableRefObject<WebSocket | null>) {
    this.wsRef = wsRef
  }

  private getWebSocket(): WebSocket | null {
    if (this.wsRef?.current && this.wsRef.current.readyState === WebSocket.OPEN) {
      return this.wsRef.current
    }
    return null
  }

  async spawn(options: { config: SpawnConfig; requestId?: string }): Promise<string | null> {
    try {
      const ws = this.getWebSocket()
      if (!ws) {
        console.error('[SimpleSpawnService] No WebSocket connection available')
        return null
      }

      const spawnConfig = {
        ...options.config,
        platform: 'local',
        size: options.config.size || { width: 800, height: 600 },
      }

      // Use provided requestId or generate new one
      const requestId = options.requestId || `spawn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

      const spawnMessage = {
        type: 'spawn',
        requestId,
        config: spawnConfig,
      }

      console.log('[SimpleSpawnService] Sending spawn message:', spawnMessage)
      ws.send(JSON.stringify(spawnMessage))

      // Return immediately - terminal will appear via WebSocket 'terminal-spawned' message
      return requestId
    } catch (error) {
      console.error('[SimpleSpawnService] Error spawning terminal:', error)
      return null
    }
  }
}

export default SimpleSpawnService.getInstance()
