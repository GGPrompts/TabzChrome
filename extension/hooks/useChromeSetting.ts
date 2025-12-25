import { useState, useEffect, useCallback, useRef } from 'react'

/**
 * Hook to sync a value with Chrome storage
 * - Loads from Chrome storage on mount
 * - Listens for external storage changes
 * - Provides a setter that updates both state and storage
 *
 * @param key - The Chrome storage key
 * @param defaultValue - Default value if key doesn't exist
 * @returns [value, setValue, isLoaded] - Current value, setter function, and load status
 */
export function useChromeSetting<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void, boolean] {
  const [value, setValueInternal] = useState<T>(defaultValue)
  const [isLoaded, setIsLoaded] = useState(false)

  // Track if component is mounted to avoid state updates after unmount
  const isMountedRef = useRef(true)

  // Load initial value from Chrome storage
  useEffect(() => {
    isMountedRef.current = true

    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get([key], (result) => {
        if (!isMountedRef.current) return

        if (result[key] !== undefined) {
          setValueInternal(result[key] as T)
        }
        setIsLoaded(true)
      })
    } else {
      setIsLoaded(true)
    }

    return () => {
      isMountedRef.current = false
    }
  }, [key])

  // Listen for external storage changes
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (!isMountedRef.current) return

      if (changes[key]?.newValue !== undefined) {
        setValueInternal(changes[key].newValue as T)
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [key])

  // Setter that updates both state and Chrome storage
  const setValue = useCallback((newValue: T | ((prev: T) => T)) => {
    setValueInternal((prev) => {
      const resolved = typeof newValue === 'function'
        ? (newValue as (prev: T) => T)(prev)
        : newValue

      // Update Chrome storage
      if (typeof chrome !== 'undefined' && chrome.storage) {
        chrome.storage.local.set({ [key]: resolved })
      }

      return resolved
    })
  }, [key])

  return [value, setValue, isLoaded]
}

/**
 * Hook to sync multiple values with Chrome storage using a key map
 * - Loads all keys from Chrome storage on mount
 * - Listens for external storage changes
 * - Returns an object with values and a setter for each key
 *
 * @param keyDefaults - Object mapping storage keys to their default values
 * @returns { values, setters, isLoaded }
 */
export function useChromeSettings<T extends Record<string, unknown>>(
  keyDefaults: T
): {
  values: T
  setters: { [K in keyof T]: (value: T[K] | ((prev: T[K]) => T[K])) => void }
  isLoaded: boolean
} {
  const keys = Object.keys(keyDefaults)
  const [values, setValuesInternal] = useState<T>(keyDefaults)
  const [isLoaded, setIsLoaded] = useState(false)

  const isMountedRef = useRef(true)

  // Load initial values from Chrome storage
  useEffect(() => {
    isMountedRef.current = true

    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.local.get(keys, (result) => {
        if (!isMountedRef.current) return

        const loaded = { ...keyDefaults }
        for (const key of keys) {
          if (result[key] !== undefined) {
            (loaded as Record<string, unknown>)[key] = result[key]
          }
        }
        setValuesInternal(loaded)
        setIsLoaded(true)
      })
    } else {
      setIsLoaded(true)
    }

    return () => {
      isMountedRef.current = false
    }
  }, [keys.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // Listen for external storage changes
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage) return

    const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
      if (!isMountedRef.current) return

      let hasChanges = false
      const updates: Partial<T> = {}

      for (const key of keys) {
        if (changes[key]?.newValue !== undefined) {
          hasChanges = true
          updates[key as keyof T] = changes[key].newValue as T[keyof T]
        }
      }

      if (hasChanges) {
        setValuesInternal((prev) => ({ ...prev, ...updates }))
      }
    }

    chrome.storage.onChanged.addListener(handleStorageChange)
    return () => chrome.storage.onChanged.removeListener(handleStorageChange)
  }, [keys.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  // Create setters for each key
  const setters = {} as { [K in keyof T]: (value: T[K] | ((prev: T[K]) => T[K])) => void }

  for (const key of keys) {
    setters[key as keyof T] = (newValue: T[keyof T] | ((prev: T[keyof T]) => T[keyof T])) => {
      setValuesInternal((prev) => {
        const resolved = typeof newValue === 'function'
          ? (newValue as (prev: T[keyof T]) => T[keyof T])(prev[key as keyof T])
          : newValue

        // Update Chrome storage
        if (typeof chrome !== 'undefined' && chrome.storage) {
          chrome.storage.local.set({ [key]: resolved })
        }

        return { ...prev, [key]: resolved }
      })
    }
  }

  return { values, setters, isLoaded }
}
