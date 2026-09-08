import { describe, expect, it } from 'vitest'
import { screenshotToolResult } from '../src/tools/screenshot.js'

describe('screenshot delivery evidence', () => {
  const image = { success: true, tabId: 42, imageData: 'YWJj', mimeType: 'image/png', width: 400, height: 300, bytes: 3 }
  it('requires a saved path for a saved screenshot and image bytes for inline-only', () => {
    expect(screenshotToolResult(image).isError).toBe(true)
    expect(screenshotToolResult(image, { inlineOnly: true }).isError).toBe(false)
    expect(screenshotToolResult({ success: true, filePath: '/synthetic/page.png' }, { inlineOnly: true }).isError).toBe(true)
    expect(screenshotToolResult({ success: true, filePath: '/synthetic/page.png' }).isError).toBe(false)
  })
  it('suppresses images after failure, wrong-tab evidence, or invalid encoding', () => {
    for (const result of [{ ...image, success: false }, { ...image, tabId: 43 }, { ...image, imageData: 'data:text/html,fixture' }]) {
      const output = screenshotToolResult(result, { inlineOnly: true, tabId: 42 })
      expect(output.isError).toBe(true)
      expect(output.content.every(item => item.type === 'text')).toBe(true)
    }
  })
})
