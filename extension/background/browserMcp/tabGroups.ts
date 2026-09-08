/**
 * Browser MCP tab-group ownership.
 *
 * The background worker is shared by every MCP connection. Agent-labelled
 * requests therefore need a durable, per-caller group binding rather than a
 * single process-wide "Claude Active" id.
 */

import { sendToWebSocket } from '../websocket'
import { assertAgentReadableTab, isRefusedPageUrl, refusalMessage } from './pageGuard'

type TabGroupColor = 'grey' | 'blue' | 'red' | 'yellow' | 'green' | 'pink' | 'purple' | 'cyan'

const DEFAULT_AGENT_KEY = '__default__'
const AGENT_GROUP_STATE_KEY = 'browserMcpAgentGroupState'
const MAX_PERSISTED_AGENTS = 64
const AGENT_GROUP_COLORS: TabGroupColor[] = [
  'purple', 'blue', 'green', 'yellow', 'red', 'pink', 'cyan', 'grey'
]

export const GENERIC_AGENT_GROUP_TITLE = 'Claude Active'

interface StoredAgentGroupState {
  groupIds: Record<string, number>
  colors: Record<string, TabGroupColor>
  nextColor: number
}

export interface AgentGroupReservation {
  readonly agentKey: string
  readonly token: symbol
  readonly generation: number
  readonly previousGroupId: number | null
}

const activeGroupIds = new Map<string, number>()
const agentGroupColors = new Map<string, TabGroupColor>()
const reservations = new Map<string, AgentGroupReservation>()
const lifecycleQueues = new Map<string, Promise<void>>()
const lifecycleGenerations = new Map<string, number>()
let nextAgentColor = 0
let stateWriteQueue = Promise.resolve()
let ownershipMutationQueue = Promise.resolve()

const ownershipListeners = new Set<(tabId: number) => void>()
export function subscribeToTabOwnershipChanges(listener: (tabId: number) => void): () => void {
  ownershipListeners.add(listener)
  return () => ownershipListeners.delete(listener)
}

function invalidateTabOwnership(tabIds: number[]): void {
  for (const tabId of tabIds) {
    for (const listener of ownershipListeners) {
      try { listener(tabId) } catch { /* Each subscriber invalidates independently. */ }
    }
  }
}

async function groupTabsInternal(options: chrome.tabs.GroupOptions): Promise<number> {
  invalidateTabOwnership(Array.isArray(options.tabIds) ? options.tabIds : options.tabIds === undefined ? [] : [options.tabIds])
  return chrome.tabs.group(options)
}

export function getAgentKey(agent?: string): string {
  return agent?.trim() || DEFAULT_AGENT_KEY
}

export function isNamedAgent(agent?: string): boolean {
  return getAgentKey(agent) !== DEFAULT_AGENT_KEY
}

function isTabGroupColor(value: unknown): value is TabGroupColor {
  return typeof value === 'string' && AGENT_GROUP_COLORS.includes(value as TabGroupColor)
}

function generationFor(key: string): number {
  return lifecycleGenerations.get(key) ?? 0
}

function invalidateLifecycle(key: string): void {
  lifecycleGenerations.set(key, generationFor(key) + 1)
  reservations.delete(key)
}

/** Serialize mutations for one caller without blocking unrelated callers. */
export async function runAgentGroupLifecycle<T>(agent: string | undefined, operation: () => Promise<T>): Promise<T> {
  const key = getAgentKey(agent)
  const previous = lifecycleQueues.get(key) ?? Promise.resolve()
  let resolveResult!: (value: T | PromiseLike<T>) => void
  let rejectResult!: (reason?: unknown) => void
  const result = new Promise<T>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })
  const queued = previous
    .catch(() => undefined)
    .then(async () => {
      try {
        resolveResult(await operation())
      } catch (error) {
        rejectResult(error)
      }
    })
  lifecycleQueues.set(key, queued)
  void queued.finally(() => {
    if (lifecycleQueues.get(key) === queued) lifecycleQueues.delete(key)
  })
  return result
}

/** Chrome grouping is globally mutable, so adoption checks and mutations are atomic. */
export async function runTabOwnershipMutation<T>(operation: () => Promise<T>): Promise<T> {
  const previous = ownershipMutationQueue
  let resolveResult!: (value: T | PromiseLike<T>) => void
  let rejectResult!: (reason?: unknown) => void
  const result = new Promise<T>((resolve, reject) => {
    resolveResult = resolve
    rejectResult = reject
  })
  ownershipMutationQueue = previous
    .catch(() => undefined)
    .then(async () => {
      try { resolveResult(await operation()) } catch (error) { rejectResult(error) }
    })
  return result
}

async function loadAgentGroupState(): Promise<void> {
  const storage = chrome.storage?.session
  if (!storage) return
  const result = await storage.get(AGENT_GROUP_STATE_KEY)
  const stored = result[AGENT_GROUP_STATE_KEY] as Partial<StoredAgentGroupState> | undefined
  if (!stored || typeof stored !== 'object') return

  const candidates = Object.entries(stored.groupIds ?? {})
    .filter((entry): entry is [string, number] => !!entry[0] && Number.isInteger(entry[1]))
  const groupCounts = new Map<number, number>()
  for (const [, groupId] of candidates) groupCounts.set(groupId, (groupCounts.get(groupId) ?? 0) + 1)

  let sanitized = candidates.length !== Object.keys(stored.groupIds ?? {}).length
  for (const [agent, groupId] of candidates) {
    // Corrupt state that names two owners for one group authorizes neither.
    if (groupCounts.get(groupId) !== 1) {
      sanitized = true
      continue
    }
    activeGroupIds.set(agent, groupId)
  }
  for (const [agent, color] of Object.entries(stored.colors ?? {})) {
    if (activeGroupIds.has(agent) && isTabGroupColor(color)) agentGroupColors.set(agent, color)
    else sanitized = true
  }
  if (Number.isInteger(stored.nextColor) && (stored.nextColor ?? -1) >= 0) {
    nextAgentColor = stored.nextColor as number
  }
  if (sanitized) await persistAgentGroupState()
}

const agentGroupStateReady = loadAgentGroupState().catch(() => undefined)

function persistAgentGroupState(): Promise<void> {
  const storage = chrome.storage?.session
  if (!storage) return Promise.resolve()
  const state: StoredAgentGroupState = {
    groupIds: Object.fromEntries(activeGroupIds),
    colors: Object.fromEntries(agentGroupColors),
    nextColor: nextAgentColor
  }
  stateWriteQueue = stateWriteQueue
    .catch(() => undefined)
    .then(() => storage.set({ [AGENT_GROUP_STATE_KEY]: state }))
  return stateWriteQueue
}

function ownersOfGroup(groupId: number): string[] {
  return [...activeGroupIds.entries()]
    .filter(([, boundGroupId]) => boundGroupId === groupId)
    .map(([agent]) => agent)
}

function reservedCapacityCount(): number {
  return [...reservations.keys()].filter(key => !activeGroupIds.has(key)).length
}

async function dropStaleAgentGroups(): Promise<void> {
  const snapshot = [...activeGroupIds.entries()]
  const stale = await Promise.all(snapshot.map(async ([agent, groupId]) => {
    try {
      await chrome.tabGroups.get(groupId)
      return null
    } catch {
      return { agent, groupId }
    }
  }))
  let changed = false
  for (const entry of stale) {
    if (!entry || activeGroupIds.get(entry.agent) !== entry.groupId) continue
    activeGroupIds.delete(entry.agent)
    agentGroupColors.delete(entry.agent)
    changed = true
  }
  if (changed) await persistAgentGroupState()
}

/** Reserve before any Chrome mutation so pending work consumes capacity too. */
export async function reserveAgentGroupBindingInternal(agent?: string): Promise<AgentGroupReservation> {
  await agentGroupStateReady
  const key = getAgentKey(agent)
  if (reservations.has(key)) throw new Error('This browser agent is already changing its tab group')
  if (!activeGroupIds.has(key) && activeGroupIds.size + reservedCapacityCount() >= MAX_PERSISTED_AGENTS) {
    await dropStaleAgentGroups()
  }
  if (!activeGroupIds.has(key) && activeGroupIds.size + reservedCapacityCount() >= MAX_PERSISTED_AGENTS) {
    throw new Error('Browser agent group capacity reached; release an existing group before opening another')
  }
  const reservation: AgentGroupReservation = {
    agentKey: key,
    token: Symbol(key),
    generation: generationFor(key),
    previousGroupId: activeGroupIds.get(key) ?? null
  }
  reservations.set(key, reservation)
  return reservation
}

export function assertAgentGroupReservationCurrent(reservation: AgentGroupReservation): void {
  if (reservations.get(reservation.agentKey)?.token !== reservation.token ||
      generationFor(reservation.agentKey) !== reservation.generation) {
    throw new Error('Browser agent group reservation expired')
  }
}

export async function releaseAgentGroupReservationInternal(reservation: AgentGroupReservation): Promise<void> {
  if (reservations.get(reservation.agentKey)?.token !== reservation.token) return
  reservations.delete(reservation.agentKey)
  if (!activeGroupIds.has(reservation.agentKey)) agentGroupColors.delete(reservation.agentKey)
  await persistAgentGroupState()
}

async function setActiveGroupId(
  agent: string | undefined,
  groupId: number,
  reservation: AgentGroupReservation
): Promise<void> {
  await agentGroupStateReady
  const key = getAgentKey(agent)
  if (reservation.agentKey !== key) throw new Error('Browser agent group reservation does not match')
  assertAgentGroupReservationCurrent(reservation)
  const otherOwners = ownersOfGroup(groupId).filter(owner => owner !== key)
  if (otherOwners.length > 0) throw new Error(`Group ${groupId} belongs to another browser agent`)
  const previousGroupId = activeGroupIds.get(key)
  activeGroupIds.set(key, groupId)
  reservations.delete(key)
  try {
    await persistAgentGroupState()
  } catch (error) {
    if (previousGroupId === undefined) activeGroupIds.delete(key)
    else activeGroupIds.set(key, previousGroupId)
    throw error
  }
}

function assertGroupNotOwnedByOther(agent: string | undefined, groupId: number): void {
  const key = getAgentKey(agent)
  if (ownersOfGroup(groupId).some(owner => owner !== key)) {
    throw new Error(`Group ${groupId} belongs to another browser agent`)
  }
}

export async function bindAgentGroup(
  agent: string | undefined,
  groupId: number,
  reservation?: AgentGroupReservation
): Promise<void> {
  await chrome.tabGroups.get(groupId)
  const ownedReservation = reservation ?? await reserveAgentGroupBindingInternal(agent)
  try {
    await setActiveGroupId(agent, groupId, ownedReservation)
  } finally {
    await releaseAgentGroupReservationInternal(ownedReservation)
  }
}

async function dropActiveGroupId(agent?: string, expectedGroupId?: number): Promise<void> {
  await agentGroupStateReady
  const key = getAgentKey(agent)
  if (expectedGroupId !== undefined && activeGroupIds.get(key) !== expectedGroupId) return
  const changed = activeGroupIds.delete(key)
  const droppedColor = agentGroupColors.delete(key)
  if (changed || droppedColor) await persistAgentGroupState()
}

export async function getClaudeActiveGroupId(agent?: string): Promise<number | null> {
  await agentGroupStateReady
  const key = getAgentKey(agent)
  const groupId = activeGroupIds.get(key)
  if (groupId === undefined) return null
  if (ownersOfGroup(groupId).length !== 1) return null
  try {
    await chrome.tabGroups.get(groupId)
    return groupId
  } catch {
    await dropActiveGroupId(agent, groupId)
    return null
  }
}

export async function getAgentForGroup(groupId: number): Promise<string | null> {
  await agentGroupStateReady
  const owners = ownersOfGroup(groupId)
  return owners.length === 1 ? owners[0] : null
}

export async function getAgentGroupLabel(agent?: string): Promise<string | undefined> {
  const groupId = await getClaudeActiveGroupId(agent)
  if (groupId === null) return undefined
  try {
    const title = (await chrome.tabGroups.get(groupId)).title?.trim()
    return title && title !== GENERIC_AGENT_GROUP_TITLE ? title : undefined
  } catch {
    return undefined
  }
}

/** Named agents may read or mutate only tabs in their own bound group. */
export async function assertTabInAgentGroup(agent: string | undefined, tabId: number): Promise<void> {
  if (!isNamedAgent(agent)) return
  const groupId = await getClaudeActiveGroupId(agent)
  if (groupId === null) {
    throw new Error('This browser agent has no tab group; open a new tab before targeting an existing tab')
  }
  const tab = await chrome.tabs.get(tabId)
  if (tab.groupId !== groupId) throw new Error(`Tab ${tabId} is outside your group (group ${groupId})`)
}

/** An explicit adoption may claim an ungrouped tab, but never another owned group. */
export async function assertTabCanBeAdopted(agent: string | undefined, tabId: number): Promise<void> {
  await assertAgentReadableTab('tabz_claude_group_add', tabId)
  if (!isNamedAgent(agent)) return
  const own = await getClaudeActiveGroupId(agent)
  const tab = await chrome.tabs.get(tabId)
  if (own !== null && tab.groupId === own) return
  if (tab.groupId === undefined || tab.groupId === chrome.tabGroups.TAB_GROUP_ID_NONE) return
  const owners = ownersOfGroup(tab.groupId)
  if (owners.length > 0) throw new Error(`Tab ${tabId} belongs to another browser agent`)
  throw new Error(`Tab ${tabId} is already in an unowned tab group and cannot be adopted safely`)
}

export async function assertGroupOwnedByAgent(agent: string | undefined, groupId: number): Promise<void> {
  if (!isNamedAgent(agent)) return
  const own = await getClaudeActiveGroupId(agent)
  if (own === null) throw new Error('This browser agent has no tab group')
  if (own !== groupId) throw new Error(`Group ${groupId} is not your group (group ${own})`)
}

/** Resolve omitted targets inside the caller's group. Named callers never fall back browser-wide. */
export async function resolveAgentTab(agent: string | undefined, tabId?: number): Promise<chrome.tabs.Tab | undefined> {
  if (tabId !== undefined) {
    await assertTabInAgentGroup(agent, tabId)
    return chrome.tabs.get(tabId)
  }
  const groupId = await getClaudeActiveGroupId(agent)
  if (groupId === null) {
    if (isNamedAgent(agent)) throw new Error('This browser agent has no tab group; open a new tab first')
    return (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0]
  }
  const tabs = await chrome.tabs.query({ groupId })
  const selected = tabs.find(tab => tab.active)
    ?? [...tabs].sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0]
  if (!selected) throw new Error(`No tab found in your group (group ${groupId}); open one with tabz_open_url`)
  return selected
}

async function assertGroupableTabs(tool: string, tabIds: number[]): Promise<void> {
  for (const tabId of tabIds) {
    const tab = await chrome.tabs.get(tabId)
    const refusedUrl = [tab.url, tab.pendingUrl].find(isRefusedPageUrl)
    if (refusedUrl) throw new Error(refusalMessage(tool, refusedUrl))
  }
}

export async function ungroupTabsInternal(tabIds: number[]): Promise<void> {
  if (tabIds.length > 0) {
    invalidateTabOwnership(tabIds)
    await chrome.tabs.ungroup(tabIds as [number, ...number[]])
  }
}

async function restoreTabGroup(
  tabId: number,
  previousGroupId: number | null,
  expectedCurrentGroupId: number
): Promise<void> {
  try {
    const current = await chrome.tabs.get(tabId)
    if (current.groupId !== expectedCurrentGroupId) return
    if (previousGroupId === null) await ungroupTabsInternal([tabId])
    else await groupTabsInternal({ tabIds: [tabId], groupId: previousGroupId })
  } catch {
    // Preserve the original lifecycle failure. Compensation is best effort.
  }
}

async function getAgentGroupColor(agent?: string): Promise<TabGroupColor> {
  const key = getAgentKey(agent)
  const existing = agentGroupColors.get(key)
  if (existing) return existing
  const color = AGENT_GROUP_COLORS[nextAgentColor % AGENT_GROUP_COLORS.length]
  nextAgentColor += 1
  agentGroupColors.set(key, color)
  return color
}

async function getFreshGroupId(tabId: number, expectedGroupId: number): Promise<number> {
  const tab = await chrome.tabs.get(tabId)
  return tab.groupId !== undefined && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE
    ? tab.groupId
    : expectedGroupId
}

/** Keep the existing stale-id retry behavior from tc-51h5. */
export async function updateGroupWithRetry(
  tabId: number,
  groupId: number,
  properties: chrome.tabGroups.UpdateProperties,
  agent?: string
): Promise<chrome.tabGroups.TabGroup> {
  const freshId = await getFreshGroupId(tabId, groupId)
  assertGroupNotOwnedByOther(agent, freshId)
  try {
    await chrome.tabGroups.update(freshId, properties)
    return await chrome.tabGroups.get(freshId)
  } catch {
    const retryId = await getFreshGroupId(tabId, freshId)
    assertGroupNotOwnedByOther(agent, retryId)
    await chrome.tabGroups.update(retryId, properties)
    return chrome.tabGroups.get(retryId)
  }
}

export async function configureAgentGroup(
  tabId: number,
  groupId: number,
  agent?: string,
  title?: string,
  reservation?: AgentGroupReservation
): Promise<chrome.tabGroups.TabGroup> {
  const ownedReservation = reservation ?? await reserveAgentGroupBindingInternal(agent)
  try {
    assertAgentGroupReservationCurrent(ownedReservation)
    const group = await updateGroupWithRetry(tabId, groupId, {
      title: title?.trim() || GENERIC_AGENT_GROUP_TITLE,
      color: await getAgentGroupColor(agent)
    }, agent)
    assertAgentGroupReservationCurrent(ownedReservation)
    await setActiveGroupId(agent, group.id, ownedReservation)
    return group
  } catch (error) {
    if (!activeGroupIds.has(getAgentKey(agent))) agentGroupColors.delete(getAgentKey(agent))
    throw error
  } finally {
    await releaseAgentGroupReservationInternal(ownedReservation)
  }
}

export async function rollbackAgentGroupBindingInternal(
  agent: string | undefined,
  attemptedGroupId: number,
  previousGroupId: number | null
): Promise<void> {
  const key = getAgentKey(agent)
  if (activeGroupIds.get(key) !== attemptedGroupId) return
  if (previousGroupId === null) {
    activeGroupIds.delete(key)
    agentGroupColors.delete(key)
  } else {
    activeGroupIds.set(key, previousGroupId)
  }
  try { await persistAgentGroupState() } catch { /* best effort */ }
}

async function dissolveGroup(groupId: number): Promise<number> {
  const tabs = await chrome.tabs.query({ groupId })
  const ids: number[] = []
  for (const tab of tabs) {
    if (tab.id === undefined) continue
    try {
      if ((await chrome.tabs.get(tab.id)).groupId === groupId) ids.push(tab.id)
    } catch { /* closed */ }
  }
  await ungroupTabsInternal(ids)
  return ids.length
}

export function releaseAgentGroupInternal(agent?: string): Promise<{ groupId: number | null; ungroupedCount: number }> {
  const key = getAgentKey(agent)
  // Invalidate synchronously so a Chrome promise already in flight cannot bind late.
  invalidateLifecycle(key)
  return runAgentGroupLifecycle(agent, () => runTabOwnershipMutation(async () => {
    const groupId = await getClaudeActiveGroupId(agent)
    if (groupId === null) {
      agentGroupColors.delete(key)
      await persistAgentGroupState()
      return { groupId: null, ungroupedCount: 0 }
    }
    const ungroupedCount = await dissolveGroup(groupId)
    await dropActiveGroupId(agent, groupId)
    return { groupId, ungroupedCount }
  }))
}

async function addTabToClaudeGroupExclusive(
  tabId: number,
  agent?: string,
  title?: string
): Promise<{ groupId: number; title: string; color: chrome.tabGroups.TabGroup['color']; tabCount: number }> {
  await assertTabCanBeAdopted(agent, tabId)
  const candidate = await chrome.tabs.get(tabId)
  const previousGroupId = Number.isInteger(candidate.groupId) && candidate.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE
    ? candidate.groupId as number
    : null
  let groupId = await getClaudeActiveGroupId(agent)
  const reservation = await reserveAgentGroupBindingInternal(agent)
  try {
    assertAgentGroupReservationCurrent(reservation)
    if (groupId === null) {
    let groupedAs: number | null = null
    try {
      groupedAs = await groupTabsInternal({ tabIds: [tabId] })
      assertAgentGroupReservationCurrent(reservation)
      const group = await configureAgentGroup(tabId, groupedAs, agent, title, reservation)
      groupId = group.id
    } catch (error) {
      if (groupedAs !== null) await restoreTabGroup(tabId, previousGroupId, groupedAs)
      throw error
    }
    } else if (candidate.groupId !== groupId) {
      await groupTabsInternal({ tabIds: [tabId], groupId })
      assertAgentGroupReservationCurrent(reservation)
      groupId = await getFreshGroupId(tabId, groupId)
      if (groupId !== await getClaudeActiveGroupId(agent)) {
      try {
        await setActiveGroupId(agent, groupId, reservation)
      } catch (error) {
        await restoreTabGroup(tabId, previousGroupId, groupId)
        throw error
      }
    }
    }
  } finally {
    await releaseAgentGroupReservationInternal(reservation)
  }
  const group = await chrome.tabGroups.get(groupId)
  const tabs = await chrome.tabs.query({ groupId })
  return { groupId, title: group.title || '', color: group.color, tabCount: tabs.length }
}

export function addTabToClaudeGroupInternal(
  tabId: number,
  agent?: string,
  title?: string
): Promise<{ groupId: number; title: string; color: chrome.tabGroups.TabGroup['color']; tabCount: number }> {
  return runAgentGroupLifecycle(agent, () => runTabOwnershipMutation(
    () => addTabToClaudeGroupExclusive(tabId, agent, title)
  ))
}

function sendResult(type: string, requestId: string, result: Record<string, unknown>): void {
  sendToWebSocket({ type: `${type}-result`, requestId, ...result })
}

export async function handleBrowserListTabGroups(message: { requestId: string; agent?: string }): Promise<void> {
  try {
    const ownGroupId = await getClaudeActiveGroupId(message.agent)
    const allTabs = isNamedAgent(message.agent)
      ? (ownGroupId === null ? [] : await chrome.tabs.query({ groupId: ownGroupId }))
      : await chrome.tabs.query({ lastFocusedWindow: true })
    const groupIds = [...new Set(allTabs
      .map(tab => tab.groupId)
      .filter((id): id is number => id !== undefined && id !== chrome.tabGroups.TAB_GROUP_ID_NONE))]
    const groups = (await Promise.all(groupIds.map(async groupId => {
      try {
        const group = await chrome.tabGroups.get(groupId)
        const tabs = allTabs.filter(tab => tab.groupId === groupId)
        return {
          groupId: group.id, title: group.title || '', color: group.color,
          collapsed: group.collapsed, windowId: group.windowId, tabCount: tabs.length,
          tabIds: tabs.map(tab => tab.id).filter((id): id is number => id !== undefined)
        }
      } catch { return null }
    }))).filter((group): group is NonNullable<typeof group> => group !== null)
    sendResult('browser-list-tab-groups', message.requestId, { success: true, groups, claudeActiveGroupId: ownGroupId })
  } catch (error) {
    sendResult('browser-list-tab-groups', message.requestId, { success: false, groups: [], error: (error as Error).message })
  }
}

export async function handleBrowserCreateTabGroup(message: {
  requestId: string; tabIds: number[]; title?: string; color?: TabGroupColor; collapsed?: boolean; agent?: string
}): Promise<void> {
  const type = 'browser-create-tab-group'
  try {
    if (!message.tabIds?.length) throw new Error('At least one tabId is required')
    const group = await runAgentGroupLifecycle(message.agent, () => runTabOwnershipMutation(async () => {
      await assertGroupableTabs('tabz_create_group', message.tabIds)
      for (const tabId of message.tabIds) {
        if (isNamedAgent(message.agent)) await assertTabCanBeAdopted(message.agent, tabId)
      }
      const reservation = isNamedAgent(message.agent) ? await reserveAgentGroupBindingInternal(message.agent) : null
      const previous = reservation?.previousGroupId ?? null
      const previousMemberships = new Map<number, number | null>()
      for (const tabId of message.tabIds) {
        const tab = await chrome.tabs.get(tabId)
        previousMemberships.set(tabId,
          Number.isInteger(tab.groupId) && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE
            ? tab.groupId : null)
      }
      let groupedId: number | null = null
      try {
        groupedId = await groupTabsInternal({ tabIds: message.tabIds as [number, ...number[]] })
        const props: chrome.tabGroups.UpdateProperties = {}
        if (message.title !== undefined) props.title = message.title
        if (message.color !== undefined) props.color = message.color
        if (message.collapsed !== undefined) props.collapsed = message.collapsed
        const created = Object.keys(props).length
          ? await updateGroupWithRetry(message.tabIds[0], groupedId, props)
          : await chrome.tabGroups.get(await getFreshGroupId(message.tabIds[0], groupedId))
        if (reservation) {
          await setActiveGroupId(message.agent, created.id, reservation)
          if (previous !== null && previous !== created.id) await dissolveGroup(previous)
        }
        return created
      } catch (error) {
        if (groupedId !== null && reservation) {
          const currentBinding = await getClaudeActiveGroupId(message.agent)
          if (currentBinding !== null && currentBinding !== previous) {
            await rollbackAgentGroupBindingInternal(message.agent, currentBinding, previous)
          }
          for (const tabId of message.tabIds) {
            await restoreTabGroup(tabId, previousMemberships.get(tabId) ?? null, groupedId)
          }
        }
        throw error
      } finally {
        if (reservation) await releaseAgentGroupReservationInternal(reservation)
      }
    }))
    sendResult(type, message.requestId, { success: true, group: {
      groupId: group.id, title: group.title ?? '', color: group.color, collapsed: group.collapsed,
      windowId: group.windowId, tabCount: message.tabIds.length
    } })
  } catch (error) {
    sendResult(type, message.requestId, { success: false, error: (error as Error).message })
  }
}

export async function handleBrowserUpdateTabGroup(message: {
  requestId: string; groupId: number; title?: string; color?: TabGroupColor; collapsed?: boolean; agent?: string
}): Promise<void> {
  const type = 'browser-update-tab-group'
  try {
    await assertGroupOwnedByAgent(message.agent, message.groupId)
    const properties: chrome.tabGroups.UpdateProperties = {}
    if (message.title !== undefined) properties.title = message.title
    if (message.color !== undefined) properties.color = message.color
    if (message.collapsed !== undefined) properties.collapsed = message.collapsed
    if (!Object.keys(properties).length) throw new Error('No update properties provided')
    await chrome.tabGroups.update(message.groupId, properties)
    const group = await chrome.tabGroups.get(message.groupId)
    sendResult(type, message.requestId, { success: true, group: {
      groupId: group.id, title: group.title ?? '', color: group.color,
      collapsed: group.collapsed, windowId: group.windowId
    } })
  } catch (error) {
    sendResult(type, message.requestId, { success: false, error: (error as Error).message })
  }
}

export async function handleBrowserAddToTabGroup(message: {
  requestId: string; groupId: number; tabIds: number[]; agent?: string
}): Promise<void> {
  const type = 'browser-add-to-tab-group'
  try {
    const { group, tabs } = await runAgentGroupLifecycle(message.agent, () => runTabOwnershipMutation(async () => {
      if (!message.tabIds?.length) throw new Error('At least one tabId is required')
      await assertGroupOwnedByAgent(message.agent, message.groupId)
      await assertGroupableTabs('tabz_add_to_group', message.tabIds)
      for (const tabId of message.tabIds) await assertTabCanBeAdopted(message.agent, tabId)
      const previousMemberships = new Map<number, number | null>()
      for (const tabId of message.tabIds) {
        const tab = await chrome.tabs.get(tabId)
        previousMemberships.set(tabId,
          Number.isInteger(tab.groupId) && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE
            ? tab.groupId : null)
      }
      let grouped = false
      try {
        await groupTabsInternal({ tabIds: message.tabIds as [number, ...number[]], groupId: message.groupId })
        grouped = true
        const freshId = await getFreshGroupId(message.tabIds[0], message.groupId)
        assertGroupNotOwnedByOther(message.agent, freshId)
        return {
          group: await chrome.tabGroups.get(freshId),
          tabs: await chrome.tabs.query({ groupId: freshId })
        }
      } catch (error) {
        if (grouped) {
          for (const tabId of message.tabIds) {
            await restoreTabGroup(tabId, previousMemberships.get(tabId) ?? null, message.groupId)
          }
        }
        throw error
      }
    }))
    sendResult(type, message.requestId, { success: true, group: {
      groupId: group.id, title: group.title || '', color: group.color, tabCount: tabs.length
    } })
  } catch (error) {
    sendResult(type, message.requestId, { success: false, error: (error as Error).message })
  }
}

export async function handleBrowserUngroupTabs(message: { requestId: string; tabIds: number[]; agent?: string }): Promise<void> {
  const type = 'browser-ungroup-tabs'
  try {
    await runAgentGroupLifecycle(message.agent, () => runTabOwnershipMutation(async () => {
      if (!message.tabIds?.length) throw new Error('At least one tabId is required')
      for (const tabId of message.tabIds) await assertTabInAgentGroup(message.agent, tabId)
      await ungroupTabsInternal(message.tabIds)
    }))
    sendResult(type, message.requestId, { success: true, ungroupedCount: message.tabIds.length })
  } catch (error) {
    sendResult(type, message.requestId, { success: false, error: (error as Error).message })
  }
}

export async function handleBrowserAddToClaudeGroup(message: {
  requestId: string; tabId: number; agent?: string; title?: string
}): Promise<void> {
  const type = 'browser-add-to-claude-group'
  try {
    const group = await addTabToClaudeGroupInternal(message.tabId, message.agent, message.title)
    sendResult(type, message.requestId, { success: true, group })
  } catch (error) {
    sendResult(type, message.requestId, { success: false, error: (error as Error).message })
  }
}

export async function handleBrowserRemoveFromClaudeGroup(message: {
  requestId: string; tabId: number; agent?: string
}): Promise<void> {
  const type = 'browser-remove-from-claude-group'
  try {
    await runAgentGroupLifecycle(message.agent, () => runTabOwnershipMutation(async () => {
      const groupId = await getClaudeActiveGroupId(message.agent)
      if (groupId === null) throw new Error('This browser agent has no tab group')
      await assertTabInAgentGroup(message.agent, message.tabId)
      await ungroupTabsInternal([message.tabId])
      await getClaudeActiveGroupId(message.agent)
    }))
    sendResult(type, message.requestId, { success: true })
  } catch (error) {
    sendResult(type, message.requestId, { success: false, error: (error as Error).message })
  }
}

export async function handleBrowserReleaseClaudeGroup(message: {
  requestId: string; type?: string; agent?: string
}): Promise<void> {
  const type = message.type === 'browser-close-claude-group'
    ? 'browser-close-claude-group'
    : 'browser-release-claude-group'
  try {
    sendResult(type, message.requestId, { success: true, ...await releaseAgentGroupInternal(message.agent) })
  } catch (error) {
    sendResult(type, message.requestId, { success: false, error: (error as Error).message })
  }
}

export async function handleBrowserGetClaudeGroupStatus(message: { requestId: string; agent?: string }): Promise<void> {
  const type = 'browser-get-claude-group-status'
  try {
    const groupId = await getClaudeActiveGroupId(message.agent)
    if (groupId === null) {
      sendResult(type, message.requestId, { success: true, exists: false, groupId: null, tabCount: 0 })
      return
    }
    const group = await chrome.tabGroups.get(groupId)
    const tabs = await chrome.tabs.query({ groupId })
    sendResult(type, message.requestId, {
      success: true, exists: true, groupId,
      group: { groupId: group.id, title: group.title || '', color: group.color, collapsed: group.collapsed },
      tabCount: tabs.length,
      tabIds: tabs.map(tab => tab.id).filter((id): id is number => id !== undefined)
    })
  } catch (error) {
    sendResult(type, message.requestId, { success: false, error: (error as Error).message })
  }
}

/** Reset mutable service-worker state between isolated unit tests. */
export function resetAgentGroupStateForTests(): void {
  activeGroupIds.clear()
  agentGroupColors.clear()
  reservations.clear()
  lifecycleQueues.clear()
  lifecycleGenerations.clear()
  nextAgentColor = 0
  stateWriteQueue = Promise.resolve()
  ownershipMutationQueue = Promise.resolve()
}
