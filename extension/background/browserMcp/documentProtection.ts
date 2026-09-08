/**
 * Per-document admission boundary for browser reads and saved-value writes.
 *
 * Chrome document IDs, rather than URLs, keep same-document SPA/history and
 * BFCache documents protected. Records contain identifiers and generations
 * only; no URL, selector, value, or value-derived hash is persisted.
 */

import { assertAgentReadableTab } from './pageGuard'

const STORAGE_PREFIX = 'tabz.document-protection.'
const STATE_VERSION = 1

interface PersistedDocumentState {
  version: 1
  generation: number
  protectedDocumentIds: string[]
  uncertainReadDocumentIds: string[]
  tabWideProtection: boolean
  manualHandoffProtection: boolean
}

export interface DocumentProtectionToken {
  tabId: number
  documentId: string
  generation: number
  /** In-memory fence; absent only in compatibility mocks. */
  navigationEpoch?: number
}

export type DocumentProtectionReason = 'saved-fill' | 'manual-login'

export interface DocumentGuardOptions {
  guard?: () => void
  expiresAt?: number
}

const admissionTails = new Map<number, Promise<void>>()
const stateCache = new Map<number, PersistedDocumentState>()
const currentMainDocuments = new Map<number, string>()
const currentFrameDocuments = new Map<number, Set<string>>()
interface CurrentFrameDocument {
  documentId: string
  parentFrameId: number
  parentDocumentId?: string
}
const currentFrameTrees = new Map<number, Map<number, CurrentFrameDocument>>()
const loadedTabs = new Set<number>()
const storageFailures = new Set<number>()
const protectionListeners = new Set<(tabId: number) => void | Promise<void>>()
const lifecycleEpochs = new Map<number, number>()
const navigationEpochs = new Map<number, number>()
let removalListenerRegistered = false
let webNavigationListenersRegistered = false

export interface DocumentLifecycleEvent {
  type: 'before-navigate' | 'committed' | 'removed'
  tabId: number
  frameId: number
  documentId?: string
}

const documentLifecycleListeners = new Set<(event: DocumentLifecycleEvent) => void | Promise<void>>()

function notifyDocumentLifecycle(event: DocumentLifecycleEvent): void {
  for (const listener of documentLifecycleListeners) void listener(event)
}

function clearCurrentDocuments(tabId: number): void {
  currentMainDocuments.delete(tabId)
  currentFrameDocuments.delete(tabId)
  currentFrameTrees.delete(tabId)
  loadedTabs.delete(tabId)
}

function removeFrameSubtree(tabId: number, frameId: number): void {
  const tree = currentFrameTrees.get(tabId)
  if (!tree) return
  const remove = new Set<number>([frameId])
  let changed = true
  while (changed) {
    changed = false
    for (const [candidate, frame] of tree) {
      if (!remove.has(candidate) && remove.has(frame.parentFrameId)) {
        remove.add(candidate)
        changed = true
      }
    }
  }
  for (const id of remove) tree.delete(id)
  currentFrameDocuments.set(tabId, new Set([...tree.values()].map(frame => frame.documentId)))
}

function onBeforeNavigate(details: chrome.webNavigation.WebNavigationBaseCallbackDetails): void {
  if (details.tabId < 0) return
  if (details.frameId === 0) {
    navigationEpochs.set(details.tabId, (navigationEpochs.get(details.tabId) ?? 0) + 1)
    clearCurrentDocuments(details.tabId)
  } else {
    removeFrameSubtree(details.tabId, details.frameId)
  }
  notifyDocumentLifecycle({ type: 'before-navigate', tabId: details.tabId, frameId: details.frameId })
}

function onCommitted(details: chrome.webNavigation.WebNavigationTransitionCallbackDetails): void {
  if (details.tabId < 0 || details.documentLifecycle !== 'active' ||
      typeof details.documentId !== 'string' || details.documentId.length === 0) return

  if (details.frameId !== 0) {
    const tree = currentFrameTrees.get(details.tabId)
    if (!tree || !details.parentDocumentId ||
        ![...tree.values()].some(frame => frame.documentId === details.parentDocumentId)) return
    tree.set(details.frameId, {
      documentId: details.documentId,
      parentFrameId: details.parentFrameId,
      parentDocumentId: details.parentDocumentId
    })
    currentFrameDocuments.set(details.tabId, new Set([...tree.values()].map(frame => frame.documentId)))
    notifyDocumentLifecycle({
      type: 'committed', tabId: details.tabId, frameId: details.frameId, documentId: details.documentId
    })
    return
  }

  navigationEpochs.set(details.tabId, (navigationEpochs.get(details.tabId) ?? 0) + 1)
  const epoch = navigationEpochs.get(details.tabId) ?? 0
  loadedTabs.delete(details.tabId)
  currentMainDocuments.set(details.tabId, details.documentId)
  currentFrameTrees.set(details.tabId, new Map([[0, {
    documentId: details.documentId,
    parentFrameId: -1
  }]]))
  currentFrameDocuments.set(details.tabId, new Set([details.documentId]))

  void runWithDocumentAdmission(details.tabId, async () => {
    try {
      await loadState(details.tabId)
      if ((navigationEpochs.get(details.tabId) ?? 0) !== epoch ||
          currentMainDocuments.get(details.tabId) !== details.documentId) return
      notifyDocumentLifecycle({
        type: 'committed', tabId: details.tabId, frameId: 0, documentId: details.documentId
      })
    } catch {
      // loadState records a fail-closed storage failure.
    }
  })
}

/** Register trusted Chrome lifecycle listeners during service-worker startup. */
export function setupDocumentLifecycle(): void {
  if (!webNavigationListenersRegistered && chrome.webNavigation?.onBeforeNavigate && chrome.webNavigation?.onCommitted) {
    chrome.webNavigation.onBeforeNavigate.addListener(onBeforeNavigate)
    chrome.webNavigation.onCommitted.addListener(onCommitted)
    webNavigationListenersRegistered = true
  }
  ensureRemovalListener()
}

function lifecycleEpoch(tabId: number): number {
  return lifecycleEpochs.get(tabId) ?? 0
}

function assertNavigationEpoch(tabId: number, epoch: number, message: string): void {
  if ((navigationEpochs.get(tabId) ?? 0) !== epoch) throw new Error(message)
}

function emptyState(): PersistedDocumentState {
  return {
    version: STATE_VERSION,
    generation: 0,
    protectedDocumentIds: [],
    uncertainReadDocumentIds: [],
    tabWideProtection: false,
    manualHandoffProtection: false
  }
}

function storageKey(tabId: number): string {
  return `${STORAGE_PREFIX}${tabId}`
}

function validIds(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(id => typeof id === 'string' && id.length > 0)
}

function parseState(value: unknown): PersistedDocumentState {
  if (value === undefined) return emptyState()
  if (!value || typeof value !== 'object') throw new Error('Document protection state is invalid; refusing browser content access')
  const state = value as Partial<PersistedDocumentState>
  if (
    state.version !== STATE_VERSION || !Number.isSafeInteger(state.generation) || (state.generation ?? -1) < 0 ||
    !validIds(state.protectedDocumentIds) || !validIds(state.uncertainReadDocumentIds) ||
    typeof state.tabWideProtection !== 'boolean' || typeof state.manualHandoffProtection !== 'boolean'
  ) {
    throw new Error('Document protection state is invalid; refusing browser content access')
  }
  return {
    version: STATE_VERSION,
    generation: state.generation as number,
    protectedDocumentIds: [...new Set(state.protectedDocumentIds)],
    uncertainReadDocumentIds: [...new Set(state.uncertainReadDocumentIds)],
    tabWideProtection: state.tabWideProtection,
    manualHandoffProtection: state.manualHandoffProtection
  }
}

function checkGuard(options: DocumentGuardOptions = {}): void {
  options.guard?.()
  if (options.expiresAt !== undefined && Date.now() >= options.expiresAt) {
    throw new Error('Refused: the document-protection deadline expired before the operation started')
  }
}

function ensureRemovalListener(): void {
  if (removalListenerRegistered) return
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    // Invalidate on Chrome's earliest tab signal too; webNavigation later
    // repopulates only a committed active document with its immutable ID.
    if (changeInfo.status === 'loading' || changeInfo.url !== undefined) {
      navigationEpochs.set(tabId, (navigationEpochs.get(tabId) ?? 0) + 1)
      clearCurrentDocuments(tabId)
      notifyDocumentLifecycle({ type: 'before-navigate', tabId, frameId: 0 })
    }
  })
  chrome.tabs.onRemoved.addListener((tabId) => {
    lifecycleEpochs.set(tabId, lifecycleEpoch(tabId) + 1)
    navigationEpochs.delete(tabId)
    stateCache.delete(tabId)
    clearCurrentDocuments(tabId)
    storageFailures.delete(tabId)
    notifyDocumentLifecycle({ type: 'removed', tabId, frameId: 0 })
    void runWithDocumentAdmission(tabId, async () => {
      try {
        await chrome.storage.session.remove(storageKey(tabId))
      } catch {
        storageFailures.add(tabId)
      }
    })
  })
  removalListenerRegistered = true
}

async function loadState(tabId: number): Promise<PersistedDocumentState> {
  setupDocumentLifecycle()
  if (storageFailures.has(tabId)) throw new Error('Document protection storage is unavailable; refusing browser content access')
  const epoch = lifecycleEpoch(tabId)
  try {
    const key = storageKey(tabId)
    const stored = await chrome.storage.session.get(key)
    const state = parseState(stored[key])
    if (lifecycleEpoch(tabId) !== epoch) throw new Error('The browser tab closed during document protection')
    stateCache.set(tabId, state)
    loadedTabs.add(tabId)
    return state
  } catch (error) {
    storageFailures.add(tabId)
    stateCache.delete(tabId)
    loadedTabs.delete(tabId)
    if (error instanceof Error && (
      error.message.startsWith('Document protection state is invalid') ||
      error.message === 'The browser tab closed during document protection'
    )) throw error
    throw new Error('Document protection storage is unavailable; refusing browser content access')
  }
}

async function saveState(tabId: number, state: PersistedDocumentState): Promise<void> {
  setupDocumentLifecycle()
  const epoch = lifecycleEpoch(tabId)
  try {
    await chrome.storage.session.set({ [storageKey(tabId)]: state })
    if (lifecycleEpoch(tabId) !== epoch) {
      try { await chrome.storage.session.remove(storageKey(tabId)) } catch { /* keep failure below */ }
      throw new Error('The browser tab closed during document protection')
    }
    stateCache.set(tabId, state)
    loadedTabs.add(tabId)
    storageFailures.delete(tabId)
  } catch (error) {
    storageFailures.add(tabId)
    stateCache.delete(tabId)
    loadedTabs.delete(tabId)
    if (error instanceof Error && error.message === 'The browser tab closed during document protection') throw error
    throw new Error('Document protection could not be persisted; refusing the operation')
  }
}

async function probeCurrentDocument(
  tabId: number,
  tool: string,
  options: DocumentGuardOptions = {}
): Promise<string> {
  setupDocumentLifecycle()
  const navigationEpoch = navigationEpochs.get(tabId) ?? 0
  checkGuard(options)
  const tab = await chrome.tabs.get(tabId)
  await assertAgentReadableTab(tool, tab)
  if (tab.pendingUrl || tab.status === 'loading') {
    throw new Error(`Refused: ${tool} cannot use a tab while navigation is pending`)
  }
  checkGuard(options)
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => true
  })
  if (results.length === 0 || results.some(result => typeof result.documentId !== 'string' || !result.documentId)) {
    throw new Error(`Refused: ${tool} could not bind every accessible frame to a Chrome document ID`)
  }
  const mainFrame = results.find(result => result.frameId === 0)
  if (mainFrame?.result !== true || typeof mainFrame.documentId !== 'string' || !mainFrame.documentId) {
    throw new Error(`Refused: ${tool} could not bind the operation to a Chrome document ID`)
  }
  checkGuard(options)
  const after = await chrome.tabs.get(tabId)
  await assertAgentReadableTab(tool, after)
  if (after.pendingUrl || after.status === 'loading') {
    throw new Error(`Refused: ${tool} cannot use a tab while navigation is pending`)
  }
  if ((navigationEpochs.get(tabId) ?? 0) !== navigationEpoch) {
    throw new Error(`Refused: ${tool} detected navigation while binding the Chrome document`)
  }
  currentMainDocuments.set(tabId, mainFrame.documentId)
  currentFrameDocuments.set(tabId, new Set(results.map(result => result.documentId as string)))
  currentFrameTrees.set(tabId, new Map(results.map(result => [result.frameId, {
    documentId: result.documentId as string,
    parentFrameId: result.frameId === 0 ? -1 : 0
  }])))
  return mainFrame.documentId
}

/** Serialize admission and the complete associated read/fill on one tab. */
export async function runWithDocumentAdmission<T>(tabId: number, fn: () => Promise<T>): Promise<T> {
  const previous = admissionTails.get(tabId) ?? Promise.resolve()
  let release!: () => void
  const slot = new Promise<void>(resolve => { release = resolve })
  const tail = previous.catch(() => undefined).then(() => slot)
  admissionTails.set(tabId, tail)
  await previous.catch(() => undefined)
  try {
    return await fn()
  } finally {
    release()
    if (admissionTails.get(tabId) === tail) admissionTails.delete(tabId)
  }
}

/**
 * Probe and persist protection before a saved value or human credential can
 * enter the page. Call inside runWithDocumentAdmission.
 */
export async function preflightAndProtectDocument(
  tabId: number,
  options: DocumentGuardOptions & { reason: DocumentProtectionReason }
): Promise<DocumentProtectionToken> {
  checkGuard(options)
  const documentId = await probeCurrentDocument(tabId, 'saved login handoff', options)
  const documentEpoch = navigationEpochs.get(tabId) ?? 0
  const previous = await loadState(tabId)
  assertNavigationEpoch(tabId, documentEpoch, 'Refused: the page navigated before saved-login protection could be persisted')
  if (previous.uncertainReadDocumentIds.includes(documentId)) {
    throw new Error('Refused: an earlier browser read may still be running in this document; navigate to a new page before entering a saved login')
  }
  const state: PersistedDocumentState = {
    ...previous,
    generation: previous.generation + 1,
    protectedDocumentIds: [...new Set([...previous.protectedDocumentIds, documentId])],
    manualHandoffProtection: options.reason === 'manual-login' || previous.manualHandoffProtection
  }
  checkGuard(options)
  await saveState(tabId, state)
  await Promise.all([...protectionListeners].map(listener => listener(tabId)))

  // A navigation after persistence leaves the historical document protected,
  // but cannot redirect this request into the replacement document.
  const currentDocumentId = await probeCurrentDocument(tabId, 'saved login handoff', options)
  if (currentDocumentId !== documentId) {
    throw new Error('Refused: the page navigated during saved-login protection; nothing was entered')
  }
  return { tabId, documentId, generation: state.generation, navigationEpoch: navigationEpochs.get(tabId) ?? 0 }
}

/**
 * Finish a manual handoff after the caller has independently observed its
 * clear-state policy. The completion document remains historical protection;
 * only this manual reservation is retired.
 */
export async function completeManualLoginHandoff(
  tabId: number,
  options: DocumentGuardOptions = {}
): Promise<DocumentProtectionToken> {
  const documentId = await probeCurrentDocument(tabId, 'manual login completion', options)
  const documentEpoch = navigationEpochs.get(tabId) ?? 0
  const previous = await loadState(tabId)
  assertNavigationEpoch(tabId, documentEpoch, 'Refused: the page navigated while completing the manual login handoff')
  if (!previous.manualHandoffProtection) throw new Error('No manual login handoff is active for this tab')
  const staged: PersistedDocumentState = {
    ...previous,
    generation: previous.generation + 1,
    protectedDocumentIds: [...new Set([...previous.protectedDocumentIds, documentId])],
    manualHandoffProtection: true
  }
  checkGuard(options)
  await saveState(tabId, staged)
  await Promise.all([...protectionListeners].map(listener => listener(tabId)))
  const currentDocumentId = await probeCurrentDocument(tabId, 'manual login completion', options)
  if (currentDocumentId !== documentId) {
    throw new Error('Refused: the page navigated while completing the manual login handoff')
  }
  const verifiedNavigationEpoch = navigationEpochs.get(tabId) ?? 0
  const completed: PersistedDocumentState = {
    ...staged,
    generation: staged.generation + 1,
    manualHandoffProtection: false
  }
  checkGuard(options)
  await saveState(tabId, completed)
  if ((navigationEpochs.get(tabId) ?? 0) !== verifiedNavigationEpoch) {
    await saveState(tabId, {
      ...completed,
      generation: completed.generation + 1,
      manualHandoffProtection: true
    })
    throw new Error('Refused: the page navigated while completing the manual login handoff')
  }
  await Promise.all([...protectionListeners].map(listener => listener(tabId)))
  return { tabId, documentId, generation: completed.generation, navigationEpoch: navigationEpochs.get(tabId) ?? 0 }
}

export function protectedDocumentTarget(token: DocumentProtectionToken): chrome.scripting.InjectionTarget {
  return { tabId: token.tabId, documentIds: [token.documentId] }
}

/**
 * CDP input cannot bind commands to a Chrome document ID. Persist a
 * conservative whole-tab restriction before using such a value-bearing path;
 * it is intentionally cleared only when the tab closes.
 */
export async function protectTabForUnboundMutation(
  tabId: number,
  token: DocumentProtectionToken
): Promise<DocumentProtectionToken> {
  if (token.tabId !== tabId) throw new Error('Saved-login document token belongs to another tab')
  if (token.navigationEpoch !== undefined) {
    assertNavigationEpoch(tabId, token.navigationEpoch, 'Saved-login document changed before unbound input started')
  }
  const previous = await loadState(tabId)
  if (token.navigationEpoch !== undefined) {
    assertNavigationEpoch(tabId, token.navigationEpoch, 'Saved-login document changed before unbound input started')
  }
  if (previous.generation !== token.generation || !previous.protectedDocumentIds.includes(token.documentId)) {
    throw new Error('Saved-login document protection changed before unbound input started')
  }
  const state: PersistedDocumentState = {
    ...previous,
    generation: previous.generation + 1,
    tabWideProtection: true
  }
  await saveState(tabId, state)
  await Promise.all([...protectionListeners].map(listener => listener(tabId)))
  return { ...token, generation: state.generation }
}

/** Revalidate protection and exact current document after a saved mutation. */
export async function assertProtectedDocumentCurrent(
  tabId: number,
  token: DocumentProtectionToken,
  options: DocumentGuardOptions = {}
): Promise<void> {
  checkGuard(options)
  if (token.tabId !== tabId) throw new Error('Saved-login document token belongs to another tab')
  if (token.navigationEpoch !== undefined && token.navigationEpoch !== (navigationEpochs.get(tabId) ?? 0)) {
    throw new Error('The page navigated before the saved fill could be verified')
  }
  const state = await loadState(tabId)
  if (state.generation !== token.generation ||
      (!state.tabWideProtection && !state.manualHandoffProtection && !state.protectedDocumentIds.includes(token.documentId))) {
    throw new Error('Saved-login document protection changed before verification completed')
  }
  const currentDocumentId = await probeCurrentDocument(tabId, 'saved login verification', options)
  if (currentDocumentId !== token.documentId) {
    throw new Error('The page navigated before the saved fill could be verified')
  }
  if (token.navigationEpoch !== undefined && token.navigationEpoch !== (navigationEpochs.get(tabId) ?? 0)) {
    throw new Error('The page navigated before the saved fill could be verified')
  }
}

/** Return protection for the current document. Call inside admission lock. */
export async function currentDocumentProtection(
  tabId: number,
  options: DocumentGuardOptions = {}
): Promise<DocumentProtectionToken | null> {
  const documentId = await probeCurrentDocument(tabId, 'browser mutation', options)
  const documentEpoch = navigationEpochs.get(tabId) ?? 0
  const state = await loadState(tabId)
  assertNavigationEpoch(tabId, documentEpoch, 'The page navigated while checking document protection')
  return state.tabWideProtection || state.manualHandoffProtection || state.protectedDocumentIds.includes(documentId)
    ? { tabId, documentId, generation: state.generation, navigationEpoch: navigationEpochs.get(tabId) ?? 0 }
    : null
}

/** Admit a content read and return the exact document token for post-checking. */
export async function assertDocumentReadable(
  tabId: number,
  tool: string,
  options: DocumentGuardOptions = {}
): Promise<DocumentProtectionToken> {
  const documentId = await probeCurrentDocument(tabId, tool, options)
  const documentEpoch = navigationEpochs.get(tabId) ?? 0
  const state = await loadState(tabId)
  assertNavigationEpoch(tabId, documentEpoch, `Refused: ${tool} detected navigation during browser-read admission`)
  if (state.tabWideProtection || state.manualHandoffProtection || state.protectedDocumentIds.includes(documentId)) {
    throw new Error(`Refused: ${tool} cannot read a document that may contain a saved or manually entered login; navigate to a new page first`)
  }
  if (state.uncertainReadDocumentIds.includes(documentId)) {
    throw new Error(`Refused: ${tool} cannot use this document because an earlier read may still be running; navigate to a new page first`)
  }
  return { tabId, documentId, generation: state.generation, navigationEpoch: navigationEpochs.get(tabId) ?? 0 }
}

/** Verify that a read result still belongs to its admitted document. */
export async function assertDocumentReadCurrent(
  tabId: number,
  token: DocumentProtectionToken,
  options: DocumentGuardOptions & { documentId?: string; captureDocumentId?: string } = {}
): Promise<void> {
  checkGuard(options)
  if (token.tabId !== tabId) throw new Error('Browser-read document token belongs to another tab')
  if (token.navigationEpoch !== undefined && token.navigationEpoch !== (navigationEpochs.get(tabId) ?? 0)) {
    throw new Error('The page navigated before the browser read could be verified')
  }
  if (options.documentId !== undefined && options.documentId !== token.documentId) {
    throw new Error('Browser-read result came from a different document')
  }
  const state = await loadState(tabId)
  if (
    state.generation !== token.generation || state.tabWideProtection || state.manualHandoffProtection ||
    state.protectedDocumentIds.includes(token.documentId) || state.uncertainReadDocumentIds.includes(token.documentId) ||
    (options.captureDocumentId !== undefined && (
      !currentFrameDocuments.get(tabId)?.has(options.captureDocumentId) ||
      state.protectedDocumentIds.includes(options.captureDocumentId) ||
      state.uncertainReadDocumentIds.includes(options.captureDocumentId)
    ))
  ) {
    throw new Error('Browser-read admission changed before the result completed')
  }
  const currentDocumentId = await probeCurrentDocument(tabId, 'browser read verification', options)
  if (currentDocumentId !== token.documentId) {
    throw new Error('The page navigated before the browser read could be verified')
  }
  if (token.navigationEpoch !== undefined && token.navigationEpoch !== (navigationEpochs.get(tabId) ?? 0)) {
    throw new Error('The page navigated before the browser read could be verified')
  }
  if (options.captureDocumentId !== undefined && !currentFrameDocuments.get(tabId)?.has(options.captureDocumentId)) {
    throw new Error('Browser-read result came from a frame outside the current verified document tree')
  }
}

/** Persist an unresolved read so a later saved fill cannot race its callback. */
export async function markDocumentReadUncertain(
  tabId: number,
  token: DocumentProtectionToken
): Promise<void> {
  if (token.tabId !== tabId) throw new Error('Browser-read document token belongs to another tab')
  const previous = await loadState(tabId)
  if (previous.generation !== token.generation) return
  await saveState(tabId, {
    ...previous,
    generation: previous.generation + 1,
    uncertainReadDocumentIds: [...new Set([...previous.uncertainReadDocumentIds, token.documentId])]
  })
}

/** Async capture admission for an event already bound to a document ID. */
export async function assertDocumentCaptureAllowed(
  tabId: number,
  documentId: string | undefined,
  tool: string
): Promise<DocumentProtectionToken> {
  if (!documentId) throw new Error(`Refused: ${tool} capture has no Chrome document ID`)
  const mainDocumentId = await probeCurrentDocument(tabId, tool)
  const documentEpoch = navigationEpochs.get(tabId) ?? 0
  const state = await loadState(tabId)
  assertNavigationEpoch(tabId, documentEpoch, `Refused: ${tool} capture detected navigation during admission`)
  if (!currentFrameDocuments.get(tabId)?.has(documentId)) {
    throw new Error(`Refused: ${tool} capture does not belong to the current verified frame tree`)
  }
  if (
    state.tabWideProtection || state.manualHandoffProtection || state.protectedDocumentIds.includes(mainDocumentId) ||
    state.uncertainReadDocumentIds.includes(mainDocumentId) ||
    state.protectedDocumentIds.includes(documentId) || state.uncertainReadDocumentIds.includes(documentId)
  ) {
    throw new Error(`Refused: ${tool} capture belongs to a protected browser document`)
  }
  return { tabId, documentId: mainDocumentId, generation: state.generation, navigationEpoch: navigationEpochs.get(tabId) ?? 0 }
}

/** Last synchronous gate immediately before a console/network row is stored. */
export function canCaptureDocumentSync(tabId: number, documentId: string | undefined): boolean {
  if (!documentId || !loadedTabs.has(tabId) || storageFailures.has(tabId)) return false
  const state = stateCache.get(tabId)
  const mainDocumentId = currentMainDocuments.get(tabId)
  const frameDocumentIds = currentFrameDocuments.get(tabId)
  return Boolean(state &&
    mainDocumentId && frameDocumentIds?.has(documentId) && !state.tabWideProtection && !state.manualHandoffProtection &&
    !state.protectedDocumentIds.includes(mainDocumentId) &&
    !state.uncertainReadDocumentIds.includes(mainDocumentId) &&
    !state.protectedDocumentIds.includes(documentId) &&
    !state.uncertainReadDocumentIds.includes(documentId))
}

/** Subscribe to persisted protection so existing capture buffers can be pruned. */
export function subscribeToDocumentProtection(
  listener: (tabId: number) => void | Promise<void>
): () => void {
  protectionListeners.add(listener)
  return () => protectionListeners.delete(listener)
}

export function subscribeToDocumentLifecycle(
  listener: (event: DocumentLifecycleEvent) => void | Promise<void>
): () => void {
  documentLifecycleListeners.add(listener)
  return () => documentLifecycleListeners.delete(listener)
}

/** Test-only reset of service-worker memory; persisted session state remains. */
export function resetDocumentProtectionMemoryForTests(): void {
  admissionTails.clear()
  stateCache.clear()
  currentMainDocuments.clear()
  currentFrameDocuments.clear()
  currentFrameTrees.clear()
  loadedTabs.clear()
  storageFailures.clear()
  protectionListeners.clear()
  lifecycleEpochs.clear()
  navigationEpochs.clear()
  documentLifecycleListeners.clear()
  removalListenerRegistered = false
  webNavigationListenersRegistered = false
}
