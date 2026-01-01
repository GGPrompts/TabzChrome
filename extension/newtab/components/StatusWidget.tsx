import React from 'react'
import { Terminal, Wifi, WifiOff } from 'lucide-react'

interface TerminalInfo {
  id: string
  name: string
  workingDir?: string
  profileColor?: string
  profileIcon?: string
}

interface StatusWidgetProps {
  terminals: TerminalInfo[]
  connected: boolean
  onTerminalClick: (id: string) => void
}

export function StatusWidget({ terminals, connected, onTerminalClick }: StatusWidgetProps) {
  return (
    <div className="status-widget animate-slide-up stagger-1">
      <div className="status-header">
        <span className={`status-indicator ${connected ? '' : 'offline'}`} />
        {connected ? (
          <Wifi className="w-3 h-3" />
        ) : (
          <WifiOff className="w-3 h-3" />
        )}
        <span>Active Terminals</span>
        {terminals.length > 0 && (
          <span className="ml-auto text-[var(--text-secondary)]">{terminals.length}</span>
        )}
      </div>

      <div className="terminal-list">
        {terminals.length === 0 ? (
          <div className="empty-terminals">
            <Terminal className="w-5 h-5 mx-auto mb-2 opacity-40" />
            <p>No active terminals</p>
            <p className="text-[0.7rem] mt-1 opacity-60">
              Click a profile to spawn one
            </p>
          </div>
        ) : (
          terminals.slice(0, 5).map((terminal) => (
            <button
              key={terminal.id}
              className="terminal-item"
              onClick={() => onTerminalClick(terminal.id)}
            >
              <div
                className="terminal-icon"
                style={{
                  backgroundColor: terminal.profileColor
                    ? `${terminal.profileColor}20`
                    : 'var(--elevated)',
                  color: terminal.profileColor || 'var(--accent)',
                }}
              >
                {terminal.profileIcon || (
                  <Terminal className="w-3 h-3" />
                )}
              </div>
              <div className="terminal-info">
                <div className="terminal-name">{terminal.name}</div>
                {terminal.workingDir && (
                  <div className="terminal-dir">{terminal.workingDir}</div>
                )}
              </div>
            </button>
          ))
        )}

        {terminals.length > 5 && (
          <div className="text-center text-[0.7rem] text-[var(--text-muted)] py-1">
            +{terminals.length - 5} more
          </div>
        )}
      </div>
    </div>
  )
}
