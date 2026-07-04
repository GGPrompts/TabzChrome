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

describe('TerminalCustomizePopover quick rename', () => {
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

  it('hides the rename field when onRename is not provided', () => {
    renderPopover({ onRename: undefined, currentName: undefined })
    expect(screen.queryByLabelText('Terminal name')).toBeNull()
  })
})
