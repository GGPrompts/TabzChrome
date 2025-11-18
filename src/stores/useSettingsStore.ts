import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

export type TerminalTheme =
  | "default"
  | "cyberpunk"
  | "matrix"
  | "holographic"
  | "vaporwave"
  | "aurora"
  | "synthwave"
  | "retro";

interface AppSettings {
  theme: "dark" | "light";
  terminalDefaultTheme: TerminalTheme;
  terminalDefaultBackground: string; // Background gradient key (e.g., 'dark-neutral', 'matrix-depths')
  terminalDefaultTransparency: number;
  terminalDefaultFontSize: number;
  terminalDefaultFontFamily: string;
  defaultTerminalSize: { width: number; height: number };
  autoReconnectToTmuxSessions: boolean;
  useTmux: boolean; // Use tmux for all terminal spawns (default true)

  // Directory settings
  workingDirectory: string;
  directoryFavorites: string[];
  fileFavorites: string[];
}

interface SettingsStore extends AppSettings {
  updateSettings: (settings: Partial<AppSettings>) => void;
  resetSettings: () => void;
  exportSettings: () => string;
  importSettings: (json: string) => void;
  _hasHydrated: boolean;
  setHasHydrated: (state: boolean) => void;
}

const defaultSettings: AppSettings = {
  theme: "dark",
  terminalDefaultTheme: "default",
  terminalDefaultBackground: "dark-neutral", // Default background gradient
  terminalDefaultTransparency: 0.1,
  terminalDefaultFontSize: 16, // Match Word 12pt standard for better readability
  terminalDefaultFontFamily: "monospace", // System default monospace font
  defaultTerminalSize: { width: 600, height: 720 },
  autoReconnectToTmuxSessions: true, // Set to false to prevent reconnecting to external tmux sessions
  useTmux: true, // Use tmux by default for better session persistence and resize handling

  // Directory settings
  workingDirectory: "/home/matt",
  directoryFavorites: [],
  fileFavorites: [],
};

// Migrate from old Opustrator settings key to new Tabz key
const migrateSettings = () => {
  const oldKey = "opustrator-settings";
  const newKey = "tabz-settings";

  try {
    // Check if new key already exists
    const existingNew = localStorage.getItem(newKey);
    if (existingNew) {
      console.log('[SettingsStore] Already migrated to tabz-settings');
      return;
    }

    // Try to migrate from old key
    const oldSettings = localStorage.getItem(oldKey);
    if (oldSettings) {
      console.log('[SettingsStore] Migrating settings from opustrator-settings to tabz-settings');
      localStorage.setItem(newKey, oldSettings);
      console.log('[SettingsStore] Migration complete');
    }
  } catch (error) {
    console.error('[SettingsStore] Migration failed:', error);
  }
};

// Run migration before store creation
migrateSettings();

export const useSettingsStore = create<SettingsStore>()(
  persist(
    immer((set, get) => ({
      ...defaultSettings,
      _hasHydrated: false,

      setHasHydrated: (state) => {
        set({
          _hasHydrated: state
        });
      },

      updateSettings: (settings) =>
        set((state) => {
          Object.assign(state, settings);
        }),

      resetSettings: () => set(() => defaultSettings),

      exportSettings: () => {
        const {
          updateSettings,
          resetSettings,
          exportSettings,
          importSettings,
          _hasHydrated,
          setHasHydrated,
          ...settings
        } = get();
        return JSON.stringify(settings, null, 2);
      },

      importSettings: (json) =>
        set((state) => {
          try {
            const settings = JSON.parse(json) as Partial<AppSettings>;
            Object.assign(state, settings);
          } catch (error) {
            console.error("Failed to import settings:", error);
          }
        }),
    })),
    {
      name: "tabz-settings",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        console.log('[SettingsStore] Hydration complete, workingDirectory:', state?.workingDirectory);
        state?.setHasHydrated(true);
      },
      partialize: (state) => {
        // Exclude functions and hydration flag from persistence
        const { updateSettings, resetSettings, exportSettings, importSettings, _hasHydrated, setHasHydrated, ...settings } = state;
        return settings;
      },
    }
  )
);

export const terminalThemes = [
  { value: "default", label: "Default" },
  { value: "cyberpunk", label: "Cyberpunk" },
  { value: "matrix", label: "Matrix" },
  { value: "holographic", label: "Holographic" },
  { value: "vaporwave", label: "Vaporwave" },
  { value: "aurora", label: "Aurora" },
  { value: "synthwave", label: "Synthwave" },
  { value: "retro", label: "Retro" },
];
