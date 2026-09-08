import { describe, expect, it } from 'vitest'
import { formatLogsAsMarkdown } from '../src/tools/console.js'

describe('console origin display', () => {
  it('keeps page, extension and unknown origins distinct for identical messages', () => {
    const common = { level: 'error' as const, message: 'synthetic failure', timestamp: 1, url: 'https://example.test/', tabId: 42 }
    const rendered = formatLogsAsMarkdown([
      { ...common, source: 'page', origin: 'page' },
      { ...common, source: 'extension', origin: 'extension:fixture-id', count: 2 },
      { ...common, origin: 'unknown' }
    ], 3)
    expect(rendered).toContain('[page]')
    expect(rendered).toContain('[extension:fixture-id] ×2')
    expect(rendered).toContain('[unknown]')
  })
})
