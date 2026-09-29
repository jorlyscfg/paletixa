import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { applyTheme, getInitialTheme, getNextTheme, persistTheme, ThemeContext, type Theme } from './theme'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme)
  const themeRef = useRef(theme)

  const setTheme = useCallback((nextTheme: Theme) => {
    themeRef.current = nextTheme
    setThemeState(nextTheme)
    applyTheme(nextTheme)
    persistTheme(nextTheme)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme(getNextTheme(themeRef.current))
  }, [setTheme])

  useLayoutEffect(() => {
    themeRef.current = theme
    applyTheme(theme)
  }, [theme])

  return <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>{children}</ThemeContext.Provider>
}
