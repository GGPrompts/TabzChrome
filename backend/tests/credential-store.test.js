/**
 * Credential store: parser, host matching, mode refusal, stub creation, and
 * the no-secret-in-any-listing rule. Every fixture lives under a temp dir;
 * nothing touches the real home and nothing secret-shaped is committed.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import crypto from 'crypto'
import { createRequire } from 'module'

const require = createRequire(import.meta.url)

const {
  createCredentialStore,
  parseConfig,
  matchHost,
  blockMatches,
  slugForHost,
  resolveStoreDir,
  CredentialStoreError,
  patternProblem,
  usableBlocks,
  normalizeHost,
  compilePattern,
  normalizeSecretValue,
  warnedPatterns
} = await import('../modules/credential-store.js')

const SECRET = 'fixture-value-' + Math.random().toString(36).slice(2)

let home
let store

function writeKey(name, value, mode = 0o600) {
  const keyPath = path.join(store.keysDir, name)
  fs.mkdirSync(store.keysDir, { recursive: true, mode: 0o700 })
  fs.writeFileSync(keyPath, value, { mode })
  fs.chmodSync(keyPath, mode)
  return keyPath
}

function writeConfig(text, mode = 0o600) {
  fs.mkdirSync(store.storeDir, { recursive: true, mode: 0o700 })
  fs.writeFileSync(store.configPath, text, { mode })
  fs.chmodSync(store.configPath, mode)
}

beforeEach(() => {
  home = fs.mkdtempSync(path.join(os.tmpdir(), 'tabz-store-'))
  store = createCredentialStore({ homeDir: home })
})

afterEach(() => {
  vi.restoreAllMocks()
  fs.rmSync(home, { recursive: true, force: true })
})

describe('parseConfig', () => {
  it('reads Host blocks with User and IdentityFile, tolerating comments, blanks, and = syntax', () => {
    const blocks = parseConfig([
      '# saved logins',
      '',
      'Host us3.example.com *.example.com',
      '  # a comment line inside the block',
      '  User saved-user',
      '  IdentityFile ~/.tabzchrome/keys/example-demo',
      '',
      'host=other.example.com',
      '  user = "quoted user"',
      '  identityfile=keys/other',
      '  UnknownKeyword ignored'
    ].join('\n'))

    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({
      patterns: ['us3.example.com', '*.example.com'],
      user: 'saved-user',
      identityFile: '~/.tabzchrome/keys/example-demo'
    })
    expect(blocks[1]).toMatchObject({ patterns: ['other.example.com'], user: 'quoted user', identityFile: 'keys/other' })
  })

  it('ignores directives before the first Host block', () => {
    expect(parseConfig('User stray\nIdentityFile stray\n')).toEqual([])
  })
})

describe('host matching', () => {
  const blocks = parseConfig([
    'Host !admin.example.com *.example.com',
    '  User wildcard',
    'Host us3.example.com',
    '  User exact',
    'Host app.example.net',
    '  User portless',
    'Host ported.example.net:8443',
    '  User ported'
  ].join('\n'))

  it('matches glob patterns case-insensitively', () => {
    expect(blockMatches(blocks[0], 'US3.example.com')).toBe(true)
    expect(blockMatches(blocks[0], 'example.com')).toBe(false)
    expect(blockMatches(blocks[0], 'notreally-example.com')).toBe(false)
  })

  it('honours negated patterns', () => {
    expect(blockMatches(blocks[0], 'admin.example.com')).toBe(false)
  })

  it('first match wins, as in ssh, and a request host drops its :port', () => {
    expect(matchHost(blocks, 'us3.example.com').user).toBe('wildcard')
    expect(matchHost(blocks, 'app.example.net:8443').user).toBe('portless')
    expect(matchHost(blocks, 'nowhere.test')).toBeNull()
  })

  it('a ported Host pattern never matches (no tab hostname carries a port) and is skipped on load', () => {
    expect(matchHost(blocks, 'ported.example.net')).toBeNull()
    expect(matchHost(blocks, 'ported.example.net:8443')).toBeNull()
    expect(usableBlocks(blocks).map(b => b.user)).toEqual(['wildcard', 'exact', 'portless'])
  })
})

describe('IdentityFile expansion', () => {
  it('expands ~ to the store home and relative paths against the store dir', () => {
    expect(store.expandPath('~/.tabzchrome/keys/a')).toBe(path.join(home, '.tabzchrome', 'keys', 'a'))
    expect(store.expandPath('~')).toBe(home)
    expect(store.expandPath('keys/b')).toBe(path.join(store.storeDir, 'keys', 'b'))
    expect(store.expandPath('/abs/c')).toBe('/abs/c')
  })

  it('renders paths under home with a ~ prefix', () => {
    expect(store.displayPath(path.join(home, '.tabzchrome', 'keys', 'x'))).toBe('~/.tabzchrome/keys/x')
    expect(store.displayPath('/elsewhere/x')).toBe('/elsewhere/x')
  })
})

describe('mode refusal', () => {
  it('refuses a key file that is not mode 600 and names the chmod', () => {
    const keyPath = writeKey('loose', SECRET, 0o644)
    writeConfig(`Host app.example.com\n  User dana\n  IdentityFile ${keyPath}\n`)

    let caught
    try {
      store.fillSecretInto('app.example.com', 'password')
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(CredentialStoreError)
    expect(caught.code).toBe('KEY_MODE')
    expect(caught.message).toContain(keyPath)
    expect(caught.message).toContain('mode is 644')
    expect(caught.message).toContain(`chmod 600 '${keyPath}'`)
    expect(caught.message).not.toContain(SECRET)
  })

  it('accepts a 600 key file and refuses a world-readable config', () => {
    const keyPath = writeKey('tight', SECRET + '\n', 0o600)
    writeConfig(`Host app.example.com\n  User dana\n  IdentityFile ${keyPath}\n`, 0o600)
    expect(store.fillSecretInto('app.example.com', 'password')).toEqual({ host: 'app.example.com', user: 'dana', kind: 'password', value: SECRET, normalized: false })

    writeConfig(`Host app.example.com\n  User dana\n  IdentityFile ${keyPath}\n`, 0o666)
    expect(() => store.listEntries()).toThrow(/Refusing config .*mode is 666.*chmod 600/)
  })

  it('accepts a 644 config, as ssh does', () => {
    writeConfig('Host app.example.com\n  User dana\n  IdentityFile keys/none\n', 0o644)
    expect(store.listEntries()).toHaveLength(1)
  })
})

describe('ensureEntry', () => {
  it('creates the store, a stub block, and an empty 600 key file on first request', () => {
    const result = store.ensureEntry('US3.example.com')

    expect(result.created).toBe(true)
    expect(result.host).toBe('us3.example.com')
    expect(result.hasUsername).toBe(false)
    expect(fs.statSync(store.storeDir).mode & 0o777).toBe(0o700)
    expect(fs.statSync(store.configPath).mode & 0o777).toBe(0o600)
    expect(fs.statSync(result.keyPath).mode & 0o777).toBe(0o600)
    expect(fs.readFileSync(result.keyPath, 'utf8')).toBe('')

    const config = fs.readFileSync(store.configPath, 'utf8')
    expect(config).toBe('Host us3.example.com\n  User \n  IdentityFile ~/.tabzchrome/keys/us3.example.com\n')
  })

  it('is idempotent: a second request for a matching host changes nothing', () => {
    const first = store.ensureEntry('us3.example.com')
    const before = fs.readFileSync(store.configPath, 'utf8')

    const second = store.ensureEntry('us3.example.com')

    expect(second.created).toBe(false)
    expect(second.keyPath).toBe(first.keyPath)
    expect(fs.readFileSync(store.configPath, 'utf8')).toBe(before)
    expect(fs.readdirSync(store.keysDir)).toEqual(['us3.example.com'])
  })

  it('reuses a wildcard block that already covers the host', () => {
    writeConfig('Host *.example.com\n  User demo\n  IdentityFile keys/example\n')
    const result = store.ensureEntry('us9.example.com')
    expect(result.created).toBe(false)
    expect(result.hasUsername).toBe(true)
    expect(JSON.stringify(result)).not.toContain('demo')
    expect(fs.existsSync(path.join(store.keysDir, 'example'))).toBe(true)
  })

  it('rejects anything that is not a hostname', () => {
    expect(() => store.ensureEntry('https://app.example.com/login')).toThrow(/not a hostname/)
    expect(() => store.ensureEntry('../../etc/passwd')).toThrow(/not a hostname/)
  })

  it('slugs hosts into safe key names and keeps them unique', () => {
    expect(slugForHost('App.Example.com:8443')).toBe('app.example.com')
    store.ensureEntry('app.example.com')
    writeConfig(fs.readFileSync(store.configPath, 'utf8').replace('Host app.example.com', 'Host old.example.com'))
    const second = store.ensureEntry('app.example.com')
    expect(path.basename(second.keyPath)).toBe('app.example.com-2')
  })
})

describe('listEntries and readiness never expose values', () => {
  beforeEach(() => {
    const keyPath = writeKey('example-demo', SECRET + '\n')
    writeConfig([
      'Host us3.example.com *.example.com',
      '  User saved-user',
      `  IdentityFile ${keyPath}`,
      'Host pending.example.net',
      '  User ',
      '  IdentityFile keys/pending'
    ].join('\n') + '\n')
    writeKey('pending', '')
  })

  it('lists names, patterns, username presence, and key presence only', () => {
    const entries = store.listEntries()
    expect(entries).toEqual([
      { name: 'example-demo', patterns: ['us3.example.com', '*.example.com'], hasUsername: true, hasKey: true, keyMode: '600', keyStatus: 'ready', fields: [], secretFiles: [] },
      { name: 'pending', patterns: ['pending.example.net'], hasUsername: false, hasKey: false, keyMode: '600', keyStatus: 'empty', fields: [], secretFiles: [] }
    ])
    expect(JSON.stringify(entries)).not.toContain(SECRET)
  })

  it('reports readiness without content', () => {
    expect(store.isReady('us3.example.com')).toMatchObject({ ready: true, hasUsername: true })
    expect(store.isReady('pending.example.net')).toMatchObject({ ready: false })
    expect(store.isReady('unknown.other.net')).toMatchObject({ ready: false, host: 'unknown.other.net' })
    expect(JSON.stringify(store.isReady('us3.example.com'))).not.toContain(SECRET)
    expect(JSON.stringify(store.isReady('us3.example.com'))).not.toContain('saved-user')
  })

  it('omits username, password, ordinary-field, and SecretFile values from every metadata result', () => {
    const username = `fixture-user-${Math.random().toString(36).slice(2)}`
    const fieldValue = `fixture-org-${Math.random().toString(36).slice(2)}`
    const token = `fixture-token-${Math.random().toString(36).slice(2)}`
    const saved = store.saveEntry({
      host: 'metadata.example.com',
      user: username,
      password: SECRET,
      fields: [{ name: 'org_id', value: fieldValue }],
      secretFiles: [{ name: 'api_token', value: token }]
    })
    const metadata = [saved, store.listEntries(), store.isReady('metadata.example.com'), store.ensureEntry('metadata.example.com')]
    const serialized = JSON.stringify(metadata)
    for (const value of [username, SECRET, fieldValue, token]) expect(serialized).not.toContain(value)
    expect(saved).toMatchObject({ hasUsername: true, fields: ['org_id'], secretFiles: ['api_token'] })
  })
})

describe('fillSecretInto', () => {
  let keyPath

  beforeEach(() => {
    keyPath = writeKey('example-demo', SECRET + '\n')
    writeConfig([
      'Host *.example.com',
      '  User saved-user',
      `  IdentityFile ${keyPath}`,
      'Host us3.example.com',
      '  User exact-user',
      `  IdentityFile ${keyPath}`,
      'Host nouser.example.net',
      '  User ',
      '  IdentityFile keys/empty'
    ].join('\n') + '\n')
    writeKey('empty', '')
  })

  it('returns the User for field=username and the key content for field=password, trailing newline stripped', () => {
    expect(store.fillSecretInto('us3.example.com', 'username')).toEqual({ host: 'us3.example.com', user: 'saved-user', kind: 'username', value: 'saved-user', normalized: false })
    expect(store.fillSecretInto('us3.example.com', 'password').value).toBe(SECRET)
  })

  it('binds to the tab hostname: an unmatched host is refused', () => {
    expect(() => store.fillSecretInto('evil.example.net', 'password')).toThrow(/No saved login matches evil\.example\.net/)
  })

  it('names related saved patterns without authorizing a fill for the new hostname', () => {
    writeConfig(`Host us3.example.com\n  User private-user\n  IdentityFile ${keyPath}\n`)

    let caught
    try {
      store.fillSecretInto('console3.example.us', 'password')
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(CredentialStoreError)
    expect(caught.code).toBe('NO_MATCH')
    expect(caught.message).toBe('No saved login matches console3.example.us. A block exists for us3.example.com; ask the user to re-save it for this host on the Logins page (tabz_secret_request).')
    expect(caught.message).not.toContain('private-user')
    expect(caught.message).not.toContain(SECRET)
    expect(store.isReady('console3.example.us')).toEqual({
      ready: false,
      status: 'pending',
      keyStatus: 'no_match',
      host: 'console3.example.us',
      hasUsername: false,
      patterns: [],
      fields: [],
      secretFiles: [],
      nearMiss: ['us3.example.com']
    })
  })

  it('keeps the default pending status shape when no saved pattern is related', () => {
    writeConfig(`Host us3.example.com\n  User private-user\n  IdentityFile ${keyPath}\n`)

    expect(() => store.fillSecretInto('console.other.net', 'password')).toThrow('No saved login for console.other.net. Ask the user to add one with tabz_secret_request.')
    expect(store.isReady('console.other.net')).toEqual({
      ready: false,
      status: 'pending',
      keyStatus: 'no_match',
      host: 'console.other.net',
      hasUsername: false,
      patterns: [],
      fields: [],
      secretFiles: []
    })
  })

  it('uses the registrable label above a shared suffix for near misses', () => {
    writeConfig([
      `Host old.customer.co.uk`,
      `  User tenant-user`,
      `  IdentityFile ${keyPath}`,
      `Host old.other.co.uk`,
      `  User other-user`,
      `  IdentityFile ${keyPath}`
    ].join('\n') + '\n')

    expect(store.isReady('new.customer.co.uk')).toMatchObject({
      ready: false,
      status: 'pending',
      nearMiss: ['old.customer.co.uk']
    })
    expect(() => store.fillSecretInto('new.customer.co.uk', 'password')).toThrow(/A block exists for old\.customer\.co\.uk;/)
  })

  it('lets host disambiguate among matching blocks but never override the tab', () => {
    expect(store.fillSecretInto('us3.example.com', 'username', { host: 'us3.example.com' }).user).toBe('exact-user')
    expect(store.fillSecretInto('us3.example.com', 'username', { host: '*.example.com' }).user).toBe('saved-user')
    expect(() => store.fillSecretInto('nouser.example.com', 'password', { host: 'us3.example.com' })).toThrow(/does not match the tab/)
  })

  it('refuses an empty key file and a missing User without leaking anything', () => {
    expect(() => store.fillSecretInto('nouser.example.net', 'password')).toThrow(/empty/)
    expect(() => store.fillSecretInto('nouser.example.net', 'username')).toThrow(/no User/)
    expect(() => store.fillSecretInto('us3.example.com', 'cvv')).toThrow(/has no field "cvv"/)
  })
})

describe('resolveStoreDir', () => {
  it('honours TABZ_HOME and falls back to ~/.tabzchrome', () => {
    expect(resolveStoreDir({ TABZ_HOME: home })).toBe(home)
    expect(resolveStoreDir({})).toBe(path.join(os.homedir(), '.tabzchrome'))
  })
})

describe('host-pattern hardening', () => {

  it('refuses public/private suffix wildcards and ported patterns, and accepts an owner domain', () => {
    expect(patternProblem('*')).toMatch(/last label/)
    expect(patternProblem('*.com')).toMatch(/registrable owner domain/)
    expect(patternProblem('*example.com')).toMatch(/registrable owner domain/)
    expect(patternProblem('us3.example.com:8443')).toMatch(/:port/)
    expect(patternProblem('*.example.com')).toBe('')
    expect(patternProblem('us?.example.com')).toBe('')
    expect(patternProblem('localhost')).toBe('')
    expect(patternProblem('!*.evil.com')).toBe('')
  })

  it('skips offending blocks on load so nothing resolves through them', () => {
    const blocks = parseConfig('Host *\n  User any\n  IdentityFile keys/any\n\nHost *.example.com\n  User ok\n  IdentityFile keys/ok\n')
    expect(usableBlocks(blocks).map(b => b.user)).toEqual(['ok'])
  })

  it('does not match a host through a bare * block: ensureEntry creates a real stub and isReady stays false', () => {
    writeConfig('Host *\n  User any\n  IdentityFile keys/any\n')
    writeKey('any', SECRET)
    expect(store.isReady('evil.example.com')).toMatchObject({ ready: false, patterns: [] })
    const entry = store.ensureEntry('evil.example.com')
    expect(entry).toMatchObject({ created: true, patterns: ['evil.example.com'] })
    expect(() => store.fillSecretInto('evil.example.com', 'password')).toThrow(/is empty/)
    expect(fs.readFileSync(store.configPath, 'utf8')).toContain('Host evil.example.com')
  })

  it('strips a :port on request and refuses a ported Host pattern on load', () => {
    expect(normalizeHost('App.Example.com:8443')).toBe('app.example.com')
    const entry = store.ensureEntry('app.example.com:8443')
    expect(entry.host).toBe('app.example.com')
    expect(fs.readFileSync(store.configPath, 'utf8')).toContain('Host app.example.com\n')
    fs.writeFileSync(entry.keyPath, SECRET)
    expect(store.isReady('app.example.com').ready).toBe(true)
    expect(store.fillSecretInto('app.example.com', 'password').value).toBe(SECRET)

    writeConfig('Host ported.example.com:8443\n  User any\n  IdentityFile keys/ported\n')
    writeKey('ported', SECRET)
    expect(store.isReady('ported.example.com').ready).toBe(false)
    expect(() => store.fillSecretInto('ported.example.com', 'password')).toThrow(CredentialStoreError)
  })

  it('uses one readiness predicate: a newline-only key is not ready anywhere, a real value is ready and fills', () => {
    writeConfig('Host us3.example.com\n  User demo\n  IdentityFile keys/demo\n')
    const keyPath = writeKey('demo', '\n')
    expect(store.isReady('us3.example.com').ready).toBe(false)
    expect(store.listEntries()[0].hasKey).toBe(false)
    expect(() => store.fillSecretInto('us3.example.com', 'password')).toThrow(/is empty/)

    fs.writeFileSync(keyPath, '  \n')
    expect(store.isReady('us3.example.com').ready).toBe(false)

    fs.writeFileSync(keyPath, `${SECRET}\n`)
    expect(store.isReady('us3.example.com').ready).toBe(true)
    expect(store.fillSecretInto('us3.example.com', 'password').value).toBe(SECRET)
  })

  it('assigns an IdentityFile to a matched block without one and creates the 0600 key', () => {
    writeConfig('# saved\nHost us3.example.com\n  User demo\n\nHost other.example.com\n  User x\n  IdentityFile keys/x\n')
    const entry = store.ensureEntry('us3.example.com')
    expect(entry.created).toBe(false)
    expect(entry.keyPath).toBe(path.join(store.keysDir, 'us3.example.com'))
    expect(fs.statSync(entry.keyPath).mode & 0o777).toBe(0o600)
    const text = fs.readFileSync(store.configPath, 'utf8')
    expect(text).toMatch(/Host us3\.example\.com\n  IdentityFile ~\/\.tabzchrome\/keys\/us3\.example\.com\n  User demo\n/)
    expect(text).toContain('Host other.example.com\n  User x\n  IdentityFile keys/x')
    expect(fs.statSync(store.configPath).mode & 0o777).toBe(0o600)
    // Re-reading resolves to the assigned key
    expect(store.readConfig()[0].identityFile).toBe('~/.tabzchrome/keys/us3.example.com')
    expect(store.ensureEntry('us3.example.com').keyPath).toBe(entry.keyPath)
  })
})

describe('readiness and config-preservation hardening', () => {
  it('a wildcard matches one label only and never crosses a dot', () => {
    const star = compilePattern('*.example.com').regex
    expect(star.test('us3.example.com')).toBe(true)
    expect(star.test('a.b.example.com')).toBe(false)
    expect(star.test('example.com')).toBe(false)
    const q = compilePattern('us?.example.com').regex
    expect(q.test('us3.example.com')).toBe(true)
    expect(q.test('us..example.com')).toBe(false)
    const blocks = parseConfig('Host *.example.com\n  User w\n')
    expect(blockMatches(blocks[0], 'login.us3.example.com')).toBe(false)
  })

  it('refuses a wildcard in the last label and right before a shared suffix, keeps *.example.com', () => {
    for (const bad of ['login.example.*', 'example.co*', '*.*', 'us3.example.?om']) {
      expect(patternProblem(bad), bad).toMatch(/last label/)
    }
    for (const bad of ['*.co.uk', '*.github.io', '*.herokuapp.com', '*.com.au']) {
      expect(patternProblem(bad), bad).toMatch(/registrable owner domain/)
    }
    expect(patternProblem('*.example.com')).toBe('')
    expect(patternProblem('*.login.co.uk')).toBe('')
    expect(patternProblem('app.example.com')).toBe('')
    const blocks = parseConfig('Host login.example.*\n  User a\nHost *.github.io\n  User b\nHost *.example.com\n  User c\n')
    expect(usableBlocks(blocks).map(b => b.user)).toEqual(['c'])
  })

  it('warns once per pattern per config revision, not on every read', () => {
    warnedPatterns.clear()
    writeConfig('Host *\n  User any\n  IdentityFile keys/any\nHost ok.example.com\n  User ok\n')
    store.readConfig()
    store.readConfig()
    store.readConfig()
    // One warning key for the one bad pattern, however often the config is read.
    expect(warnedPatterns.size).toBe(1)
    expect([...warnedPatterns][0]).toContain(store.configPath)
    expect([...warnedPatterns][0]).toMatch(/\|1\|\*$/)
    // A config edit (new mtime) warns once more.
    const future = new Date(Date.now() + 5000)
    fs.utimesSync(store.configPath, future, future)
    store.readConfig()
    store.readConfig()
    expect(warnedPatterns.size).toBe(2)
    // Direct calls without a revision never touch the set (they warn every time, as before).
    usableBlocks(parseConfig('Host *\n  User any\n'))
    expect(warnedPatterns.size).toBe(2)
  })

  it('reports a wrong key mode as bad_mode with the chmod to run, for status and listing alike, and fill refuses the same file', () => {
    const keyPath = writeKey('loose', SECRET, 0o644)
    writeConfig(`Host app.example.com\n  User dana\n  IdentityFile ${keyPath}\n`)
    const state = store.isReady('app.example.com')
    expect(state).toMatchObject({ ready: false, status: 'bad_mode', keyStatus: 'bad_mode', keyMode: '644', fix: `chmod 600 '${keyPath}'` })
    expect(JSON.stringify(state)).not.toContain(SECRET)
    expect(store.listEntries()[0]).toMatchObject({ hasKey: false, keyMode: '644', keyStatus: 'bad_mode', fix: `chmod 600 '${keyPath}'` })
    expect(() => store.fillSecretInto('app.example.com', 'password')).toThrow(/chmod 600/)
    fs.chmodSync(keyPath, 0o600)
    expect(store.isReady('app.example.com')).toMatchObject({ ready: true, status: 'ready' })
    expect(store.fillSecretInto('app.example.com', 'password').value).toBe(SECRET)
  })

  it('strips leading and trailing whitespace with one normalisation and flags it', () => {
    expect(normalizeSecretValue('hunter2\n')).toEqual({ value: 'hunter2', ready: true, normalized: false })
    expect(normalizeSecretValue('hunter2\r\n\r\n')).toEqual({ value: 'hunter2', ready: true, normalized: false })
    expect(normalizeSecretValue('\nhunter2\n')).toEqual({ value: 'hunter2', ready: true, normalized: true })
    expect(normalizeSecretValue('  hunter2  ')).toEqual({ value: 'hunter2', ready: true, normalized: true })
    expect(normalizeSecretValue('\n\n')).toMatchObject({ ready: false })
    const keyPath = writeKey('padded', `\n${SECRET}\n`)
    writeConfig(`Host app.example.com\n  User dana\n  IdentityFile ${keyPath}\n`)
    expect(store.isReady('app.example.com').ready).toBe(true)
    expect(store.fillSecretInto('app.example.com', 'password')).toEqual({ host: 'app.example.com', user: 'dana', kind: 'password', value: SECRET, normalized: true })
    expect(store.fillSecretInto('app.example.com', 'username').normalized).toBe(false)
  })

  it('assignIdentityFile keeps CRLF line endings and every other byte, adding only its one line', () => {
    const original = '# saved\r\nHost us3.example.com\r\n  User demo\r\n\r\nHost other.example.com\r\n  User x\r\n  IdentityFile keys/x\r\n'
    writeConfig(original)
    const entry = store.ensureEntry('us3.example.com')
    const text = fs.readFileSync(store.configPath, 'utf8')
    expect(text).toBe(original.replace('Host us3.example.com\r\n', 'Host us3.example.com\r\n  IdentityFile ~/.tabzchrome/keys/us3.example.com\r\n'))
    expect(text).not.toContain('\n\n')
    expect(entry.keyPath).toBe(path.join(store.keysDir, 'us3.example.com'))
  })

  it('assignIdentityFile handles an unterminated last Host line and mixed endings without rewriting them', () => {
    // The unterminated Host line takes the previous line's ending (CRLF here).
    const original = 'Host a.example.com\n  User a\n  IdentityFile keys/a\r\nHost us3.example.com'
    writeConfig(original)
    store.ensureEntry('us3.example.com')
    expect(fs.readFileSync(store.configPath, 'utf8')).toBe(`${original}\r\n  IdentityFile ~/.tabzchrome/keys/us3.example.com\r\n`)
    // A one-line file gets LF.
    writeConfig('Host one.example.com')
    store.ensureEntry('one.example.com')
    expect(fs.readFileSync(store.configPath, 'utf8')).toBe('Host one.example.com\n  IdentityFile ~/.tabzchrome/keys/one.example.com\n')
  })

  it('defers the config rewrite when asked and does it on the next call without the flag', () => {
    const original = 'Host us3.example.com\n  User demo\n'
    writeConfig(original)
    const deferred = store.ensureEntry('us3.example.com', { deferConfigEdit: true })
    expect(deferred).toMatchObject({ created: false, keyPath: '', configEditDeferred: true, hasUsername: true })
    expect(JSON.stringify(deferred)).not.toContain('demo')
    expect(fs.readFileSync(store.configPath, 'utf8')).toBe(original)
    expect(fs.existsSync(path.join(store.keysDir, 'us3.example.com'))).toBe(false)
    expect(store.isReady('us3.example.com')).toMatchObject({ ready: false, status: 'pending', keyStatus: 'no_key' })

    const assigned = store.ensureEntry('us3.example.com')
    expect(assigned.keyPath).toBe(path.join(store.keysDir, 'us3.example.com'))
    expect(fs.readFileSync(store.configPath, 'utf8')).toContain('IdentityFile ~/.tabzchrome/keys/us3.example.com')
    // A brand-new host is deferred too: the stub block would land in the
    // same config the open editor may save over.
    const before = fs.readFileSync(store.configPath, 'utf8')
    expect(store.ensureEntry('new.example.com', { deferConfigEdit: true })).toEqual({
      created: false, host: 'new.example.com', hasUsername: false, patterns: [], keyPath: '', configEditDeferred: true
    })
    expect(fs.readFileSync(store.configPath, 'utf8')).toBe(before)
    expect(fs.existsSync(path.join(store.keysDir, 'new.example.com'))).toBe(false)
    expect(store.ensureEntry('new.example.com')).toMatchObject({ created: true, patterns: ['new.example.com'] })
    expect(fs.readFileSync(store.configPath, 'utf8')).toContain('Host new.example.com')
  })
})

describe('named fields', () => {
  const TOKEN = 'fixture-token-' + Math.random().toString(36).slice(2)

  it('parses Field and SecretFile lines and lists their names only', () => {
    const keyPath = writeKey('example', SECRET)
    const tokenPath = writeKey('example.api_token', TOKEN)
    writeConfig([
      'Host us3.example.com',
      '  User demo',
      `  IdentityFile ${keyPath}`,
      '  Field org_id 1234',
      '  Field login_type dispatch',
      `  SecretFile api_token ${tokenPath}`,
      '  Field password shadowed',
      '  Field label Dispatch admin',
      '  Field bad/name x'
    ].join('\n') + '\n')

    const [block] = parseConfig(fs.readFileSync(store.configPath, 'utf8'))
    expect(block.fields).toEqual({ org_id: '1234', login_type: 'dispatch', label: 'Dispatch admin' })
    expect(block.secretFiles).toEqual({ api_token: tokenPath })

    const [entry] = store.listEntries()
    expect(entry.fields).toEqual(['org_id', 'login_type', 'label'])
    expect(entry.secretFiles).toEqual(['api_token'])
    const listing = JSON.stringify([entry, store.isReady('us3.example.com')])
    expect(listing).not.toContain('1234')
    expect(listing).not.toContain(TOKEN)
    expect(store.isReady('us3.example.com')).toMatchObject({ ready: true, fields: ['org_id', 'login_type', 'label'], secretFiles: ['api_token'] })
  })

  it('fills a Field as kind field, a SecretFile as kind secretfile, and refuses unknown names', () => {
    const keyPath = writeKey('example', SECRET)
    const tokenPath = writeKey('example.api_token', TOKEN + '\n')
    writeConfig(`Host us3.example.com\n  User demo\n  IdentityFile ${keyPath}\n  Field org_id 1234\n  SecretFile api_token ${tokenPath}\n`)

    expect(store.fillSecretInto('us3.example.com', 'org_id')).toEqual({ host: 'us3.example.com', user: 'demo', kind: 'field', value: '1234', normalized: false })
    expect(store.fillSecretInto('us3.example.com', 'api_token')).toEqual({ host: 'us3.example.com', user: 'demo', kind: 'secretfile', value: TOKEN, normalized: false })
    expect(() => store.fillSecretInto('us3.example.com', 'cvv')).toThrow(/has no field "cvv" \(it has: username, password, org_id, api_token\)/)
    expect(() => store.fillSecretInto('us3.example.com', '../etc')).toThrow(/field must be username, password, or the name/)

    fs.chmodSync(tokenPath, 0o644)
    expect(() => store.fillSecretInto('us3.example.com', 'api_token')).toThrow(/mode is 644/)
  })
})

describe('saveEntry and deleteEntry', () => {
  const TOKEN = 'fixture-token-' + Math.random().toString(36).slice(2)

  it('writes the block, the 0600 key file, and secret files, and reports names only', () => {
    const result = store.saveEntry({
      host: 'US3.example.com',
      user: 'demo',
      password: SECRET,
      fields: [{ name: 'org_id', value: ' 1234 ' }, { name: 'login_type', value: 'dispatch' }],
      secretFiles: [{ name: 'api_token', value: TOKEN }]
    })

    expect(result).toMatchObject({ created: true, ready: true, status: 'ready', host: 'us3.example.com', hasUsername: true, fields: ['org_id', 'login_type'], secretFiles: ['api_token'] })
    expect(JSON.stringify(result)).not.toContain('demo')
    expect(JSON.stringify(result)).not.toContain(SECRET)
    expect(JSON.stringify(result)).not.toContain(TOKEN)

    const keyPath = path.join(store.keysDir, 'us3.example.com')
    const tokenPath = path.join(store.keysDir, 'us3.example.com.api_token')
    expect(fs.statSync(keyPath).mode & 0o777).toBe(0o600)
    expect(fs.statSync(tokenPath).mode & 0o777).toBe(0o600)
    expect(fs.readFileSync(keyPath, 'utf8')).toBe(SECRET + '\n')
    expect(fs.readFileSync(tokenPath, 'utf8')).toBe(TOKEN + '\n')
    expect(fs.readFileSync(store.configPath, 'utf8')).toBe([
      'Host us3.example.com',
      '  User demo',
      '  IdentityFile ~/.tabzchrome/keys/us3.example.com',
      '  Field org_id 1234',
      '  Field login_type dispatch',
      '  SecretFile api_token ~/.tabzchrome/keys/us3.example.com.api_token',
      ''
    ].join('\n'))
    expect(store.fillSecretInto('us3.example.com', 'password').value).toBe(SECRET)
    expect(store.fillSecretInto('us3.example.com', 'org_id').value).toBe('1234')
  })

  it('goes ahead of a wildcard block that also covers the host, so the exact login wins', () => {
    writeConfig('Host *.example.com\n  User shared\n  IdentityFile keys/example\n')
    writeKey('example', SECRET)
    store.saveEntry({ host: 'us3.example.com', user: 'mine', password: 'other-' + SECRET })

    expect(fs.readFileSync(store.configPath, 'utf8').startsWith('Host us3.example.com\n  User mine\n')).toBe(true)
    expect(fs.readFileSync(store.configPath, 'utf8')).toContain('\n\nHost *.example.com\n  User shared\n  IdentityFile keys/example\n')
    expect(store.fillSecretInto('us3.example.com', 'username').value).toBe('mine')
    expect(store.fillSecretInto('us9.example.com', 'username').value).toBe('shared')
  })

  it('replaces an existing block in place, keeps the key on an empty password, and drops a removed SecretFile', () => {
    writeConfig('Host a.example.com\n  User a\n  IdentityFile keys/a\n\nHost b.example.com\n  User b\n  IdentityFile keys/b\n  Field org_id 1\n  SecretFile api_token keys/b.api_token\n\nHost c.example.com\n  User c\n  IdentityFile keys/c\n')
    writeKey('b', SECRET)
    writeKey('b.api_token', TOKEN)

    const result = store.saveEntry({ host: 'b.example.com', user: 'b2', password: '', fields: [{ name: 'org_id', value: '2' }] })

    expect(result).toMatchObject({ created: false, ready: true, hasUsername: true, fields: ['org_id'], secretFiles: [] })
    expect(JSON.stringify(result)).not.toContain('b2')
    expect(fs.readFileSync(store.configPath, 'utf8')).toBe('Host a.example.com\n  User a\n  IdentityFile keys/a\n\nHost b.example.com\n  User b2\n  IdentityFile keys/b\n  Field org_id 2\n\nHost c.example.com\n  User c\n  IdentityFile keys/c\n')
    expect(fs.readFileSync(path.join(store.keysDir, 'b'), 'utf8')).toBe(SECRET)
    expect(fs.existsSync(path.join(store.keysDir, 'b.api_token'))).toBe(false)
  })

  it('refuses bad hosts, reserved and malformed field names, multi-line fields, and never writes a value into the config', () => {
    expect(() => store.saveEntry({ host: 'https://x.example.com', user: 'a', password: 'p' })).toThrow(/hostname/)
    expect(() => store.saveEntry({ host: 'x.example.com', user: 'a', password: 'p', fields: [{ name: 'password', value: 'v' }] })).toThrow(/built-in field/)
    expect(() => store.saveEntry({ host: 'x.example.com', user: 'a', password: 'p', fields: [{ name: 'bad name', value: 'v' }] })).toThrow(/one token/)
    expect(() => store.saveEntry({ host: 'x.example.com', user: 'a', password: 'p', fields: [{ name: 'a', value: 'v' }, { name: 'A', value: 'w' }] })).toThrow(/twice/)
    expect(() => store.saveEntry({ host: 'x.example.com', user: 'a', password: 'p', fields: [{ name: 'note', value: 'two\nlines' }] })).toThrow(/one line/)
    expect(fs.existsSync(store.configPath) ? fs.readFileSync(store.configPath, 'utf8') : '').toBe('')

    store.saveEntry({ host: 'x.example.com', user: 'a', password: SECRET, secretFiles: [{ name: 'api_token', value: TOKEN }] })
    const config = fs.readFileSync(store.configPath, 'utf8')
    expect(config).not.toContain(SECRET)
    expect(config).not.toContain(TOKEN)
  })

  it('deletes a block by its exact pattern with its key files, never through a wildcard', () => {
    store.saveEntry({ host: 'us3.example.com', user: 'demo', password: SECRET, secretFiles: [{ name: 'api_token', value: TOKEN }] })
    writeConfig(fs.readFileSync(store.configPath, 'utf8') + '\nHost *.example.com\n  User shared\n  IdentityFile keys/shared\n')
    writeKey('shared', SECRET)

    expect(() => store.deleteEntry('app.example.com')).toThrow(/No saved login has the Host pattern app.example.com/)

    const result = store.deleteEntry('US3.example.com')
    expect(result).toEqual({ deleted: true, patterns: ['us3.example.com'], removedKeys: ['us3.example.com', 'us3.example.com.api_token'] })
    expect(fs.readdirSync(store.keysDir).sort()).toEqual(['shared'])
    expect(fs.readFileSync(store.configPath, 'utf8')).toBe('\nHost *.example.com\n  User shared\n  IdentityFile keys/shared\n')
    expect(store.listEntries().map(e => e.patterns)).toEqual([['*.example.com']])
  })

  it('refuses an external key path on delete and leaves both config and file untouched', () => {
    const outside = path.join(home, 'elsewhere-key')
    fs.writeFileSync(outside, SECRET, { mode: 0o600 })
    writeConfig(`Host a.example.com\n  User a\n  IdentityFile ${outside}\n`)

    expect(() => store.deleteEntry('a.example.com')).toThrow(/outside the store's keys directory/)
    expect(fs.existsSync(outside)).toBe(true)
    expect(fs.readFileSync(store.configPath, 'utf8')).toContain(`IdentityFile ${outside}`)
  })
})

describe('config editing and safe key paths', () => {
  const TOKEN = 'fixture-token-' + Math.random().toString(36).slice(2)

  it('createCredentialStore honours TABZ_HOME when no storeDir is given, like getDefaultStore', () => {
    const override = path.join(home, 'elsewhere')
    process.env.TABZ_HOME = override
    try {
      const fromEnv = createCredentialStore({ homeDir: home })
      expect(fromEnv.storeDir).toBe(override)
      expect(fromEnv.keysDir).toBe(path.join(override, 'keys'))
      expect(createCredentialStore({}).storeDir).toBe(override)
      expect(createCredentialStore({ homeDir: home, storeDir: path.join(home, 'explicit') }).storeDir).toBe(path.join(home, 'explicit'))
    } finally {
      delete process.env.TABZ_HOME
    }
    expect(createCredentialStore({ homeDir: home }).storeDir).toBe(path.join(home, '.tabzchrome'))
  })

  it('only a # at line start is a comment: a value containing # round-trips (A#42)', () => {
    store.saveEntry({ host: 'a.example.com', user: 'user#1', password: SECRET, fields: [{ name: 'pin', value: 'A#42' }] })
    expect(fs.readFileSync(store.configPath, 'utf8')).toContain('  Field pin A#42\n')
    expect(store.fillSecretInto('a.example.com', 'pin').value).toBe('A#42')
    expect(store.fillSecretInto('a.example.com', 'username').value).toBe('user#1')

    const blocks = parseConfig('# top comment\nHost b.example.com\n   # indented comment\n  User b#c\n  Field code x#y # not a comment\n')
    expect(blocks[0].user).toBe('b#c')
    expect(blocks[0].fields.code).toBe('x#y # not a comment')
  })

  it('refuses to write a key file outside the keys directory and leaves the file and the config untouched', () => {
    const outside = path.join(home, 'id_ed25519')
    fs.writeFileSync(outside, 'ssh-private-key-fixture', { mode: 0o600 })
    fs.chmodSync(outside, 0o644)
    const config = `Host a.example.com\n  User a\n  IdentityFile ${outside}\n`
    writeConfig(config)

    expect(() => store.saveEntry({ host: 'a.example.com', user: 'a2', password: 'new-' + SECRET })).toThrow(/outside the store's keys directory/)
    expect(fs.readFileSync(outside, 'utf8')).toBe('ssh-private-key-fixture')
    expect(fs.statSync(outside).mode & 0o777).toBe(0o644)
    expect(fs.readFileSync(store.configPath, 'utf8')).toBe(config)

    // An empty password still refuses: the block could not be rotated through the store either way.
    expect(() => store.saveEntry({ host: 'a.example.com', user: 'a2', password: '' })).toThrow(/outside the store's keys directory/)

    // A SecretFile elsewhere refuses the whole save before any key is written.
    writeConfig(`Host b.example.com\n  User b\n  IdentityFile keys/b\n  SecretFile api_token ${outside}\n`)
    expect(() => store.saveEntry({ host: 'b.example.com', user: 'b', password: SECRET, secretFiles: [{ name: 'api_token', value: TOKEN }] })).toThrow(/SecretFile api_token .* outside/)
    expect(fs.existsSync(path.join(store.keysDir, 'b'))).toBe(false)
    expect(fs.readFileSync(outside, 'utf8')).toBe('ssh-private-key-fixture')
  })

  it('a blank ordinary Field keeps the saved value on a rotate and is refused for a new login', () => {
    store.saveEntry({ host: 'a.example.com', user: 'a', password: SECRET, fields: [{ name: 'org_id', value: '1234' }, { name: 'login_type', value: 'dispatch' }] })

    const rotated = store.saveEntry({ host: 'a.example.com', user: 'a', password: 'new-' + SECRET, fields: [{ name: 'org_id', value: '' }, { name: 'login_type', value: 'admin' }] })
    expect(rotated).toMatchObject({ created: false, ready: true, fields: ['org_id', 'login_type'] })
    expect(store.fillSecretInto('a.example.com', 'org_id').value).toBe('1234')
    expect(store.fillSecretInto('a.example.com', 'login_type').value).toBe('admin')
    expect(store.fillSecretInto('a.example.com', 'password').value).toBe('new-' + SECRET)

    expect(() => store.saveEntry({ host: 'a.example.com', user: 'a', password: '', fields: [{ name: 'brand_new', value: '' }] })).toThrow(/Field "brand_new" is empty/)
    expect(() => store.saveEntry({ host: 'new.example.com', user: 'n', password: SECRET, fields: [{ name: 'org_id', value: ' ' }] })).toThrow(/Field "org_id" is empty/)
    expect(fs.existsSync(path.join(store.keysDir, 'new.example.com'))).toBe(false)
  })

  it('rewrites a block in place: in-block comments and unknown directives stay, the separator and the comment above the next Host are untouched', () => {
    const before = [
      'Host b.example.com',
      '  # primary login',
      '  User b',
      '  IdentityFile keys/b',
      '  ProxyJump bastion',
      '  Field org_id 1',
      '',
      '# c is the staging login',
      'Host c.example.com',
      '  User c',
      ''
    ].join('\n')
    writeConfig(before)
    writeKey('b', SECRET)

    store.saveEntry({ host: 'b.example.com', user: 'b2', password: '', fields: [{ name: 'org_id', value: '2' }], secretFiles: [{ name: 'api_token', value: TOKEN }] })

    expect(fs.readFileSync(store.configPath, 'utf8')).toBe([
      'Host b.example.com',
      '  # primary login',
      '  User b2',
      '  IdentityFile keys/b',
      '  ProxyJump bastion',
      '  Field org_id 2',
      '  SecretFile api_token ~/.tabzchrome/keys/b.example.com.api_token',
      '',
      '# c is the staging login',
      'Host c.example.com',
      '  User c',
      ''
    ].join('\n'))
    expect(store.fillSecretInto('b.example.com', 'api_token').value).toBe(TOKEN)

    // Dropping the SecretFile removes only its line; a delete leaves the comment above the next Host in place.
    store.saveEntry({ host: 'b.example.com', user: 'b2', password: '', fields: [{ name: 'org_id', value: '3' }] })
    expect(fs.readFileSync(store.configPath, 'utf8')).toContain('  Field org_id 3\n\n# c is the staging login\nHost c.example.com\n')
    expect(fs.readFileSync(store.configPath, 'utf8')).not.toContain('SecretFile')
    store.deleteEntry('b.example.com')
    expect(fs.readFileSync(store.configPath, 'utf8')).toBe('\n# c is the staging login\nHost c.example.com\n  User c\n')
  })

  it('rewrites a block that lacks a User line by adding it after the Host line, keeping CRLF endings', () => {
    writeConfig('Host a.example.com\r\n  IdentityFile keys/a\r\n\r\nHost z.example.com\r\n  User z\r\n')
    writeKey('a', SECRET)
    store.saveEntry({ host: 'a.example.com', user: 'added', password: '' })
    expect(fs.readFileSync(store.configPath, 'utf8')).toBe('Host a.example.com\r\n  IdentityFile keys/a\r\n  User added\r\n\r\nHost z.example.com\r\n  User z\r\n')
  })

  it('rotates a wildcard-only block by its pattern in place; a pattern naming no block is refused', () => {
    writeConfig('Host *.example.com\n  User shared\n  IdentityFile keys/example\n')
    writeKey('example', SECRET)

    const result = store.saveEntry({ host: '*.example.com', user: 'shared2', password: 'new-' + SECRET })
    expect(result).toMatchObject({ created: false, ready: true, status: 'ready', host: '*.example.com', hasUsername: true, patterns: ['*.example.com'] })
    expect(JSON.stringify(result)).not.toContain('shared2')
    expect(fs.readFileSync(store.configPath, 'utf8')).toMatch(/^Host \*\.example\.com\n  User shared2\n  IdentityFile ~\/\.tabzchrome\/keys\/example\.com(?:-\d+)?\n$/)
    expect(store.fillSecretInto('us3.example.com', 'password').value).toBe('new-' + SECRET)

    expect(() => store.saveEntry({ host: '*.other.com', user: 'x', password: SECRET })).toThrow(/only names an existing login/)
    expect(fs.readdirSync(store.keysDir)).toEqual(['example.com'])
  })
})

describe('portable permission boundary and public suffix policy', () => {
  it('does not create an absent store during metadata listing', () => {
    expect(fs.existsSync(store.storeDir)).toBe(false)
    expect(store.listEntries()).toEqual([])
    expect(fs.existsSync(store.storeDir)).toBe(false)
  })

  it('fails closed on native Windows before touching the filesystem', () => {
    const lstat = vi.spyOn(fs, 'lstatSync')
    const mkdir = vi.spyOn(fs, 'mkdirSync')
    expect(() => createCredentialStore({ platform: 'win32', homeDir: home, isWsl: false })).toThrow(/Native Windows is unsupported.*WSL/)
    expect(lstat).not.toHaveBeenCalled()
    expect(mkdir).not.toHaveBeenCalled()
  })

  it.each(['linux', 'darwin'])('supports %s when owner and POSIX modes can be verified', platform => {
    const portable = createCredentialStore({ platform, homeDir: home, storeDir: path.join(home, platform), isWsl: false })
    const entry = portable.ensureEntry(`${platform}.example.com`)
    expect(entry).toMatchObject({ created: true, hasUsername: false })
    expect(fs.statSync(portable.storeDir).mode & 0o777).toBe(0o700)
    expect(fs.statSync(portable.configPath).mode & 0o777).toBe(0o600)
  })

  it('refuses a WSL Windows mount before I/O and accepts a Linux-home path', () => {
    const lstat = vi.spyOn(fs, 'lstatSync')
    expect(() => createCredentialStore({ platform: 'linux', storeDir: '/mnt/c/tabz', homeDir: '/home/test', isWsl: true })).toThrow(/Windows-mounted WSL path/)
    expect(lstat).not.toHaveBeenCalled()
    vi.restoreAllMocks()
    const linuxHome = createCredentialStore({ platform: 'linux', storeDir: path.join(home, 'wsl-home'), homeDir: home, isWsl: true })
    expect(linuxHome.ensureEntry('wsl.example.com').created).toBe(true)
  })

  it('validates existing directory ownership and modes even when config is absent', () => {
    fs.mkdirSync(store.storeDir, { recursive: true, mode: 0o755 })
    fs.chmodSync(store.storeDir, 0o755)
    expect(() => store.listEntries()).toThrow(/mode is 755, expected 700/)

    fs.chmodSync(store.storeDir, 0o700)
    fs.mkdirSync(store.keysDir, { mode: 0o755 })
    fs.chmodSync(store.keysDir, 0o755)
    expect(() => store.listEntries()).toThrow(/mode is 755, expected 700/)

    fs.chmodSync(store.keysDir, 0o700)
    const wrongOwner = createCredentialStore({ homeDir: home, storeDir: store.storeDir, uid: process.getuid() + 1, isWsl: false })
    expect(() => wrongOwner.listEntries()).toThrow(/owned by uid .* expected uid/)
  })

  it('maps a filesystem that cannot enforce mode changes to a clear refusal', () => {
    const limited = createCredentialStore({ homeDir: home, storeDir: path.join(home, 'limited'), isWsl: false })
    vi.spyOn(fs, 'chmodSync').mockImplementation(() => {
      const error = new Error('not supported')
      error.code = 'ENOTSUP'
      throw error
    })
    expect(() => limited.ensureStore()).toThrow(/Cannot enforce mode 700.*POSIX filesystem/)
    expect(fs.existsSync(limited.configPath)).toBe(false)
    expect(fs.existsSync(limited.keysDir)).toBe(false)
  })

  it('refuses an existing store when chmod is a no-op despite fixed 0600 bits', () => {
    store.ensureStore()
    writeKey('saved-password', SECRET)
    writeConfig('Host fixed-mode.example.com\n  User hidden-user\n  IdentityFile keys/saved-password\n')
    vi.spyOn(fs, 'chmodSync').mockImplementation(() => undefined)
    expect(() => store.listEntries()).toThrow(/Cannot enforce mode 400.*POSIX filesystem/)
    expect(fs.readdirSync(store.keysDir)).toEqual(['saved-password'])
  })

  it('uses ICANN and private suffix data to keep wildcard matches within one owner', () => {
    for (const pattern of ['*.co.il', '*.github.io', '*.workers.dev', '*.example.unknownsuffix']) {
      expect(patternProblem(pattern), pattern).toMatch(/registrable owner domain/)
    }
    for (const pattern of ['*.customer.co.il', '*.tenant.github.io', '*.tenant.workers.dev', '*.example.com']) {
      expect(patternProblem(pattern), pattern).toBe('')
    }
    expect(patternProblem('host.example.unknownsuffix')).toBe('')
    expect(patternProblem('xn--bcher-kva.de')).toBe('')
    expect(patternProblem('bücher.de')).toMatch(/hostname/)
    expect(store.saveEntry({ host: 'host.example.unknownsuffix', user: '', password: '' })).toMatchObject({ created: true, hasUsername: false })
  })
})

describe('path and symlink refusals', () => {
  it('refuses a symlinked config and a symlinked keys directory', () => {
    fs.mkdirSync(store.storeDir, { recursive: true, mode: 0o700 })
    fs.chmodSync(store.storeDir, 0o700)
    const outsideConfig = path.join(home, 'outside-config')
    fs.writeFileSync(outsideConfig, 'Host a.example.com\n', { mode: 0o600 })
    fs.symlinkSync(outsideConfig, store.configPath)
    expect(() => store.listEntries()).toThrow(/config .* symbolic link/)

    fs.rmSync(store.configPath)
    const outsideKeys = path.join(home, 'outside-keys')
    fs.mkdirSync(outsideKeys, { mode: 0o700 })
    fs.symlinkSync(outsideKeys, store.keysDir)
    expect(() => store.listEntries()).toThrow(/directory is a symbolic link/)
  })

  it('refuses key and intermediate-directory symlinks on every access', () => {
    store.ensureStore()
    const outside = path.join(home, 'outside-secret')
    fs.writeFileSync(outside, SECRET, { mode: 0o600 })
    const linked = path.join(store.keysDir, 'linked')
    fs.symlinkSync(outside, linked)
    writeConfig(`Host linked.example.com\n  User hidden-user\n  IdentityFile ${linked}\n`)
    for (const access of [
      () => store.listEntries(),
      () => store.isReady('linked.example.com'),
      () => store.fillSecretInto('linked.example.com', 'password'),
      () => store.saveEntry({ host: 'linked.example.com', user: '', password: 'new-secret' }),
      () => store.deleteEntry('linked.example.com')
    ]) expect(access).toThrow(/symbolic link/)
    expect(fs.readFileSync(outside, 'utf8')).toBe(SECRET)

    fs.rmSync(linked)
    const outsideDir = path.join(home, 'outside-dir')
    fs.mkdirSync(outsideDir, { mode: 0o700 })
    fs.symlinkSync(outsideDir, path.join(store.keysDir, 'nested'))
    writeConfig('Host nested.example.com\n  User hidden-user\n  IdentityFile keys/nested/password\n')
    expect(() => store.listEntries()).toThrow(/directory is a symbolic link/)
  })

  it('refuses a symlinked SecretFile during listing and readiness', () => {
    store.ensureStore()
    writeKey('password', SECRET)
    const outside = path.join(home, 'outside-token')
    fs.writeFileSync(outside, 'token-value', { mode: 0o600 })
    fs.symlinkSync(outside, path.join(store.keysDir, 'linked-token'))
    writeConfig('Host secret-link.example.com\n  User hidden-user\n  IdentityFile keys/password\n  SecretFile token keys/linked-token\n')
    expect(() => store.listEntries()).toThrow(/SecretFile token .* symbolic link/)
    expect(() => store.isReady('secret-link.example.com')).toThrow(/SecretFile token .* symbolic link/)
  })

  it('refuses external key paths for list, status, fill, save, and delete', () => {
    const outside = path.join(home, 'external-key')
    fs.writeFileSync(outside, SECRET, { mode: 0o600 })
    writeConfig(`Host outside.example.com\n  User hidden-user\n  IdentityFile ${outside}\n`)
    for (const access of [
      () => store.listEntries(),
      () => store.isReady('outside.example.com'),
      () => store.fillSecretInto('outside.example.com', 'password'),
      () => store.saveEntry({ host: 'outside.example.com', user: '', password: 'new-secret' }),
      () => store.deleteEntry('outside.example.com')
    ]) expect(access).toThrow(/outside the store's keys directory/)
    expect(fs.readFileSync(outside, 'utf8')).toBe(SECRET)
  })
})

describe('atomic credential mutations', () => {
  function rejectConfigPublish() {
    const rename = fs.renameSync.bind(fs)
    return vi.spyOn(fs, 'renameSync').mockImplementation((source, destination) => {
      if (destination === store.configPath) throw Object.assign(new Error('publish failed'), { code: 'EIO' })
      return rename(source, destination)
    })
  }

  it('removes staged files when a new save or ensure cannot publish config', () => {
    store.ensureStore()
    rejectConfigPublish()
    expect(() => store.saveEntry({ host: 'new.example.com', user: 'hidden-user', password: SECRET })).toThrow(/publish failed/)
    expect(fs.readFileSync(store.configPath, 'utf8')).toBe('')
    expect(fs.readdirSync(store.keysDir)).toEqual([])
    expect(fs.readdirSync(store.storeDir).filter(name => name.startsWith('.config.tmp-'))).toEqual([])

    expect(() => store.ensureEntry('ensure.example.com')).toThrow(/publish failed/)
    expect(fs.readdirSync(store.keysDir)).toEqual([])
  })

  it('keeps the old config and keys when rotate or delete cannot publish config', () => {
    store.saveEntry({ host: 'old.example.com', user: 'hidden-user', password: SECRET, secretFiles: [{ name: 'token', value: 'old-token' }] })
    const before = fs.readFileSync(store.configPath, 'utf8')
    const beforeKeys = fs.readdirSync(store.keysDir).sort()
    rejectConfigPublish()
    expect(() => store.saveEntry({ host: 'old.example.com', user: '', password: 'new-secret', secretFiles: [{ name: 'token', value: 'new-token' }] })).toThrow(/publish failed/)
    expect(fs.readFileSync(store.configPath, 'utf8')).toBe(before)
    expect(fs.readdirSync(store.keysDir).sort()).toEqual(beforeKeys)
    expect(store.fillSecretInto('old.example.com', 'password').value).toBe(SECRET)
    vi.restoreAllMocks()

    rejectConfigPublish()
    expect(() => store.deleteEntry('old.example.com')).toThrow(/publish failed/)
    expect(fs.readFileSync(store.configPath, 'utf8')).toBe(before)
    expect(fs.readdirSync(store.keysDir).sort()).toEqual(beforeKeys)
  })

  it('cleans a partially written fresh key after a write failure', () => {
    store.ensureStore()
    const write = fs.writeFileSync.bind(fs)
    vi.spyOn(fs, 'writeFileSync').mockImplementation((target, ...args) => {
      if (typeof target === 'number') {
        fs.writeSync(target, 'partial')
        throw Object.assign(new Error('disk full'), { code: 'ENOSPC' })
      }
      return write(target, ...args)
    })
    expect(() => store.saveEntry({ host: 'partial.example.com', user: 'hidden-user', password: SECRET })).toThrow(/disk full/)
    expect(fs.readFileSync(store.configPath, 'utf8')).toBe('')
    expect(fs.readdirSync(store.keysDir)).toEqual([])
  })

  it('cleans a partially written config stage without publishing it', () => {
    store.ensureStore()
    const write = fs.writeFileSync.bind(fs)
    let descriptorWrites = 0
    vi.spyOn(fs, 'writeFileSync').mockImplementation((target, ...args) => {
      if (typeof target === 'number') {
        descriptorWrites += 1
        if (descriptorWrites === 2) {
          fs.writeSync(target, 'partial config')
          throw Object.assign(new Error('disk full during config'), { code: 'ENOSPC' })
        }
      }
      return write(target, ...args)
    })
    expect(() => store.saveEntry({ host: 'partial-config.example.com', user: 'hidden-user', password: SECRET })).toThrow(/disk full during config/)
    expect(fs.readFileSync(store.configPath, 'utf8')).toBe('')
    expect(fs.readdirSync(store.keysDir)).toEqual([])
    expect(fs.readdirSync(store.storeDir).filter(name => name.startsWith('.config.tmp-'))).toEqual([])
  })

  it('preserves a pre-existing staging collision', () => {
    store.ensureStore()
    const bytes = Buffer.from('1234567890abcdef')
    vi.spyOn(crypto, 'randomBytes').mockReturnValue(bytes)
    const collision = path.join(store.storeDir, `.config.tmp-${process.pid}-${bytes.toString('hex')}`)
    fs.writeFileSync(collision, 'do-not-delete', { mode: 0o600 })
    expect(() => store.saveEntry({ host: 'collision.example.com', user: 'hidden-user', password: SECRET })).toThrow(/EEXIST|exist/)
    expect(fs.readFileSync(collision, 'utf8')).toBe('do-not-delete')
    expect(fs.readdirSync(store.keysDir)).toEqual([])
    expect(fs.readFileSync(store.configPath, 'utf8')).toBe('')
  })

  it('rotates to fresh files, publishes their paths, and only then removes obsolete files', () => {
    store.saveEntry({ host: 'rotate.example.com', user: 'hidden-user', password: SECRET, secretFiles: [{ name: 'token', value: 'old-token' }] })
    const oldBlock = store.readRawConfig()[0]
    const oldPaths = [store.expandPath(oldBlock.identityFile), store.expandPath(oldBlock.secretFiles.token)]
    const result = store.saveEntry({ host: 'rotate.example.com', user: '', password: 'new-secret', secretFiles: [{ name: 'token', value: 'new-token' }] })
    expect(result).toMatchObject({ ready: true, hasUsername: true })
    expect(JSON.stringify(result)).not.toContain('hidden-user')
    expect(store.fillSecretInto('rotate.example.com', 'username').value).toBe('hidden-user')
    expect(store.fillSecretInto('rotate.example.com', 'password').value).toBe('new-secret')
    expect(store.fillSecretInto('rotate.example.com', 'token').value).toBe('new-token')
    oldPaths.forEach(oldPath => expect(fs.existsSync(oldPath)).toBe(false))
    const current = store.readRawConfig()[0]
    expect(fs.readdirSync(store.keysDir).sort()).toEqual([
      path.basename(store.expandPath(current.identityFile)),
      path.basename(store.expandPath(current.secretFiles.token))
    ].sort())
  })

  it('does not delete an owned key while another Host block still references it', () => {
    store.ensureStore()
    const sharedPassword = writeKey('shared-password', SECRET)
    const sharedToken = writeKey('shared-token', 'shared-token-value')
    writeConfig([
      'Host first.example.com',
      '  User first-user',
      `  IdentityFile ${sharedPassword}`,
      `  SecretFile token ${sharedToken}`,
      'Host second.example.com',
      '  User second-user',
      `  IdentityFile ${sharedPassword}`,
      `  SecretFile token ${sharedToken}`,
      ''
    ].join('\n'))

    store.saveEntry({ host: 'first.example.com', user: '', password: 'first-new', secretFiles: [{ name: 'token', value: 'first-token-new' }] })
    expect(fs.existsSync(sharedPassword)).toBe(true)
    expect(fs.existsSync(sharedToken)).toBe(true)
    expect(store.fillSecretInto('second.example.com', 'password').value).toBe(SECRET)

    const removed = store.deleteEntry('second.example.com')
    expect(removed.removedKeys.sort()).toEqual(['shared-password', 'shared-token'])
    expect(fs.existsSync(sharedPassword)).toBe(false)
    expect(fs.existsSync(sharedToken)).toBe(false)
  })
})
