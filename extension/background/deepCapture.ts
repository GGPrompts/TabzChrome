/** Bounded, opt-in response capture through the Chrome debugger Network domain. */

import { redactBody, redactHeaders, redactTextPayload } from './requestRedaction'
import {
  attachWithBusyRetry,
  debuggerAttachError,
  isDeepCaptureTabAttached,
  isEmulatedTabAttached,
  isPersistentDebuggerAttached,
  markDeepCaptureTabAttached,
  markDeepCaptureTabDetached,
  runExclusivePerTab,
  sendDebuggerCommand
} from './browserMcp/debugger'
import { assertTabInAgentGroup, getAgentForGroup, resolveAgentTab, subscribeToTabOwnershipChanges } from './browserMcp/tabGroups'
import { assertAgentReadableTab } from './browserMcp/pageGuard'
import {
  assertDocumentReadCurrent,
  assertDocumentReadable,
  canCaptureDocumentSync,
  runWithDocumentAdmission,
  subscribeToDocumentLifecycle,
  subscribeToDocumentProtection,
  type DocumentProtectionToken
} from './browserMcp/documentProtection'

const DEFAULT_MAX_BODY_BYTES = 64_000
const MAX_MAX_BODY_BYTES = 1_000_000
const MAX_DEEP_REQUESTS = 500
const MAX_STREAM_MESSAGES = 500
const MAX_WEBSOCKET_FRAMES = 500
const MAX_PENDING_EVENTS = 200
const REQUEST_MAX_AGE_MS = 5 * 60 * 1000
const REDACTED = '[redacted]'
const SENSITIVE_BODY_URL_PATTERN = /auth|token|login|password|secret/i
const SELF_ORIGINS = new Set(['http://localhost:8129', 'http://127.0.0.1:8129'])
const MAX_HANDLER_BUDGET_MS = 13_500

export type StreamCapturePath = 'eventsource' | 'data-received-final-body'

export interface CaptureOwner {
  agent: string
  groupId: number | null
}

interface DeepCaptureOptions extends Partial<CaptureOwner> {
  documentToken?: DocumentProtectionToken
  expiresAt?: number
}

function requestExpiresAt(requestTimeoutMs?: number): number {
  const requested = Number.isFinite(requestTimeoutMs) ? Math.floor(requestTimeoutMs!) : MAX_HANDLER_BUDGET_MS
  return Date.now() + Math.min(MAX_HANDLER_BUDGET_MS, Math.max(1, requested))
}

function checkDeadline(expiresAt?: number): void {
  if (expiresAt !== undefined && Date.now() >= expiresAt) {
    throw new Error('Deep capture request expired before capture could start')
  }
}

export interface DeepStreamMessage {
  eventName: string
  eventId: string
  data: string
  timestamp: number
}

export interface DeepWebSocketFrame {
  direction: 'sent' | 'received'
  opcode: number
  payload: string
  timestamp: number
}

export interface StoredDeepNetworkRequest {
  requestId: string
  url: string
  method: string
  resourceType: string
  timestamp: number
  lastActivity: number
  tabId: number
  source: 'deep'
  deep: true
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
  responseBody?: string
  base64Encoded?: boolean
  responseBodyTruncated?: boolean
  responseBodyByteLength?: number
  bodyRedacted?: boolean
  streamCapture?: StreamCapturePath
  streamMessages: DeepStreamMessage[]
  droppedStreamMessages: number
  dataReceivedChunkCount: number
  dataReceivedBytes: number
  webSocketFrames: DeepWebSocketFrame[]
  droppedWebSocketFrames: number
  webSocketClosed?: boolean
  cdpStartTime?: number
  bodyFetchStarted?: boolean
  retainedPayloadBytes?: number
  droppedPendingEvents?: number
}

export interface DeepNetworkRequestSummary extends Omit<StoredDeepNetworkRequest,
  'responseBody' | 'streamMessages' | 'webSocketFrames' | 'cdpStartTime' | 'bodyFetchStarted' | 'lastActivity' | 'retainedPayloadBytes'> {
  bodyAvailable: boolean
  streamMessageCount: number
  webSocketFrameCount: number
  webSocketFramesSent: number
  webSocketFramesReceived: number
}

interface DeepCaptureSession extends CaptureOwner {
  tabId: number
  maxBodyBytes: number
  includeSelf: boolean
  documentToken?: DocumentProtectionToken
  requests: Map<string, StoredDeepNetworkRequest>
  eventTail: Promise<void>
  pendingEventCount: number
  pendingEventBytes: number
}

export interface DeepCaptureContext {
  tabId: number
  maxBodyBytes: number
  includeSelf: boolean
}

export interface DeepBodyPage {
  success: boolean
  requestId: string
  tabId?: number
  kind?: 'body' | 'event-stream' | 'websocket'
  text?: string
  base64Encoded?: boolean
  truncated?: boolean
  redacted?: boolean
  streamCapture?: StreamCapturePath
  offset: number
  length: number
  totalLength: number
  hasMore: boolean
  nextOffset?: number
  dropped?: number
  error?: string
}

const deepCaptureSessions = new Map<number, DeepCaptureSession>()

function normalizeMaxBodyBytes(value?: number): number {
  if (value === undefined || !Number.isFinite(value)) return DEFAULT_MAX_BODY_BYTES
  return Math.min(MAX_MAX_BODY_BYTES, Math.max(1, Math.floor(value)))
}

function ownerKey(agent?: string): string {
  return agent?.trim() || '__default__'
}

function sessionCurrent(session: DeepCaptureSession): boolean {
  return Boolean(session.documentToken && canCaptureDocumentSync(session.tabId, session.documentToken.documentId))
}

async function sessionOwnerCurrent(session: DeepCaptureSession): Promise<boolean> {
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

function exactSelfOrigin(value: unknown): boolean {
  if (typeof value !== 'string' || !value) return false
  try {
    const url = new URL(value)
    return url.protocol === 'chrome-extension:' || SELF_ORIGINS.has(url.origin)
  } catch {
    return false
  }
}

function isDeepSelfTraffic(params: Record<string, unknown>): boolean {
  const request = params.request as Record<string, unknown> | undefined
  if (exactSelfOrigin(request?.url ?? params.url) || exactSelfOrigin(params.documentURL)) return true
  const initiator = params.initiator as Record<string, unknown> | undefined
  if (exactSelfOrigin(initiator?.url)) return true
  const stack = initiator?.stack as Record<string, unknown> | undefined
  const callFrames = stack?.callFrames as Array<Record<string, unknown>> | undefined
  return callFrames?.some(frame => exactSelfOrigin(frame.url)) ?? false
}

function normalizeHeaders(headers?: Record<string, unknown>): Record<string, string> | undefined {
  if (!headers) return undefined
  const redacted = redactHeaders(Object.fromEntries(Object.entries(headers).slice(0, 100)
    .map(([name, value]) => [name, String(value)])))
  return Object.fromEntries(Object.entries(redacted)
    .map(([name, value]) => [truncateUtf8(name, 256).value, truncateUtf8(value, 4096).value]))
}

function getHeader(headers: Record<string, unknown> | undefined, name: string): string | undefined {
  const entry = headers && Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase())
  return entry ? String(entry[1]) : undefined
}

export function isSensitiveBodyUrl(url: string): boolean {
  return SENSITIVE_BODY_URL_PATTERN.test(url)
}

function isOpenWebSocket(request: StoredDeepNetworkRequest): boolean {
  return request.resourceType === 'WebSocket' && request.webSocketClosed !== true
}

function cleanupDeepStore(store: Map<string, StoredDeepNetworkRequest>, now = Date.now()): void {
  for (const [id, request] of store) {
    if (!isOpenWebSocket(request) && now - request.lastActivity > REQUEST_MAX_AGE_MS) store.delete(id)
  }
  if (store.size > MAX_DEEP_REQUESTS) {
    const oldest = [...store.entries()]
      .sort((a, b) => a[1].lastActivity - b[1].lastActivity)
      .slice(0, store.size - MAX_DEEP_REQUESTS)
    for (const [id] of oldest) store.delete(id)
  }
}

function touch(request: StoredDeepNetworkRequest): void {
  request.lastActivity = Date.now()
}

function archiveRedirect(store: Map<string, StoredDeepNetworkRequest>, requestId: string, params: Record<string, unknown>): void {
  const existing = store.get(requestId)
  if (!existing) return
  let hop = 1
  while (store.has(`${requestId}:r${hop}`)) hop++
  const archiveId = `${requestId}:r${hop}`
  const redirect = params.redirectResponse as Record<string, unknown> | undefined
  const next = params.request as Record<string, unknown> | undefined
  store.set(archiveId, {
    ...existing,
    requestId: archiveId,
    redirectHop: hop,
    redirectedTo: boundedUrl(next?.url),
    status: typeof redirect?.status === 'number' ? redirect.status : existing.status,
    statusText: typeof redirect?.statusText === 'string' ? truncateUtf8(redirect.statusText, 1024).value : existing.statusText,
    responseHeaders: normalizeHeaders(redirect?.headers as Record<string, unknown> | undefined) ?? existing.responseHeaders,
    mimeType: typeof redirect?.mimeType === 'string' ? truncateUtf8(redirect.mimeType, 256).value : existing.mimeType
  })
  store.delete(requestId)
}

function createRequest(context: DeepCaptureContext, requestId: string, params: Record<string, unknown>): StoredDeepNetworkRequest | undefined {
  if (!context.includeSelf && isDeepSelfTraffic(params)) return undefined
  const request = (params.request ?? {}) as Record<string, unknown>
  const headers = request.headers as Record<string, unknown> | undefined
  const rawUrl = String(request.url ?? params.url ?? '')
  const url = boundedUrl(rawUrl)
  const contentType = getHeader(headers, 'content-type')
  const postData = typeof request.postData === 'string' ? request.postData : undefined
  const sensitive = params.sensitiveBody === true || isSensitiveBodyUrl(rawUrl)
  const redactedPostData = postData === undefined ? undefined
    : sensitive ? {
        postData: REDACTED,
        postDataContentType: contentType,
        postDataByteLength: new TextEncoder().encode(postData).length
      }
      : redactBody(postData, contentType)
  return {
    requestId,
    url,
    method: String(request.method ?? 'GET'),
    resourceType: String(params.type ?? 'Other'),
    timestamp: typeof params.wallTime === 'number' ? params.wallTime * 1000 : Date.now(),
    lastActivity: Date.now(),
    tabId: context.tabId,
    source: 'deep', deep: true,
    requestHeaders: normalizeHeaders(headers),
    ...redactedPostData,
    bodyRedacted: sensitive || undefined,
    streamMessages: [], droppedStreamMessages: 0,
    dataReceivedChunkCount: 0, dataReceivedBytes: 0,
    webSocketFrames: [], droppedWebSocketFrames: 0,
    retainedPayloadBytes: 0,
    cdpStartTime: typeof params.timestamp === 'number' ? params.timestamp : undefined
  }
}

function boundedUrl(value: unknown): string {
  const raw = String(value ?? '')
  try {
    const url = new URL(raw)
    if (url.username) url.username = REDACTED
    if (url.password) url.password = REDACTED
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_BODY_URL_PATTERN.test(key)) url.searchParams.set(key, REDACTED)
    }
    return truncateUtf8(url.href, 4096).value
  } catch {
    return SENSITIVE_BODY_URL_PATTERN.test(raw) ? REDACTED : truncateUtf8(raw, 4096).value
  }
}

/** Remove credentials and bound page-controlled strings before an event waits in the per-tab queue. */
function prepareQueuedParams(method: string, params: Record<string, unknown>, maxBodyBytes: number): Record<string, unknown> {
  const prepared: Record<string, unknown> = {
    requestId: truncateUtf8(String(params.requestId ?? ''), 512).value,
    timestamp: Number(params.timestamp ?? 0),
    wallTime: Number(params.wallTime ?? 0),
    type: truncateUtf8(String(params.type ?? 'Other'), 128).value
  }
  if (method === 'Network.requestWillBeSent') {
    const request = (params.request ?? {}) as Record<string, unknown>
    const headers = request.headers as Record<string, unknown> | undefined
    const rawUrl = String(request.url ?? params.url ?? '')
    const url = boundedUrl(rawUrl)
    const sensitive = isSensitiveBodyUrl(rawUrl)
    const contentType = getHeader(headers, 'content-type')
    const rawPostData = typeof request.postData === 'string' ? request.postData : undefined
    const redactedPostData = rawPostData === undefined ? undefined
      : sensitive ? REDACTED
      : redactBody(rawPostData, contentType).postData
    prepared.sensitiveBody = sensitive
    prepared.request = {
      url, method: truncateUtf8(String(request.method ?? 'GET'), 32).value,
      headers: normalizeHeaders(headers),
      postData: redactedPostData === undefined ? undefined : truncateUtf8(redactedPostData, maxBodyBytes).value
    }
    const redirect = params.redirectResponse as Record<string, unknown> | undefined
    if (redirect) {
      prepared.redirectResponse = {
        status: Number(redirect.status ?? 0),
        statusText: truncateUtf8(String(redirect.statusText ?? ''), 1024).value,
        headers: normalizeHeaders(redirect.headers as Record<string, unknown> | undefined),
        mimeType: truncateUtf8(String(redirect.mimeType ?? ''), 256).value
      }
    }
    prepared.documentURL = boundedUrl(params.documentURL)
    const initiator = params.initiator as Record<string, unknown> | undefined
    if (initiator) {
      const stack = initiator.stack as Record<string, unknown> | undefined
      const callFrames = stack?.callFrames as Array<Record<string, unknown>> | undefined
      prepared.initiator = {
        url: boundedUrl(initiator.url),
        stack: callFrames ? { callFrames: callFrames.slice(0, 20).map(frame => ({ url: boundedUrl(frame.url) })) } : undefined
      }
    }
  } else if (method === 'Network.responseReceived') {
    const response = (params.response ?? {}) as Record<string, unknown>
    prepared.response = {
      status: Number(response.status ?? 0),
      statusText: truncateUtf8(String(response.statusText ?? ''), 1024).value,
      headers: normalizeHeaders(response.headers as Record<string, unknown> | undefined),
      mimeType: truncateUtf8(String(response.mimeType ?? ''), 256).value
    }
  } else if (method === 'Network.eventSourceMessageReceived') {
    prepared.data = truncateUtf8(redactTextPayload(String(params.data ?? '')), maxBodyBytes).value
    prepared.eventName = truncateUtf8(String(params.eventName ?? ''), 256).value
    prepared.eventId = truncateUtf8(String(params.eventId ?? ''), 256).value
  } else if (method === 'Network.webSocketFrameSent' || method === 'Network.webSocketFrameReceived') {
    const response = (params.response ?? {}) as Record<string, unknown>
    const opcode = Number(response.opcode ?? 1)
    prepared.response = {
      opcode,
      payloadData: truncateUtf8(opcode === 1 ? redactTextPayload(String(response.payloadData ?? '')) : '[binary omitted]', maxBodyBytes).value
    }
  } else if (method === 'Network.webSocketCreated') {
    prepared.url = boundedUrl(params.url)
  } else if (method === 'Network.loadingFailed') {
    prepared.errorText = truncateUtf8(String(params.errorText ?? 'Network Error'), 1024).value
  } else if (method === 'Network.dataReceived') {
    prepared.dataLength = Number(params.dataLength ?? 0)
  } else if (method === 'Network.loadingFinished') {
    prepared.encodedDataLength = Number(params.encodedDataLength ?? 0)
  }
  return prepared
}

function ensureWebSocketRequest(store: Map<string, StoredDeepNetworkRequest>, context: DeepCaptureContext, requestId: string, params: Record<string, unknown>): StoredDeepNetworkRequest | undefined {
  const existing = store.get(requestId)
  if (existing) {
    existing.resourceType = 'WebSocket'
    if (!existing.url) existing.url = String(params.url ?? '')
    touch(existing)
    return existing
  }
  const created = createRequest(context, requestId, {
    ...params, type: 'WebSocket', request: { url: params.url, method: 'GET' }
  })
  if (created) store.set(requestId, created)
  return created
}

export function applyDeepCaptureEvent(store: Map<string, StoredDeepNetworkRequest>, context: DeepCaptureContext, method: string, params: Record<string, unknown>): { fetchBodyFor?: string } {
  cleanupDeepStore(store)
  const requestId = String(params.requestId ?? '')
  if (!requestId) return {}
  if (method === 'Network.requestWillBeSent') {
    archiveRedirect(store, requestId, params)
    const request = createRequest(context, requestId, params)
    if (request) store.set(requestId, request)
    cleanupDeepStore(store)
    return {}
  }
  if (method === 'Network.webSocketCreated') {
    ensureWebSocketRequest(store, context, requestId, params)
    cleanupDeepStore(store)
    return {}
  }
  const request = store.get(requestId)
  if (!request) return {}
  touch(request)
  if (method === 'Network.responseReceived') {
    const response = (params.response ?? {}) as Record<string, unknown>
    request.status = typeof response.status === 'number' ? response.status : undefined
    request.statusText = typeof response.statusText === 'string' ? response.statusText : undefined
    request.responseHeaders = normalizeHeaders(response.headers as Record<string, unknown> | undefined)
    request.mimeType = typeof response.mimeType === 'string' ? response.mimeType : undefined
    request.resourceType = String(params.type ?? request.resourceType)
    return {}
  }
  if (method === 'Network.dataReceived') {
    request.dataReceivedChunkCount++
    request.dataReceivedBytes += Number(params.dataLength ?? 0)
    return {}
  }
  if (method === 'Network.eventSourceMessageReceived') {
    request.streamCapture = 'eventsource'
    const available = Math.max(0, context.maxBodyBytes - (request.retainedPayloadBytes ?? 0))
    if (request.streamMessages.length >= MAX_STREAM_MESSAGES || available === 0) {
      request.droppedStreamMessages++
      return {}
    }
    const payload = truncateUtf8(request.bodyRedacted ? REDACTED : redactTextPayload(String(params.data ?? '')), available)
    const item: DeepStreamMessage = {
      eventName: truncateUtf8(String(params.eventName ?? 'message'), 256).value,
      eventId: truncateUtf8(String(params.eventId ?? ''), 256).value,
      data: payload.value,
      timestamp: Number(params.timestamp ?? 0)
    }
    request.streamMessages.push(item)
    request.retainedPayloadBytes = (request.retainedPayloadBytes ?? 0) + new TextEncoder().encode(payload.value).length
    return {}
  }
  if (method === 'Network.webSocketFrameSent' || method === 'Network.webSocketFrameReceived') {
    const response = (params.response ?? {}) as Record<string, unknown>
    const available = Math.max(0, context.maxBodyBytes - (request.retainedPayloadBytes ?? 0))
    if (request.webSocketFrames.length >= MAX_WEBSOCKET_FRAMES || available === 0) {
      request.droppedWebSocketFrames++
      return {}
    }
    const opcode = Number(response.opcode ?? 1)
    const rawPayload = opcode === 1 ? redactTextPayload(String(response.payloadData ?? '')) : '[binary omitted]'
    const payload = truncateUtf8(request.bodyRedacted ? REDACTED : rawPayload, available)
    const frame: DeepWebSocketFrame = {
      direction: method.endsWith('Sent') ? 'sent' : 'received',
      opcode,
      payload: payload.value,
      timestamp: Number(params.timestamp ?? 0)
    }
    request.webSocketFrames.push(frame)
    request.retainedPayloadBytes = (request.retainedPayloadBytes ?? 0) + new TextEncoder().encode(payload.value).length
    return {}
  }
  if (method === 'Network.webSocketClosed') {
    request.webSocketClosed = true
  } else if (method === 'Network.loadingFailed') {
    request.status = 0
    request.statusText = String(params.errorText ?? 'Network Error')
  } else if (method === 'Network.loadingFinished') {
    request.encodedDataLength = Number(params.encodedDataLength ?? 0)
    if (request.bodyRedacted) {
      request.responseBody = REDACTED
      request.base64Encoded = false
      return {}
    }
    const isEventStream = request.mimeType?.toLowerCase() === 'text/event-stream'
    if (isEventStream && request.streamMessages.length > 0) {
      request.streamCapture = 'eventsource'
      return {}
    }
    if (isEventStream) request.streamCapture = 'data-received-final-body'
    if (!request.bodyFetchStarted) {
      request.bodyFetchStarted = true
      return { fetchBodyFor: requestId }
    }
    return {}
  } else return {}
  if (request.cdpStartTime !== undefined && typeof params.timestamp === 'number') {
    request.responseTime = Math.max(0, Math.round((params.timestamp - request.cdpStartTime) * 1000))
  }
  return {}
}

function truncateUtf8(value: string, maxBytes: number): { value: string; byteLength: number; truncated: boolean } {
  const encoded = new TextEncoder().encode(value)
  if (encoded.length <= maxBytes) return { value, byteLength: encoded.length, truncated: false }
  let end = Math.max(0, maxBytes)
  while (end > 0) {
    try {
      return {
        value: new TextDecoder('utf-8', { fatal: true }).decode(encoded.slice(0, end)),
        byteLength: encoded.length,
        truncated: true
      }
    } catch {
      end--
    }
  }
  return { value: '', byteLength: encoded.length, truncated: true }
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192))
  }
  return btoa(binary)
}

export function storeDeepResponseBody(request: StoredDeepNetworkRequest, body: string, base64Encoded: boolean, maxBodyBytes: number): void {
  if (request.bodyRedacted || isSensitiveBodyUrl(request.url)) {
    request.responseBody = REDACTED
    request.base64Encoded = false
    request.bodyRedacted = true
    return
  }
  if (base64Encoded) {
    try {
      const decoded = atob(body)
      const bytes = Uint8Array.from(decoded, character => character.charCodeAt(0))
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
      const trimmed = text.trim()
      const parsed = JSON.parse(trimmed)
      if (parsed === null || typeof parsed !== 'object') throw new Error('not structured text')
      const redacted = truncateUtf8(redactTextPayload(text), maxBodyBytes)
      const encoded = new TextEncoder().encode(redacted.value)
      request.responseBodyByteLength = bytes.length
      request.responseBodyTruncated = redacted.truncated
      request.responseBody = bytesToBase64(encoded)
      request.base64Encoded = true
      return
    } catch {
      request.responseBody = REDACTED
      request.responseBodyByteLength = body.length
      request.responseBodyTruncated = true
      request.base64Encoded = false
      request.bodyRedacted = true
      return
    }
  }
  const truncated = truncateUtf8(redactTextPayload(body), maxBodyBytes)
  request.responseBody = truncated.value
  request.responseBodyByteLength = truncated.byteLength
  request.responseBodyTruncated = truncated.truncated
  request.base64Encoded = false
}

function toSummary(request: StoredDeepNetworkRequest): DeepNetworkRequestSummary {
  const { responseBody, streamMessages, webSocketFrames, cdpStartTime, bodyFetchStarted, lastActivity, retainedPayloadBytes, ...summary } = request
  return {
    ...summary,
    bodyAvailable: responseBody !== undefined || streamMessages.length > 0 || webSocketFrames.length > 0,
    streamMessageCount: streamMessages.length,
    webSocketFrameCount: webSocketFrames.length,
    webSocketFramesSent: webSocketFrames.filter(frame => frame.direction === 'sent').length,
    webSocketFramesReceived: webSocketFrames.filter(frame => frame.direction === 'received').length
  }
}

export function getDeepNetworkRequests(tabId?: number, agent?: string): DeepNetworkRequestSummary[] {
  const sessions = tabId === undefined ? [...deepCaptureSessions.values()]
    : deepCaptureSessions.has(tabId) ? [deepCaptureSessions.get(tabId)!] : []
  const owner = agent === undefined ? undefined : ownerKey(agent)
  const rows: DeepNetworkRequestSummary[] = []
  for (const session of sessions) {
    if ((owner !== undefined && session.agent !== owner) || !sessionCurrent(session)) continue
    cleanupDeepStore(session.requests)
    rows.push(...[...session.requests.values()].map(toSummary))
  }
  return rows
}

export function isDeepCaptureActive(tabId?: number, agent?: string): boolean {
  const owner = agent === undefined ? undefined : ownerKey(agent)
  const sessions = tabId === undefined ? [...deepCaptureSessions.values()]
    : deepCaptureSessions.has(tabId) ? [deepCaptureSessions.get(tabId)!] : []
  return sessions.some(session => sessionCurrent(session) && (owner === undefined || session.agent === owner))
}

export function clearDeepCaptureRequests(tabId?: number, agent?: string): void {
  const owner = agent === undefined ? undefined : ownerKey(agent)
  for (const session of deepCaptureSessions.values()) {
    if ((tabId === undefined || session.tabId === tabId) && (owner === undefined || session.agent === owner)) {
      session.requests.clear()
    }
  }
}

function renderBody(request: StoredDeepNetworkRequest): { kind: 'body' | 'event-stream' | 'websocket'; text: string; dropped: number } | undefined {
  if (request.webSocketFrames.length > 0 || request.resourceType === 'WebSocket') {
    return { kind: 'websocket', text: request.webSocketFrames.map(frame => JSON.stringify(frame)).join('\n'), dropped: request.droppedWebSocketFrames }
  }
  if (request.streamMessages.length > 0) {
    return {
      kind: 'event-stream',
      text: request.streamMessages.map(item => JSON.stringify({ event: item.eventName || 'message', eventId: item.eventId, data: item.data, timestamp: item.timestamp })).join('\n'),
      dropped: request.droppedStreamMessages
    }
  }
  return request.responseBody === undefined ? undefined : { kind: 'body', text: request.responseBody, dropped: 0 }
}

export function paginateDeepResponseBody(request: StoredDeepNetworkRequest, offset = 0, length = 16_000): DeepBodyPage {
  const rendered = renderBody(request)
  const safeOffset = Math.max(0, Math.floor(offset))
  const safeLength = Math.min(32_000, Math.max(1, Math.floor(length)))
  if (!rendered) return { success: false, requestId: request.requestId, tabId: request.tabId, offset: safeOffset, length: 0, totalLength: 0, hasMore: false, streamCapture: request.streamCapture, error: 'Response body is not available yet' }
  const base64 = rendered.kind === 'body' && request.base64Encoded === true
  const effectiveOffset = base64 ? safeOffset - (safeOffset % 4) : safeOffset
  const effectiveLength = base64 ? Math.max(4, safeLength - (safeLength % 4)) : safeLength
  const text = rendered.text.slice(effectiveOffset, effectiveOffset + effectiveLength)
  const hasMore = effectiveOffset + text.length < rendered.text.length
  return {
    success: true, requestId: request.requestId, tabId: request.tabId,
    kind: rendered.kind, text, base64Encoded: request.base64Encoded,
    truncated: request.responseBodyTruncated, redacted: request.bodyRedacted,
    streamCapture: request.streamCapture, offset: effectiveOffset, length: text.length,
    totalLength: rendered.text.length, hasMore,
    nextOffset: hasMore ? effectiveOffset + text.length : undefined, dropped: rendered.dropped
  }
}

export function getDeepResponseBody(options: { requestId: string; tabId?: number; offset?: number; length?: number; agent?: string }): DeepBodyPage {
  const owner = options.agent === undefined ? undefined : ownerKey(options.agent)
  const sessions = options.tabId === undefined ? [...deepCaptureSessions.values()]
    : deepCaptureSessions.has(options.tabId) ? [deepCaptureSessions.get(options.tabId)!] : []
  for (const session of sessions) {
    if ((owner !== undefined && session.agent !== owner) || !sessionCurrent(session)) continue
    const request = session.requests.get(options.requestId)
    if (request) return paginateDeepResponseBody(request, options.offset, options.length)
  }
  return {
    success: false, requestId: options.requestId, tabId: options.tabId,
    offset: Math.max(0, Math.floor(options.offset ?? 0)), length: 0, totalLength: 0, hasMore: false,
    error: `Deep capture request ${options.requestId} was not found${options.tabId === undefined ? '' : ` in tab ${options.tabId}`}`
  }
}

export async function enableDeepCapture(tabId: number, maxBodyBytes?: number, includeSelf = false, options: DeepCaptureOptions = {}): Promise<{ success: boolean; tabId?: number; tabIds?: number[]; maxBodyBytes?: number; error?: string }> {
  const normalized = normalizeMaxBodyBytes(maxBodyBytes)
  try {
    checkDeadline(options.expiresAt)
    if (!options.documentToken || options.documentToken.tabId !== tabId) throw new Error('Deep capture requires an admitted current document')
    if (!options.agent?.trim() || !Object.prototype.hasOwnProperty.call(options, 'groupId')) {
      throw new Error('Deep capture requires an explicit tab owner')
    }
    await chrome.tabs.get(tabId)
    await runExclusivePerTab(tabId, async () => {
      // The debugger queue can outlive the relay request. Refuse before the
      // first CDP command instead of starting capture for an absent caller.
      checkDeadline(options.expiresAt)
      const target: chrome.debugger.Debuggee = { tabId }
      const persistent = isPersistentDebuggerAttached(tabId)
      let attachedHere = false
      try {
        if (!persistent) {
          await attachWithBusyRetry(target, tabId)
          attachedHere = true
        }
        checkDeadline(options.expiresAt)
        const previous = deepCaptureSessions.get(tabId)
        const sameOwnerDocument = previous?.agent === (options.agent ?? '__default__') &&
          previous.groupId === (options.groupId ?? null) &&
          previous.documentToken?.documentId === options.documentToken?.documentId &&
          previous.documentToken?.generation === options.documentToken?.generation
        const session: DeepCaptureSession = {
          tabId, maxBodyBytes: normalized, includeSelf,
          agent: options.agent ?? '__default__', groupId: options.groupId ?? null,
        documentToken: options.documentToken,
        requests: sameOwnerDocument ? previous!.requests : new Map(),
        eventTail: Promise.resolve(), pendingEventCount: 0, pendingEventBytes: 0
        }
        deepCaptureSessions.set(tabId, session)
        const resource = Math.min(2_000_000, Math.max(128_000, normalized * 2))
        await sendDebuggerCommand(target, 'Network.enable', {
          maxResourceBufferSize: resource,
          maxTotalBufferSize: Math.min(20_000_000, Math.max(1_000_000, resource * 10)),
          maxPostDataSize: normalized
        })
        checkDeadline(options.expiresAt)
        if (deepCaptureSessions.get(tabId) !== session || !sessionCurrent(session)) {
          throw new Error('Deep capture document or owner changed before Network capture started')
        }
        markDeepCaptureTabAttached(tabId)
      } catch (error) {
        deepCaptureSessions.delete(tabId)
        if (attachedHere) {
          try { await sendDebuggerCommand(target, 'Network.disable') } catch { /* best effort */ }
          try { await chrome.debugger.detach(target) } catch { /* best effort */ }
        }
        throw error
      }
    })
    const agent = options.agent ?? '__default__'
    return {
      success: true, tabId,
      tabIds: [...deepCaptureSessions.values()].filter(session => session.agent === agent).map(session => session.tabId),
      maxBodyBytes: normalized
    }
  } catch (error) {
    return { success: false, error: debuggerAttachError(tabId, error).message }
  }
}

export async function disableDeepCapture(tabId: number): Promise<{ success: boolean; tabId?: number; tabIds?: number[]; error?: string }> {
  try {
    await runExclusivePerTab(tabId, async () => {
      const target: chrome.debugger.Debuggee = { tabId }
      const attached = isDeepCaptureTabAttached(tabId)
      try {
        if (attached) try { await sendDebuggerCommand(target, 'Network.disable') } catch { /* best effort */ }
      } finally {
        deepCaptureSessions.delete(tabId)
        markDeepCaptureTabDetached(tabId)
        if (attached && !isEmulatedTabAttached(tabId)) try { await chrome.debugger.detach(target) } catch { /* best effort */ }
      }
    })
    return { success: true, tabId, tabIds: [] }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function invalidateDeepCaptureOwnership(tabId: number): Promise<void> {
  // Remove synchronously so no event can land while debugger cleanup queues.
  deepCaptureSessions.delete(tabId)
  if (!isDeepCaptureTabAttached(tabId)) return
  await runExclusivePerTab(tabId, async () => {
    const target: chrome.debugger.Debuggee = { tabId }
    try { await sendDebuggerCommand(target, 'Network.disable') } catch { /* best effort */ }
    markDeepCaptureTabDetached(tabId)
    if (!isEmulatedTabAttached(tabId)) try { await chrome.debugger.detach(target) } catch { /* best effort */ }
  })
}

async function captureCompletedBody(source: chrome.debugger.Debuggee, requestId: string, expected: DeepCaptureSession): Promise<void> {
  if (typeof source.tabId !== 'number' || deepCaptureSessions.get(source.tabId) !== expected || !sessionCurrent(expected)) return
  const request = expected.requests.get(requestId)
  if (!request) return
  try {
    const ownerBefore = await sessionOwnerCurrent(expected)
    if (deepCaptureSessions.get(source.tabId) !== expected) return
    if (!ownerBefore || !sessionCurrent(expected)) {
      await invalidateDeepCaptureOwnership(source.tabId)
      return
    }
    const result = await sendDebuggerCommand<{ body: string; base64Encoded: boolean }>(source, 'Network.getResponseBody', { requestId })
    const ownerAfter = await sessionOwnerCurrent(expected)
    if (deepCaptureSessions.get(source.tabId) !== expected) return
    if (expected.requests.get(requestId) === request && sessionCurrent(expected) && ownerAfter) {
      storeDeepResponseBody(request, result.body, result.base64Encoded, expected.maxBodyBytes)
    } else {
      await invalidateDeepCaptureOwnership(source.tabId)
    }
  } catch { /* request metadata remains useful when Chrome evicts the body */ }
}

function onDebuggerEvent(source: chrome.debugger.Debuggee, method: string, params?: object): void {
  if (typeof source.tabId !== 'number' || !method.startsWith('Network.')) return
  const session = deepCaptureSessions.get(source.tabId)
  if (!session) return
  const capturedParams = prepareQueuedParams(method, (params ?? {}) as Record<string, unknown>, session.maxBodyBytes)
  const pendingBytes = new TextEncoder().encode(JSON.stringify(capturedParams)).length
  const maxPendingBytes = Math.max(DEFAULT_MAX_BODY_BYTES, session.maxBodyBytes)
  if (session.pendingEventCount >= MAX_PENDING_EVENTS || session.pendingEventBytes + pendingBytes > maxPendingBytes) {
    const request = session.requests.get(String(capturedParams.requestId ?? ''))
    if (request) request.droppedPendingEvents = (request.droppedPendingEvents ?? 0) + 1
    return
  }
  session.pendingEventCount++
  session.pendingEventBytes += pendingBytes
  session.eventTail = session.eventTail.catch(() => undefined).then(async () => {
    try {
      if (deepCaptureSessions.get(source.tabId!) !== session || !sessionCurrent(session)) return
      const ownerCurrent = await sessionOwnerCurrent(session)
      if (deepCaptureSessions.get(source.tabId!) !== session) return
      if (!ownerCurrent || !sessionCurrent(session)) {
        await invalidateDeepCaptureOwnership(source.tabId!)
        return
      }
      const effect = applyDeepCaptureEvent(session.requests, session, method, capturedParams)
      if (effect.fetchBodyFor) await captureCompletedBody(source, effect.fetchBodyFor, session)
    } finally {
      session.pendingEventCount = Math.max(0, session.pendingEventCount - 1)
      session.pendingEventBytes = Math.max(0, session.pendingEventBytes - pendingBytes)
    }
  })
}

chrome.debugger?.onEvent?.addListener(onDebuggerEvent)
chrome.debugger?.onDetach?.addListener(source => {
  if (typeof source.tabId === 'number') {
    deepCaptureSessions.delete(source.tabId)
    markDeepCaptureTabDetached(source.tabId)
  }
})
subscribeToDocumentProtection(tabId => invalidateDeepCaptureOwnership(tabId))
subscribeToTabOwnershipChanges(tabId => { void invalidateDeepCaptureOwnership(tabId) })
subscribeToDocumentLifecycle(event => {
  if ((event.type === 'before-navigate' && event.frameId === 0) || event.type === 'removed') {
    return invalidateDeepCaptureOwnership(event.tabId)
  }
})

export function resetDeepCaptureStateForTests(): void {
  for (const tabId of deepCaptureSessions.keys()) markDeepCaptureTabDetached(tabId)
  deepCaptureSessions.clear()
}

export async function handleBrowserEnableDeepCapture(message: { requestId: string; tabId?: number; maxBodyBytes?: number; includeSelf?: boolean; agent?: string; requestTimeoutMs?: number }): Promise<Record<string, unknown>> {
  const expiresAt = requestExpiresAt(message.requestTimeoutMs)
  try {
    checkDeadline(expiresAt)
    const tab = await resolveAgentTab(message.agent, message.tabId)
    if (tab?.id === undefined) throw new Error('No active tab found')
    await assertAgentReadableTab('tabz_enable_deep_capture', tab)
    return await runWithDocumentAdmission(tab.id, async () => {
      checkDeadline(expiresAt)
      const token = await assertDocumentReadable(tab.id!, 'tabz_enable_deep_capture', { expiresAt })
      await assertDocumentReadCurrent(tab.id!, token, { expiresAt })
      const result = await enableDeepCapture(tab.id!, message.maxBodyBytes, message.includeSelf ?? false, {
        agent: ownerKey(message.agent), groupId: Number.isInteger(tab.groupId) ? tab.groupId! : null,
        documentToken: token, expiresAt
      })
      if (result.success) await assertDocumentReadCurrent(tab.id!, token, { expiresAt })
      return result
    })
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function handleBrowserDisableDeepCapture(message: { requestId: string; tabId?: number; agent?: string }): Promise<Record<string, unknown>> {
  try {
    const tab = await resolveAgentTab(message.agent, message.tabId)
    if (tab?.id === undefined) throw new Error('No active tab found')
    const session = deepCaptureSessions.get(tab.id)
    if (session && session.agent !== ownerKey(message.agent)) throw new Error('Deep capture belongs to another browser agent')
    return disableDeepCapture(tab.id)
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function handleBrowserGetResponseBody(message: { requestId: string; networkRequestId: string; tabId?: number; offset?: number; length?: number; agent?: string; requestTimeoutMs?: number }): Promise<Record<string, unknown>> {
  const expiresAt = requestExpiresAt(message.requestTimeoutMs)
  try {
    checkDeadline(expiresAt)
    const tab = await resolveAgentTab(message.agent, message.tabId)
    if (tab?.id === undefined) throw new Error('No active tab found')
    await assertTabInAgentGroup(message.agent, tab.id)
    return await runWithDocumentAdmission(tab.id, async () => {
      checkDeadline(expiresAt)
      const token = await assertDocumentReadable(tab.id!, 'tabz_get_response_body', { expiresAt })
      const result = getDeepResponseBody({ requestId: message.networkRequestId, tabId: tab.id, offset: message.offset, length: message.length, agent: message.agent })
      await assertDocumentReadCurrent(tab.id!, token, { expiresAt })
      const { requestId: _capturedRequestId, ...page } = result
      return { networkRequestId: message.networkRequestId, ...page }
    })
  } catch (error) {
    return {
      success: false, networkRequestId: message.networkRequestId, tabId: message.tabId,
      offset: Math.max(0, Math.floor(message.offset ?? 0)), length: 0, totalLength: 0, hasMore: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
