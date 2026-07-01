import { describe, it, expect, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { resetChromeStorage, setChromeStorageData, getChromeStorageData } from '../../setup'
import { useAccentSettings } from '../../../extension/hooks/useAccentSettings'
import { ACCENT_SETTINGS_KEY, DEFAULT_ACCENT } from '../../../extension/styles/accent'

describe('useAccentSettings', () => {
  beforeEach(() => resetChromeStorage())

  it('defaults to green when storage empty', async () => {
    const { result } = renderHook(() => useAccentSettings())
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.accentColor).toBe(DEFAULT_ACCENT)
    expect(result.current.glowEnabled).toBe(true)
  })

  it('loads persisted settings', async () => {
    setChromeStorageData({ [ACCENT_SETTINGS_KEY]: { accentColor: '#3b82f6', glowEnabled: false } })
    const { result } = renderHook(() => useAccentSettings())
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(result.current.accentColor).toBe('#3b82f6')
    expect(result.current.glowEnabled).toBe(false)
  })

  it('setAccent persists and updates state', async () => {
    const { result } = renderHook(() => useAccentSettings())
    await waitFor(() => expect(result.current.loaded).toBe(true))
    act(() => { result.current.setAccent({ accentColor: '#ffffff' }) })
    await waitFor(() => expect(result.current.accentColor).toBe('#ffffff'))
    expect(getChromeStorageData()[ACCENT_SETTINGS_KEY]).toMatchObject({ accentColor: '#ffffff' })
  })

  it('applies the accent to document CSS variables', async () => {
    setChromeStorageData({ [ACCENT_SETTINGS_KEY]: { accentColor: '#3b82f6' } })
    renderHook(() => useAccentSettings())
    await waitFor(() =>
      expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('#3b82f6'))
  })

  it('does not touch --color-primary when storage is empty', async () => {
    document.documentElement.style.removeProperty('--color-primary')
    const { result } = renderHook(() => useAccentSettings())
    await waitFor(() => expect(result.current.loaded).toBe(true))
    expect(document.documentElement.style.getPropertyValue('--color-primary')).toBe('')
  })
})
