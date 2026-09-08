// Shell tests use only temporary synthetic files and fake Windows/rsync tools.
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const helper = resolve('scripts/windows-sync.sh')
let root: string
let source: string
let bin: string
const manifest = { name: 'Synthetic Tabz', background: { service_worker: 'worker.js' } }

function shell(code: string, args: string[] = [], env: Record<string, string> = {}) {
  return spawnSync('bash', ['-c', 'source "$1" || exit; shift; ' + code, 'rebuild-test', helper, ...args], {
    encoding: 'utf8', env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, ...env }
  })
}
function executable(name: string, body: string) {
  const file = join(bin, name)
  writeFileSync(file, '#!/usr/bin/env bash\n' + body + '\n', { mode: 0o755 })
  return file
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'tabz-rebuild-test-'))
  source = join(root, 'source')
  bin = join(root, 'bin')
  mkdirSync(source)
  mkdirSync(bin)
  writeFileSync(join(source, 'manifest.json'), JSON.stringify(manifest))
  writeFileSync(join(source, 'worker.js'), '// synthetic worker')
  executable('rsync', 'printf "%s\\n" "$@" > "$RSYNC_RECORD"\ncp -R "${@: -2:1}/." "${@: -1}"')
})
afterEach(() => rmSync(root, { recursive: true, force: true }))

describe('rebuild destination safety', () => {
  it('retains TABZ_WIN_PATH as the exact load folder without resolving a profile', () => {
    const destination = join(root, 'Windows Desktop', 'custom-extension')
    const result = shell('resolve_windows_desktop() { return 77; }; tabz_windows_extension_dir', [], { TABZ_WIN_PATH: destination + '/' })
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe(destination)
  })

  it('falls back from PowerShell to the Windows profile instead of picking the first user', () => {
    executable('powershell.exe', 'exit 1')
    executable('cmd.exe', 'printf "%s\\r\\n" "C:\\Users\\Synthetic User"')
    executable('wslpath', 'printf "%s\\n" "$2" > "$WSLPATH_RECORD"\nprintf "%s\\n" "$SYNTHETIC_DESKTOP"')
    const record = join(root, 'wslpath-args')
    const result = shell('tabz_windows_extension_dir', [], {
      TABZ_WIN_PATH: '', WSLPATH_RECORD: record, SYNTHETIC_DESKTOP: join(root, 'Desktop')
    })
    expect(result.status).toBe(0)
    expect(result.stdout.trim()).toBe(join(root, 'Desktop', 'TabzChrome', 'dist-extension'))
    expect(readFileSync(record, 'utf8').trim()).toBe('C:\\Users\\Synthetic User\\Desktop')
  })

  it('refuses unsafe, overlapping and foreign destinations before invoking rsync', () => {
    const other = join(root, 'other')
    mkdirSync(other)
    writeFileSync(join(other, 'manifest.json'), JSON.stringify({ ...manifest, name: 'Another extension' }))
    const unrelated = join(root, 'unrelated')
    mkdirSync(unrelated)
    writeFileSync(join(unrelated, 'keep.txt'), 'keep')
    const alias = join(root, 'alias')
    symlinkSync(source, alias)
    const record = join(root, 'rsync-record')
    for (const destination of ['', '/', 'relative', source, join(source, 'child'), root, other, unrelated, alias]) {
      const result = shell('sync_tabz_extension "$1" "$2"', [source, destination], { RSYNC_RECORD: record })
      expect(result.status, destination).not.toBe(0)
      expect(existsSync(record), destination).toBe(false)
    }
    expect(readFileSync(join(unrelated, 'keep.txt'), 'utf8')).toBe('keep')
    expect(shell('sync_tabz_extension "$1" "$2"', [join(root, 'missing'), join(root, 'new')], { RSYNC_RECORD: record }).status).not.toBe(0)
    expect(existsSync(join(root, 'new'))).toBe(false)
  })

  it('copies a complete build to the exact folder and propagates rsync failure', () => {
    const destination = join(root, 'Windows Desktop', 'dist-extension')
    const record = join(root, 'rsync-record')
    const result = shell('sync_tabz_extension "$1" "$2"', [source, destination], { RSYNC_RECORD: record })
    expect(result.status, result.stderr).toBe(0)
    expect(readFileSync(join(destination, 'manifest.json'), 'utf8')).toBe(JSON.stringify(manifest))
    expect(existsSync(join(destination, 'dist-extension'))).toBe(false)
    expect(result.stdout).toContain(destination)
    expect(readFileSync(record, 'utf8')).toContain('--delete')
    executable('rsync', 'exit 23')
    expect(shell('sync_tabz_extension "$1" "$2"', [source, destination]).status).not.toBe(0)
  })
})
