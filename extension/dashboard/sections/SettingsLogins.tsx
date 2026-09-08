import React, { useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, Check, CheckCircle, Copy, KeyRound, Lock, Plus, RefreshCw, RotateCcw, Trash2, XCircle } from 'lucide-react'
import { EyeOffIcon, type AnimatedIconHandle } from '../../components/icons'

const API_BASE = 'http://localhost:8129'

type FieldKind = 'text' | 'select' | 'secret'

interface FieldRow {
  id: number
  name: string
  kind: FieldKind
  value: string
}

interface SavedEntry {
  name: string
  patterns: string[]
  hasUsername: boolean
  hasKey: boolean
  keyMode: string | null
  keyStatus: 'ready' | 'empty' | 'missing' | 'not_file' | 'bad_mode' | 'no_key'
  fix?: string
  fields: string[]
  secretFiles: string[]
}

interface SaveResponse {
  success: boolean
  status?: 'ready' | 'pending' | 'bad_mode'
  host?: string
  hasUsername?: boolean
  patterns?: string[]
  fields?: string[]
  secretFiles?: string[]
  created?: boolean
  fix?: string
  keyMode?: string
  error?: string
}

interface SettingsLoginsProps {
  onDirtyChange?: (dirty: boolean) => void
}

const KIND_LABELS: Record<FieldKind, string> = {
  text: 'Text field',
  select: 'Select value',
  secret: 'Secret',
}

const KIND_HINTS: Record<FieldKind, string> = {
  text: 'Typed into a text input (an org id or account number).',
  select: "Picks a dropdown option by its value or visible label.",
  secret: 'Stored in its own protected file and typed only into a password input.',
}

let nextRowId = 1

function newRow(name = '', kind: FieldKind = 'text'): FieldRow {
  return { id: nextRowId++, name, kind, value: '' }
}

function hostFromHash(): string {
  const hash = window.location.hash
  if (!hash.startsWith('#/logins')) return ''
  const query = hash.split('?')[1]
  if (!query) return ''
  return (new URLSearchParams(query).get('host') || '').trim().toLowerCase()
}

function rotatePattern(entry: SavedEntry): string {
  return entry.patterns[0] || ''
}

function isWildcardPattern(pattern: string): boolean {
  return /[*?!]/.test(pattern)
}

export default function SettingsLogins({ onDirtyChange }: SettingsLoginsProps) {
  const [host, setHost] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')
  const [rows, setRows] = useState<FieldRow[]>([])
  const [hostEdited, setHostEdited] = useState(false)
  const [rotating, setRotating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [entries, setEntries] = useState<SavedEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [listError, setListError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [copiedFix, setCopiedFix] = useState<string | null>(null)

  const userRef = useRef<HTMLInputElement>(null)
  const iconRef = useRef<AnimatedIconHandle>(null)
  const acceptedHashRef = useRef(window.location.hash)
  const dirty = saving || rotating || hostEdited || user.trim() !== '' || password !== '' || rows.some(row => row.name.trim() !== '' || row.value !== '')
  const formRef = useRef({ host: '', dirty: false })
  formRef.current = { host, dirty }

  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])

  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])

  useEffect(() => {
    const timer = setTimeout(() => iconRef.current?.startAnimation(), 100)
    return () => clearTimeout(timer)
  }, [])

  const loadEntries = useCallback(async () => {
    setLoading(true)
    setListError(null)
    try {
      const res = await fetch(`${API_BASE}/api/browser/secrets`)
      if (!res.ok) throw new Error(`The Node backend answered HTTP ${res.status}`)
      const data = await res.json()
      setEntries(Array.isArray(data.entries) ? data.entries : [])
    } catch (error) {
      setListError(error instanceof Error ? error.message : 'Could not load saved logins')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadEntries()
  }, [loadEntries])

  useEffect(() => {
    const applyHash = () => {
      const fromHash = hostFromHash()
      if (!fromHash) return
      const current = formRef.current
      if (fromHash === current.host) {
        acceptedHashRef.current = window.location.hash
        setTimeout(() => userRef.current?.focus(), 0)
        return
      }
      if (current.dirty) {
        window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}${acceptedHashRef.current}`)
        setSaveMessage({
          kind: 'error',
          text: `A login for ${current.host || 'another host'} is half-typed; save it or press Cancel before switching to ${fromHash}.`,
        })
        return
      }
      setUser('')
      setPassword('')
      setRows([])
      setRotating(false)
      setSaveMessage(null)
      setHost(fromHash)
      setHostEdited(false)
      acceptedHashRef.current = window.location.hash
      setTimeout(() => userRef.current?.focus(), 0)
    }
    applyHash()
    window.addEventListener('hashchange', applyHash)
    return () => window.removeEventListener('hashchange', applyHash)
  }, [])

  const updateRow = (id: number, patch: Partial<FieldRow>) => {
    setRows(previous => previous.map(row => row.id === id ? { ...row, ...patch } : row))
  }

  const resetForm = () => {
    setHost('')
    setUser('')
    setPassword('')
    setRows([])
    setRotating(false)
    setHostEdited(false)
  }

  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaveMessage(null)
    const trimmedHost = host.trim().toLowerCase()
    if (!trimmedHost) {
      setSaveMessage({ kind: 'error', text: 'Host is required (hostname only, e.g. app.example.com).' })
      return
    }
    const body = {
      host: trimmedHost,
      user: user.trim(),
      password,
      fields: rows.filter(row => row.kind !== 'secret').map(row => ({ name: row.name.trim(), value: row.value })),
      secretFiles: rows.filter(row => row.kind === 'secret').map(row => ({ name: row.name.trim(), value: row.value })),
    }
    setSaving(true)
    try {
      const res = await fetch(`${API_BASE}/api/browser/secrets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data: SaveResponse = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }))
      if (!res.ok || !data.success) {
        setSaveMessage({ kind: 'error', text: data.error || `Save failed with HTTP ${res.status}` })
        return
      }
      const names = ['username', 'password', ...(data.fields || []), ...(data.secretFiles || [])]
      const status = data.status === 'ready'
        ? ''
        : data.status === 'bad_mode'
          ? ` The saved login has the wrong file mode; follow the displayed repair guidance.`
          : ' The password is still empty, so the saved login is not ready.'
      setSaveMessage({ kind: 'ok', text: `Saved ${data.host || trimmedHost}: ${names.join(', ')}.${status}` })
      resetForm()
      void loadEntries()
    } catch (error) {
      setSaveMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Could not reach the Node backend' })
    } finally {
      setSaving(false)
    }
  }

  const startRotate = (entry: SavedEntry) => {
    if (dirty && !window.confirm('Discard the unsaved login changes?')) return
    setSaveMessage(null)
    setHost(rotatePattern(entry))
    setHostEdited(false)
    // Metadata never contains saved values. Blank fields tell the backend to
    // retain each current value unless the human enters a replacement.
    setUser('')
    setPassword('')
    setRows([
      ...entry.fields.map(name => newRow(name, 'text')),
      ...entry.secretFiles.map(name => newRow(name, 'secret')),
    ])
    setRotating(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setTimeout(() => userRef.current?.focus(), 0)
  }

  const remove = async (pattern: string) => {
    setSaveMessage(null)
    try {
      const res = await fetch(`${API_BASE}/api/browser/secrets/${encodeURIComponent(pattern)}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({ success: false, error: `HTTP ${res.status}` }))
      if (!res.ok || !data.success) {
        setSaveMessage({ kind: 'error', text: data.error || `Delete failed with HTTP ${res.status}` })
      } else {
        setSaveMessage({ kind: 'ok', text: `Removed the login for ${pattern}.` })
      }
    } catch (error) {
      setSaveMessage({ kind: 'error', text: error instanceof Error ? error.message : 'Could not reach the Node backend' })
    } finally {
      setConfirmDelete(null)
      void loadEntries()
    }
  }

  const copyFix = async (fix: string) => {
    try {
      await navigator.clipboard.writeText(fix)
      setCopiedFix(fix)
      setTimeout(() => setCopiedFix(null), 2000)
    } catch {
      // The repair guidance stays visible if clipboard access is unavailable.
    }
  }

  const inputClass = 'w-full px-3 py-2 rounded-lg bg-background border border-border focus:border-primary focus:outline-none text-sm'

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold font-mono text-primary terminal-glow flex items-center gap-3">
            <EyeOffIcon ref={iconRef} size={32} />
            Logins
          </h1>
          <p className="text-muted-foreground mt-1">
            Saved logins live in <code className="font-mono text-xs">~/.tabzchrome</code>, outside the repo. Tabz fills them into pages without returning their values to agents.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadEntries()}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 text-sm rounded-lg bg-card border border-border hover:bg-muted/50 transition-colors disabled:opacity-50"
          title="Reload the saved list"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {listError && (
        <div role="alert" className="mb-6 p-3 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-300">
          {listError}. Is the Node backend running on port 8129?
        </div>
      )}

      {saveMessage && (
        <div role={saveMessage.kind === 'error' ? 'alert' : 'status'} className={`mb-6 p-3 rounded-lg border text-sm ${saveMessage.kind === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
          {saveMessage.text}
        </div>
      )}

      <form onSubmit={save} autoComplete="off" className="p-4 rounded-lg bg-card border border-border mb-6">
        <fieldset disabled={saving} className="contents">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">{rotating ? 'Rotate a saved login' : 'Save a login'}</h2>
          {rotating && (
            <button type="button" onClick={resetForm} className="ml-auto text-xs text-muted-foreground hover:text-foreground">Cancel</button>
          )}
        </div>

        {rotating && (
          <p className="text-xs text-amber-300/90 mb-3">
            Enter only values you want to change. Blank username, password, field, and secret inputs retain their saved values.
            {isWildcardPattern(host) && <> This pattern, <span className="font-mono">{host}</span>, is rotated in place.</>}
          </p>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-3">
          <label className="block">
            <span className="text-xs text-muted-foreground">Host</span>
            <input
              aria-label="Host"
              type="text"
              value={host}
              onChange={event => {
                setHost(event.target.value)
                setHostEdited(true)
              }}
              placeholder="app.example.com"
              spellCheck={false}
              readOnly={rotating}
              aria-readonly={rotating}
              title={rotating ? 'Rotate updates this saved Host pattern; press Cancel to enter another host' : undefined}
              className={`${inputClass} font-mono ${rotating ? 'opacity-70 cursor-not-allowed' : ''}`}
              required
            />
            <span className="text-[11px] text-muted-foreground/70">{rotating ? 'The saved Host pattern.' : 'Hostname only, without a scheme or path.'}</span>
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">Username</span>
            <input aria-label="Username" ref={userRef} type="text" value={user} onChange={event => setUser(event.target.value)} autoComplete="off" spellCheck={false} className={inputClass} />
          </label>
          <label className="block">
            <span className="text-xs text-muted-foreground">Password</span>
            <input aria-label="Password" type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" className={inputClass} />
            <span className="text-[11px] text-muted-foreground/70">Cleared from this form after saving.</span>
          </label>
        </div>

        <div className="mb-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-muted-foreground">Extra fields needed by the login page</span>
            <button type="button" onClick={() => setRows(previous => [...previous, newRow()])} className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors">
              <Plus className="w-3.5 h-3.5" /> Add field
            </button>
          </div>
          {rows.length === 0 && <p className="text-xs text-muted-foreground/60">None. Username and password are enough for most sites.</p>}
          <div className="space-y-2">
            {rows.map(row => (
              <div key={row.id} className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr_auto] gap-2 items-start">
                <input type="text" value={row.name} onChange={event => updateRow(row.id, { name: event.target.value })} placeholder="org_id" spellCheck={false} autoComplete="off" className={`${inputClass} font-mono`} title="One field name: letters, digits, underscore, period, or dash" />
                <div className="flex rounded-lg border border-border overflow-hidden text-xs">
                  {(Object.keys(KIND_LABELS) as FieldKind[]).map(kind => (
                    <button key={kind} type="button" onClick={() => updateRow(row.id, { kind, value: '' })} className={`px-2 py-2 transition-colors ${row.kind === kind ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted/50'}`} title={KIND_HINTS[kind]}>
                      {KIND_LABELS[kind]}
                    </button>
                  ))}
                </div>
                <div>
                  <input type={row.kind === 'secret' ? 'password' : 'text'} value={row.value} onChange={event => updateRow(row.id, { value: event.target.value })} placeholder={row.kind === 'select' ? 'option value or label' : row.kind === 'secret' ? '' : 'value'} autoComplete={row.kind === 'secret' ? 'new-password' : 'off'} spellCheck={false} className={inputClass} />
                  <span className="text-[11px] text-muted-foreground/70">{KIND_HINTS[row.kind]}</span>
                </div>
                <button type="button" onClick={() => setRows(previous => previous.filter(candidate => candidate.id !== row.id))} className="p-2 rounded-lg text-muted-foreground hover:text-red-300 hover:bg-red-500/10 transition-colors" title="Remove this field">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50">
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {rotating ? 'Save changes' : 'Save login'}
          </button>
          <span className="text-xs text-muted-foreground/70">Only host patterns, status, and field names appear in this list.</span>
        </div>
        </fieldset>
      </form>

      <div className="p-4 rounded-lg bg-card border border-border">
        <div className="flex items-center gap-2 mb-3">
          <Lock className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">Saved logins</h2>
          <span className="text-xs text-muted-foreground ml-auto">{entries.length} {entries.length === 1 ? 'entry' : 'entries'}</span>
        </div>

        {!loading && entries.length === 0 && !listError && <p className="text-sm text-muted-foreground">No saved logins yet.</p>}

        <div className="divide-y divide-border">
          {entries.map(entry => {
            const pattern = entry.patterns[0] || entry.name
            const key = `${pattern}|${entry.name}`
            return (
              <div key={key} className="py-3 flex flex-col md:flex-row md:items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm">{entry.patterns.join('  ')}</span>
                    <StatusBadge entry={entry} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {entry.hasUsername ? <span>username saved</span> : <span className="text-amber-300/80">no username yet</span>}
                    {entry.name && <> · key <span className="font-mono">{entry.name}</span></>}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-2">
                    <Chip>username</Chip>
                    <Chip>password</Chip>
                    {entry.fields.map(name => <Chip key={`f-${name}`}>{name}</Chip>)}
                    {entry.secretFiles.map(name => <Chip key={`s-${name}`} secret>{name}</Chip>)}
                  </div>
                  {entry.keyStatus === 'bad_mode' && entry.fix && (
                    <div className="mt-2 flex items-center gap-2">
                      <code className="font-mono text-xs px-2 py-1 rounded bg-background border border-red-500/30 text-red-200 break-all">{entry.fix}</code>
                      <button type="button" onClick={() => void copyFix(entry.fix!)} className="p-1 rounded text-muted-foreground hover:text-foreground" title="Copy the repair command">
                        {copiedFix === entry.fix ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button type="button" disabled={saving} onClick={() => startRotate(entry)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg bg-muted/40 hover:bg-muted/70 transition-colors disabled:opacity-50" title="Re-enter values for this saved login">
                    <RotateCcw className="w-3.5 h-3.5" /> Rotate
                  </button>
                  {confirmDelete === key ? (
                    <span className="flex items-center gap-1">
                      <button type="button" disabled={saving} onClick={() => void remove(pattern)} className="px-2.5 py-1.5 text-xs rounded-lg bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors disabled:opacity-50">Delete {pattern}</button>
                      <button type="button" onClick={() => setConfirmDelete(null)} className="px-2 py-1.5 text-xs rounded-lg text-muted-foreground hover:text-foreground">Keep</button>
                    </span>
                  ) : (
                    <button type="button" disabled={saving} onClick={() => setConfirmDelete(key)} className="flex items-center gap-1 px-2.5 py-1.5 text-xs rounded-lg text-muted-foreground hover:text-red-300 hover:bg-red-500/10 transition-colors disabled:opacity-50" title="Remove this saved login">
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function Chip({ children, secret = false }: { children: React.ReactNode; secret?: boolean }) {
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-mono border ${secret ? 'border-amber-500/30 bg-amber-500/10 text-amber-200' : 'border-border bg-muted/30 text-muted-foreground'}`} title={secret ? 'Secret field' : 'Saved field name'}>
      {secret && <Lock className="w-3 h-3" />}
      {children}
    </span>
  )
}

function StatusBadge({ entry }: { entry: SavedEntry }) {
  if (entry.keyStatus === 'ready') {
    return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"><CheckCircle className="w-3 h-3" /> ready</span>
  }
  if (entry.keyStatus === 'bad_mode') {
    return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-red-500/15 text-red-300 border border-red-500/30"><XCircle className="w-3 h-3" /> wrong file mode{entry.keyMode ? ` (${entry.keyMode})` : ''}</span>
  }
  return <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-amber-500/15 text-amber-200 border border-amber-500/30"><AlertTriangle className="w-3 h-3" /> not saved yet</span>
}
