/**
 * Browser MCP - Bookmark handlers
 * Get bookmark tree, search, create, move, delete bookmarks
 */

import { sendToWebSocket } from '../websocket'

interface BookmarkNode {
  id: string
  title: string
  url?: string
  parentId?: string
  index?: number
  dateAdded?: number
  children?: BookmarkNode[]
}

/**
 * Convert Chrome bookmark tree to simplified format, limiting depth
 */
function simplifyBookmarkTree(nodes: chrome.bookmarks.BookmarkTreeNode[], maxDepth: number, currentDepth: number = 0): BookmarkNode[] {
  return nodes.map(node => {
    const simplified: BookmarkNode = {
      id: node.id,
      title: node.title,
      parentId: node.parentId,
      index: node.index,
      dateAdded: node.dateAdded
    }

    if (node.url) {
      simplified.url = node.url
    }

    if (node.children && currentDepth < maxDepth) {
      simplified.children = simplifyBookmarkTree(node.children, maxDepth, currentDepth + 1)
    } else if (node.children) {
      // Indicate there are more children but we're not showing them
      simplified.children = []
    }

    return simplified
  })
}

/**
 * Handle bookmark tree request
 */
export async function handleBrowserBookmarksTree(message: {
  requestId: string
  folderId?: string
  maxDepth?: number
}): Promise<void> {
  try {
    const maxDepth = message.maxDepth || 3

    let tree: chrome.bookmarks.BookmarkTreeNode[]
    if (message.folderId) {
      tree = await chrome.bookmarks.getSubTree(message.folderId)
    } else {
      tree = await chrome.bookmarks.getTree()
    }

    // Simplify and limit depth
    const simplifiedTree = simplifyBookmarkTree(tree, maxDepth)

    sendToWebSocket({
      type: 'browser-bookmarks-tree-result',
      requestId: message.requestId,
      success: true,
      tree: simplifiedTree
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-bookmarks-tree-result',
      requestId: message.requestId,
      success: false,
      tree: [],
      error: (err as Error).message
    })
  }
}

/**
 * Handle bookmark search request
 */
export async function handleBrowserBookmarksSearch(message: {
  requestId: string
  query: string
  limit?: number
}): Promise<void> {
  try {
    const results = await chrome.bookmarks.search(message.query)
    const limit = message.limit || 20

    // Convert to simplified format
    const bookmarks: BookmarkNode[] = results.slice(0, limit).map(bm => ({
      id: bm.id,
      title: bm.title,
      url: bm.url,
      parentId: bm.parentId,
      index: bm.index,
      dateAdded: bm.dateAdded
    }))

    sendToWebSocket({
      type: 'browser-bookmarks-search-result',
      requestId: message.requestId,
      success: true,
      bookmarks
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-bookmarks-search-result',
      requestId: message.requestId,
      success: false,
      bookmarks: [],
      error: (err as Error).message
    })
  }
}

/**
 * Handle bookmark create request
 */
export async function handleBrowserBookmarksCreate(message: {
  requestId: string
  url: string
  title: string
  parentId?: string
  index?: number
}): Promise<void> {
  try {
    const createDetails: chrome.bookmarks.CreateDetails = {
      url: message.url,
      title: message.title,
      parentId: message.parentId || '1' // Default to Bookmarks Bar
    }

    if (message.index !== undefined) {
      createDetails.index = message.index
    }

    const bookmark = await chrome.bookmarks.create(createDetails)

    sendToWebSocket({
      type: 'browser-bookmarks-create-result',
      requestId: message.requestId,
      success: true,
      bookmark: {
        id: bookmark.id,
        title: bookmark.title,
        url: bookmark.url,
        parentId: bookmark.parentId,
        index: bookmark.index
      }
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-bookmarks-create-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Handle bookmark folder create request
 */
export async function handleBrowserBookmarksCreateFolder(message: {
  requestId: string
  title: string
  parentId?: string
  index?: number
}): Promise<void> {
  try {
    const createDetails: chrome.bookmarks.CreateDetails = {
      title: message.title,
      parentId: message.parentId || '1' // Default to Bookmarks Bar
      // No URL = folder
    }

    if (message.index !== undefined) {
      createDetails.index = message.index
    }

    const folder = await chrome.bookmarks.create(createDetails)

    sendToWebSocket({
      type: 'browser-bookmarks-create-folder-result',
      requestId: message.requestId,
      success: true,
      folder: {
        id: folder.id,
        title: folder.title,
        parentId: folder.parentId,
        index: folder.index
      }
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-bookmarks-create-folder-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Handle bookmark move request
 */
export async function handleBrowserBookmarksMove(message: {
  requestId: string
  id: string
  parentId: string
  index?: number
}): Promise<void> {
  try {
    const destination: chrome.bookmarks.MoveDestination = {
      parentId: message.parentId
    }

    if (message.index !== undefined) {
      destination.index = message.index
    }

    const bookmark = await chrome.bookmarks.move(message.id, destination)

    sendToWebSocket({
      type: 'browser-bookmarks-move-result',
      requestId: message.requestId,
      success: true,
      bookmark: {
        id: bookmark.id,
        title: bookmark.title,
        url: bookmark.url,
        parentId: bookmark.parentId,
        index: bookmark.index
      }
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-bookmarks-move-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}

/**
 * Handle bookmark delete request
 */
export async function handleBrowserBookmarksDelete(message: {
  requestId: string
  id: string
}): Promise<void> {
  try {
    // Try to remove as a folder first (recursively deletes contents)
    // If it's a bookmark, this will still work
    try {
      await chrome.bookmarks.removeTree(message.id)
    } catch {
      // If removeTree fails (e.g., for a single bookmark), use remove
      await chrome.bookmarks.remove(message.id)
    }

    sendToWebSocket({
      type: 'browser-bookmarks-delete-result',
      requestId: message.requestId,
      success: true
    })
  } catch (err) {
    sendToWebSocket({
      type: 'browser-bookmarks-delete-result',
      requestId: message.requestId,
      success: false,
      error: (err as Error).message
    })
  }
}
