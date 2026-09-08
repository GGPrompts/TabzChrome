import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SettingsLogins from '../../../extension/dashboard/sections/SettingsLogins'

const STORED_USERNAME = 'stored-user-must-not-render'
const ENTRIES = [
  {
    name: 'icabbi',
    patterns: ['*.icabbi.com'],
    hasUsername: true,
    user: STORED_USERNAME,
    hasKey: true,
    keyMode: '600',
    keyStatus: 'ready',
    fields: ['org_id'],
    secretFiles: ['api_token'],
  },
  {
    name: 'a.example.com',
    patterns: ['a.example.com'],
    hasUsername: false,
    hasKey: false,
    keyMode: '600',
    keyStatus: 'empty',
    fields: [],
    secretFiles: [],
  },
]

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status < 400, status, json: () => Promise.resolve(body) } as Response
}

describe('SettingsLogins', () => {
  const posts: Array<Record<string, unknown>> = []
  const deletes: string[] = []
  let postStatus = 200

  beforeEach(() => {
    window.scrollTo = vi.fn()
    window.location.hash = '#/logins'
    posts.length = 0
    deletes.length = 0
    postStatus = 200
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push(JSON.parse(String(init.body)))
        return postStatus === 200
          ? jsonResponse(200, { success: true, status: 'ready', host: 'b.example.com', fields: ['account'], secretFiles: ['api_token'] })
          : jsonResponse(postStatus, { success: false, error: 'Field "org_id" is empty' })
      }
      if (init?.method === 'DELETE') {
        deletes.push(String(url))
        return jsonResponse(200, { success: true, deleted: true })
      }
      return jsonResponse(200, { success: true, storeDir: '/private/path/must-not-render', entries: ENTRIES })
    }) as unknown as typeof fetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function hostInput(): HTMLInputElement {
    return screen.getByPlaceholderText('app.example.com') as HTMLInputElement
  }

  function usernameInput(): HTMLInputElement {
    return screen.getByLabelText('Username') as HTMLInputElement
  }

  function passwordInput(): HTMLInputElement {
    return screen.getByLabelText('Password') as HTMLInputElement
  }

  async function changeHash(hash: string) {
    await act(async () => {
      window.location.hash = hash
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
  }

  it('shows metadata only and rotates with blank values that retain saved fields', async () => {
    render(<SettingsLogins />)
    const rotateButtons = await screen.findAllByTitle('Re-enter values for this saved login')

    expect(screen.getByText('username saved')).toBeInTheDocument()
    expect(screen.getByText('no username yet')).toBeInTheDocument()
    expect(document.body.textContent).not.toContain(STORED_USERNAME)
    expect(document.body.textContent).not.toContain('/private/path/must-not-render')

    fireEvent.click(rotateButtons[0])
    expect(hostInput().value).toBe('*.icabbi.com')
    expect(hostInput().readOnly).toBe(true)
    expect(usernameInput().value).toBe('')
    expect(passwordInput().value).toBe('')
    expect(screen.getByText(/Blank username, password, field, and secret inputs retain/)).toBeInTheDocument()

    await act(async () => {
      fireEvent.submit(hostInput().closest('form') as HTMLFormElement)
    })
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toEqual({
      host: '*.icabbi.com',
      user: '',
      password: '',
      fields: [{ name: 'org_id', value: '' }],
      secretFiles: [{ name: 'api_token', value: '' }],
    })
    await waitFor(() => expect(hostInput().readOnly).toBe(false))
  })

  it('adds named ordinary and secret fields and deletes by the displayed pattern', async () => {
    render(<SettingsLogins />)
    await screen.findAllByTitle('Re-enter values for this saved login')
    fireEvent.change(hostInput(), { target: { value: 'login.example.com' } })
    fireEvent.change(usernameInput(), { target: { value: 'synthetic-user' } })
    fireEvent.change(passwordInput(), { target: { value: 'synthetic-password' } })

    fireEvent.click(screen.getByText('Add field'))
    fireEvent.change(screen.getByPlaceholderText('org_id'), { target: { value: 'account' } })
    fireEvent.change(screen.getByPlaceholderText('value'), { target: { value: 'north' } })

    fireEvent.click(screen.getByText('Add field'))
    const names = screen.getAllByPlaceholderText('org_id')
    fireEvent.change(names[1], { target: { value: 'api_token' } })
    fireEvent.click(screen.getAllByText('Secret')[1])
    const secretInputs = document.querySelectorAll('input[type="password"]')
    fireEvent.change(secretInputs[1], { target: { value: 'synthetic-token' } })

    fireEvent.click(screen.getByText('Add field'))
    const allNames = screen.getAllByPlaceholderText('org_id')
    fireEvent.change(allNames[2], { target: { value: 'login_type' } })
    fireEvent.click(screen.getAllByText('Select value')[2])
    fireEvent.change(screen.getByPlaceholderText('option value or label'), { target: { value: 'staff' } })

    await act(async () => {
      fireEvent.submit(hostInput().closest('form') as HTMLFormElement)
    })
    await waitFor(() => expect(posts).toHaveLength(1))
    expect(posts[0]).toEqual({
      host: 'login.example.com',
      user: 'synthetic-user',
      password: 'synthetic-password',
      fields: [{ name: 'account', value: 'north' }, { name: 'login_type', value: 'staff' }],
      secretFiles: [{ name: 'api_token', value: 'synthetic-token' }],
    })

    fireEvent.click((await screen.findAllByTitle('Remove this saved login'))[0])
    fireEvent.click(screen.getByText('Delete *.icabbi.com'))
    await waitFor(() => expect(deletes).toEqual(['http://localhost:8129/api/browser/secrets/*.icabbi.com']))
  })

  it('keeps a dirty deep link on its original host and follows a new host once clean', async () => {
    window.location.hash = '#/logins?host=first.example.com'
    render(<SettingsLogins />)
    await waitFor(() => expect(hostInput().value).toBe('first.example.com'))

    fireEvent.change(passwordInput(), { target: { value: 'typed-fixture' } })
    await changeHash('#/logins?host=second.example.com')

    expect(hostInput().value).toBe('first.example.com')
    expect(passwordInput().value).toBe('typed-fixture')
    expect(screen.getByRole('alert')).toHaveTextContent('second.example.com')
    expect(window.location.hash).toBe('#/logins?host=first.example.com')

    fireEvent.change(passwordInput(), { target: { value: '' } })
    await changeHash('#/logins?host=third.example.com')
    expect(hostInput().value).toBe('third.example.com')
  })

  it('keeps entered values after a failed save and clears them after success', async () => {
    postStatus = 400
    render(<SettingsLogins />)
    await screen.findAllByTitle('Re-enter values for this saved login')
    fireEvent.change(hostInput(), { target: { value: 'b.example.com' } })
    fireEvent.change(passwordInput(), { target: { value: 'keep-me-fixture' } })

    await act(async () => {
      fireEvent.submit(hostInput().closest('form') as HTMLFormElement)
    })
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('org_id'))
    expect(passwordInput().value).toBe('keep-me-fixture')
    expect(hostInput().value).toBe('b.example.com')

    postStatus = 200
    await act(async () => {
      fireEvent.submit(hostInput().closest('form') as HTMLFormElement)
    })
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Saved b.example.com'))
    expect(passwordInput().value).toBe('')
    expect(hostInput().value).toBe('')
  })

  it('requires confirmation before Rotate replaces a dirty form', async () => {
    vi.stubGlobal('confirm', vi.fn(() => false))
    render(<SettingsLogins />)
    const rotate = (await screen.findAllByTitle('Re-enter values for this saved login'))[0]
    fireEvent.change(hostInput(), { target: { value: 'unfinished.example.com' } })
    fireEvent.change(passwordInput(), { target: { value: 'unfinished-fixture' } })

    fireEvent.click(rotate)
    expect(hostInput().value).toBe('unfinished.example.com')
    expect(passwordInput().value).toBe('unfinished-fixture')

    vi.mocked(window.confirm).mockReturnValue(true)
    fireEvent.click(rotate)
    expect(hostInput().value).toBe('*.icabbi.com')
    expect(passwordInput().value).toBe('')
  })

  it('disables form and entry mutations while a save response is pending', async () => {
    let finishSave: ((response: Response) => void) | undefined
    vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        return new Promise<Response>(resolve => {
          finishSave = resolve
        })
      }
      return Promise.resolve(jsonResponse(200, { success: true, entries: ENTRIES }))
    }) as unknown as typeof fetch)

    render(<SettingsLogins />)
    const rotate = (await screen.findAllByTitle('Re-enter values for this saved login'))[0] as HTMLButtonElement
    fireEvent.change(hostInput(), { target: { value: 'pending.example.com' } })
    fireEvent.change(passwordInput(), { target: { value: 'pending-fixture' } })
    fireEvent.submit(hostInput().closest('form') as HTMLFormElement)

    await waitFor(() => expect(passwordInput()).toBeDisabled())
    expect(hostInput()).toBeDisabled()
    expect(rotate).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Save login' })).toBeDisabled()

    await act(async () => {
      finishSave?.(jsonResponse(200, { success: true, status: 'ready', host: 'pending.example.com', fields: [], secretFiles: [] }))
    })
    await waitFor(() => expect(passwordInput().value).toBe(''))
    expect(hostInput().value).toBe('')
  })
})

vi.mock('../../../extension/dashboard/sections/Home', () => ({ default: () => <div>Home section</div> }))
vi.mock('../../../extension/dashboard/sections/Terminals', () => ({ default: () => <div>Terminals section</div> }))
vi.mock('../../../extension/dashboard/sections/ApiPlayground', () => ({ default: () => <div>API section</div> }))
vi.mock('../../../extension/dashboard/sections/SettingsMcp', () => ({ default: () => <div>MCP section</div> }))
vi.mock('../../../extension/dashboard/sections/SettingsAudio', () => ({ default: () => <div>Audio section</div> }))
vi.mock('../../../extension/dashboard/sections/SettingsNotifications', () => ({ default: () => <div>Notifications section</div> }))
vi.mock('../../../extension/dashboard/sections/SettingsProfiles', () => ({ default: () => <div>Profiles section</div> }))
vi.mock('../../../extension/dashboard/sections/SettingsAppearance', () => ({ default: () => <div>Appearance section</div> }))
vi.mock('../../../extension/dashboard/sections/Files', () => ({ default: () => <div>Files section</div> }))
vi.mock('../../../extension/dashboard/sections/Git', () => ({ default: () => <div>Git section</div> }))
vi.mock('../../../extension/dashboard/sections/Pages', () => ({ default: () => <div>Pages section</div> }))
vi.mock('../../../extension/dashboard/components/CaptureViewer', () => ({ default: () => null }))
vi.mock('../../../extension/dashboard/components/QuickOpenModal', () => ({
  QuickOpenModal: ({ isOpen, onFileOpen }: { isOpen: boolean; onFileOpen: () => boolean | void }) => isOpen
    ? <button onClick={() => onFileOpen()}>Open synthetic file</button>
    : null,
}))
vi.mock('../../../extension/dashboard/contexts/FilesContext', () => ({ FilesProvider: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('../../../extension/hooks/useWorkingDirectory', () => ({
  useWorkingDirectory: () => ({ globalWorkingDir: '~', setGlobalWorkingDir: vi.fn(), recentDirs: [], setRecentDirs: vi.fn(), addToRecentDirs: vi.fn() }),
}))
vi.mock('../../../extension/hooks/useAccentSettings', () => ({ useAccentSettings: vi.fn() }))

describe('dashboard unsaved login navigation', () => {
  beforeEach(() => {
    window.location.hash = '#/logins'
    localStorage.clear()
    vi.stubGlobal('confirm', vi.fn(() => false))
    vi.stubGlobal('fetch', vi.fn(async (url: string) => String(url).includes('/api/browser/secrets')
      ? jsonResponse(200, { success: true, entries: [] })
      : jsonResponse(200, { success: true })) as unknown as typeof fetch)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('guards sidebar, hash, Quick Open, and page unload while the form is dirty', async () => {
    const { default: App } = await import('../../../extension/dashboard/App')
    render(<App />)
    await screen.findByRole('heading', { name: 'Logins' })
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'synthetic-unsaved' } })

    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)

    fireEvent.click(document.querySelector('button[data-section="home"]') as HTMLButtonElement)
    expect(screen.getByRole('heading', { name: 'Logins' })).toBeInTheDocument()

    await act(async () => {
      window.location.hash = '#/home'
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    })
    expect(window.location.hash).toBe('#/logins')
    expect(screen.getByRole('heading', { name: 'Logins' })).toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'p', ctrlKey: true })
    fireEvent.click(screen.getByText('Open synthetic file'))
    expect(screen.getByRole('heading', { name: 'Logins' })).toBeInTheDocument()
    expect(window.confirm).toHaveBeenCalledTimes(3)
  })

  it('allows normal dashboard navigation while the login form is clean', async () => {
    const { default: App } = await import('../../../extension/dashboard/App')
    render(<App />)
    await screen.findByRole('heading', { name: 'Logins' })

    fireEvent.click(document.querySelector('button[data-section="home"]') as HTMLButtonElement)
    expect(await screen.findByText('Home section')).toBeInTheDocument()
    expect(window.confirm).not.toHaveBeenCalled()
  })

})
