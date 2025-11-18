import React from 'react'
import './HotkeysHelpModal.css'

interface Props {
  show: boolean
  onClose: () => void
}

export function HotkeysHelpModal({ show, onClose }: Props) {
  if (!show) return null

  return (
    <div className="hotkeys-modal">
      <div className="hotkeys-header">
        <h2>⌨️ Keyboard Shortcuts</h2>
        <div className="hotkeys-header-actions">
          <span className="pinned-indicator" title="Sidebar stays open while working">📌</span>
          <button onClick={onClose} title="Close sidebar">✕</button>
        </div>
      </div>

      <div className="hotkeys-content">
        <section>
          <h3>Tab Navigation</h3>
          <div className="hotkey-row">
            <kbd>Alt</kbd> + <kbd>1</kbd>-<kbd>9</kbd>
            <span>Jump to tab 1-9</span>
          </div>
          <div className="hotkey-row">
            <kbd>Alt</kbd> + <kbd>0</kbd>
            <span>Jump to last tab</span>
          </div>
          <div className="hotkey-row">
            <kbd>Alt</kbd> + <kbd>]</kbd>
            <span>Next tab</span>
          </div>
          <div className="hotkey-row">
            <kbd>Alt</kbd> + <kbd>[</kbd>
            <span>Previous tab</span>
          </div>
        </section>

        <section>
          <h3>Splits & Panes</h3>
          <div className="hotkey-row hotkey-tip">
            <span className="tip-icon">💡</span>
            <span>Drag 2 tabs together to create splits</span>
          </div>
          <div className="hotkey-row">
            <kbd>Alt</kbd> + <kbd>V</kbd>
            <span>Split vertical (tmux)</span>
          </div>
          <div className="hotkey-row">
            <kbd>Alt</kbd> + <kbd>X</kbd>
            <span>Close pane</span>
          </div>
          <div className="hotkey-row">
            <kbd>Alt</kbd> + <kbd>Z</kbd>
            <span>Zoom toggle</span>
          </div>
        </section>

        <section>
          <h3>Pane Navigation</h3>
          <div className="hotkey-row">
            <kbd>Alt</kbd> + <kbd>↑</kbd>/<kbd>↓</kbd>/<kbd>←</kbd>/<kbd>→</kbd>
            <span>Navigate between panes</span>
          </div>
        </section>
      </div>
    </div>
  )
}
