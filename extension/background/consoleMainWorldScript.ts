export const CONSOLE_MAIN_WORLD_SCRIPT_ID = 'tabz-console-main-world'

export const CONSOLE_MAIN_WORLD_SCRIPT: chrome.scripting.RegisteredContentScript = {
  id: CONSOLE_MAIN_WORLD_SCRIPT_ID,
  js: ['content/consoleMainWorld.js'],
  matches: ['<all_urls>'],
  runAt: 'document_start',
  world: 'MAIN',
  allFrames: true,
  persistAcrossSessions: true,
}

let registration: Promise<void> | null = null

export function registerConsoleMainWorldScript(): Promise<void> {
  if (!registration) {
    registration = doRegister().finally(() => { registration = null })
  }
  return registration
}

async function doRegister(): Promise<void> {
  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [CONSOLE_MAIN_WORLD_SCRIPT_ID] })
    if (existing.length > 0) await chrome.scripting.updateContentScripts([CONSOLE_MAIN_WORLD_SCRIPT])
    else await chrome.scripting.registerContentScripts([CONSOLE_MAIN_WORLD_SCRIPT])
  } catch (error) {
    if (/Duplicate script ID/i.test(String((error as Error)?.message ?? error))) return
    console.error('Console MAIN-world script registration failed:', error)
  }
}
