import { describe, it, expect } from 'vitest'
import {
  backgroundGradients,
  gradientNames,
  getGradient,
  getGradientCSS,
  PANEL_COLORS,
  DEFAULT_PANEL_COLOR,
  DEFAULT_TRANSPARENCY,
  getPanelColor,
  type BackgroundGradient,
} from '../../../extension/styles/terminal-backgrounds'

describe('terminal-backgrounds', () => {
  describe('backgroundGradients object', () => {
    it('should have at least one gradient', () => {
      expect(Object.keys(backgroundGradients).length).toBeGreaterThan(0)
    })

    it('should have dark-neutral as the default', () => {
      expect(backgroundGradients['dark-neutral']).toBeDefined()
    })

    it('should include expected gradient categories', () => {
      // Neutral/Black
      expect(backgroundGradients['dark-neutral']).toBeDefined()
      expect(backgroundGradients['pure-black']).toBeDefined()
      expect(backgroundGradients['carbon']).toBeDefined()

      // Purple
      expect(backgroundGradients['dracula-purple']).toBeDefined()
      expect(backgroundGradients['deep-purple']).toBeDefined()

      // Blue
      expect(backgroundGradients['ocean-depths']).toBeDefined()
      expect(backgroundGradients['midnight-blue']).toBeDefined()

      // Green
      expect(backgroundGradients['matrix-depths']).toBeDefined()
      expect(backgroundGradients['terminal-green']).toBeDefined()

      // Warm/Amber
      expect(backgroundGradients['amber-warmth']).toBeDefined()

      // Neon/Cyberpunk
      expect(backgroundGradients['cyberpunk-neon']).toBeDefined()
      expect(backgroundGradients['vaporwave-dream']).toBeDefined()

      // Special
      expect(backgroundGradients['transparent']).toBeDefined()
    })
  })

  describe('BackgroundGradient structure', () => {
    it.each(Object.keys(backgroundGradients))('gradient "%s" should have required properties', (gradientName) => {
      const gradient = backgroundGradients[gradientName]

      expect(gradient.name).toBeDefined()
      expect(typeof gradient.name).toBe('string')
      expect(gradient.name.length).toBeGreaterThan(0)

      expect(gradient.gradient).toBeDefined()
      expect(typeof gradient.gradient).toBe('string')

      expect(gradient.lightGradient).toBeDefined()
      expect(typeof gradient.lightGradient).toBe('string')

      expect(gradient.preview).toBeDefined()
      expect(Array.isArray(gradient.preview)).toBe(true)
      expect(gradient.preview.length).toBeGreaterThan(0)
    })

    it.each(Object.keys(backgroundGradients))('gradient "%s" preview colors should be valid', (gradientName) => {
      const gradient = backgroundGradients[gradientName]

      gradient.preview.forEach((color) => {
        // Should be hex color or rgba
        expect(color).toMatch(/^(#[0-9a-fA-F]{6}|rgba?\([^)]+\))$/)
      })
    })
  })

  describe('gradient format validation', () => {
    it.each(Object.keys(backgroundGradients))('gradient "%s" should have valid CSS gradient or color', (gradientName) => {
      const gradient = backgroundGradients[gradientName]

      // Can be linear-gradient, radial-gradient, hex color, or transparent
      const validPatterns = [
        /^linear-gradient\(/,
        /^radial-gradient\(/,
        /^#[0-9a-fA-F]{6}$/,
        /^transparent$/,
      ]

      const darkMatches = validPatterns.some((pattern) => pattern.test(gradient.gradient))
      expect(darkMatches).toBe(true)

      const lightMatches = validPatterns.some((pattern) => pattern.test(gradient.lightGradient))
      expect(lightMatches).toBe(true)
    })

    it('pure-black should be solid colors', () => {
      const pureBlack = backgroundGradients['pure-black']

      expect(pureBlack.gradient).toBe('#000000')
      expect(pureBlack.lightGradient).toBe('#ffffff')
    })

    it('transparent should be transparent', () => {
      const transparent = backgroundGradients['transparent']

      expect(transparent.gradient).toBe('transparent')
      expect(transparent.lightGradient).toBe('transparent')
    })
  })

  describe('gradientNames', () => {
    it('should be an array of gradient keys', () => {
      expect(Array.isArray(gradientNames)).toBe(true)
      expect(gradientNames.length).toBe(Object.keys(backgroundGradients).length)
    })

    it('should contain all gradient keys', () => {
      Object.keys(backgroundGradients).forEach((gradientName) => {
        expect(gradientNames).toContain(gradientName)
      })
    })
  })

  describe('getGradient', () => {
    it('should return gradient by key', () => {
      const gradient = getGradient('ocean-depths')

      expect(gradient).toEqual(backgroundGradients['ocean-depths'])
    })

    it('should return dark-neutral for undefined key', () => {
      const gradient = getGradient(undefined)

      expect(gradient).toEqual(backgroundGradients['dark-neutral'])
    })

    it('should return dark-neutral for empty string', () => {
      const gradient = getGradient('')

      expect(gradient).toEqual(backgroundGradients['dark-neutral'])
    })

    it('should return dark-neutral for unknown key', () => {
      const gradient = getGradient('non-existent-gradient')

      expect(gradient).toEqual(backgroundGradients['dark-neutral'])
    })

    it('should return correct gradient for all keys', () => {
      gradientNames.forEach((name) => {
        const gradient = getGradient(name)
        expect(gradient).toEqual(backgroundGradients[name])
      })
    })
  })

  describe('getGradientCSS', () => {
    it('should return dark gradient when isDark is true', () => {
      const css = getGradientCSS('cyberpunk-neon', true)

      expect(css).toBe(backgroundGradients['cyberpunk-neon'].gradient)
    })

    it('should return light gradient when isDark is false', () => {
      const css = getGradientCSS('cyberpunk-neon', false)

      expect(css).toBe(backgroundGradients['cyberpunk-neon'].lightGradient)
    })

    it('should default to dark mode', () => {
      const css = getGradientCSS('amber-warmth')

      expect(css).toBe(backgroundGradients['amber-warmth'].gradient)
    })

    it('should fall back to dark-neutral for undefined key', () => {
      const css = getGradientCSS(undefined, true)

      expect(css).toBe(backgroundGradients['dark-neutral'].gradient)
    })

    it('should fall back to dark-neutral for unknown key', () => {
      const css = getGradientCSS('unknown-gradient', true)

      expect(css).toBe(backgroundGradients['dark-neutral'].gradient)
    })

    it('should return valid CSS for all gradients', () => {
      gradientNames.forEach((name) => {
        const darkCss = getGradientCSS(name, true)
        const lightCss = getGradientCSS(name, false)

        expect(typeof darkCss).toBe('string')
        expect(darkCss.length).toBeGreaterThan(0)
        expect(typeof lightCss).toBe('string')
        expect(lightCss.length).toBeGreaterThan(0)
      })
    })
  })

  describe('PANEL_COLORS', () => {
    it('should be an array of color presets', () => {
      expect(Array.isArray(PANEL_COLORS)).toBe(true)
      expect(PANEL_COLORS.length).toBeGreaterThan(0)
    })

    it('should have name and value for each preset', () => {
      PANEL_COLORS.forEach((preset) => {
        expect(preset.name).toBeDefined()
        expect(typeof preset.name).toBe('string')
        expect(preset.name.length).toBeGreaterThan(0)

        expect(preset.value).toBeDefined()
        expect(preset.value).toMatch(/^#[0-9a-fA-F]{6}$/)
      })
    })

    it('should include Black as first option', () => {
      expect(PANEL_COLORS[0].name).toBe('Black')
      expect(PANEL_COLORS[0].value).toBe('#000000')
    })

    it('should include accent colors', () => {
      const names = PANEL_COLORS.map((p) => p.name)

      expect(names).toContain('Navy')
      expect(names).toContain('Forest')
      expect(names).toContain('Wine')
      expect(names).toContain('Purple')
    })

    it('should have unique values', () => {
      const values = PANEL_COLORS.map((p) => p.value)
      const uniqueValues = new Set(values)

      expect(uniqueValues.size).toBe(values.length)
    })
  })

  describe('DEFAULT_PANEL_COLOR', () => {
    it('should be black', () => {
      expect(DEFAULT_PANEL_COLOR).toBe('#000000')
    })

    it('should match first PANEL_COLORS entry', () => {
      expect(DEFAULT_PANEL_COLOR).toBe(PANEL_COLORS[0].value)
    })
  })

  describe('DEFAULT_TRANSPARENCY', () => {
    it('should be 100 (full gradient)', () => {
      expect(DEFAULT_TRANSPARENCY).toBe(100)
    })
  })

  describe('getPanelColor', () => {
    it('should return same color in dark mode', () => {
      PANEL_COLORS.forEach((preset) => {
        const color = getPanelColor(preset.value, true)
        expect(color).toBe(preset.value)
      })
    })

    it('should return light equivalent in light mode', () => {
      // Black -> white
      expect(getPanelColor('#000000', false)).toBe('#ffffff')

      // Near black -> light gray
      expect(getPanelColor('#0a0a0f', false)).toBe('#f8f9fa')

      // Navy -> light blue
      expect(getPanelColor('#0a0d1a', false)).toBe('#e8f4fc')

      // Forest -> light green
      expect(getPanelColor('#0a1a0a', false)).toBe('#f0fdf4')

      // Wine -> light red
      expect(getPanelColor('#1a0a0f', false)).toBe('#fff5f5')

      // Purple -> light purple
      expect(getPanelColor('#14001e', false)).toBe('#fdf4ff')
    })

    it('should return white for unknown color in light mode', () => {
      const color = getPanelColor('#123456', false)

      expect(color).toBe('#ffffff')
    })

    it('should return original for unknown color in dark mode', () => {
      const color = getPanelColor('#123456', true)

      expect(color).toBe('#123456')
    })

    it('should handle all PANEL_COLORS presets', () => {
      PANEL_COLORS.forEach((preset) => {
        const darkColor = getPanelColor(preset.value, true)
        const lightColor = getPanelColor(preset.value, false)

        // Dark mode returns original
        expect(darkColor).toBe(preset.value)

        // Light mode returns mapped color or white fallback
        expect(lightColor).toMatch(/^#[0-9a-fA-F]{6}$/)
      })
    })
  })

  describe('gradient categories', () => {
    it('should have gradients for each color family', () => {
      // Neutral/Black gradients
      const neutralGradients = ['dark-neutral', 'pure-black', 'carbon']
      neutralGradients.forEach((name) => {
        expect(backgroundGradients[name]).toBeDefined()
      })

      // Purple gradients
      const purpleGradients = ['dracula-purple', 'deep-purple']
      purpleGradients.forEach((name) => {
        expect(backgroundGradients[name]).toBeDefined()
      })

      // Blue gradients
      const blueGradients = ['ocean-depths', 'midnight-blue']
      blueGradients.forEach((name) => {
        expect(backgroundGradients[name]).toBeDefined()
      })

      // Green gradients
      const greenGradients = ['matrix-depths', 'terminal-green', 'forest-night']
      greenGradients.forEach((name) => {
        expect(backgroundGradients[name]).toBeDefined()
      })
    })

    it('dark gradients should use dark colors', () => {
      // Check that dark mode gradients contain dark hex values
      const darkGradients = ['dark-neutral', 'dracula-purple', 'ocean-depths', 'matrix-depths']

      darkGradients.forEach((name) => {
        const gradient = backgroundGradients[name]
        // Preview colors should be dark (low brightness)
        gradient.preview.forEach((color) => {
          if (color.startsWith('#')) {
            const r = parseInt(color.slice(1, 3), 16)
            const g = parseInt(color.slice(3, 5), 16)
            const b = parseInt(color.slice(5, 7), 16)
            const brightness = (r + g + b) / 3

            // Dark colors should have low brightness
            expect(brightness).toBeLessThan(100)
          }
        })
      })
    })
  })

  describe('light gradient variants', () => {
    it('light gradients should be softer versions, not pure white', () => {
      gradientNames.forEach((name) => {
        if (name === 'pure-black' || name === 'transparent') return

        const gradient = backgroundGradients[name]

        // Light gradients should still be gradients (not just white)
        if (gradient.lightGradient !== 'transparent') {
          expect(gradient.lightGradient).toMatch(/^(linear|radial)-gradient\(/)
        }
      })
    })

    it('light gradients should contain light colors', () => {
      const testGradients = ['dark-neutral', 'ocean-depths', 'amber-warmth']

      testGradients.forEach((name) => {
        const gradient = backgroundGradients[name]

        // Light gradient should contain high-value hex colors (f in first digit)
        expect(gradient.lightGradient).toMatch(/#[ef][0-9a-f]{5}/i)
      })
    })
  })

  describe('gradient consistency', () => {
    it('gradient and lightGradient should use same gradient type', () => {
      gradientNames.forEach((name) => {
        const gradient = backgroundGradients[name]

        // Skip solid colors and transparent
        if (
          !gradient.gradient.includes('gradient') ||
          !gradient.lightGradient.includes('gradient')
        ) {
          return
        }

        // If dark is linear, light should be linear
        if (gradient.gradient.startsWith('linear-gradient')) {
          expect(gradient.lightGradient).toMatch(/^linear-gradient/)
        }

        // If dark is radial, light should be radial
        if (gradient.gradient.startsWith('radial-gradient')) {
          expect(gradient.lightGradient).toMatch(/^radial-gradient/)
        }
      })
    })
  })

  describe('edge cases', () => {
    it('getGradient should handle null-like values', () => {
      expect(getGradient(undefined)).toEqual(backgroundGradients['dark-neutral'])
      expect(getGradient('')).toEqual(backgroundGradients['dark-neutral'])
    })

    it('getGradientCSS should handle null-like values', () => {
      expect(getGradientCSS(undefined)).toBe(backgroundGradients['dark-neutral'].gradient)
      expect(getGradientCSS('')).toBe(backgroundGradients['dark-neutral'].gradient)
    })

    it('getPanelColor should handle edge case colors', () => {
      // Valid hex but not in mapping
      expect(getPanelColor('#abcdef', true)).toBe('#abcdef')
      expect(getPanelColor('#abcdef', false)).toBe('#ffffff')
    })
  })
})
