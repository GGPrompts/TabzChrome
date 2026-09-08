import { beforeEach, describe, expect, it, vi } from 'vitest'

describe('MAIN-world console registration', () => {
  beforeEach(() => { vi.resetModules() })

  it('registers the synchronous all-frame IIFE when absent', async () => {
    const registerContentScripts = vi.fn(async () => undefined)
    Object.assign(chrome, { scripting: {
      getRegisteredContentScripts: vi.fn(async () => []),
      registerContentScripts,
      updateContentScripts: vi.fn(),
    } })
    const module = await import('@/background/consoleMainWorldScript')
    await module.registerConsoleMainWorldScript()
    expect(registerContentScripts).toHaveBeenCalledExactlyOnceWith([expect.objectContaining({
      id: 'tabz-console-main-world',
      js: ['content/consoleMainWorld.js'],
      runAt: 'document_start',
      world: 'MAIN',
      allFrames: true,
      persistAcrossSessions: true,
    })])
  })

  it('updates an existing registration and shares concurrent registration work', async () => {
    let release!: (value: chrome.scripting.RegisteredContentScript[]) => void
    const pending = new Promise<chrome.scripting.RegisteredContentScript[]>(resolve => { release = resolve })
    const getRegisteredContentScripts = vi.fn(() => pending)
    const updateContentScripts = vi.fn(async () => undefined)
    Object.assign(chrome, { scripting: {
      getRegisteredContentScripts,
      registerContentScripts: vi.fn(),
      updateContentScripts,
    } })
    const module = await import('@/background/consoleMainWorldScript')
    const first = module.registerConsoleMainWorldScript()
    const second = module.registerConsoleMainWorldScript()
    release([module.CONSOLE_MAIN_WORLD_SCRIPT])
    await Promise.all([first, second])
    expect(getRegisteredContentScripts).toHaveBeenCalledTimes(1)
    expect(updateContentScripts).toHaveBeenCalledTimes(1)
  })
})
