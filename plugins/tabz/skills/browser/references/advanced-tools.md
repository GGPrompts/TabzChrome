# Advanced Tools

DOM inspection, performance profiling, device emulation, notifications, and audio.

*Part of the [Tabz MCP Tools](../MCP_TOOLS.md) reference.*

---

## tabz_get_dom_tree

**Purpose:** Get the full DOM tree structure of the current page using Chrome DevTools Protocol.

**Trigger phrases:**
- [Show me the DOM structure](tabz:paste?text=Show%20me%20the%20DOM%20structure)
- [What's the page hierarchy?](tabz:paste?text=What%27s%20the%20page%20hierarchy%3F)
- [Inspect the DOM tree](tabz:paste?text=Inspect%20the%20DOM%20tree)
- [Get the HTML structure](tabz:paste?text=Get%20the%20HTML%20structure)

**Parameters:**
- `tabId` (optional): Chrome tab ID. Omit for active tab.
- `maxDepth` (optional): Maximum depth to traverse (1-10, default: 4). Higher values = more detail.
- `selector` (optional): CSS selector to focus on a specific subtree.
- `response_format`: `markdown` (default) or `json`

**Returns:**
- `tree`: Simplified DOM tree with tag names, IDs, and classes
- `nodeCount`: Total nodes in returned tree
- Child counts shown for truncated branches

**Examples:**
```javascript
// Full document (shallow)
{ maxDepth: 2 }

// Navigation only
{ selector: "nav" }

// Deep inspection of main content
{ maxDepth: 8, selector: "main" }

// Specific component
{ selector: "#app", maxDepth: 5 }
```

**Note:** The user will see a "debugging" banner in Chrome while this runs. The debugger automatically detaches after operation completes.

**Use cases:**
- Understand page structure for web scraping
- Debug complex layouts
- Find element hierarchies for automation
- Analyze shadow DOM content

---

## tabz_profile_performance

**Purpose:** Profile the current page's performance metrics using Chrome DevTools Protocol.

**Trigger phrases:**
- [Check page performance](tabz:paste?text=Check%20page%20performance)
- [How much memory is this using?](tabz:paste?text=How%20much%20memory%20is%20this%20using%3F)
- [Profile this page](tabz:paste?text=Profile%20this%20page)
- [Get performance metrics](tabz:paste?text=Get%20performance%20metrics)

**Parameters:**
- `tabId` (optional): Chrome tab ID. Omit for active tab.
- `response_format`: `markdown` (default) or `json`

**Returns:**
- **Timing metrics (ms):** TaskDuration, ScriptDuration, LayoutDuration, etc.
- **Memory metrics (MB):** JSHeapUsedSize, JSHeapTotalSize, etc.
- **DOM metrics:** Nodes, Documents, Frames, LayoutCount
- **Other metrics:** Process-level stats

**Examples:**
```javascript
// Profile current tab
{}

// Profile specific tab
{ tabId: 1762559892 }

// JSON for programmatic analysis
{ response_format: "json" }
```

**Note:** The user will see a "debugging" banner in Chrome while metrics are collected.

**Key metrics to watch:**
- **TaskDuration** - High values indicate slow JavaScript
- **JSHeapUsedSize** - Memory usage, watch for leaks
- **Nodes** - DOM size, large numbers slow rendering
- **LayoutCount** - Frequent layouts cause jank

**Use cases:**
- Diagnose slow pages
- Identify memory leaks
- Monitor DOM bloat
- Performance optimization

---

## tabz_get_coverage

**Purpose:** Analyze JavaScript and/or CSS code coverage to find unused code.

**Trigger phrases:**
- [How much code is unused?](tabz:paste?text=How%20much%20code%20is%20unused%3F)
- [Check CSS coverage](tabz:paste?text=Check%20CSS%20coverage)
- [Find unused JavaScript](tabz:paste?text=Find%20unused%20JavaScript)
- [Code coverage analysis](tabz:paste?text=Code%20coverage%20analysis)

**Parameters:**
- `tabId` (optional): Chrome tab ID. Omit for active tab.
- `type` (optional): `'js'` (JavaScript only), `'css'` (CSS only), or `'both'` (default)
- `response_format`: `markdown` (default) or `json`

**Returns:**
- **Per-file coverage:** URL, used bytes, total bytes, usage percentage
- **Summary:** Total files, bytes used/total, overall percentage
- Files sorted by total size (largest first)

**Examples:**
```javascript
// Full audit (JS + CSS)
{}

// JavaScript only
{ type: "js" }

// CSS only
{ type: "css" }

// JSON for analysis
{ type: "both", response_format: "json" }
```

**Note:** Coverage reflects code used since page load. Interact with the page for fuller coverage data.

**Interpreting results:**
- **Low usage %** = Opportunity for code splitting
- **Large unused files** = Consider lazy loading
- **CSS < 50%** = May have dead CSS rules

**Use cases:**
- Find code splitting opportunities
- Identify dead CSS
- Measure bundle efficiency
- Optimize page load time

---

## tabz_emulate_device

**Purpose:** Emulate a mobile or tablet viewport with device presets.

**Trigger phrases:**
- [Test on iPhone](tabz:paste?text=Test%20on%20iPhone)
- [Mobile view](tabz:paste?text=Mobile%20view)
- [Emulate tablet](tabz:paste?text=Emulate%20tablet)

**Parameters:**
- `preset` (optional): Device preset name:
  - `iPhone 14 Pro`, `iPhone 14 Pro Max`, `iPhone SE`
  - `Pixel 7`, `Pixel 7 Pro`, `Samsung Galaxy S23`
  - `iPad`, `iPad Pro 12.9`, `iPad Mini`
  - `Surface Pro`, `Kindle Fire HDX`
- `width` (optional): Custom viewport width (if no preset)
- `height` (optional): Custom viewport height (if no preset)
- `deviceScaleFactor` (optional): DPR (default: 2 for mobile, 1 for desktop)
- `mobile` (optional): Enable mobile mode (default: true for mobile presets)
- `tabId` (optional): Target tab ID

**Returns:**
- Confirmation with applied viewport settings

**Examples:**
```javascript
// Use preset
{ preset: "iPhone 14 Pro" }

// Custom dimensions
{ width: 375, height: 812, mobile: true, deviceScaleFactor: 3 }
```

---

## tabz_emulate_clear

**Purpose:** Clear all emulation overrides and reset to normal browser state.

**Trigger phrases:**
- [Clear emulation](tabz:paste?text=Clear%20emulation)
- [Reset viewport](tabz:paste?text=Reset%20viewport)
- [Stop emulating](tabz:paste?text=Stop%20emulating)

**Parameters:**
- `tabId` (optional): Target tab ID

**Returns:**
- Confirmation that all emulation was cleared

---

## tabz_emulate_geolocation

**Purpose:** Spoof the browser's geolocation.

**Trigger phrases:**
- [Set location to Paris](tabz:paste?text=Set%20location%20to%20Paris)
- [Fake GPS](tabz:paste?text=Fake%20GPS)
- [Spoof location](tabz:paste?text=Spoof%20location)

**Parameters:**
- `latitude` (required): Latitude coordinate
- `longitude` (required): Longitude coordinate
- `accuracy` (optional): Accuracy in meters (default: 100)
- `tabId` (optional): Target tab ID

**Returns:**
- Confirmation with coordinates set

**Examples:**
```javascript
// Paris
{ latitude: 48.8566, longitude: 2.3522 }

// New York
{ latitude: 40.7128, longitude: -74.0060 }
```

---

## tabz_emulate_network

**Purpose:** Throttle network speed to simulate different connection types.

**Trigger phrases:**
- [Test on slow 3G](tabz:paste?text=Test%20on%20slow%203G)
- [Simulate offline](tabz:paste?text=Simulate%20offline)
- [Throttle network](tabz:paste?text=Throttle%20network)

**Parameters:**
- `preset` (optional): Network preset:
  - `offline` - No connection
  - `GPRS` - 50 Kbps
  - `Slow 3G` - 500 Kbps
  - `Fast 3G` - 1.5 Mbps
  - `4G` - 4 Mbps
  - `WiFi` - 30 Mbps
- `downloadThroughput` (optional): Download speed in bytes/sec (if no preset)
- `uploadThroughput` (optional): Upload speed in bytes/sec
- `latency` (optional): Additional latency in ms
- `offline` (optional): Simulate offline (true/false)
- `tabId` (optional): Target tab ID

**Returns:**
- Confirmation with applied network conditions

**Examples:**
```javascript
// Use preset
{ preset: "Slow 3G" }

// Go offline
{ offline: true }

// Custom throttle
{ downloadThroughput: 100000, latency: 200 }
```

---

## tabz_emulate_media

**Purpose:** Set media type and features for CSS testing.

**Trigger phrases:**
- [Print preview](tabz:paste?text=Print%20preview)
- [Test dark mode preference](tabz:paste?text=Test%20dark%20mode%20preference)
- [Force light mode](tabz:paste?text=Force%20light%20mode)

**Parameters:**
- `type` (optional): Media type: `screen` or `print`
- `colorScheme` (optional): `light` or `dark` preference
- `reducedMotion` (optional): `reduce` or `no-preference`
- `forcedColors` (optional): `active` or `none`
- `tabId` (optional): Target tab ID

**Returns:**
- Confirmation with applied media settings

**Examples:**
```javascript
// Print preview mode
{ type: "print" }

// Force dark mode preference
{ colorScheme: "dark" }

// Reduce motion
{ reducedMotion: "reduce" }
```

---

## tabz_emulate_vision

**Purpose:** Simulate vision deficiencies for accessibility testing.

**Trigger phrases:**
- [Test for colorblindness](tabz:paste?text=Test%20for%20colorblindness)
- [Simulate deuteranopia](tabz:paste?text=Simulate%20deuteranopia)
- [Vision accessibility test](tabz:paste?text=Vision%20accessibility%20test)

**Parameters:**
- `type` (required): Vision deficiency type:
  - `none` - Clear emulation
  - `blurredVision` - Blurred vision
  - `protanopia` - Red-blind
  - `deuteranopia` - Green-blind (most common)
  - `tritanopia` - Blue-blind
  - `achromatopsia` - Total color blindness
- `tabId` (optional): Target tab ID

**Returns:**
- Confirmation with applied vision emulation

**Use cases:**
- Accessibility testing for color contrast
- Ensure UI works for colorblind users
- WCAG compliance testing

---

## tabz_notification_show

**Purpose:** Display a Chrome desktop notification.

**Trigger phrases:**
- [Show notification](tabz:paste?text=Show%20notification)
- [Alert me when done](tabz:paste?text=Alert%20me%20when%20done)
- [Desktop notification](tabz:paste?text=Desktop%20notification)

**Parameters:**
- `title` (required): Notification title (max 100 chars)
- `message` (required): Notification body (max 500 chars)
- `type` (optional): `basic` (default), `image`, `list`, or `progress`
- `iconUrl` (optional): Custom icon URL (uses extension icon if omitted)
- `imageUrl` (optional): Image URL for `image` type
- `items` (optional): List items for `list` type: `[{title, message}, ...]`
- `progress` (optional): 0-100 for `progress` type
- `buttons` (optional): Up to 2 buttons: `[{title, iconUrl?}, ...]`
- `priority` (optional): -2 (lowest) to 2 (highest), default 0
- `notificationId` (optional): Custom ID for updates (auto-generated if omitted)
- `requireInteraction` (optional): Keep visible until dismissed (default: false)

**Returns:**
- `notificationId`: ID for updating or clearing this notification

**Examples:**
```javascript
// Basic notification
{ title: "Build Complete", message: "Ready for testing" }

// Progress notification
{ type: "progress", title: "Downloading", message: "file.zip", progress: 45 }

// With buttons
{ title: "Deploy?", message: "Ready to deploy", buttons: [{title: "Yes"}, {title: "No"}] }
```

**Note:** Button clicks display but are not yet connected to callback actions.

---

## tabz_notification_update

**Purpose:** Update an existing notification.

**Trigger phrases:**
- [Update notification](tabz:paste?text=Update%20notification)
- [Change progress](tabz:paste?text=Change%20progress)

**Parameters:**
- `notificationId` (required): ID from `tabz_notification_show`
- `title` (optional): New title
- `message` (optional): New message
- `progress` (optional): New progress (0-100)
- `type` (optional): Change type (e.g., `basic` to remove progress bar when done)

**Returns:**
- `wasUpdated`: Whether notification existed and was updated

**Example workflow:**
```javascript
// 1. Create progress notification
{ type: "progress", title: "Processing", message: "Step 1", progress: 0 }

// 2. Update progress
{ notificationId: "...", progress: 50, message: "Step 2" }

// 3. Mark complete
{ notificationId: "...", type: "basic", title: "Done!", message: "Finished" }
```

---

## tabz_notification_progress

**Purpose:** Show or update a progress notification (convenience wrapper).

**Trigger phrases:**
- [Show progress](tabz:paste?text=Show%20progress)
- [Update progress bar](tabz:paste?text=Update%20progress%20bar)

**Parameters:**
- `title` (required): Notification title
- `message` (required): Status message
- `progress` (required): 0-100 percentage
- `notificationId` (optional): ID for updates (creates new if omitted)

**Returns:**
- `notificationId`: ID for further updates

---

## tabz_notification_clear

**Purpose:** Dismiss a notification.

**Trigger phrases:**
- [Clear notification](tabz:paste?text=Clear%20notification)
- [Dismiss alert](tabz:paste?text=Dismiss%20alert)

**Parameters:**
- `notificationId` (required): ID from `tabz_notification_show`

**Returns:**
- `wasCleared`: Whether notification existed and was cleared

---

## tabz_notification_list

**Purpose:** Get all active notifications.

**Trigger phrases:**
- [List notifications](tabz:paste?text=List%20notifications)
- [Active notifications](tabz:paste?text=Active%20notifications)

**Parameters:**
- `response_format`: `markdown` (default) or `json`

**Returns:**
- Count and list of active notification IDs with their type, title, and message

---

## tabz_speak

**Purpose:** Speak text aloud using neural text-to-speech.

**Trigger phrases:**
- [Say this out loud](tabz:paste?text=Say%20this%20out%20loud)
- [Announce...](tabz:paste?text=Announce%E2%80%A6)
- [Read this to me](tabz:paste?text=Read%20this%20to%20me)
- [Speak...](tabz:paste?text=Speak%E2%80%A6)

**Parameters:**
- `text` (required): The text to speak (max 3000 chars, markdown stripped automatically)
- `voice` (optional): TTS voice (e.g., `en-US-AriaNeural`). Uses user's configured voice if not specified.
- `rate` (optional): Speech rate (e.g., `+30%` faster, `-20%` slower)
- `pitch` (optional): Voice pitch (e.g., `+50Hz` higher, `-100Hz` lower)
- `priority` (optional): `high` interrupts current audio, `low` (default) may be skipped

**Returns:**
- Success confirmation with text preview

**Example:**
```javascript
// Simple announcement
{ text: "Build complete. Ready for next task." }

// Urgent alert with custom settings
{ text: "Error: 3 tests failed", priority: "high", pitch: "+50Hz" }

// Use specific voice
{ text: "Hello!", voice: "en-GB-SoniaNeural" }
```

**Notes:**
- Uses Microsoft Edge neural TTS (high-quality voices)
- Respects user's audio settings from TabzChrome dashboard
- Audio plays through the browser sidebar

---

## tabz_list_voices

**Purpose:** List available neural TTS voices for use with `tabz_speak`.

**Trigger phrases:**
- [What voices are available?](tabz:paste?text=What%20voices%20are%20available%3F)
- [List TTS voices](tabz:paste?text=List%20TTS%20voices)
- [Show available voices](tabz:paste?text=Show%20available%20voices)

**Parameters:** None

**Returns:**
- List of voice codes with descriptions organized by region (US, UK, AU)

**Available voices include:**
- `en-US-AndrewMultilingualNeural` - US Male, warm and confident
- `en-US-EmmaMultilingualNeural` - US Female, cheerful and clear
- `en-US-AriaNeural` - US Female, confident news-style
- `en-GB-SoniaNeural` - UK Female, friendly
- `en-GB-RyanNeural` - UK Male, friendly
- `en-AU-NatashaNeural` - AU Female, friendly

---

## tabz_play_audio

**Purpose:** Play an audio file through the browser.

**Trigger phrases:**
- [Play this sound](tabz:paste?text=Play%20this%20sound)
- [Play audio file](tabz:paste?text=Play%20audio%20file)
- [Trigger notification sound](tabz:paste?text=Trigger%20notification%20sound)
- [Soundboard](tabz:paste?text=Soundboard)

**Parameters:**
- `url` (required): URL of the audio file (MP3, WAV, OGG, etc.)
  - Local: `http://localhost:8129/sounds/ding.mp3`
  - Remote: `https://example.com/sound.mp3`
- `volume` (optional): 0.0 to 1.0. Uses user's configured volume if not specified.
- `priority` (optional): `high` interrupts current audio, `low` (default) may be skipped

**Returns:**
- Success confirmation with URL and volume info

**Example:**
```javascript
// Play local sound
{ url: "http://localhost:8129/sounds/success.mp3" }

// Play at half volume
{ url: "http://localhost:8129/sounds/notify.mp3", volume: 0.5 }

// Urgent notification
{ url: "http://localhost:8129/sounds/alert.mp3", priority: "high" }
```

**Serving audio files:**
Place audio files in `backend/public/sounds/` to serve them at `http://localhost:8129/sounds/<filename>`

**Use cases:**
- Soundboards with custom sound effects
- Notification sounds for task completion
- Alert sounds for errors or warnings
- Ambient sounds or music playback

---
