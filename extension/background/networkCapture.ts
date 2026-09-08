/** Redacted chrome.webRequest capture, scoped to independently owned tabs. */

import { sendToWebSocket } from './websocket'
import { redactBody, redactFormData, redactHeaders } from './requestRedaction'
import {
  clearDeepCaptureRequests,
  getDeepNetworkRequests,
  isDeepCaptureActive,
  type DeepNetworkRequestSummary
} from './deepCapture'
import {
  assertTabInAgentGroup,
  getAgentForGroup,
  resolveAgentTab,
  subscribeToTabOwnershipChanges
} from './browserMcp/tabGroups'
import { assertAgentReadableTab } from './browserMcp/pageGuard'
import {
  assertDocumentReadable,
  assertDocumentReadCurrent,
  canCaptureDocumentSync,
  runWithDocumentAdmission,
  subscribeToDocumentProtection
} from './browserMcp/documentProtection'

const MAX_NETWORK_REQUESTS_PER_TAB = 500
const REQUEST_MAX_AGE_MS = 5 * 60 * 1000
const MAX_REQUEST_BODY_CHARS = 10_000
const SELF_ORIGINS = new Set(['http://localhost:8129', 'http://127.0.0.1:8129'])
const SENSITIVE_BODY_URL_PATTERN = /auth|token|login|password|secret/i
const MAX_HANDLER_BUDGET_MS = 13_500
const REDACTED = '[redacted]'

interface CaptureSession {
  tabId: number
  agent: string
  groupId: number | null
  includeSelf: boolean
}

export interface StoredNetworkRequest {
  requestId: string
  url: string
  method: string
  resourceType: string
  timestamp: number
  tabId: number
  documentId: string
  requestHeaders?: Record<string, string>
  postData?: string
  postDataContentType?: string
  postDataByteLength?: number
  status?: number
  statusText?: string
  responseHeaders?: Record<string, string>
  mimeType?: string
  responseTime?: number
  encodedDataLength?: number
  redirectedTo?: string
  redirectHop?: number
  bodyRedacted?: boolean
  /** Internal capture-time owner; stripped from every public row. */
  ownerAgent?: string
  ownerGroupId?: number | null
}

export type NetworkRequestSource = 'webrequest' | 'deep' | 'both'
export type NetworkRequestListRow =
  | (Omit<StoredNetworkRequest, 'ownerAgent' | 'ownerGroupId'> & { source: 'webrequest'; deep?: false })
  | DeepNetworkRequestSummary
  | (Omit<DeepNetworkRequestSummary, 'source'> & { source: 'both'; webRequestId: string })

const networkRequests = new Map<string, StoredNetworkRequest>()
const captureSessions = new Map<number, CaptureSession>()
let listenersRegistered = false

function ownerKey(agent?: string): string {
  return agent?.trim() || '__default__'
}

function requestExpiresAt(requestTimeoutMs?: number): number {
  const requested = Number.isFinite(requestTimeoutMs) ? Math.floor(requestTimeoutMs!) : MAX_HANDLER_BUDGET_MS
  return Date.now() + Math.min(MAX_HANDLER_BUDGET_MS, Math.max(1, requested))
}

function checkDeadline(expiresAt: number): void {
  if (Date.now() >= expiresAt) throw new Error('Network capture request expired before capture could start')
}

function storeKey(tabId: number, requestId: string): string {
  return `${tabId}:${requestId}`
}

function publicRow(request: StoredNetworkRequest): Omit<StoredNetworkRequest, 'ownerAgent' | 'ownerGroupId'> {
  const { ownerAgent: _ownerAgent, ownerGroupId: _ownerGroupId, ...row } = request
  return row
}

function boundedCapturedUrl(raw: string): string {
  try {
    const url = new URL(raw)
    if (url.username) url.username = REDACTED
    if (url.password) url.password = REDACTED
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_BODY_URL_PATTERN.test(key)) url.searchParams.set(key, REDACTED)
    }
    return url.href.slice(0, 4096)
  } catch {
    return SENSITIVE_BODY_URL_PATTERN.test(raw) ? REDACTED : raw.slice(0, 4096)
  }
}

function sameExchange(a: { tabId: number; url: string; method: string }, b: { tabId: number; url: string; method: string }): boolean {
  return a.tabId === b.tabId && a.url === b.url && a.method.toUpperCase() === b.method.toUpperCase()
}

export function mergeNetworkRequestRows(webRows: StoredNetworkRequest[], deepRows: DeepNetworkRequestSummary[], matchWindowMs = 2_000): NetworkRequestListRow[] {
  const used = new Set<number>()
  const pairs = new Map<number, number>()
  for (let deepIndex = 0; deepIndex < deepRows.length; deepIndex++) {
    let best = -1
    let difference = Number.POSITIVE_INFINITY
    for (let webIndex = 0; webIndex < webRows.length; webIndex++) {
      if (used.has(webIndex) || !sameExchange(webRows[webIndex], deepRows[deepIndex])) continue
      const next = Math.abs(webRows[webIndex].timestamp - deepRows[deepIndex].timestamp)
      if (next <= matchWindowMs && next < difference) { best = webIndex; difference = next }
    }
    if (best >= 0) { used.add(best); pairs.set(deepIndex, best) }
  }
  // CDP and webRequest use independent clocks in some Chrome versions. When
  // those clocks cannot be compared, pair remaining identical exchanges by
  // their stable capture order instead of returning duplicate rows.
  const unmatchedByExchange = new Map<string, number[]>()
  webRows.forEach((web, index) => {
    if (used.has(index)) return
    const key = `${web.tabId}\n${web.method.toUpperCase()}\n${web.url}`
    const bucket = unmatchedByExchange.get(key) ?? []
    bucket.push(index)
    unmatchedByExchange.set(key, bucket)
  })
  deepRows.forEach((deep, index) => {
    if (pairs.has(index)) return
    const key = `${deep.tabId}\n${deep.method.toUpperCase()}\n${deep.url}`
    const webIndex = unmatchedByExchange.get(key)?.shift()
    if (webIndex !== undefined) {
      used.add(webIndex)
      pairs.set(index, webIndex)
    }
  })
  const rows: NetworkRequestListRow[] = deepRows.map((deep, index) => {
    const webIndex = pairs.get(index)
    if (webIndex === undefined) return deep
    const web = publicRow(webRows[webIndex])
    return {
      ...web, ...deep,
      timestamp: Math.min(web.timestamp, deep.timestamp),
      requestHeaders: web.requestHeaders ?? deep.requestHeaders,
      postData: web.postData ?? deep.postData,
      postDataContentType: web.postDataContentType ?? deep.postDataContentType,
      postDataByteLength: web.postDataByteLength ?? deep.postDataByteLength,
      responseHeaders: web.responseHeaders ?? deep.responseHeaders,
      source: 'both', deep: true, webRequestId: web.requestId, requestId: deep.requestId
    }
  })
  webRows.forEach((web, index) => {
    if (!used.has(index)) rows.push({ ...publicRow(web), source: 'webrequest', deep: false })
  })
  return rows
}

export function archiveRedirectHop(store: Map<string, StoredNetworkRequest>, key: string): void {
  const existing = store.get(key)
  if (!existing) return
  let hop = 1
  while (store.has(`${key}:r${hop}`)) hop++
  store.set(`${key}:r${hop}`, { ...existing, redirectHop: hop })
  store.delete(key)
}

export interface SelfTrafficCandidate {
  url: string
  initiator?: string
  documentUrl?: string
  type?: string
}

function parsedOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined
  try { return new URL(value).origin } catch { return undefined }
}

function isExtensionUrl(value: string | undefined): boolean {
  if (!value) return false
  try { return new URL(value).protocol === 'chrome-extension:' } catch { return false }
}

export function isSelfTraffic(candidate: SelfTrafficCandidate, backendOrigins: readonly string[] = [...SELF_ORIGINS]): boolean {
  const navigation = candidate.type === 'main_frame' || candidate.type === 'sub_frame'
  if (!navigation && isExtensionUrl(candidate.initiator)) return true
  if (isExtensionUrl(candidate.documentUrl)) return true
  const requestOrigin = parsedOrigin(candidate.url)
  return requestOrigin !== undefined && backendOrigins.includes(requestOrigin)
}

function cleanup(): void {
  const now = Date.now()
  for (const [key, request] of networkRequests) {
    if (now - request.timestamp > REQUEST_MAX_AGE_MS) networkRequests.delete(key)
  }
  for (const tabId of captureSessions.keys()) {
    const rows = [...networkRequests.entries()]
      .filter(([, request]) => request.tabId === tabId)
      .sort((a, b) => a[1].timestamp - b[1].timestamp)
    for (const [key] of rows.slice(0, Math.max(0, rows.length - MAX_NETWORK_REQUESTS_PER_TAB))) networkRequests.delete(key)
  }
}

function mapResourceType(type: string): string {
  return ({
    main_frame: 'Document', sub_frame: 'Document', stylesheet: 'Stylesheet', script: 'Script',
    image: 'Image', font: 'Font', object: 'Other', xmlhttprequest: 'XHR', ping: 'Other',
    csp_report: 'Other', media: 'Media', websocket: 'WebSocket', other: 'Other'
  } as Record<string, string>)[type] || 'Other'
}

function headersToRecord(headers?: chrome.webRequest.HttpHeader[]): Record<string, string> | undefined {
  if (!headers) return undefined
  const original = Object.fromEntries(headers.filter(header => header.name && header.value !== undefined).slice(0, 100)
    .map(header => [header.name, header.value!]))
  return Object.fromEntries(Object.entries(redactHeaders(original))
    .map(([name, value]) => [name.slice(0, 256), value.slice(0, 4096)]))
}

function requestForEvent(details: { tabId?: number; requestId: string; documentId?: string }): StoredNetworkRequest | undefined {
  let key = Number.isInteger(details.tabId) ? storeKey(details.tabId!, details.requestId) : undefined
  let request = key === undefined ? undefined : networkRequests.get(key)
  if (!request && !Number.isInteger(details.tabId)) {
    const match = [...networkRequests.entries()].find(([, row]) => row.requestId === details.requestId)
    key = match?.[0]
    request = match?.[1]
  }
  const session = request ? captureSessions.get(request.tabId) : undefined
  if (!request || !session || request.ownerAgent !== session.agent ||
      (Number.isInteger(details.tabId) && details.tabId !== request.tabId) ||
      (details.documentId !== undefined && details.documentId !== request.documentId) ||
      !canCaptureDocumentSync(request.tabId, request.documentId)) {
    if (request && !canCaptureDocumentSync(request.tabId, request.documentId)) {
      for (const [rowKey, row] of networkRequests) {
        if (row.tabId === request.tabId && row.documentId === request.documentId) networkRequests.delete(rowKey)
      }
    } else if (request && key) {
      networkRequests.delete(key)
    }
    return undefined
  }
  return request
}

async function captureOwnerCurrent(session: CaptureSession): Promise<boolean> {
  try {
    const tab = await chrome.tabs.get(session.tabId)
    const groupId = Number.isInteger(tab.groupId) ? tab.groupId! : null
    if (groupId !== session.groupId) return false
    if (groupId === null || groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return session.agent === '__default__'
    return await getAgentForGroup(groupId) === session.agent
  } catch {
    return false
  }
}

function onBeforeRequest(details: chrome.webRequest.OnBeforeRequestDetails): chrome.webRequest.BlockingResponse | undefined {
  const session = captureSessions.get(details.tabId)
  const documentId = details.documentId
  if (!session || !/^https?:\/\//i.test(details.url) || !documentId || !canCaptureDocumentSync(details.tabId, documentId)) return
  const documentUrl = (details as chrome.webRequest.OnBeforeRequestDetails & { documentUrl?: string }).documentUrl
  if (!session.includeSelf && isSelfTraffic({ url: details.url, initiator: details.initiator, documentUrl, type: details.type })) return
  cleanup()
  const key = storeKey(details.tabId, details.requestId)
  archiveRedirectHop(networkRequests, key)
  const sensitive = SENSITIVE_BODY_URL_PATTERN.test(details.url)
  const request: StoredNetworkRequest = {
    requestId: details.requestId, url: boundedCapturedUrl(details.url), method: details.method,
    resourceType: mapResourceType(details.type), timestamp: Date.now(), tabId: details.tabId,
    documentId, ownerAgent: session.agent, ownerGroupId: session.groupId,
    bodyRedacted: sensitive || undefined
  }
  if (details.requestBody) {
    if (sensitive) {
      request.postData = '[redacted]'
    } else if (details.requestBody.raw?.length) {
      try {
        const text = details.requestBody.raw.map(item => item.bytes ? new TextDecoder().decode(item.bytes) : '').join('')
        Object.assign(request, redactBody(text.slice(0, MAX_REQUEST_BODY_CHARS)))
      } catch { /* omit undecodable bodies */ }
    } else if (details.requestBody.formData) {
      const redacted = redactFormData(details.requestBody.formData as unknown as Record<string, string[]>)
      Object.assign(request, { ...redacted, postData: redacted.postData?.slice(0, MAX_REQUEST_BODY_CHARS) })
    }
  }
  networkRequests.set(key, request)
  cleanup()
  void captureOwnerCurrent(session).then(current => {
    if (!current && captureSessions.get(details.tabId) === session) invalidateNetworkCaptureOwnership(details.tabId)
  })
}

function onSendHeaders(details: chrome.webRequest.OnSendHeadersDetails): void {
  const request = requestForEvent(details)
  const headers = request && headersToRecord(details.requestHeaders)
  if (request && headers) request.requestHeaders = headers
}

function onHeadersReceived(details: chrome.webRequest.OnHeadersReceivedDetails): chrome.webRequest.BlockingResponse | undefined {
  const request = requestForEvent(details)
  if (!request) return
  request.status = details.statusCode
  request.statusText = (details.statusLine?.split(' ').slice(1).join(' ') || '').slice(0, 1024)
  const headers = headersToRecord(details.responseHeaders)
  if (headers) request.responseHeaders = headers
  const contentType = details.responseHeaders?.find(header => header.name.toLowerCase() === 'content-type')?.value
  if (contentType) request.mimeType = contentType.split(';')[0].trim()
}

function onBeforeRedirect(details: chrome.webRequest.OnBeforeRedirectDetails): void {
  const request = requestForEvent(details)
  if (!request) return
  request.status = details.statusCode
  request.statusText = (details.statusLine?.split(' ').slice(1).join(' ') || '').slice(0, 1024)
  request.redirectedTo = boundedCapturedUrl(details.redirectUrl)
}

function onCompleted(details: chrome.webRequest.OnCompletedDetails): void {
  const request = requestForEvent(details)
  if (request) request.responseTime = Date.now() - request.timestamp
}

function onErrorOccurred(details: chrome.webRequest.OnErrorOccurredDetails): void {
  const request = requestForEvent(details)
  if (request) {
    request.status = 0
    request.statusText = (details.error || 'Network Error').slice(0, 1024)
    request.responseTime = Date.now() - request.timestamp
  }
}

function registerListeners(): void {
  if (listenersRegistered) return
  chrome.webRequest.onBeforeRequest.addListener(onBeforeRequest, { urls: ['<all_urls>'] }, ['requestBody'])
  chrome.webRequest.onSendHeaders.addListener(onSendHeaders, { urls: ['<all_urls>'] }, ['requestHeaders'])
  chrome.webRequest.onHeadersReceived.addListener(onHeadersReceived, { urls: ['<all_urls>'] }, ['responseHeaders'])
  chrome.webRequest.onBeforeRedirect.addListener(onBeforeRedirect, { urls: ['<all_urls>'] })
  chrome.webRequest.onCompleted.addListener(onCompleted, { urls: ['<all_urls>'] })
  chrome.webRequest.onErrorOccurred.addListener(onErrorOccurred, { urls: ['<all_urls>'] })
  listenersRegistered = true
}

export function enableNetworkCapture(tabId?: number, includeSelf = false, owner: { agent?: string; groupId?: number | null } = {}): { success: boolean; error?: string } {
  if (!Number.isInteger(tabId) || (tabId ?? -1) < 0) return { success: false, error: 'A valid tabId is required for network capture' }
  if (!owner.agent?.trim() || !Object.prototype.hasOwnProperty.call(owner, 'groupId')) {
    return { success: false, error: 'Network capture requires an explicit tab owner' }
  }
  registerListeners()
  const agent = ownerKey(owner.agent)
  const previous = captureSessions.get(tabId!)
  if (previous && (previous.agent !== agent || previous.groupId !== (owner.groupId ?? null))) invalidateNetworkCaptureOwnership(tabId!)
  captureSessions.set(tabId!, {
    tabId: tabId!, agent, groupId: owner.groupId ?? null, includeSelf
  })
  return { success: true }
}

export function invalidateNetworkCaptureOwnership(tabId: number): void {
  captureSessions.delete(tabId)
  purgeNetworkRequestsForTab(tabId)
}

function purgeNetworkRequestsForTab(tabId: number): void {
  for (const [key, request] of networkRequests) if (request.tabId === tabId) networkRequests.delete(key)
}

// Protection discards already captured content, while keeping the explicit
// per-tab enablement available for a later independently readable document.
subscribeToDocumentProtection(purgeNetworkRequestsForTab)
subscribeToTabOwnershipChanges(invalidateNetworkCaptureOwnership)

export function resetNetworkCaptureStateForTests(): void {
  networkRequests.clear()
  captureSessions.clear()
}

function matches(value: string, pattern: string): boolean {
  try { return new RegExp(pattern, 'i').test(value) } catch { return value.toLowerCase().includes(pattern.toLowerCase()) }
}

export function getNetworkRequests(options: {
  urlPattern?: string; excludePattern?: string; method?: string; statusMin?: number; statusMax?: number;
  resourceType?: string; limit?: number; offset?: number; tabId?: number; source?: NetworkRequestSource; agent?: string
}): { requests: NetworkRequestListRow[]; total: number; hasMore: boolean; nextOffset?: number; captureActive: boolean; webRequestCaptureActive: boolean; deepCaptureActive: boolean } {
  cleanup()
  const owner = options.agent === undefined ? undefined : ownerKey(options.agent)
  for (const [key, request] of networkRequests) {
    if (!canCaptureDocumentSync(request.tabId, request.documentId)) networkRequests.delete(key)
  }
  const webRows = [...networkRequests.values()].filter(request =>
    (options.tabId === undefined || request.tabId === options.tabId) &&
    (owner === undefined || request.ownerAgent === owner))
  const deepRows = getDeepNetworkRequests(options.tabId, options.agent)
  const source = options.source ?? 'both'
  let rows: NetworkRequestListRow[] = source === 'webrequest'
    ? webRows.map(row => ({ ...publicRow(row), source: 'webrequest', deep: false }))
    : source === 'deep' ? deepRows : mergeNetworkRequestRows(webRows, deepRows)
  if (options.urlPattern) rows = rows.filter(row => matches(row.url, options.urlPattern!))
  if (options.excludePattern) rows = rows.filter(row => !matches(row.url, options.excludePattern!))
  if (options.method && options.method !== 'all') rows = rows.filter(row => row.method.toLowerCase() === options.method!.toLowerCase())
  if (options.statusMin !== undefined) rows = rows.filter(row => row.status !== undefined && row.status >= options.statusMin!)
  if (options.statusMax !== undefined) rows = rows.filter(row => row.status !== undefined && row.status <= options.statusMax!)
  if (options.resourceType && options.resourceType !== 'all') rows = rows.filter(row => row.resourceType.toLowerCase() === options.resourceType!.toLowerCase())
  rows.sort((a, b) => b.timestamp - a.timestamp)
  const total = rows.length
  const offset = Math.max(0, Math.floor(options.offset ?? 0))
  const limit = Math.min(200, Math.max(1, Math.floor(options.limit ?? 50)))
  const activeSession = options.tabId === undefined ? [...captureSessions.values()].find(session => owner === undefined || session.agent === owner) : captureSessions.get(options.tabId)
  const webActive = Boolean(activeSession && (owner === undefined || activeSession.agent === owner))
  const deepActive = isDeepCaptureActive(options.tabId, options.agent)
  return {
    requests: rows.slice(offset, offset + limit), total, hasMore: offset + limit < total,
    nextOffset: offset + limit < total ? offset + limit : undefined,
    captureActive: source === 'webrequest' ? webActive : source === 'deep' ? deepActive : webActive || deepActive,
    webRequestCaptureActive: webActive, deepCaptureActive: deepActive
  }
}

export function clearNetworkRequests(tabId?: number, agent?: string): void {
  const owner = agent === undefined ? undefined : ownerKey(agent)
  for (const [key, request] of networkRequests) {
    if ((tabId === undefined || request.tabId === tabId) && (owner === undefined || request.ownerAgent === owner)) networkRequests.delete(key)
  }
  clearDeepCaptureRequests(tabId, agent)
}

export async function handleBrowserEnableNetworkCapture(message: { requestId: string; tabId?: number; includeSelf?: boolean; agent?: string; requestTimeoutMs?: number }): Promise<void> {
  const expiresAt = requestExpiresAt(message.requestTimeoutMs)
  let result: { success: boolean; error?: string; tabId?: number; tabIds?: number[] } = { success: false }
  try {
    checkDeadline(expiresAt)
    const tab = await resolveAgentTab(message.agent, message.tabId)
    if (tab?.id === undefined) throw new Error('No active tab found')
    await assertAgentReadableTab('tabz_enable_network_capture', tab)
    result = await runWithDocumentAdmission(tab.id, async () => {
      checkDeadline(expiresAt)
      const token = await assertDocumentReadable(tab.id!, 'tabz_enable_network_capture', { expiresAt })
      await assertDocumentReadCurrent(tab.id!, token, { expiresAt })
      checkDeadline(expiresAt)
      const enabled = enableNetworkCapture(tab.id, message.includeSelf ?? false, {
        agent: message.agent, groupId: Number.isInteger(tab.groupId) ? tab.groupId! : null
      })
      const agent = ownerKey(message.agent)
      return {
        ...enabled, tabId: tab.id,
        tabIds: [...captureSessions.values()].filter(session => session.agent === agent).map(session => session.tabId)
      }
    })
  } catch (error) {
    result = { success: false, error: error instanceof Error ? error.message : String(error) }
  }
  sendToWebSocket({ type: 'browser-enable-network-capture-result', requestId: message.requestId, ...result })
}

export async function handleBrowserGetNetworkRequests(message: {
  requestId: string; urlPattern?: string; excludePattern?: string; method?: string; statusMin?: number; statusMax?: number;
  resourceType?: string; limit?: number; offset?: number; tabId?: number; source?: NetworkRequestSource; agent?: string
}): Promise<void> {
  try {
    const tab = await resolveAgentTab(message.agent, message.tabId)
    if (tab?.id === undefined) throw new Error('No active tab found')
    await assertTabInAgentGroup(message.agent, tab.id)
    const result = await runWithDocumentAdmission(tab.id, async () => {
      const token = await assertDocumentReadable(tab.id!, 'tabz_get_network_requests')
      const rows = getNetworkRequests({ ...message, tabId: tab.id, agent: message.agent })
      await assertDocumentReadCurrent(tab.id!, token)
      return rows
    })
    sendToWebSocket({ type: 'browser-get-network-requests-result', requestId: message.requestId, success: true, ...result })
  } catch (error) {
    sendToWebSocket({
      type: 'browser-get-network-requests-result', requestId: message.requestId, success: false,
      requests: [], total: 0, hasMore: false, error: error instanceof Error ? error.message : String(error)
    })
  }
}

export async function handleBrowserClearNetworkRequests(message: { requestId: string; tabId?: number; agent?: string }): Promise<void> {
  try {
    const tab = await resolveAgentTab(message.agent, message.tabId)
    if (tab?.id === undefined) throw new Error('No active tab found')
    await assertTabInAgentGroup(message.agent, tab.id)
    clearNetworkRequests(tab.id, message.agent)
    sendToWebSocket({ type: 'browser-clear-network-requests-result', requestId: message.requestId, success: true, tabId: tab.id })
  } catch (error) {
    sendToWebSocket({ type: 'browser-clear-network-requests-result', requestId: message.requestId, success: false, error: error instanceof Error ? error.message : String(error) })
  }
}
