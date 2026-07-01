import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { TerminalCustomizePopover } from '../../../extension/components/TerminalCustomizePopover'

function renderPopover(extra = {}) {
  const onUpdate = vi.fn()
  const onReset = vi.fn()
  const onRename = vi.fn()
  render(
    <TerminalCustomizePopover
      sessionId="ctt-default-abcd1234"
      isOpen={true}
      position={{ x: 10, y: 10 }}
      currentOverrides={undefined}
      profileDefaults={{}}
      currentName="My Term"
      onRename={onRename}
      accentDefaults={{ accentColor: '#00ff88', glowEnabled: true }}
      onUpdate={onUpdate}
      onReset={onReset}
      onIncreaseFontSize={() => {}}
      onDecreaseFontSize={() => {}}
      onResetFontSize={() => {}}
      onClose={() => {}}
      {...extra}
    />
  )
  return { onUpdate, onReset, onRename }
}

describe('TerminalCustomizePopover accent additions', () => {
  it('renders the rename field with the current name', () => {
    renderPopover()
    const input = screen.getByLabelText('Terminal name') as HTMLInputElement
    expect(input.value).toBe('My Term')
  })

  it('typing in the rename field calls onRename live', () => {
    const { onRename } = renderPopover()
    fireEvent.change(screen.getByLabelText('Terminal name'), { target: { value: 'Renamed' } })
    expect(onRename).toHaveBeenCalledWith('ctt-default-abcd1234', 'Renamed')
  })

  it('choosing an accent preset calls onUpdate with accentColor', () => {
    const { onUpdate } = renderPopover()
    fireEvent.click(screen.getByTitle('Blue'))
    expect(onUpdate).toHaveBeenCalledWith('ctt-default-abcd1234', { accentColor: '#3b82f6' })
  })

  it('toggling glow calls onUpdate with glowEnabled', () => {
    const { onUpdate } = renderPopover()
    fireEvent.click(screen.getByRole('switch', { name: /glow/i }))
    expect(onUpdate).toHaveBeenCalledWith('ctt-default-abcd1234', { glowEnabled: false })
  })
})
