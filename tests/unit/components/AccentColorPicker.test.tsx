import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { AccentColorPicker } from '../../../extension/components/AccentColorPicker'

function setup(overrides = {}) {
  const onColorChange = vi.fn()
  const onGlowChange = vi.fn()
  render(
    <AccentColorPicker
      color="#00ff88"
      glowEnabled={true}
      onColorChange={onColorChange}
      onGlowChange={onGlowChange}
      {...overrides}
    />
  )
  return { onColorChange, onGlowChange }
}

describe('AccentColorPicker', () => {
  it('renders a swatch per preset', () => {
    setup()
    // Blue preset swatch is reachable by its title
    expect(screen.getByTitle('Blue')).toBeTruthy()
    expect(screen.getByTitle('White')).toBeTruthy()
  })

  it('clicking a preset calls onColorChange with that hex', () => {
    const { onColorChange } = setup()
    fireEvent.click(screen.getByTitle('Blue'))
    expect(onColorChange).toHaveBeenCalledWith('#3b82f6')
  })

  it('changing the native color input calls onColorChange', () => {
    const { onColorChange } = setup()
    const input = screen.getByLabelText('Custom color') as HTMLInputElement
    fireEvent.input(input, { target: { value: '#123456' } })
    expect(onColorChange).toHaveBeenCalledWith('#123456')
  })

  it('toggling glow calls onGlowChange with the new value', () => {
    const { onGlowChange } = setup()
    fireEvent.click(screen.getByRole('switch', { name: /glow/i }))
    expect(onGlowChange).toHaveBeenCalledWith(false)
  })
})
