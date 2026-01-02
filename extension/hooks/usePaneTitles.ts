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
 *
 * We want to SHOW: Claude task names, PyRadio songs, etc. (dynamic content)
 * We want to HIDE: hostnames, shell names (static/generic content)
 */
export function isGenericPaneTitle(paneTitle: string | undefined): boolean {
  if (!paneTitle) return true

  // Strip the " @ path" suffix that the API adds before checking
  const cleanTitle = cleanPaneTitle(paneTitle)

  // Empty or whitespace only
  if (!cleanTitle.trim()) return true

  // Generic shell names (exact match or with command in parentheses like "bash (./app)")
  if (/^(bash|zsh|sh|fish|python|node|ruby|perl)$/i.test(cleanTitle)) return true
  if (/^(bash|zsh|sh|fish)\s*\(.*\)$/i.test(cleanTitle)) return true

  // Path-like names that aren't meaningful
  if (cleanTitle.startsWith('~') || cleanTitle.startsWith('/')) return true

  // Hostname patterns - expanded to catch more cases:
  // - localhost
  // - MattDesktop, Matt-Desktop, matt-laptop (word + desktop/laptop)
  // - DESKTOP-ABC123 (Windows default)
  // - MacBook-Pro, MacBook-Air, iMac, Mac-mini, Mac-Studio (Apple)
  // - ip-xxx-xxx (AWS/cloud)
  // - Single short word that looks like a hostname (lowercase, no spaces, 3-15 chars)
  const hostnamePatterns = [
    /^localhost$/i,
    /^[\w]+-?(desktop|laptop)$/i,                    // MattDesktop, Matt-Laptop
    /^desktop-[a-z0-9]+$/i,                          // DESKTOP-ABC123 (Windows)
    /^(macbook|imac|mac-?(mini|pro|studio))/i,       // Apple devices
    /^ip-[\d-]+$/i,                                  // AWS instances
    /^[a-z][a-z0-9-]{1,14}$/,                        // Short lowercase hostnames (matt, dev-box)
  ]

  if (hostnamePatterns.some(pattern => pattern.test(cleanTitle))) return true

  // Single word with no spaces is likely a hostname (e.g., "LappityToppity")
  // Real content like song titles or task names almost always have spaces
  // Exception: allow single words that look like app names (contain numbers or special chars)
  if (/^\w+$/.test(cleanTitle) && cleanTitle.length <= 20 && !/\d/.test(cleanTitle)) {
    return true
  }

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
