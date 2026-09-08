import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import vm from 'node:vm'
import { expect, it, vi } from 'vitest'

it('utility process imports append a startup marker without truncating existing logs', () => {
  const loggerFile = fileURLToPath(new URL('../modules/logger.js', import.meta.url))
  const source = readFileSync(loggerFile, 'utf8')
  const write = vi.fn()
  const createWriteStream = vi.fn(() => ({ write }))
  const fakeFs = {
    existsSync: () => true,
    createWriteStream,
    writeFileSync: () => { throw new Error('Runtime log truncation attempted') },
    mkdirSync: () => { throw new Error('Unexpected directory creation') }
  }
  const fakeConsole = Object.fromEntries(
    ['info', 'success', 'warn', 'error', 'debug', 'fatal', 'start', 'ready'].map(level => [level, vi.fn()])
  )
  const exports = {}
  vm.runInNewContext(source, {
    module: { exports },
    __dirname: path.dirname(loggerFile),
    process: { env: {} },
    require: name => {
      if (name === 'fs') return fakeFs
      if (name === 'path') return path
      if (name === 'consola') return { createConsola: () => fakeConsole }
      throw new Error(`Unexpected dependency: ${name}`)
    }
  }, { filename: loggerFile })
  expect(createWriteStream).toHaveBeenCalledWith(expect.any(String), { flags: 'a' })
  expect(write).toHaveBeenCalledWith(expect.stringContaining('Unified Log Started:'))
})
