import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  addToRecentDirs: vi.fn(),
  clearPendingNavigation: vi.fn(),
  isWorkingDirectoryLoaded: true,
  isFavorite: vi.fn(() => false),
  openFile: vi.fn(),
  pinFile: vi.fn(),
  setFileTree: vi.fn(),
  setFileTreePath: vi.fn(),
  setGlobalWorkingDir: vi.fn(),
  toggleFavorite: vi.fn(),
}))

const rootTree = {
  name: 'project',
  path: '/workspace/project',
  type: 'directory' as const,
  children: [
    {
      name: 'src',
      path: '/workspace/project/src',
      type: 'directory' as const,
      children: [],
    },
  ],
}

vi.mock('../../../extension/dashboard/contexts/FilesContext', () => ({
  useFilesContext: () => ({
    fileTree: rootTree,
    setFileTree: mocks.setFileTree,
    fileTreePath: rootTree.path,
    setFileTreePath: mocks.setFileTreePath,
    pendingTreeNavigation: null,
    clearPendingNavigation: mocks.clearPendingNavigation,
    toggleFavorite: mocks.toggleFavorite,
    isFavorite: mocks.isFavorite,
    openFile: mocks.openFile,
    pinFile: mocks.pinFile,
  }),
}))

vi.mock('../../../extension/hooks/useWorkingDirectory', () => ({
  useWorkingDirectory: () => ({
    globalWorkingDir: rootTree.path,
    setGlobalWorkingDir: mocks.setGlobalWorkingDir,
    recentDirs: [rootTree.path],
    setRecentDirs: vi.fn(),
    addToRecentDirs: mocks.addToRecentDirs,
    isLoaded: mocks.isWorkingDirectoryLoaded,
  }),
}))

import { FileTree } from '../../../extension/dashboard/components/files/FileTree'

const folderPath = '/workspace/project/src'

function treeRequestFor(path: string) {
  return expect.stringContaining(
    `/api/files/tree?path=${encodeURIComponent(path)}`,
  )
}

describe('FileTree directory actions', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.isWorkingDirectoryLoaded = true
    localStorage.clear()

    vi.mocked(fetch).mockImplementation(async (input) => {
      const url = String(input)
      if (url.includes('/api/files/git-status')) {
        return {
          ok: true,
          json: async () => ({ isGitRepo: false, files: {} }),
        } as Response
      }

      if (url.includes('/api/files/tree')) {
        const path = new URL(url).searchParams.get('path') || rootTree.path
        return {
          ok: true,
          json: async () => ({
            name: path.split('/').pop() || '/',
            path,
            type: 'directory',
            children: [],
          }),
        } as Response
      }

      throw new Error(`Unexpected fetch: ${url}`)
    })
  })

  async function openFolderMenu() {
    render(<FileTree basePath={rootTree.path} />)

    const folder = await screen.findByText('src')
    fireEvent.contextMenu(folder)

    expect(screen.getByRole('button', { name: 'Set as Working Dir' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Browse Here' })).toBeVisible()
  }

  it('browses in the tree without changing shared working-directory state', async () => {
    await openFolderMenu()

    fireEvent.click(screen.getByRole('button', { name: 'Browse Here' }))

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(treeRequestFor(folderPath))
    })
    expect(mocks.setGlobalWorkingDir).not.toHaveBeenCalled()
    expect(mocks.addToRecentDirs).not.toHaveBeenCalled()
    expect(chrome.storage.local.clear).not.toHaveBeenCalled()
  })

  it('keeps the global action unavailable until working-directory initialization finishes', async () => {
    mocks.isWorkingDirectoryLoaded = false

    render(<FileTree basePath={rootTree.path} />)
    const folder = await screen.findByText('src')
    fireEvent.contextMenu(folder)

    expect(screen.queryByRole('button', { name: 'Set as Working Dir' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Browse Here' })).toBeVisible()
  })

  it('sets shared working-directory state and keeps the tree on that folder', async () => {
    await openFolderMenu()

    fireEvent.click(screen.getByRole('button', { name: 'Set as Working Dir' }))

    expect(mocks.setGlobalWorkingDir).toHaveBeenCalledWith(folderPath)
    expect(mocks.addToRecentDirs).toHaveBeenCalledWith(folderPath)
    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(treeRequestFor(folderPath))
    })
    expect(chrome.storage.local.clear).not.toHaveBeenCalled()
  })
})
