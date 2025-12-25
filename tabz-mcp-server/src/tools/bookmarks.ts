/**
 * Bookmark Tools
 *
 * Tools for managing Chrome bookmarks - save, search, organize, and navigate bookmarks
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import axios from "axios";
import { BACKEND_URL, handleApiError } from "../shared.js";
import {
  ResponseFormat,
  type BookmarkNode,
  type BookmarkTreeResult,
  type BookmarkSearchResult,
  type BookmarkCreateResult,
  type BookmarkFolderResult,
  type BookmarkMoveResult,
  type BookmarkDeleteResult
} from "../types.js";

/**
 * Get bookmark tree via Extension API
 */
async function getBookmarkTree(options: {
  folderId?: string;
  maxDepth?: number;
}): Promise<BookmarkTreeResult> {
  try {
    const response = await axios.get<BookmarkTreeResult>(
      `${BACKEND_URL}/api/browser/bookmarks`,
      {
        params: {
          folderId: options.folderId,
          maxDepth: options.maxDepth
        },
        timeout: 10000
      }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to get bookmarks");
  }
}

/**
 * Search bookmarks via Extension API
 */
async function searchBookmarks(options: {
  query: string;
  limit?: number;
}): Promise<BookmarkSearchResult> {
  try {
    const response = await axios.post<BookmarkSearchResult>(
      `${BACKEND_URL}/api/browser/bookmarks/search`,
      { query: options.query, limit: options.limit },
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to search bookmarks");
  }
}

/**
 * Create a bookmark via Extension API
 */
async function createBookmark(options: {
  title: string;
  url: string;
  parentId?: string;
  index?: number;
}): Promise<BookmarkCreateResult> {
  try {
    const response = await axios.post<BookmarkCreateResult>(
      `${BACKEND_URL}/api/browser/bookmarks/create`,
      options,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to create bookmark");
  }
}

/**
 * Create a bookmark folder via Extension API
 */
async function createBookmarkFolder(options: {
  title: string;
  parentId?: string;
  index?: number;
}): Promise<BookmarkFolderResult> {
  try {
    const response = await axios.post<BookmarkFolderResult>(
      `${BACKEND_URL}/api/browser/bookmarks/create-folder`,
      options,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to create folder");
  }
}

/**
 * Move a bookmark via Extension API
 */
async function moveBookmark(options: {
  id: string;
  parentId?: string;
  index?: number;
}): Promise<BookmarkMoveResult> {
  try {
    const response = await axios.post<BookmarkMoveResult>(
      `${BACKEND_URL}/api/browser/bookmarks/move`,
      options,
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to move bookmark");
  }
}

/**
 * Delete a bookmark via Extension API
 */
async function deleteBookmark(id: string): Promise<BookmarkDeleteResult> {
  try {
    const response = await axios.post<BookmarkDeleteResult>(
      `${BACKEND_URL}/api/browser/bookmarks/delete`,
      { id },
      { timeout: 10000 }
    );
    return response.data;
  } catch (error) {
    throw handleApiError(error, "Failed to delete bookmark");
  }
}

// Special folder IDs
const BOOKMARKS_BAR_ID = "1";
const OTHER_BOOKMARKS_ID = "2";

// =====================================
// Input Schemas
// =====================================

const GetBookmarkTreeSchema = z.object({
  folderId: z.string()
    .optional()
    .describe("Folder ID to get children of. Omit for full tree. Special IDs: '1' = Bookmarks Bar, '2' = Other Bookmarks"),
  maxDepth: z.number()
    .int()
    .min(1)
    .max(10)
    .default(3)
    .describe("Maximum depth to traverse (1-10, default: 3). Use 1 for immediate children only."),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();

type GetBookmarkTreeInput = z.infer<typeof GetBookmarkTreeSchema>;

const SearchBookmarksSchema = z.object({
  query: z.string()
    .min(1)
    .describe("Search query - matches against bookmark titles and URLs"),
  limit: z.number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum results to return (1-100, default: 20)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();

type SearchBookmarksInput = z.infer<typeof SearchBookmarksSchema>;

const SaveBookmarkSchema = z.object({
  url: z.string()
    .url()
    .describe("URL to bookmark"),
  title: z.string()
    .min(1)
    .describe("Bookmark title"),
  parentId: z.string()
    .optional()
    .describe("Parent folder ID. Default: '1' (Bookmarks Bar). Use '2' for Other Bookmarks, or a folder ID from tabz_get_bookmark_tree."),
  index: z.number()
    .int()
    .min(0)
    .optional()
    .describe("Position within the folder (0 = first). Omit to add at end.")
}).strict();

type SaveBookmarkInput = z.infer<typeof SaveBookmarkSchema>;

const CreateFolderSchema = z.object({
  title: z.string()
    .min(1)
    .describe("Folder name"),
  parentId: z.string()
    .optional()
    .describe("Parent folder ID. Default: '1' (Bookmarks Bar). Use '2' for Other Bookmarks."),
  index: z.number()
    .int()
    .min(0)
    .optional()
    .describe("Position within parent (0 = first). Omit to add at end.")
}).strict();

type CreateFolderInput = z.infer<typeof CreateFolderSchema>;

const MoveBookmarkSchema = z.object({
  id: z.string()
    .describe("Bookmark or folder ID to move (from tabz_get_bookmark_tree or tabz_search_bookmarks)"),
  parentId: z.string()
    .describe("Destination folder ID. Use '1' for Bookmarks Bar, '2' for Other Bookmarks."),
  index: z.number()
    .int()
    .min(0)
    .optional()
    .describe("Position in destination folder (0 = first). Omit to add at end.")
}).strict();

type MoveBookmarkInput = z.infer<typeof MoveBookmarkSchema>;

const DeleteBookmarkSchema = z.object({
  id: z.string()
    .describe("Bookmark or folder ID to delete. WARNING: Deleting a folder removes all contents!")
}).strict();

type DeleteBookmarkInput = z.infer<typeof DeleteBookmarkSchema>;

// =====================================
// Formatting Helpers
// =====================================

/**
 * Format bookmark tree for markdown display
 */
function formatBookmarkTree(nodes: BookmarkNode[], indent: number = 0, maxDepth: number = 3): string[] {
  const lines: string[] = [];
  const prefix = "  ".repeat(indent);

  for (const node of nodes) {
    if (node.url) {
      // Bookmark
      lines.push(`${prefix}- 🔖 **${node.title || 'Untitled'}** (id: ${node.id})`);
      lines.push(`${prefix}  ${node.url}`);
    } else {
      // Folder
      const folderIcon = node.id === BOOKMARKS_BAR_ID ? "⭐" :
                         node.id === OTHER_BOOKMARKS_ID ? "📁" : "📂";
      lines.push(`${prefix}- ${folderIcon} **${node.title || 'Folder'}** (id: ${node.id})`);

      if (node.children && indent < maxDepth - 1) {
        lines.push(...formatBookmarkTree(node.children, indent + 1, maxDepth));
      } else if (node.children && node.children.length > 0) {
        lines.push(`${prefix}  ... ${node.children.length} items`);
      }
    }
  }

  return lines;
}

/**
 * Format search results for markdown display
 */
function formatSearchResults(bookmarks: BookmarkNode[]): string[] {
  const lines: string[] = [];

  for (let i = 0; i < bookmarks.length; i++) {
    const bm = bookmarks[i];
    lines.push(`### ${i + 1}. ${bm.title || 'Untitled'}`);
    lines.push(`- **ID:** ${bm.id}`);
    if (bm.url) {
      lines.push(`- **URL:** ${bm.url}`);
    }
    if (bm.parentId) {
      lines.push(`- **Parent ID:** ${bm.parentId}`);
    }
    lines.push("");
  }

  return lines;
}

// =====================================
// Tool Registration
// =====================================

/**
 * Register bookmark tools with the MCP server
 */
export function registerBookmarkTools(server: McpServer): void {

  // Get bookmark tree
  server.tool(
    "tabz_get_bookmark_tree",
    `Get the Chrome bookmarks hierarchy.

Returns the bookmark tree structure showing folders and bookmarks.
Use this to explore your bookmarks and find folder IDs for organizing.

**Special Folder IDs:**
- "1" = Bookmarks Bar (visible in browser toolbar)
- "2" = Other Bookmarks

Args:
  - folderId (optional): Get children of specific folder. Omit for full tree.
  - maxDepth: How deep to traverse (1-10, default: 3)
  - response_format: 'markdown' (default) or 'json'

Returns:
  Tree structure with:
  - id: Bookmark/folder ID (use with other bookmark tools)
  - title: Display name
  - url: URL (only for bookmarks, not folders)
  - children: Nested items (for folders)

Examples:
  - Full tree: (no args)
  - Bookmarks Bar only: folderId="1"
  - Shallow view: maxDepth=1

Use the returned IDs with tabz_save_bookmark, tabz_move_bookmark, etc.`,
    GetBookmarkTreeSchema.shape,
    async (params: GetBookmarkTreeInput) => {
      try {
        const result = await getBookmarkTree({
          folderId: params.folderId,
          maxDepth: params.maxDepth
        });

        if (!result.success) {
          return {
            content: [{
              type: "text",
              text: `## Failed to Get Bookmarks\n\n**Error:** ${result.error}`
            }],
            isError: true
          };
        }

        let resultText: string;

        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify(result.tree, null, 2);
        } else {
          const lines: string[] = [];
          lines.push("# Bookmark Tree");
          lines.push("");

          if (params.folderId) {
            lines.push(`**Folder ID:** ${params.folderId}`);
            lines.push("");
          }

          if (result.tree && result.tree.length > 0) {
            lines.push(...formatBookmarkTree(result.tree, 0, params.maxDepth));
          } else {
            lines.push("No bookmarks found.");
          }

          lines.push("");
          lines.push("---");
          lines.push("**Tip:** Use folder IDs with `tabz_save_bookmark` to add bookmarks to specific folders.");

          resultText = lines.join("\n");
        }

        return {
          content: [{ type: "text", text: resultText }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Search bookmarks
  server.tool(
    "tabz_search_bookmarks",
    `Search Chrome bookmarks by title or URL.

Finds bookmarks matching your query. Searches both titles and URLs.

Args:
  - query (required): Search text - matches titles and URLs
  - limit: Max results (1-100, default: 20)
  - response_format: 'markdown' (default) or 'json'

Returns:
  List of matching bookmarks with:
  - id: Bookmark ID (use with move/delete tools)
  - title: Bookmark title
  - url: Bookmark URL
  - parentId: Parent folder ID

Examples:
  - Find React docs: query="react"
  - Find GitHub repos: query="github.com"
  - Find by domain: query="stackoverflow.com"

Use the returned IDs with tabz_move_bookmark or tabz_delete_bookmark.`,
    SearchBookmarksSchema.shape,
    async (params: SearchBookmarksInput) => {
      try {
        const result = await searchBookmarks({
          query: params.query,
          limit: params.limit
        });

        if (!result.success) {
          return {
            content: [{
              type: "text",
              text: `## Search Failed\n\n**Error:** ${result.error}`
            }],
            isError: true
          };
        }

        let resultText: string;

        if (params.response_format === ResponseFormat.JSON) {
          resultText = JSON.stringify(result.bookmarks, null, 2);
        } else {
          const lines: string[] = [];
          lines.push("# Bookmark Search Results");
          lines.push("");
          lines.push(`**Query:** "${params.query}"`);
          lines.push(`**Found:** ${result.bookmarks?.length || 0} bookmark(s)`);
          lines.push("");

          if (result.bookmarks && result.bookmarks.length > 0) {
            lines.push(...formatSearchResults(result.bookmarks));
          } else {
            lines.push("No bookmarks found matching your query.");
          }

          resultText = lines.join("\n");
        }

        return {
          content: [{ type: "text", text: resultText }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Save bookmark
  server.tool(
    "tabz_save_bookmark",
    `Save a URL as a Chrome bookmark.

Creates a new bookmark in the specified folder.

Args:
  - url (required): URL to bookmark
  - title (required): Bookmark title
  - parentId (optional): Folder ID. Default: "1" (Bookmarks Bar)
    - "1" = Bookmarks Bar (visible in toolbar)
    - "2" = Other Bookmarks
    - Or use a folder ID from tabz_get_bookmark_tree
  - index (optional): Position in folder (0 = first). Omit for end.

Returns:
  - success: Whether bookmark was created
  - bookmark: The created bookmark with its ID
  - error: Error message if failed

Examples:
  - Save to Bookmarks Bar: url="https://github.com", title="GitHub"
  - Save to Other Bookmarks: url="...", title="...", parentId="2"
  - Save to custom folder: url="...", title="...", parentId="123"

The bookmark ID can be used with tabz_move_bookmark or tabz_delete_bookmark.`,
    SaveBookmarkSchema.shape,
    async (params: SaveBookmarkInput) => {
      try {
        const result = await createBookmark({
          url: params.url,
          title: params.title,
          parentId: params.parentId || BOOKMARKS_BAR_ID,
          index: params.index
        });

        if (!result.success) {
          return {
            content: [{
              type: "text",
              text: `## Failed to Save Bookmark\n\n**Error:** ${result.error}\n\n**URL:** ${params.url}`
            }],
            isError: true
          };
        }

        const folderName = params.parentId === OTHER_BOOKMARKS_ID ? "Other Bookmarks" :
                          (!params.parentId || params.parentId === BOOKMARKS_BAR_ID) ? "Bookmarks Bar" :
                          `folder ${params.parentId}`;

        return {
          content: [{
            type: "text",
            text: `## Bookmark Saved ✓

**Title:** ${params.title}
**URL:** ${params.url}
**Folder:** ${folderName}
**Bookmark ID:** ${result.bookmark?.id}

Use this ID with \`tabz_move_bookmark\` or \`tabz_delete_bookmark\` if needed.`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Create folder
  server.tool(
    "tabz_create_folder",
    `Create a new bookmark folder.

Creates a folder to organize bookmarks.

Args:
  - title (required): Folder name
  - parentId (optional): Parent folder ID. Default: "1" (Bookmarks Bar)
    - "1" = Bookmarks Bar
    - "2" = Other Bookmarks
    - Or a folder ID for nesting
  - index (optional): Position in parent (0 = first). Omit for end.

Returns:
  - success: Whether folder was created
  - folder: The created folder with its ID
  - error: Error message if failed

Examples:
  - New folder in Bookmarks Bar: title="Work Projects"
  - Nested folder: title="React", parentId="456"
  - In Other Bookmarks: title="Archive", parentId="2"

Use the returned folder ID with tabz_save_bookmark to add bookmarks to it.`,
    CreateFolderSchema.shape,
    async (params: CreateFolderInput) => {
      try {
        const result = await createBookmarkFolder({
          title: params.title,
          parentId: params.parentId || BOOKMARKS_BAR_ID,
          index: params.index
        });

        if (!result.success) {
          return {
            content: [{
              type: "text",
              text: `## Failed to Create Folder\n\n**Error:** ${result.error}`
            }],
            isError: true
          };
        }

        const parentName = params.parentId === OTHER_BOOKMARKS_ID ? "Other Bookmarks" :
                          (!params.parentId || params.parentId === BOOKMARKS_BAR_ID) ? "Bookmarks Bar" :
                          `folder ${params.parentId}`;

        return {
          content: [{
            type: "text",
            text: `## Folder Created ✓

**Name:** ${params.title}
**Parent:** ${parentName}
**Folder ID:** ${result.folder?.id}

Use this ID as \`parentId\` in \`tabz_save_bookmark\` to add bookmarks to this folder.`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Move bookmark
  server.tool(
    "tabz_move_bookmark",
    `Move a bookmark or folder to a different location.

Reorganize your bookmarks by moving them between folders.

Args:
  - id (required): Bookmark or folder ID to move
  - parentId (required): Destination folder ID
    - "1" = Bookmarks Bar
    - "2" = Other Bookmarks
    - Or any folder ID
  - index (optional): Position in destination (0 = first). Omit for end.

Returns:
  - success: Whether move succeeded
  - error: Error message if failed

Examples:
  - Move to Bookmarks Bar: id="123", parentId="1"
  - Move to folder: id="123", parentId="456"
  - Move to first position: id="123", parentId="1", index=0

Note: Cannot move the Bookmarks Bar or Other Bookmarks folders themselves.`,
    MoveBookmarkSchema.shape,
    async (params: MoveBookmarkInput) => {
      try {
        const result = await moveBookmark({
          id: params.id,
          parentId: params.parentId,
          index: params.index
        });

        if (!result.success) {
          return {
            content: [{
              type: "text",
              text: `## Failed to Move Bookmark\n\n**Error:** ${result.error}`
            }],
            isError: true
          };
        }

        const destName = params.parentId === BOOKMARKS_BAR_ID ? "Bookmarks Bar" :
                        params.parentId === OTHER_BOOKMARKS_ID ? "Other Bookmarks" :
                        `folder ${params.parentId}`;

        return {
          content: [{
            type: "text",
            text: `## Bookmark Moved ✓

**Bookmark ID:** ${params.id}
**New Location:** ${destName}${params.index !== undefined ? ` (position ${params.index})` : ''}`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );

  // Delete bookmark
  server.tool(
    "tabz_delete_bookmark",
    `Delete a bookmark or folder.

Permanently removes a bookmark or folder from Chrome.

**WARNING:** Deleting a folder will also delete ALL bookmarks inside it!

Args:
  - id (required): Bookmark or folder ID to delete

Returns:
  - success: Whether deletion succeeded
  - error: Error message if failed

Examples:
  - Delete bookmark: id="123"
  - Delete folder (and contents): id="456"

Note: Cannot delete the Bookmarks Bar or Other Bookmarks folders.
This action cannot be undone through this tool.`,
    DeleteBookmarkSchema.shape,
    async (params: DeleteBookmarkInput) => {
      try {
        const result = await deleteBookmark(params.id);

        if (!result.success) {
          return {
            content: [{
              type: "text",
              text: `## Failed to Delete\n\n**Error:** ${result.error}`
            }],
            isError: true
          };
        }

        return {
          content: [{
            type: "text",
            text: `## Bookmark Deleted ✓

**ID:** ${params.id}

The bookmark or folder has been permanently removed.`
          }]
        };
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: `Error: ${error instanceof Error ? error.message : String(error)}`
          }],
          isError: true
        };
      }
    }
  );
}
