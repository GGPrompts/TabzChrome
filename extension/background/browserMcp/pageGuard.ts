const SUPPORTED_AGENT_SCHEMES = new Set(['http:', 'https:'])

export function isRefusedPageUrl(url: string | undefined | null): boolean {
  if (!url) return false
  try {
    return !SUPPORTED_AGENT_SCHEMES.has(new URL(url).protocol)
  } catch {
    return true
  }
}

export function refusalMessage(tool: string, url: string | undefined | null): string {
  let scheme = 'browser-internal'
  try {
    scheme = url ? `${new URL(url).protocol.replace(/:$/, '')}://` : scheme
  } catch {
    // Keep the generic label.
  }
  return `Refused: ${tool} does not work on a ${scheme} page; agent page tools support only HTTP and HTTPS pages.`
}

export async function assertAgentReadableTab(tool: string, target: number | chrome.tabs.Tab | undefined): Promise<void> {
  if (target === undefined) return
  const tab = typeof target === 'number' ? await chrome.tabs.get(target) : target
  const candidates = [tab.url, tab.pendingUrl].filter((url): url is string => Boolean(url))
  const refusedUrl = candidates.find(isRefusedPageUrl)
  if (refusedUrl) throw new Error(refusalMessage(tool, refusedUrl))
  if (candidates.length === 0) throw new Error(`Refused: ${tool} cannot verify this tab's page URL`)
}
