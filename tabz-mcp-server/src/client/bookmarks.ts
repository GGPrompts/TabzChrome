/**
 * Bookmarks Module
 *
 * Chrome bookmark management functionality.
 */

import axios from "axios";
import { BACKEND_URL, handleApiError } from "./core.js";
import type {
  BookmarkTreeResult,
  BookmarkSearchResult,
  BookmarkCreateResult,
  BookmarkFolderResult,
  BookmarkMoveResult,
  BookmarkDeleteResult
} from "../types.js";

// =====================================
// Bookmark Functions
// =====================================

/**
 * Get bookmark tree (full hierarchy or specific folder)
 */
export async function getBookmarkTree(options: {
  folderId?: string;
  maxDepth?: number;
}): Promise<BookmarkTreeResult> {
  try {
    const params = new URLSearchParams();
    if (options.folderId) params.append('folderId', options.folderId);
    if (options.maxDepth) params.append('maxDepth', String(options.maxDepth));

    const response = await axios.get<BookmarkTreeResult>(
      `${BACKEND_URL}/api/browser/bookmarks/tree?${params.toString()}`,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to get bookmark tree").message };
  }
}

/**
 * Search bookmarks by title or URL
 */
export async function searchBookmarks(options: {
  query: string;
  limit?: number;
}): Promise<BookmarkSearchResult> {
  try {
    const params = new URLSearchParams();
    params.append('query', options.query);
    if (options.limit) params.append('limit', String(options.limit));

    const response = await axios.get<BookmarkSearchResult>(
      `${BACKEND_URL}/api/browser/bookmarks/search?${params.toString()}`,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to search bookmarks").message };
  }
}

/**
 * Create a new bookmark
 */
export async function createBookmark(options: {
  url: string;
  title: string;
  parentId?: string;
  index?: number;
}): Promise<BookmarkCreateResult> {
  try {
    const response = await axios.post<BookmarkCreateResult>(
      `${BACKEND_URL}/api/browser/bookmarks/create`,
      {
        url: options.url,
        title: options.title,
        parentId: options.parentId || '1',  // Default to Bookmarks Bar
        index: options.index
      },
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to create bookmark").message };
  }
}

/**
 * Create a new bookmark folder
 */
export async function createBookmarkFolder(options: {
  title: string;
  parentId?: string;
  index?: number;
}): Promise<BookmarkFolderResult> {
  try {
    const response = await axios.post<BookmarkFolderResult>(
      `${BACKEND_URL}/api/browser/bookmarks/create-folder`,
      {
        title: options.title,
        parentId: options.parentId || '1',  // Default to Bookmarks Bar
        index: options.index
      },
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to create folder").message };
  }
}

/**
 * Move a bookmark or folder to a new location
 */
export async function moveBookmark(options: {
  id: string;
  parentId: string;
  index?: number;
}): Promise<BookmarkMoveResult> {
  try {
    const response = await axios.post<BookmarkMoveResult>(
      `${BACKEND_URL}/api/browser/bookmarks/move`,
      {
        id: options.id,
        parentId: options.parentId,
        index: options.index
      },
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to move bookmark").message };
  }
}

/**
 * Delete a bookmark or folder
 */
export async function deleteBookmark(id: string): Promise<BookmarkDeleteResult> {
  try {
    const response = await axios.post<BookmarkDeleteResult>(
      `${BACKEND_URL}/api/browser/bookmarks/delete`,
      { id },
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    return { success: false, error: handleApiError(error, "Failed to delete bookmark").message };
  }
}
