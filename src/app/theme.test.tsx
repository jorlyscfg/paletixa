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

  it('exposes an accessible 44px-compatible toggle and persists changes', () => {
    render(<ThemeProvider><ThemeToggle /></ThemeProvider>)

    const toggle = screen.getByRole('button', { name: 'Cambiar a modo claro' })
    expect(toggle).toHaveAttribute('title', 'Cambiar a modo claro')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    expect(toggle).toHaveClass('ops-icon-button')
    expect(toggle.querySelector('[data-icon="sun"]')).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Tema visual' })).toHaveValue('brand')

    fireEvent.click(toggle)

    expect(screen.getByRole('button', { name: 'Cambiar a modo oscuro' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Cambiar a modo oscuro' }).querySelector('[data-icon="moon"]')).toBeInTheDocument()
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })

  it('applies and persists the brand theme from the selector', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'light')
    render(<ThemeProvider><ThemeProbe /><ThemeToggle /></ThemeProvider>)

    fireEvent.change(screen.getByRole('combobox', { name: 'Tema visual' }), { target: { value: 'brand' } })

    expect(screen.getByText('brand')).toBeInTheDocument()
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('brand')
    expect(document.documentElement).toHaveAttribute('data-theme', 'brand')
    expect(document.documentElement.style.colorScheme).toBe('light')
  })

  it('lets users select light, dark, and brand through the accessible selector', () => {
    render(<ThemeProvider><ThemeProbe /><ThemeToggle /></ThemeProvider>)
    const selector = screen.getByRole('combobox', { name: 'Tema visual' })

    for (const selectedTheme of ['light', 'dark', 'brand']) {
      fireEvent.change(selector, { target: { value: selectedTheme } })
      expect(selector).toHaveValue(selectedTheme)
      expect(screen.getByText(selectedTheme)).toBeInTheDocument()
      expect(document.documentElement).toHaveAttribute('data-theme', selectedTheme)
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe(selectedTheme)
    }
  })
})
