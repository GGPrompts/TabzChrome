import React, { useState, useEffect, useRef } from 'react'
import { RefreshCw, Bell } from 'lucide-react'
import { BellIcon, type AnimatedIconHandle } from '../../components/icons'
import {
  NotificationSettings,
  NotificationEventSettings,
  NotificationEventType,
  NOTIFICATION_EVENT_INFO,
  DEFAULT_NOTIFICATION_SETTINGS,
} from '../../components/settings/types'

export default function NotificationsSection() {
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS)
  const [loading, setLoading] = useState(true)
  const [testPlaying, setTestPlaying] = useState(false)

  // Animated icon ref - play animation on mount
  const iconRef = useRef<AnimatedIconHandle>(null)
  useEffect(() => {
    const timer = setTimeout(() => iconRef.current?.startAnimation(), 100)
    return () => clearTimeout(timer)
  }, [])

  // Load settings from Chrome storage
  useEffect(() => {
    const loadSettings = async () => {
      try {
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.local.get(['notificationSettings'], (result: { notificationSettings?: NotificationSettings }) => {
            if (result.notificationSettings) {
              setNotificationSettings({ ...DEFAULT_NOTIFICATION_SETTINGS, ...result.notificationSettings })
            }
            setLoading(false)
          })
        } else {
          setLoading(false)
        }
      } catch (err) {
        console.error('Failed to load notification settings:', err)
        setLoading(false)
      }
    }
    loadSettings()
  }, [])

  // Listen for external changes to notification settings
  useEffect(() => {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      const listener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
        if (areaName !== 'local') return
        if (changes.notificationSettings?.newValue) {
          setNotificationSettings({ ...DEFAULT_NOTIFICATION_SETTINGS, ...changes.notificationSettings.newValue })
        }
      }
      chrome.storage.onChanged.addListener(listener)
      return () => chrome.storage.onChanged.removeListener(listener)
    }
  }, [])

  // Save settings to Chrome storage
  const saveSettings = (newSettings: NotificationSettings) => {
    setNotificationSettings(newSettings)
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.set({ notificationSettings: newSettings })
    }
  }

  const updateSettings = (updates: Partial<NotificationSettings>) => {
    saveSettings({ ...notificationSettings, ...updates })
  }

  const updateEvents = (updates: Partial<NotificationEventSettings>) => {
    saveSettings({
      ...notificationSettings,
      events: { ...notificationSettings.events, ...updates },
    })
  }

  const handleTestNotification = async () => {
    if (testPlaying) return
    setTestPlaying(true)

    try {
      if (typeof chrome !== 'undefined' && chrome.notifications) {
        chrome.notifications.create({
          type: 'basic',
          iconUrl: chrome.runtime.getURL('icons/icon48.png'),
          title: 'TabzChrome Test',
          message: 'Desktop notifications are working!',
          priority: 1,
        }, () => {
          setTestPlaying(false)
        })
      } else {
        // Fallback for dev environment
        if ('Notification' in window) {
          if (Notification.permission === 'granted') {
            new Notification('TabzChrome Test', {
              body: 'Desktop notifications are working!',
            })
          } else if (Notification.permission !== 'denied') {
            const permission = await Notification.requestPermission()
            if (permission === 'granted') {
              new Notification('TabzChrome Test', {
                body: 'Desktop notifications are working!',
              })
            }
          }
        }
        setTestPlaying(false)
      }
    } catch (err) {
      console.error('[Notification] Test failed:', err)
      setTestPlaying(false)
    }
  }

  // Format hour for display (e.g., 22 -> "10:00 PM")
  const formatHour = (hour: number): string => {
    const period = hour >= 12 ? 'PM' : 'AM'
    const displayHour = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour
    return `${displayHour}:00 ${period}`
  }

  // Check if currently in quiet hours
  const isInQuietHours = (): boolean => {
    if (!notificationSettings.quietHours.enabled) return false
    const now = new Date()
    const currentHour = now.getHours()
    const { startHour, endHour } = notificationSettings.quietHours

    if (startHour < endHour) {
      // Simple case: e.g., 9 AM to 5 PM
      return currentHour >= startHour && currentHour < endHour
    } else {
      // Overnight case: e.g., 10 PM to 8 AM
      return currentHour >= startHour || currentHour < endHour
    }
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-full">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  // Group events by category
  const connectionEvents: NotificationEventType[] = ['backendDisconnect', 'backendReconnect']
  const terminalEvents: NotificationEventType[] = ['spawnError', 'terminalError', 'longRunningComplete', 'orphanedSessions']
  const claudeEvents: NotificationEventType[] = ['contextCritical', 'questionWaiting']
  const systemEvents: NotificationEventType[] = ['errorBoundary', 'downloadFailure']

  const renderEventToggle = (eventType: NotificationEventType) => {
    const info = NOTIFICATION_EVENT_INFO[eventType]
    return (
      <div key={eventType} className="flex items-center justify-between p-4">
        <div>
          <span className="text-sm font-medium">{info.label}</span>
          <p className="text-xs text-muted-foreground mt-0.5">{info.description}</p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={notificationSettings.events[eventType]}
            onChange={(e) => updateEvents({ [eventType]: e.target.checked })}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
        </label>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold font-mono text-primary terminal-glow flex items-center gap-3">
          <BellIcon ref={iconRef} size={32} />
          Notifications
        </h1>
        <p className="text-muted-foreground mt-1">
          Desktop notifications for important events. Uses Chrome's native notification system.
        </p>
      </div>

      {/* Master Toggle */}
      <section className="mb-8">
        <div className="rounded-xl bg-card border border-border p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Enable Desktop Notifications</h3>
              <p className="text-sm text-muted-foreground mt-1">Master switch for all desktop alerts</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notificationSettings.enabled}
                onChange={(e) => updateSettings({ enabled: e.target.checked })}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </div>
      </section>

      {/* Quiet Hours */}
      <section className={`mb-8 ${!notificationSettings.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <h2 className="text-lg font-semibold mb-4">Quiet Hours</h2>
        <div className="rounded-xl bg-card border border-border p-6 space-y-6">
          {/* Enable Quiet Hours */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-sm font-medium">Enable Quiet Hours</span>
              <p className="text-xs text-muted-foreground mt-0.5">
                Suppress notifications during specified hours
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={notificationSettings.quietHours.enabled}
                onChange={(e) => updateSettings({
                  quietHours: { ...notificationSettings.quietHours, enabled: e.target.checked }
                })}
                className="sr-only peer"
              />
              <div className="w-9 h-5 bg-muted rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          {/* Time Range (only shown when enabled) */}
          {notificationSettings.quietHours.enabled && (
            <div className="space-y-4 pt-4 border-t border-border">
              <div className="grid grid-cols-2 gap-4">
                {/* Start Hour */}
                <div>
                  <label className="block text-sm font-medium mb-2">Start Time</label>
                  <select
                    value={notificationSettings.quietHours.startHour}
                    onChange={(e) => updateSettings({
                      quietHours: { ...notificationSettings.quietHours, startHour: parseInt(e.target.value) }
                    })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:border-primary focus:outline-none"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{formatHour(i)}</option>
                    ))}
                  </select>
                </div>

                {/* End Hour */}
                <div>
                  <label className="block text-sm font-medium mb-2">End Time</label>
                  <select
                    value={notificationSettings.quietHours.endHour}
                    onChange={(e) => updateSettings({
                      quietHours: { ...notificationSettings.quietHours, endHour: parseInt(e.target.value) }
                    })}
                    className="w-full px-3 py-2 bg-background border border-border rounded-lg text-foreground focus:border-primary focus:outline-none"
                  >
                    {Array.from({ length: 24 }, (_, i) => (
                      <option key={i} value={i}>{formatHour(i)}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Status indicator */}
              <div className={`text-sm ${isInQuietHours() ? 'text-yellow-400' : 'text-muted-foreground'}`}>
                {isInQuietHours() ? (
                  <span>Currently in quiet hours - notifications are muted</span>
                ) : (
                  <span>
                    Notifications will be muted from {formatHour(notificationSettings.quietHours.startHour)} to {formatHour(notificationSettings.quietHours.endHour)}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Connection Events */}
      <section className={`mb-8 ${!notificationSettings.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <h2 className="text-lg font-semibold mb-2">Connection Events</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Alerts for backend WebSocket connection status.
        </p>
        <div className="rounded-xl bg-card border border-border divide-y divide-border">
          {connectionEvents.map(renderEventToggle)}
        </div>
      </section>

      {/* Terminal Events */}
      <section className={`mb-8 ${!notificationSettings.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <h2 className="text-lg font-semibold mb-2">Terminal Events</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Alerts for terminal lifecycle and errors.
        </p>
        <div className="rounded-xl bg-card border border-border divide-y divide-border">
          {terminalEvents.map(renderEventToggle)}
        </div>
      </section>

      {/* Claude Events */}
      <section className={`mb-8 ${!notificationSettings.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <h2 className="text-lg font-semibold mb-2">Claude Events</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Alerts specific to Claude Code sessions.
        </p>
        <div className="rounded-xl bg-card border border-border divide-y divide-border">
          {claudeEvents.map(renderEventToggle)}
        </div>
      </section>

      {/* System Events */}
      <section className={`mb-8 ${!notificationSettings.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <h2 className="text-lg font-semibold mb-2">System Events</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Alerts for UI errors and MCP operations.
        </p>
        <div className="rounded-xl bg-card border border-border divide-y divide-border">
          {systemEvents.map(renderEventToggle)}
        </div>
      </section>

      {/* Test Button */}
      <section className={`mb-8 ${!notificationSettings.enabled ? 'opacity-50 pointer-events-none' : ''}`}>
        <div className="rounded-xl bg-card border border-border p-6">
          <button
            onClick={handleTestNotification}
            disabled={testPlaying}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Bell className="h-4 w-4" />
            {testPlaying ? 'Sending...' : 'Test Notification'}
          </button>
        </div>
      </section>

      {/* Info */}
      <section>
        <div className="rounded-xl bg-muted/50 border border-border p-4">
          <p className="text-sm text-muted-foreground">
            <strong>Note:</strong> Desktop notifications use Chrome's native notification system.
            Notifications may be suppressed if your system has Do Not Disturb enabled or if Chrome
            notifications are blocked in your OS settings.
          </p>
        </div>
      </section>
    </div>
  )
}
