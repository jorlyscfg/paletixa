export const THEME_STORAGE_KEY = 'paletixa:theme'

export type Theme = 'dark' | 'light' | 'brand'

export const DEFAULT_THEME: Theme = 'brand'
export const THEME_OPTIONS = [
  { value: 'brand', label: 'Marca' },
  { value: 'light', label: 'Claro' },
  { value: 'dark', label: 'Oscuro' },
] as const satisfies ReadonlyArray<{ value: Theme; label: string }>

export function getNextTheme(theme: Theme): Theme {
  const currentIndex = THEME_OPTIONS.findIndex((option) => option.value === theme)
  return THEME_OPTIONS[(currentIndex + 1) % THEME_OPTIONS.length].value
}

type ThemeStorage = Pick<Storage, 'getItem' | 'setItem'>

export type ThemeContextValue = {
  theme: Theme
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function isTheme(value: unknown): value is Theme {
  return value === 'dark' || value === 'light' || value === 'brand'
}

export function readStoredTheme(storage: Pick<Storage, 'getItem'> | null | undefined = getLocalStorage()) {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY)
    return isTheme(value) ? value : null
  } catch {
    return null
  }
}

export function persistTheme(theme: Theme, storage: Pick<Storage, 'setItem'> | null | undefined = getLocalStorage()) {
  try {
    storage?.setItem(THEME_STORAGE_KEY, theme)
  } catch {
    // Theme persistence is an enhancement and must never block rendering.
  }
}

export function getInitialTheme() {
  const storedTheme = readStoredTheme()
  if (storedTheme) return storedTheme

  if (typeof document !== 'undefined') {
    const rootTheme = document.documentElement.dataset.theme
    if (isTheme(rootTheme)) return rootTheme
  }

  return DEFAULT_THEME
}

export function applyTheme(theme: Theme) {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.theme = theme
  document.documentElement.style.colorScheme = theme === 'dark' ? 'dark' : 'light'
}

function getLocalStorage(): ThemeStorage | undefined {
  try {
    return globalThis.localStorage
  } catch {
    return undefined
  }
}
import { createContext } from 'react'
