/**
 * Browser MCP handlers - re-export all handlers
 * These handle browser automation requests from the MCP server via WebSocket
 */

// Tab management
export {
  handleBrowserListTabs,
  handleBrowserSwitchTab,
  handleBrowserGetActiveTab,
  handleBrowserOpenUrl
} from './tabs'

// Profiles and settings
export {
  handleBrowserGetProfiles,
  handleBrowserGetSettings
} from './profiles'

// Downloads and file capture
export {
  handleBrowserDownloadFile,
  handleBrowserGetDownloads,
  handleBrowserCancelDownload,
  handleBrowserCaptureImage,
  handleBrowserSavePage
} from './downloads'

// Bookmarks
export {
  handleBrowserBookmarksTree,
  handleBrowserBookmarksSearch,
  handleBrowserBookmarksCreate,
  handleBrowserBookmarksCreateFolder,
  handleBrowserBookmarksMove,
  handleBrowserBookmarksDelete
} from './bookmarks'

// Element interaction
export {
  handleBrowserClickElement,
  handleBrowserFillInput,
  handleBrowserGetElementInfo
} from './interaction'

// Screenshots
export {
  handleBrowserScreenshot
} from './screenshots'

// Chrome Debugger (DOM, Performance, Coverage)
export {
  handleBrowserGetDomTree,
  handleBrowserProfilePerformance,
  handleBrowserGetCoverage
} from './debugger'

// Script execution and page info
export {
  handleBrowserExecuteScript,
  handleBrowserGetPageInfo
} from './script'
