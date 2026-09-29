import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeProvider } from './ThemeProvider'
import { ThemeToggle } from './components/ThemeToggle'
import { DEFAULT_THEME, THEME_STORAGE_KEY, getInitialTheme, persistTheme, readStoredTheme } from './theme'
import { useTheme } from './useTheme'

function ThemeProbe() {
  const { theme } = useTheme()
  return <output>{theme}</output>
}

describe('app theme', () => {
  beforeEach(() => {
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.style.colorScheme = ''
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
    window.localStorage.clear()
    document.documentElement.removeAttribute('data-theme')
    document.documentElement.style.colorScheme = ''
  })

  it('uses the brand theme as the synchronous fallback for absent or invalid storage', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia')

    expect(DEFAULT_THEME).toBe('brand')
    expect(getInitialTheme()).toBe('brand')
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>)

    expect(screen.getByText('brand')).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('data-theme', 'brand')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('hydrates the stored brand theme on the root before the app renders', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'brand')
    render(<ThemeProvider><ThemeProbe /></ThemeProvider>)

    expect(screen.getByText('brand')).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('data-theme', 'brand')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('keeps rendering when theme storage is unavailable', () => {
    const storage = {
      getItem: vi.fn(() => { throw new Error('storage unavailable') }),
      setItem: vi.fn(() => { throw new Error('storage unavailable') }),
    }

    expect(readStoredTheme(storage)).toBeNull()
    expect(() => persistTheme('light', storage)).not.toThrow()
    expect(() => render(<ThemeProvider><ThemeProbe /></ThemeProvider>)).not.toThrow()
    expect(screen.getByText('brand')).toBeInTheDocument()
  })

  it('exposes an accessible 44px-compatible theme cycle button', () => {
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>)

    const toggle = screen.getByRole('button', { name: 'Cambiar al tema claro' })
    expect(toggle).toHaveAttribute('title', 'Cambiar al tema claro')
    expect(toggle).not.toHaveAttribute('aria-pressed')
    expect(toggle).toHaveClass('ops-icon-button')
    expect(toggle.querySelector('[data-icon="sun"]')).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument()

    fireEvent.click(toggle)

    expect(screen.getByRole('button', { name: 'Cambiar al tema oscuro' }).querySelector('[data-icon="moon"]')).toBeInTheDocument()
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })

  it('cycles through brand, light, and dark themes with the accessible button', () => {
    render(<ThemeProvider><ThemeProbe /><ThemeToggle /></ThemeProvider>)
    const transitions = [
      { theme: 'brand', nextTheme: 'light', nextLabel: 'Cambiar al tema claro', icon: 'sun' },
      { theme: 'light', nextTheme: 'dark', nextLabel: 'Cambiar al tema oscuro', icon: 'moon' },
      { theme: 'dark', nextTheme: 'brand', nextLabel: 'Cambiar al tema de marca', icon: 'refresh' },
    ] as const

    for (const transition of transitions) {
      const button = screen.getByRole('button', { name: transition.nextLabel })
      expect(screen.getByText(transition.theme)).toBeInTheDocument()
      expect(button).toHaveAttribute('title', transition.nextLabel)
      expect(button.querySelector(`[data-icon="${transition.icon}"]`)).toBeInTheDocument()
      fireEvent.click(button)
      expect(screen.getByText(transition.nextTheme)).toBeInTheDocument()
      expect(document.documentElement).toHaveAttribute('data-theme', transition.nextTheme)
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(transition.nextTheme)
    }
  })

  it('cycles and persists themes when the toggle is rendered without a provider', () => {
    const view = render(<ThemeToggle />)

    for (const transition of [
      { nextTheme: 'light', label: 'Cambiar al tema claro' },
      { nextTheme: 'dark', label: 'Cambiar al tema oscuro' },
      { nextTheme: 'brand', label: 'Cambiar al tema de marca' },
    ] as const) {
      fireEvent.click(screen.getByRole('button', { name: transition.label }))
      expect(document.documentElement).toHaveAttribute('data-theme', transition.nextTheme)
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(transition.nextTheme)
    }

    view.unmount()
    render(<ThemeToggle />)
    expect(screen.getByRole('button', { name: 'Cambiar al tema claro' })).toBeInTheDocument()
    expect(document.documentElement).toHaveAttribute('data-theme', 'brand')
  })
})
