import React from 'react'

export function ShortcutsHint() {
  return (
    <div className="shortcuts-hint animate-slide-up stagger-5">
      <div className="shortcut-item">
        <kbd>1</kbd>-<kbd>9</kbd>
        <span>Quick spawn</span>
      </div>
      <div className="shortcut-item">
        <kbd>/</kbd>
        <span>Focus search</span>
      </div>
      <div className="shortcut-item">
        <kbd>Tab</kbd>
        <span>Cycle suggestions</span>
      </div>
      <div className="shortcut-item">
        <kbd>Esc</kbd>
        <span>Clear</span>
      </div>
    </div>
  )
}
