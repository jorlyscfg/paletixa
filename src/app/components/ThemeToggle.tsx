import { useId, useLayoutEffect, useState, type ChangeEvent } from 'react'
import { applyTheme, getInitialTheme, isTheme, persistTheme, THEME_OPTIONS } from '../theme'
import { useOptionalTheme } from '../useTheme'
import { Icon } from './icons'

export function ThemeToggle({ className = '' }: { className?: string }) {
  const appTheme = useOptionalTheme()
  const [standaloneTheme, setStandaloneTheme] = useState(getInitialTheme)
  const theme = appTheme?.theme ?? standaloneTheme
  const nextTheme = theme === 'light' ? 'dark' : 'light'
  const label = nextTheme === 'light' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'

  useLayoutEffect(() => {
    if (!appTheme) applyTheme(standaloneTheme)
  }, [appTheme, standaloneTheme])

  function toggle() {
    if (appTheme) {
      appTheme.toggleTheme()
      return
    }
    const nextStandaloneTheme = standaloneTheme === 'light' ? 'dark' : 'light'
    setStandaloneTheme(nextStandaloneTheme)
    applyTheme(nextStandaloneTheme)
    persistTheme(nextStandaloneTheme)
  }

  function selectTheme(event: ChangeEvent<HTMLSelectElement>) {
    const nextSelectedTheme = event.currentTarget.value
    if (!isTheme(nextSelectedTheme)) return
    if (appTheme) {
      appTheme.setTheme(nextSelectedTheme)
      return
    }
    setStandaloneTheme(nextSelectedTheme)
    applyTheme(nextSelectedTheme)
    persistTheme(nextSelectedTheme)
  }

  const selectorId = useId()

  return <div className="flex shrink-0 items-center gap-1.5">
    <button
      type="button"
      data-theme-toggle="true"
      aria-label={label}
      title={label}
      aria-pressed={theme === 'light'}
      onClick={toggle}
      className={`ops-icon-button ops-focus shrink-0 ${className}`}
    >
      <Icon name={nextTheme === 'light' ? 'sun' : 'moon'} className="h-5 w-5" />
    </button>
    <label htmlFor={selectorId} className="sr-only">Tema visual</label>
    <select
      id={selectorId}
      data-theme-selector="true"
      aria-label="Tema visual"
      title="Seleccionar tema visual"
      value={theme}
      onChange={selectTheme}
      className="ops-theme-select ops-focus shrink-0"
    >
      {THEME_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  </div>
}
