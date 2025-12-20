import React from 'react'
import { createRoot } from 'react-dom/client'
import FocusScene from './FocusScene'
import '../styles/globals.css'
import '@xterm/xterm/css/xterm.css'

const container = document.getElementById('root')
if (container) {
  const root = createRoot(container)
  root.render(
    <React.StrictMode>
      <FocusScene />
    </React.StrictMode>
  )
}
