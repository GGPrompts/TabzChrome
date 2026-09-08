import { beforeEach, describe, expect, it, vi } from 'vitest'

import { setupActionHandler } from '../../../extension/background/keyboard'
import { configureSidePanelActionToggle } from '../../../extension/shared/sidePanel'

describe('Chrome-managed side panel toggle', () => {
  const setPanelBehavior = vi.fn(async () => undefined)
  const addActionListener = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(chrome, {
      sidePanel: { setPanelBehavior },
      action: { onClicked: { addListener: addActionListener } }
    })
  })

  it('enables Chrome toolbar-click toggle behavior', async () => {
    await expect(configureSidePanelActionToggle()).resolves.toBe(true)
    expect(setPanelBehavior).toHaveBeenCalledWith({ openPanelOnActionClick: true })
  })

  it('setup does not register a competing manual action-click opener', async () => {
    setupActionHandler()
    await vi.waitFor(() => expect(setPanelBehavior).toHaveBeenCalledOnce())
    expect(addActionListener).not.toHaveBeenCalled()
  })

  it('contains configuration failures without an unhandled rejection', async () => {
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    setPanelBehavior.mockRejectedValueOnce(new Error('policy blocked'))

    await expect(configureSidePanelActionToggle()).resolves.toBe(false)
    expect(warning).toHaveBeenCalledWith(
      '[SidePanel] Could not configure toolbar toggle:',
      expect.any(Error)
    )
    warning.mockRestore()
  })
})
