// Chrome Storage helpers

import type { TerminalSession } from '../hooks/useTerminalSessions'
import type { Profile, AudioSettings, CategorySettings } from '../components/SettingsModal'

export interface SyncedSession {
  name: string;
  created: Date;
  lastActive: Date;
  spawnOption: string;
  workingDir: string;
}

export interface StorageData {
  // Terminal sessions
  terminalSessions?: TerminalSession[];
  currentTerminalId?: string;
  activeSessions?: string[];
  recentSessions?: SyncedSession[];

  // Profiles
  profiles?: Profile[];
  defaultProfile?: string;
  categorySettings?: CategorySettings;

  // Audio
  audioSettings?: AudioSettings;
  audioGlobalMute?: boolean;

  // Working directory
  globalWorkingDir?: string;
  recentDirs?: string[];

  // Command history
  commandHistory?: string[];

  // UI settings
  isDark?: boolean;
  dashboardTheme?: string;
  fileViewerFontSize?: number;
  fileViewerFontFamily?: string;
  fileTreeMaxDepth?: number;

  // Legacy settings (deprecated, kept for migration)
  settings?: {
    theme?: string;
    fontSize?: number;
    defaultShell?: string;
    sidePanelPinned?: boolean;
    globalUseTmux?: boolean;
  };
}

// Local storage (no size limit, per-device)
export async function getLocal<K extends keyof StorageData>(
  keys: K[]
): Promise<Pick<StorageData, K>> {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => {
      resolve(result as Pick<StorageData, K>);
    });
  });
}

export async function setLocal(data: Partial<StorageData>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.set(data, () => {
      resolve();
    });
  });
}

// Sync storage (100KB limit, cross-device)
export async function getSync<K extends keyof StorageData>(
  keys: K[]
): Promise<Pick<StorageData, K>> {
  return new Promise((resolve) => {
    chrome.storage.sync.get(keys, (result) => {
      resolve(result as Pick<StorageData, K>);
    });
  });
}

export async function setSync(data: Partial<StorageData>): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.sync.set(data, () => {
      resolve();
    });
  });
}

// Listen to storage changes
export function onStorageChanged(
  callback: (
    changes: { [key: string]: chrome.storage.StorageChange },
    areaName: chrome.storage.AreaName
  ) => void
) {
  chrome.storage.onChanged.addListener(callback);
}

// Recent sessions management
export async function addRecentSession(session: SyncedSession): Promise<void> {
  const { recentSessions = [] } = await getLocal(['recentSessions']);

  // Remove if already exists
  const filtered = recentSessions.filter(s => s.name !== session.name);

  // Add to front, keep last 5
  const updated = [session, ...filtered].slice(0, 5);

  await setLocal({ recentSessions: updated });
}

export async function removeRecentSession(sessionName: string): Promise<void> {
  const { recentSessions = [] } = await getLocal(['recentSessions']);
  const updated = recentSessions.filter(s => s.name !== sessionName);
  await setLocal({ recentSessions: updated });
}

// Active sessions tracking
export async function addActiveSession(sessionName: string): Promise<void> {
  const { activeSessions = [] } = await getLocal(['activeSessions']);

  if (!activeSessions.includes(sessionName)) {
    await setLocal({ activeSessions: [...activeSessions, sessionName] });
  }
}

export async function removeActiveSession(sessionName: string): Promise<void> {
  const { activeSessions = [] } = await getLocal(['activeSessions']);
  const updated = activeSessions.filter(s => s !== sessionName);
  await setLocal({ activeSessions: updated });
}

export async function getActiveSessionCount(): Promise<number> {
  const { activeSessions = [] } = await getLocal(['activeSessions']);
  return activeSessions.length;
}
