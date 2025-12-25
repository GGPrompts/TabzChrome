import { useChromeSettings } from '../../hooks/useChromeSetting'

export interface FileViewerSettings {
  fontSize: number
  fontFamily: string
  maxDepth: number
}

const DEFAULT_SETTINGS = {
  fileViewerFontSize: 16,
  fileViewerFontFamily: 'JetBrains Mono',
  fileTreeMaxDepth: 5,
}

export function useFileViewerSettings() {
  const { values, setters, isLoaded } = useChromeSettings(DEFAULT_SETTINGS)

  // Map internal storage keys to external settings interface
  const settings: FileViewerSettings = {
    fontSize: values.fileViewerFontSize,
    fontFamily: values.fileViewerFontFamily,
    maxDepth: values.fileTreeMaxDepth,
  }

  return {
    settings,
    loaded: isLoaded,
    setFontSize: setters.fileViewerFontSize,
    setFontFamily: setters.fileViewerFontFamily,
  }
}
