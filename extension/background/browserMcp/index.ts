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
  handleBrowserGetCategories,
  handleBrowserGetSettings,
  handleBrowserCreateProfile,
  handleBrowserUpdateProfile,
  handleBrowserDeleteProfile,
  handleBrowserImportProfiles
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

// Tab groups
export {
  handleBrowserListTabGroups,
  handleBrowserCreateTabGroup,
  handleBrowserUpdateTabGroup,
  handleBrowserAddToTabGroup,
  handleBrowserUngroupTabs,
  handleBrowserAddToClaudeGroup,
  handleBrowserRemoveFromClaudeGroup,
  handleBrowserGetClaudeGroupStatus
} from './tabGroups'

// Windows and displays
export {
  handleBrowserListWindows,
  handleBrowserCreateWindow,
  handleBrowserUpdateWindow,
  handleBrowserCloseWindow,
  handleBrowserGetDisplays,
  handleBrowserTileWindows,
  handleBrowserPopoutTerminal
} from './windows'

// History
export {
  handleBrowserHistorySearch,
  handleBrowserHistoryVisits,
  handleBrowserHistoryRecent,
  handleBrowserHistoryDeleteUrl,
  handleBrowserHistoryDeleteRange
} from './history'

// Sessions (recently closed, synced devices)
export {
  handleBrowserSessionsRecent,
  handleBrowserSessionsRestore,
  handleBrowserSessionsDevices
} from './sessions'

// Cookies
export {
  handleBrowserCookiesGet,
  handleBrowserCookiesList,
  handleBrowserCookiesSet,
  handleBrowserCookiesDelete,
  handleBrowserCookiesAudit
} from './cookies'

// Emulation (CDP)
export {
  handleBrowserEmulateDevice,
  handleBrowserEmulateClear,
  handleBrowserEmulateGeolocation,
  handleBrowserEmulateNetwork,
  handleBrowserEmulateMedia,
  handleBrowserEmulateVision
} from './emulation'

// Notifications
export {
  handleBrowserNotificationShow,
  handleBrowserNotificationUpdate,
  handleBrowserNotificationClear,
  handleBrowserNotificationList
} from './notifications'
