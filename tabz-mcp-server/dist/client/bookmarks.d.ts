/**
 * Bookmarks Module
 *
 * Chrome bookmark management functionality.
 */
import type { BookmarkTreeResult, BookmarkSearchResult, BookmarkCreateResult, BookmarkFolderResult, BookmarkMoveResult, BookmarkDeleteResult } from "../types.js";
/**
 * Get bookmark tree (full hierarchy or specific folder)
 */
export declare function getBookmarkTree(options: {
    folderId?: string;
    maxDepth?: number;
}): Promise<BookmarkTreeResult>;
/**
 * Search bookmarks by title or URL
 */
export declare function searchBookmarks(options: {
    query: string;
    limit?: number;
}): Promise<BookmarkSearchResult>;
/**
 * Create a new bookmark
 */
export declare function createBookmark(options: {
    url: string;
    title: string;
    parentId?: string;
    index?: number;
}): Promise<BookmarkCreateResult>;
/**
 * Create a new bookmark folder
 */
export declare function createBookmarkFolder(options: {
    title: string;
    parentId?: string;
    index?: number;
}): Promise<BookmarkFolderResult>;
/**
 * Move a bookmark or folder to a new location
 */
export declare function moveBookmark(options: {
    id: string;
    parentId: string;
    index?: number;
}): Promise<BookmarkMoveResult>;
/**
 * Delete a bookmark or folder
 */
export declare function deleteBookmark(id: string): Promise<BookmarkDeleteResult>;
//# sourceMappingURL=bookmarks.d.ts.map