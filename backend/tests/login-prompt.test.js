import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'login-prompt.js')
const SECRET = `fixture-password-${Math.random().toString(36).slice(2)}`
const TOKEN = `fixture-token-${Math.random().toString(36).slice(2)}`

let tempRoot
let storeDir
let loggerPreload

function run(args, answers = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      env: {
        ...process.env,
        TABZ_HOME: '',
        NODE_OPTIONS: `--require=${loggerPreload}`
      }
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += chunk })
    child.stderr.on('data', chunk => { stderr += chunk })
    child.on('error', reject)
    child.on('close', code => resolve({ code, stdout, stderr }))
    child.stdin.end(`${answers.join('\n')}${answers.length ? '\n' : ''}`)
  })
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'tabz-login-prompt-'))
  storeDir = path.join(tempRoot, 'store')
  loggerPreload = path.join(tempRoot, 'quiet-logger.cjs')
  // The production logger initializes backend/logs on import. The child must
  // remain a synthetic fixture, so intercept the credential store's logger
  // dependency before the prompt module loads.
  fs.writeFileSync(loggerPreload, [
    "const Module = require('module')",
    'const original = Module._load',
    "const quiet = () => ({ info(){}, success(){}, warn(){}, error(){}, debug(){}, fatal(){}, start(){}, ready(){} })",
    'Module._load = function(request, parent, isMain) {',
    "  if (request === './logger' && parent && /credential-store\\.js$/.test(parent.filename)) {",
    "    return { createModuleLogger: quiet, logger: quiet(), appendBrowserLogs() {}, UNIFIED_LOG_PATH: 'synthetic' }",
    '  }',
    '  return original.call(this, request, parent, isMain)',
    '}',
    ''
  ].join('\n'))
})

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true })
})

describe('login-prompt.js', () => {
  it('saves protected values with owner-only modes and prints names only', async () => {
    const result = await run(['--host', 'APP.example.com', '--store', storeDir], [
      'demo-user',
      SECRET,
      'account=north',
      'secret:api_token',
      TOKEN,
      'not-a-field',
      ''
    ])

    expect(result.code, result.stderr).toBe(0)
    expect(result.stdout).toContain('Saved. Close this terminal.')
    expect(result.stdout).toContain('username, password, account, api_token')
    expect(result.stdout).toContain('Use name=value')
    expect(result.stdout + result.stderr).not.toContain(SECRET)
    expect(result.stdout + result.stderr).not.toContain(TOKEN)

    const passwordFile = path.join(storeDir, 'keys', 'app.example.com')
    const tokenFile = path.join(storeDir, 'keys', 'app.example.com.api_token')
    expect(fs.statSync(storeDir).mode & 0o777).toBe(0o700)
    expect(fs.statSync(path.join(storeDir, 'config')).mode & 0o777).toBe(0o600)
    expect(fs.statSync(passwordFile).mode & 0o777).toBe(0o600)
    expect(fs.statSync(tokenFile).mode & 0o777).toBe(0o600)
    expect(fs.readFileSync(passwordFile, 'utf8')).toBe(`${SECRET}\n`)
    expect(fs.readFileSync(tokenFile, 'utf8')).toBe(`${TOKEN}\n`)
    const config = fs.readFileSync(path.join(storeDir, 'config'), 'utf8')
    expect(config).toContain('Host app.example.com')
    expect(config).toContain('Field account north')
    expect(config).toContain(`SecretFile api_token ${tokenFile}`)
    expect(config).not.toContain(SECRET)
    expect(config).not.toContain(TOKEN)
  })

  it('returns exit 1 without writing when input validation fails', async () => {
    const result = await run(['--host', 'app.example.com', '--store', storeDir], [
      'demo-user', SECRET, 'password=again', ''
    ])

    expect(result.code).toBe(1)
    expect(result.stdout).toContain('Not saved:')
    expect(result.stdout).toContain('built-in field')
    expect(result.stdout).not.toContain(SECRET)
    expect(fs.existsSync(path.join(storeDir, 'keys', 'app.example.com'))).toBe(false)
  })

  it('returns exit 2 with usage when the host is missing', async () => {
    const result = await run([])
    expect(result.code).toBe(2)
    expect(result.stderr).toContain('usage: login-prompt.js --host')
    expect(fs.existsSync(storeDir)).toBe(false)
  })
})
