import { createRequire } from 'node:module'
import { afterEach, expect, it, vi } from 'vitest'

const require = createRequire(import.meta.url)
const fs = require('fs')

afterEach(() => vi.restoreAllMocks())

it('imports and uses backend logging without opening or resetting runtime logs', () => {
  const refuse = () => { throw new Error('A test attempted runtime log IO') }
  const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(refuse)
  const stream = vi.spyOn(fs, 'createWriteStream').mockImplementation(refuse)
  const mkdir = vi.spyOn(fs, 'mkdirSync').mockImplementation(refuse)
  const { createModuleLogger, appendBrowserLogs } = require('../modules/logger.js')
  const log = createModuleLogger('SyntheticFixture')
  log.info('synthetic event')
  appendBrowserLogs([{ message: 'synthetic browser event' }])
  expect(write).not.toHaveBeenCalled()
  expect(stream).not.toHaveBeenCalled()
  expect(mkdir).not.toHaveBeenCalled()
  expect(log.info).toHaveBeenCalledWith('synthetic event')
})
