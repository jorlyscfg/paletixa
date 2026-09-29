import { useLayoutEffect, useState } from 'react'
import { applyTheme, getInitialTheme, getNextTheme, persistTheme, type Theme } from '../theme'
import { useOptionalTheme } from '../useTheme'
import { Icon } from './icons'

const themeActionLabels: Record<Theme, string> = {
  brand: 'Cambiar al tema de marca',
  light: 'Cambiar al tema claro',
  dark: 'Cambiar al tema oscuro',
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const appTheme = useOptionalTheme()
  const [standaloneTheme, setStandaloneTheme] = useState(getInitialTheme)
  const theme = appTheme?.theme ?? standaloneTheme
  const nextTheme = getNextTheme(theme)
  const label = themeActionLabels[nextTheme]

  useLayoutEffect(() => {
    if (!appTheme) applyTheme(standaloneTheme)
  }, [appTheme, standaloneTheme])

  function toggle() {
    if (appTheme) {
      appTheme.toggleTheme()
      return
    }
    const nextStandaloneTheme = getNextTheme(standaloneTheme)
    setStandaloneTheme(nextStandaloneTheme)
    applyTheme(nextStandaloneTheme)
    persistTheme(nextStandaloneTheme)
  }

  return <button
      type="button"
      data-theme-toggle="true"
      aria-label={label}
      title={label}
      onClick={toggle}
      className={`ops-icon-button ops-focus shrink-0 ${className}`}
    >
      <Icon name={nextTheme === 'light' ? 'sun' : nextTheme === 'dark' ? 'moon' : 'refresh'} className="h-5 w-5" />
    </button>
}
