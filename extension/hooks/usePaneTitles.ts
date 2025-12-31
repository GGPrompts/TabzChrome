import { useEffect, useState, useRef } from 'react'

interface TerminalInfo {
  id: string
  sessionName?: string  // tmux session name (e.g., 'ctt-pyradio-xxx')
}

/**
 * Hook to fetch tmux pane_titles for all terminals
 * This allows apps like PyRadio to display dynamic info (current song) in the tab
 *
 * Returns a Map of terminal ID -> pane_title string
 */
export function usePaneTitles(terminals: TerminalInfo[]): Map<string, string> {
  const [paneTitles, setPaneTitles] = useState<Map<string, string>>(new Map())

  // Memoize terminals to prevent useEffect re-running on every render
  const terminalsRef = useRef<TerminalInfo[]>([])
  const terminalsKey = terminals.map(t => `${t.id}:${t.sessionName}`).join('|')
  const prevTerminalsKeyRef = useRef<string>('')

  if (terminalsKey !== prevTerminalsKeyRef.current) {
    terminalsRef.current = terminals
    prevTerminalsKeyRef.current = terminalsKey
  }

  useEffect(() => {
    const currentTerminals = terminalsRef.current

    // Only poll terminals that have a tmux session name (ctt- prefix)
    const tmuxTerminals = currentTerminals.filter(t =>
      t.sessionName || t.id?.startsWith('ctt-')
    )

    if (tmuxTerminals.length === 0) {
      setPaneTitles(new Map())
      return
    }

    const fetchPaneTitles = async () => {
      const results = await Promise.all(
        tmuxTerminals.map(async (terminal) => {
          try {
            const sessionName = terminal.sessionName || terminal.id
            const response = await fetch(
              `http://localhost:8129/api/tmux/info/${encodeURIComponent(sessionName)}`
            )
            const result = await response.json()

            if (result.success && result.paneTitle) {
              return {
                id: terminal.id,
                paneTitle: result.paneTitle,
              }
            }
            return { id: terminal.id, paneTitle: null }
          } catch (error) {
            return { id: terminal.id, paneTitle: null }
          }
        })
      )

      setPaneTitles(prevTitles => {
        const newTitles = new Map<string, string>()
        let changed = false

        for (const result of results) {
          if (result.paneTitle) {
            const prev = prevTitles.get(result.id)
            if (prev !== result.paneTitle) {
              changed = true
            }
            newTitles.set(result.id, result.paneTitle)
          }
        }

        // Only update if something changed
        if (changed || newTitles.size !== prevTitles.size) {
          return newTitles
        }
        return prevTitles
      })
    }

    // Initial fetch
    fetchPaneTitles()

    // Poll every 3 seconds (less frequent than Claude status since song changes are slower)
    const interval = setInterval(fetchPaneTitles, 3000)

    return () => clearInterval(interval)
  }, [terminalsKey])

  return paneTitles
}

/**
 * Check if a pane_title looks like a hostname or generic shell name
 * These should not be displayed as dynamic tab names
 */
export function isGenericPaneTitle(paneTitle: string | undefined): boolean {
  if (!paneTitle) return true

  // Strip the " @ path" suffix that the API adds before checking
  const cleanTitle = cleanPaneTitle(paneTitle)

  // Hostname patterns: MattDesktop, Matt-Desktop, localhost, ip-xxx
  const hostnamePattern = /^(localhost|[\w]+-?(desktop|laptop)|ip-[\d-]+)$/i
  if (hostnamePattern.test(cleanTitle)) return true

  // Generic shell names
  if (/^(bash|zsh|sh|fish|python|node)$/i.test(cleanTitle)) return true

  // Path-like names that aren't meaningful
  if (cleanTitle.startsWith('~') || cleanTitle.startsWith('/')) return true

  return false
}

/**
 * Clean pane_title for tab display
 * Strips the " @ path" suffix that the API adds
 */
export function cleanPaneTitle(paneTitle: string | undefined): string {
  if (!paneTitle) return ''

  // Strip " @ /path" or " @ ~/path" suffix
  const atIndex = paneTitle.lastIndexOf(' @ ')
  if (atIndex > 0) {
    const afterAt = paneTitle.slice(atIndex + 3)
    // Only strip if what follows looks like a path
    if (afterAt.startsWith('/') || afterAt.startsWith('~')) {
      return paneTitle.slice(0, atIndex)
    }
  }

  return paneTitle
}
