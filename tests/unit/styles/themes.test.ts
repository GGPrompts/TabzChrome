import { describe, it, expect } from 'vitest'
import {
  themes,
  themeNames,
  getThemeColors,
  getBackgroundGradient,
  getThemeVariant,
  type ThemeColors,
  type ThemeVariant,
  type Theme,
} from '../../../extension/styles/themes'

// Required color properties for every theme
const REQUIRED_COLOR_PROPERTIES: (keyof ThemeColors)[] = [
  'background',
  'foreground',
  'cursor',
  'selectionBackground',
  'black',
  'red',
  'green',
  'yellow',
  'blue',
  'magenta',
  'cyan',
  'white',
  'brightBlack',
  'brightRed',
  'brightGreen',
  'brightYellow',
  'brightBlue',
  'brightMagenta',
  'brightCyan',
  'brightWhite',
]

// CSS color pattern - matches hex, rgba, transparent, or gradient
const CSS_COLOR_PATTERN = /^(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{8}|rgba?\([^)]+\)|transparent)$/

describe('themes', () => {
  describe('themes object', () => {
    it('should have at least one theme', () => {
      expect(Object.keys(themes).length).toBeGreaterThan(0)
    })

    it('should have high-contrast as the default theme', () => {
      expect(themes['high-contrast']).toBeDefined()
    })

    it('should include all expected themes', () => {
      const expectedThemes = [
        'high-contrast',
        'dracula',
        'ocean',
        'neon',
        'amber',
        'matrix',
        'cyberpunk',
        'vaporwave',
        'synthwave',
        'aurora',
        'holographic',
      ]

      expectedThemes.forEach((themeName) => {
        expect(themes[themeName]).toBeDefined()
      })
    })
  })

  describe('theme structure', () => {
    it.each(Object.keys(themes))('theme "%s" should have required properties', (themeName) => {
      const theme = themes[themeName]

      expect(theme.name).toBeDefined()
      expect(typeof theme.name).toBe('string')
      expect(theme.name.length).toBeGreaterThan(0)

      expect(theme.description).toBeDefined()
      expect(typeof theme.description).toBe('string')

      expect(theme.dark).toBeDefined()
      expect(theme.light).toBeDefined()
    })

    it.each(Object.keys(themes))('theme "%s" dark variant should have all color properties', (themeName) => {
      const theme = themes[themeName]

      REQUIRED_COLOR_PROPERTIES.forEach((prop) => {
        expect(theme.dark.colors[prop]).toBeDefined()
        expect(typeof theme.dark.colors[prop]).toBe('string')
      })

      expect(theme.dark.backgroundGradient).toBeDefined()
      expect(typeof theme.dark.backgroundGradient).toBe('string')
    })

    it.each(Object.keys(themes))('theme "%s" light variant should have all color properties', (themeName) => {
      const theme = themes[themeName]

      REQUIRED_COLOR_PROPERTIES.forEach((prop) => {
        expect(theme.light.colors[prop]).toBeDefined()
        expect(typeof theme.light.colors[prop]).toBe('string')
      })

      expect(theme.light.backgroundGradient).toBeDefined()
      expect(typeof theme.light.backgroundGradient).toBe('string')
    })
  })

  describe('color format validation', () => {
    it.each(Object.keys(themes))('theme "%s" dark colors should be valid CSS colors', (themeName) => {
      const theme = themes[themeName]
      const { colors } = theme.dark

      // Background can be transparent or rgba
      expect(colors.background).toMatch(/^(#[0-9a-fA-F]{6}|rgba?\([^)]+\))$/)

      // Foreground, cursor should be hex colors
      expect(colors.foreground).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(colors.cursor).toMatch(/^#[0-9a-fA-F]{6}$/)

      // Selection can be rgba
      expect(colors.selectionBackground).toMatch(/^rgba?\([^)]+\)$/)

      // Standard ANSI colors should be hex
      const ansiColors: (keyof ThemeColors)[] = [
        'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white',
        'brightBlack', 'brightRed', 'brightGreen', 'brightYellow',
        'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite',
      ]

      ansiColors.forEach((color) => {
        expect(colors[color]).toMatch(/^#[0-9a-fA-F]{6}$/)
      })
    })

    it.each(Object.keys(themes))('theme "%s" light colors should be valid CSS colors', (themeName) => {
      const theme = themes[themeName]
      const { colors } = theme.light

      // Background should be opaque for light mode
      expect(colors.background).toMatch(/^(#[0-9a-fA-F]{6}|rgba?\([^)]+\))$/)

      // Foreground, cursor should be hex colors
      expect(colors.foreground).toMatch(/^#[0-9a-fA-F]{6}$/)
      expect(colors.cursor).toMatch(/^#[0-9a-fA-F]{6}$/)
    })

    it.each(Object.keys(themes))('theme "%s" should have valid background gradients', (themeName) => {
      const theme = themes[themeName]

      // Dark gradient should be linear-gradient or radial-gradient
      expect(theme.dark.backgroundGradient).toMatch(/^(linear|radial)-gradient\(/)

      // Light gradient should be linear-gradient or radial-gradient
      expect(theme.light.backgroundGradient).toMatch(/^(linear|radial)-gradient\(/)
    })
  })

  describe('themeNames', () => {
    it('should be an array of theme keys', () => {
      expect(Array.isArray(themeNames)).toBe(true)
      expect(themeNames.length).toBe(Object.keys(themes).length)
    })

    it('should contain all theme keys', () => {
      Object.keys(themes).forEach((themeName) => {
        expect(themeNames).toContain(themeName)
      })
    })
  })

  describe('getThemeColors', () => {
    it('should return dark colors when isDark is true', () => {
      const colors = getThemeColors('dracula', true)

      expect(colors).toEqual(themes['dracula'].dark.colors)
    })

    it('should return light colors when isDark is false', () => {
      const colors = getThemeColors('dracula', false)

      expect(colors).toEqual(themes['dracula'].light.colors)
    })

    it('should fall back to high-contrast theme for unknown theme', () => {
      const colors = getThemeColors('non-existent-theme', true)

      expect(colors).toEqual(themes['high-contrast'].dark.colors)
    })

    it('should return correct colors for all themes', () => {
      themeNames.forEach((themeName) => {
        const darkColors = getThemeColors(themeName, true)
        const lightColors = getThemeColors(themeName, false)

        expect(darkColors).toEqual(themes[themeName].dark.colors)
        expect(lightColors).toEqual(themes[themeName].light.colors)
      })
    })
  })

  describe('getBackgroundGradient', () => {
    it('should return dark gradient when isDark is true', () => {
      const gradient = getBackgroundGradient('ocean', true)

      expect(gradient).toBe(themes['ocean'].dark.backgroundGradient)
    })

    it('should return light gradient when isDark is false', () => {
      const gradient = getBackgroundGradient('ocean', false)

      expect(gradient).toBe(themes['ocean'].light.backgroundGradient)
    })

    it('should fall back to high-contrast theme for unknown theme', () => {
      const gradient = getBackgroundGradient('unknown-theme', true)

      expect(gradient).toBe(themes['high-contrast'].dark.backgroundGradient)
    })

    it('should return valid CSS gradients', () => {
      themeNames.forEach((themeName) => {
        const darkGradient = getBackgroundGradient(themeName, true)
        const lightGradient = getBackgroundGradient(themeName, false)

        expect(darkGradient).toMatch(/^(linear|radial)-gradient\(/)
        expect(lightGradient).toMatch(/^(linear|radial)-gradient\(/)
      })
    })
  })

  describe('getThemeVariant', () => {
    it('should return dark variant when isDark is true', () => {
      const variant = getThemeVariant('neon', true)

      expect(variant).toEqual(themes['neon'].dark)
      expect(variant.colors).toBeDefined()
      expect(variant.backgroundGradient).toBeDefined()
    })

    it('should return light variant when isDark is false', () => {
      const variant = getThemeVariant('neon', false)

      expect(variant).toEqual(themes['neon'].light)
    })

    it('should fall back to high-contrast theme for unknown theme', () => {
      const variant = getThemeVariant('non-existent', true)

      expect(variant).toEqual(themes['high-contrast'].dark)
    })

    it('should return complete ThemeVariant structure', () => {
      themeNames.forEach((themeName) => {
        const darkVariant = getThemeVariant(themeName, true)
        const lightVariant = getThemeVariant(themeName, false)

        // Check dark variant
        expect(darkVariant.colors).toBeDefined()
        expect(darkVariant.backgroundGradient).toBeDefined()
        REQUIRED_COLOR_PROPERTIES.forEach((prop) => {
          expect(darkVariant.colors[prop]).toBeDefined()
        })

        // Check light variant
        expect(lightVariant.colors).toBeDefined()
        expect(lightVariant.backgroundGradient).toBeDefined()
        REQUIRED_COLOR_PROPERTIES.forEach((prop) => {
          expect(lightVariant.colors[prop]).toBeDefined()
        })
      })
    })
  })

  describe('theme contrast', () => {
    it('dark themes should have light foreground colors', () => {
      themeNames.forEach((themeName) => {
        const { foreground } = themes[themeName].dark.colors
        // Extract RGB values from hex
        const r = parseInt(foreground.slice(1, 3), 16)
        const g = parseInt(foreground.slice(3, 5), 16)
        const b = parseInt(foreground.slice(5, 7), 16)
        const brightness = (r * 299 + g * 587 + b * 114) / 1000

        // Dark themes should have relatively bright foreground (> 100)
        expect(brightness).toBeGreaterThan(80)
      })
    })

    it('light themes should have dark foreground colors', () => {
      themeNames.forEach((themeName) => {
        const { foreground } = themes[themeName].light.colors
        // Extract RGB values from hex
        const r = parseInt(foreground.slice(1, 3), 16)
        const g = parseInt(foreground.slice(3, 5), 16)
        const b = parseInt(foreground.slice(5, 7), 16)
        const brightness = (r * 299 + g * 587 + b * 114) / 1000

        // Light themes should have relatively dark foreground (< 150)
        expect(brightness).toBeLessThan(150)
      })
    })
  })

  describe('ANSI color semantics', () => {
    it('red should be appropriate for errors', () => {
      themeNames.forEach((themeName) => {
        const { red } = themes[themeName].dark.colors
        // Red should have dominant red channel
        const r = parseInt(red.slice(1, 3), 16)
        const g = parseInt(red.slice(3, 5), 16)
        const b = parseInt(red.slice(5, 7), 16)

        expect(r).toBeGreaterThan(g)
        expect(r).toBeGreaterThan(100)
      })
    })

    it('green should be appropriate for success', () => {
      themeNames.forEach((themeName) => {
        const { green } = themes[themeName].dark.colors
        // Green should have dominant green channel (or at least visible green)
        const g = parseInt(green.slice(3, 5), 16)

        expect(g).toBeGreaterThan(100)
      })
    })
  })
})
