import React, { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { connectToBackground, sendMessage } from '../shared/messaging'
import type { Profile } from '../components/settings/types'

/**
 * NewTab - Chrome new tab override page for TabzChrome
 *
 * A terminal-inspired launchpad that provides:
 * - Quick access to spawn terminals with profiles
 * - Backend connection status
 * - Keyboard shortcuts for power users
 */
export default function App() {
  const [wsConnected, setWsConnected] = useState(false)
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [currentTime, setCurrentTime] = useState(new Date())
  const [hoveredProfile, setHoveredProfile] = useState<string | null>(null)
  const [recentCommand, setRecentCommand] = useState<string | null>(null)

  // Connect to background worker
  useEffect(() => {
    const port = connectToBackground('newtab', (message) => {
      if (message.type === 'INITIAL_STATE') {
        setWsConnected(message.wsConnected)
      } else if (message.type === 'WS_CONNECTED') {
        setWsConnected(true)
      } else if (message.type === 'WS_DISCONNECTED') {
        setWsConnected(false)
      }
    })

    return () => port.disconnect()
  }, [])

  // Load profiles from Chrome storage
  useEffect(() => {
    chrome.storage.local.get(['profiles'], (result) => {
      if (result.profiles) {
        setProfiles(result.profiles)
      }
    })

    // Listen for profile changes
    const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (changes.profiles?.newValue) {
        setProfiles(changes.profiles.newValue)
      }
    }
    chrome.storage.local.onChanged.addListener(listener)
    return () => chrome.storage.local.onChanged.removeListener(listener)
  }, [])

  // Update time every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  // Spawn terminal with profile
  const handleSpawnProfile = useCallback((profile: Profile) => {
    chrome.storage.local.get(['globalWorkingDir'], (result) => {
      const globalWorkingDir = (result.globalWorkingDir as string) || '~'
      const effectiveWorkingDir = profile.workingDir || globalWorkingDir

      sendMessage({
        type: 'SPAWN_TERMINAL',
        spawnOption: 'bash',
        name: profile.name,
        workingDir: effectiveWorkingDir,
        command: profile.command,
        profile: { ...profile, workingDir: effectiveWorkingDir },
      })

      setRecentCommand(profile.command || 'bash')
      setTimeout(() => setRecentCommand(null), 2000)
    })
  }, [])

  // Open sidebar
  const openSidebar = useCallback(() => {
    chrome.runtime.sendMessage({ type: 'OPEN_SIDEPANEL' })
  }, [])

  // Format time
  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
  }

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric'
    })
  }

  // Get profile icon/emoji
  const getProfileIcon = (profile: Profile) => {
    const name = profile.name || ''
    const emojiMatch = name.match(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)\s*/u)
    return emojiMatch ? emojiMatch[0].trim() : null
  }

  const getProfileName = (profile: Profile) => {
    const name = profile.name || 'Unnamed'
    return name.replace(/^(\p{Emoji_Presentation}|\p{Emoji}\uFE0F?)\s*/u, '')
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white overflow-hidden relative">
      {/* Subtle grid background */}
      <div
        className="fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(0, 255, 136, 0.5) 1px, transparent 1px),
            linear-gradient(90deg, rgba(0, 255, 136, 0.5) 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
        }}
      />

      {/* Gradient orbs */}
      <div className="fixed top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-[#00ff88]/5 blur-[120px] pointer-events-none" />
      <div className="fixed bottom-[-30%] right-[-10%] w-[800px] h-[800px] rounded-full bg-[#00c8ff]/5 blur-[150px] pointer-events-none" />

      {/* Main content */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center p-8">
        {/* Header - Time & Status */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="fixed top-0 left-0 right-0 p-6 flex items-center justify-between"
        >
          {/* Logo */}
          <div className="flex items-center gap-3">
            <img
              src="/icons/tabz-logo-light.png"
              alt="Tabz"
              className="h-8 opacity-80"
            />
            <span className="text-sm font-medium text-white/60 font-mono">TabzChrome</span>
          </div>

          {/* Connection Status */}
          <div className="flex items-center gap-4">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-mono ${
              wsConnected
                ? 'bg-[#00ff88]/10 text-[#00ff88] border border-[#00ff88]/20'
                : 'bg-red-500/10 text-red-400 border border-red-500/20'
            }`}>
              <span className={`w-2 h-2 rounded-full ${wsConnected ? 'bg-[#00ff88] animate-pulse' : 'bg-red-400'}`} />
              {wsConnected ? 'Backend Connected' : 'Disconnected'}
            </div>
            <button
              onClick={openSidebar}
              className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-[#00ff88]/30 rounded-lg text-sm font-medium transition-all hover:text-[#00ff88]"
            >
              Open Sidebar
            </button>
          </div>
        </motion.header>

        {/* Center content */}
        <div className="text-center mb-12">
          {/* Time display */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.1 }}
            className="mb-6"
          >
            <h1 className="text-[120px] font-bold leading-none tracking-tight font-mono text-white/90">
              {formatTime(currentTime)}
            </h1>
            <p className="text-xl text-white/40 mt-2 font-light tracking-wide">
              {formatDate(currentTime)}
            </p>
          </motion.div>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="text-white/30 text-lg font-light mb-12"
          >
            Your terminal, right where you need it
          </motion.p>
        </div>

        {/* Profile Quick Launch */}
        {profiles.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="w-full max-w-4xl"
          >
            <h2 className="text-xs font-mono text-white/30 uppercase tracking-[0.2em] mb-4 text-center">
              Quick Launch
            </h2>
            <div className="flex flex-wrap justify-center gap-3">
              {profiles.slice(0, 8).map((profile, index) => {
                const icon = getProfileIcon(profile)
                const name = getProfileName(profile)
                const isHovered = hoveredProfile === profile.id

                return (
                  <motion.button
                    key={profile.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.5 + index * 0.05 }}
                    onClick={() => handleSpawnProfile(profile)}
                    onMouseEnter={() => setHoveredProfile(profile.id)}
                    onMouseLeave={() => setHoveredProfile(null)}
                    disabled={!wsConnected}
                    className={`
                      group relative px-5 py-3 rounded-xl border transition-all duration-300
                      ${wsConnected
                        ? 'bg-white/[0.02] hover:bg-white/[0.06] border-white/10 hover:border-[#00ff88]/40 cursor-pointer'
                        : 'bg-white/[0.01] border-white/5 cursor-not-allowed opacity-50'
                      }
                    `}
                  >
                    {/* Hover glow */}
                    <div className={`
                      absolute inset-0 rounded-xl bg-gradient-to-br from-[#00ff88]/10 to-[#00c8ff]/10 opacity-0
                      group-hover:opacity-100 transition-opacity duration-300 pointer-events-none
                    `} />

                    <div className="relative flex items-center gap-3">
                      {icon ? (
                        <span className="text-2xl">{icon}</span>
                      ) : (
                        <span className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#00ff88]/20 to-[#00c8ff]/20 flex items-center justify-center text-sm font-bold text-[#00ff88]">
                          {name.charAt(0).toUpperCase()}
                        </span>
                      )}
                      <div className="text-left">
                        <span className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">
                          {name}
                        </span>
                        {profile.command && (
                          <p className="text-xs font-mono text-white/30 truncate max-w-[150px]">
                            $ {profile.command}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Keyboard hint */}
                    <AnimatePresence>
                      {isHovered && wsConnected && (
                        <motion.span
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          className="absolute -top-2 -right-2 px-2 py-0.5 bg-[#00ff88] text-black text-[10px] font-bold rounded-md"
                        >
                          Click
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </motion.button>
                )
              })}
            </div>
          </motion.div>
        )}

        {/* Recent command toast */}
        <AnimatePresence>
          {recentCommand && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="fixed bottom-8 left-1/2 -translate-x-1/2 px-4 py-2 bg-[#00ff88]/10 border border-[#00ff88]/30 rounded-lg"
            >
              <span className="text-sm font-mono text-[#00ff88]">
                Spawning: $ {recentCommand}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Footer */}
        <motion.footer
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.7 }}
          className="fixed bottom-0 left-0 right-0 p-6 flex items-center justify-center gap-8 text-xs text-white/20"
        >
          <span className="font-mono">Alt+T → New Terminal</span>
          <span className="text-white/10">|</span>
          <span className="font-mono">term → Omnibox</span>
          <span className="text-white/10">|</span>
          <a
            href="https://github.com/GGPrompts/TabzChrome"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-[#00ff88] transition-colors"
          >
            GitHub
          </a>
        </motion.footer>
      </div>
    </div>
  )
}
