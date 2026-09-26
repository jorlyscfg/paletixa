import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useQuery } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppProviders } from '../../../app/AppProviders'
import { POS_CATALOG_CACHE_KEY } from '../../../app/queryCache'
import { POS_CATALOG_QUERY_KEY } from '../../sales/api/posCatalog'
import * as authApi from '../api/adminAccess'
import { AdminBoundary, AUTH_REFRESH_INTERVAL_MS } from './AdminBoundary'

vi.mock('../api/adminAccess', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api/adminAccess')>()
  return { ...actual, getAccessContext: vi.fn(), signIn: vi.fn(), signOut: vi.fn() }
})

describe('admin boundary', () => {
  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    sessionStorage.clear()
  })
  beforeEach(() => {
    vi.resetAllMocks()
    vi.mocked(authApi.getAccessContext).mockResolvedValue(null)
  })

  it('keeps the sign-in action accessible with a login icon', async () => {
    render(<AdminBoundary><p>Contenido protegido</p></AdminBoundary>)

    expect(await screen.findByRole('form', { name: 'Inicio de sesión' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Acceso no disponible' })).not.toBeInTheDocument()
    const signInButton = screen.getByRole('button', { name: 'Iniciar sesión' })
    expect(signInButton.querySelector('[data-icon="login"]')).toBeInTheDocument()
    expect(signInButton).toHaveAttribute('title', 'Iniciar sesión')
    expect(signInButton).toHaveClass('ops-action', 'ops-icon-button', 'h-11', 'w-11')
  })

  it('deduplicates StrictMode startup access checks', async () => {
    render(<StrictMode><AdminBoundary><p>Contenido protegido</p></AdminBoundary></StrictMode>)

    expect(await screen.findByRole('form', { name: 'Inicio de sesión' })).toBeInTheDocument()
    expect(authApi.getAccessContext).toHaveBeenCalledOnce()
  })

  it('refreshes access on the interval without replacing the visible app', async () => {
    vi.useFakeTimers()
    vi.mocked(authApi.getAccessContext).mockResolvedValue({ role: 'admin', userId: 'admin-1', displayName: 'Admin', capabilities: [], branch: null })
    render(<AdminBoundary><p>Contenido protegido</p></AdminBoundary>)

    await act(async () => { await Promise.resolve() })
    expect(screen.getByText('Contenido protegido')).toBeInTheDocument()
    await act(async () => {
      vi.advanceTimersByTime(AUTH_REFRESH_INTERVAL_MS)
      await Promise.resolve()
    })

    expect(authApi.getAccessContext).toHaveBeenCalledTimes(2)
    expect(screen.getByText('Contenido protegido')).toBeInTheDocument()
    expect(screen.queryByText('Verificando acceso…')).not.toBeInTheDocument()
  })

  it('refreshes access when a visible tab regains focus', async () => {
    vi.useFakeTimers()
    vi.mocked(authApi.getAccessContext).mockResolvedValue({ role: 'cashier', userId: 'employee-1', displayName: 'Ana López', capabilities: ['pos.use'], branch: { id: 'branch-1', name: 'Central' } })
    render(<AdminBoundary cashier={(context) => <p>POS de {context.branch?.name}</p>}><p>Navegación administrativa</p></AdminBoundary>)

    await act(async () => { await Promise.resolve() })
    expect(screen.getByText('POS de Central')).toBeInTheDocument()
    await act(async () => {
      window.dispatchEvent(new Event('focus'))
      await Promise.resolve()
    })

    expect(authApi.getAccessContext).toHaveBeenCalledTimes(2)
    expect(screen.getByText('POS de Central')).toBeInTheDocument()
  })

  it('returns to login on silent unauthorized refresh without showing a loading screen', async () => {
    vi.useFakeTimers()
    let resolveRefresh!: (context: authApi.AccessContext | null) => void
    vi.mocked(authApi.getAccessContext)
      .mockResolvedValueOnce({ role: 'admin', userId: 'admin-1', displayName: 'Admin', capabilities: [], branch: null })
      .mockReturnValueOnce(new Promise((resolve) => { resolveRefresh = resolve }))
    render(<AdminBoundary><p>Contenido protegido</p></AdminBoundary>)

    await act(async () => { await Promise.resolve() })
    expect(screen.getByText('Contenido protegido')).toBeInTheDocument()
    await act(async () => {
      vi.advanceTimersByTime(AUTH_REFRESH_INTERVAL_MS)
      await Promise.resolve()
    })
    expect(screen.getByText('Contenido protegido')).toBeInTheDocument()
    expect(screen.queryByText('Verificando acceso…')).not.toBeInTheDocument()

    await act(async () => {
      resolveRefresh(null)
      await Promise.resolve()
    })
    expect(screen.getByRole('form', { name: 'Inicio de sesión' })).toBeInTheDocument()
    expect(screen.queryByText('Contenido protegido')).not.toBeInTheDocument()
  })

  it('renders the cashier branch without the administrator shell', async () => {
    vi.mocked(authApi.getAccessContext).mockResolvedValue({
      role: 'cashier',
      userId: 'employee-1',
      displayName: 'Ana López',
      capabilities: ['pos.use'],
      branch: { id: 'branch-1', name: 'Central' },
    })
    render(<AdminBoundary cashier={(context) => <p>POS de {context.branch?.name}</p>}><p>Navegación administrativa</p></AdminBoundary>)

    expect(await screen.findByText('POS de Central')).toBeInTheDocument()
    expect(screen.queryByText('Navegación administrativa')).not.toBeInTheDocument()
  })

  it('provides the session-close callback to administrator content', async () => {
    vi.mocked(authApi.getAccessContext).mockResolvedValue({ role: 'admin', userId: 'admin-1', displayName: 'Admin', capabilities: [], branch: null })
    vi.mocked(authApi.signOut).mockResolvedValue(undefined)
    render(<AdminBoundary admin={(closeSession) => <button type="button" onClick={() => void closeSession()}>Cerrar sesión</button>}><p>Navegación administrativa</p></AdminBoundary>)

    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }))

    expect(authApi.signOut).toHaveBeenCalledOnce()
    expect(await screen.findByRole('form', { name: 'Inicio de sesión' })).toBeInTheDocument()
    expect(screen.queryByText('Navegación administrativa')).not.toBeInTheDocument()
  })

  it('returns a cashier to login after explicitly closing the session', async () => {
    vi.mocked(authApi.getAccessContext).mockResolvedValue({
      role: 'cashier',
      userId: 'employee-1',
      displayName: 'Ana López',
      capabilities: ['pos.use'],
      branch: { id: 'branch-1', name: 'Central' },
    })
    vi.mocked(authApi.signOut).mockResolvedValue(undefined)
    render(<AdminBoundary cashier={(_, closeSession) => <button type="button" onClick={() => void closeSession()}>Cerrar sesión</button>}><p>Navegación administrativa</p></AdminBoundary>)

    fireEvent.click(await screen.findByRole('button', { name: 'Cerrar sesión' }))

    expect(authApi.signOut).toHaveBeenCalledOnce()
    expect(await screen.findByRole('form', { name: 'Inicio de sesión' })).toBeInTheDocument()
  })

  it('clears the persisted POS catalog when a cashier closes the session', async () => {
    vi.mocked(authApi.getAccessContext).mockResolvedValue({
      role: 'cashier',
      userId: 'employee-1',
      displayName: 'Ana López',
      capabilities: ['pos.use'],
      branch: { id: 'branch-1', name: 'Central' },
    })
    vi.mocked(authApi.signOut).mockResolvedValue(undefined)

    function SeedCatalogCache() {
      useQuery({ queryKey: POS_CATALOG_QUERY_KEY, queryFn: async () => [{ id: 'product-1' }] })
      return null
    }

    render(<AppProviders><SeedCatalogCache /><AdminBoundary cashier={(_, closeSession) => <button type="button" onClick={() => void closeSession()}>Cerrar sesión</button>}><p>Navegación administrativa</p></AdminBoundary></AppProviders>)

    await screen.findByRole('button', { name: 'Cerrar sesión' })
    await waitFor(() => expect(sessionStorage.getItem(POS_CATALOG_CACHE_KEY)).not.toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }))

    expect(await screen.findByRole('form', { name: 'Inicio de sesión' })).toBeInTheDocument()
    expect(sessionStorage.getItem(POS_CATALOG_CACHE_KEY)).toBeNull()
  })

  it('clears the persisted POS catalog even when sign-out fails', async () => {
    vi.mocked(authApi.getAccessContext).mockResolvedValue({
      role: 'cashier',
      userId: 'employee-1',
      displayName: 'Ana López',
      capabilities: ['pos.use'],
      branch: { id: 'branch-1', name: 'Central' },
    })
    vi.mocked(authApi.signOut).mockRejectedValue(new Error('network'))

    function SeedCatalogCache() {
      useQuery({ queryKey: POS_CATALOG_QUERY_KEY, queryFn: async () => [{ id: 'product-1' }] })
      return null
    }

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    let closeSession: (() => Promise<void>) | null = null
    render(<AppProviders><SeedCatalogCache /><AdminBoundary cashier={(_, handler) => { closeSession = handler; return <button type="button">Cerrar sesión</button> }}><p>Navegación administrativa</p></AdminBoundary></AppProviders>)

    await screen.findByRole('button', { name: 'Cerrar sesión' })
    await waitFor(() => expect(sessionStorage.getItem(POS_CATALOG_CACHE_KEY)).not.toBeNull())
    expect(closeSession).not.toBeNull()
    await expect(closeSession!()).resolves.toBeUndefined()

    expect(sessionStorage.getItem(POS_CATALOG_CACHE_KEY)).toBeNull()
    expect(authApi.signOut).toHaveBeenCalledOnce()
    expect(await screen.findByRole('form', { name: 'Inicio de sesión' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Cerrar sesión' })).not.toBeInTheDocument()
    expect(consoleError).toHaveBeenCalledWith('Admin sign-out failed; local session was closed.')
    consoleError.mockRestore()
  })

  it('rejects empty credentials on the client without calling sign-in', async () => {
    render(<AdminBoundary><p>Contenido protegido</p></AdminBoundary>)

    const form = await screen.findByRole('form', { name: 'Inicio de sesión' })
    fireEvent.submit(form)

    const summary = await screen.findByRole('alert')
    expect(summary).toHaveTextContent('Revisa los campos marcados antes de continuar.')
    expect(summary).toHaveFocus()
    expect(screen.getByLabelText(/Correo electrónico o usuario/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText(/Correo electrónico o usuario/)).toHaveAttribute('aria-describedby', 'identifier-error')
    expect(screen.getByText('Ingresa tu correo electrónico o usuario.')).toBeInTheDocument()
    expect(screen.getByLabelText(/Contraseña/)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByText('Ingresa tu contraseña.')).toBeInTheDocument()
    expect(authApi.signIn).not.toHaveBeenCalled()
  })

  it('rejects an invalid employee identifier on the client without calling sign-in', async () => {
    render(<AdminBoundary><p>Contenido protegido</p></AdminBoundary>)

    const form = await screen.findByRole('form', { name: 'Inicio de sesión' })
    fireEvent.change(screen.getByLabelText('Correo electrónico o usuario'), { target: { value: 'ab' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secret' } })
    fireEvent.submit(form)

    expect(await screen.findByText(/Ingresa un correo válido o un usuario de empleado/)).toBeInTheDocument()
    expect(authApi.signIn).not.toHaveBeenCalled()
  })

  it('shows a safe actionable message when sign-in is rejected', async () => {
    vi.mocked(authApi.signIn).mockRejectedValue({ statusCode: 401, message: 'raw backend details' })
    render(<AdminBoundary><p>Contenido protegido</p></AdminBoundary>)

    const form = await screen.findByRole('form', { name: 'Inicio de sesión' })
    fireEvent.change(screen.getByLabelText('Correo electrónico o usuario'), { target: { value: 'admin@example.com' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secret' } })
    fireEvent.submit(form)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No se pudo iniciar sesión. Verifica tu usuario o correo, contraseña y que la cuenta esté verificada.')
    expect(alert).not.toHaveTextContent('raw backend details')
    expect(alert).toHaveFocus()
    expect(authApi.getAccessContext).toHaveBeenCalledTimes(1)
  })

  it('continues to the access check after a successful sign-in', async () => {
    vi.mocked(authApi.signIn).mockResolvedValue(undefined)
    vi.mocked(authApi.getAccessContext)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ role: 'admin', userId: 'admin-1', displayName: 'Admin', capabilities: [], branch: null })
    render(<AdminBoundary><p>Contenido protegido</p></AdminBoundary>)

    const form = await screen.findByRole('form', { name: 'Inicio de sesión' })
    fireEvent.change(screen.getByLabelText('Correo electrónico o usuario'), { target: { value: ' admin@example.com ' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secret' } })
    fireEvent.submit(form)

    expect(await screen.findByText('Contenido protegido')).toBeInTheDocument()
    expect(authApi.signIn).toHaveBeenCalledWith('admin@example.com', 'secret')
    expect(authApi.getAccessContext).toHaveBeenCalledTimes(2)
  })

  it('keeps the loading state and ignores duplicate submissions', async () => {
    let resolveSignIn!: () => void
    vi.mocked(authApi.signIn).mockReturnValue(new Promise<void>((resolve) => { resolveSignIn = resolve }))
    render(<AdminBoundary><p>Contenido protegido</p></AdminBoundary>)

    const form = await screen.findByRole('form', { name: 'Inicio de sesión' })
    fireEvent.change(screen.getByLabelText('Correo electrónico o usuario'), { target: { value: 'admin@example.com' } })
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'secret' } })
    fireEvent.submit(form)

    const signInButton = screen.getByRole('button', { name: 'Iniciando sesión…' })
    expect(signInButton).toBeDisabled()
    expect(signInButton).toHaveAttribute('aria-busy', 'true')
    fireEvent.submit(form)
    expect(authApi.signIn).toHaveBeenCalledTimes(1)

    resolveSignIn()
    await waitFor(() => expect(authApi.getAccessContext).toHaveBeenCalledTimes(2))
  })

  it('preserves the access verification error state and retry action', async () => {
    vi.mocked(authApi.getAccessContext).mockRejectedValue(new Error('temporary failure'))
    render(<AdminBoundary><p>Contenido protegido</p></AdminBoundary>)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('No se pudo verificar el acceso.')
    expect(alert).toHaveFocus()
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('keeps the login screen for an unauthenticated initial access check', async () => {
    render(<AdminBoundary><p>Contenido protegido</p></AdminBoundary>)

    expect(await screen.findByRole('form', { name: 'Inicio de sesión' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    await waitFor(() => expect(authApi.signIn).not.toHaveBeenCalled())
  })
})
