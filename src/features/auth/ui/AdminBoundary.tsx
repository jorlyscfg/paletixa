import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState, useMemo } from 'react'
import { clearAppQueryCache, useAppQueryCache } from '../../../app/queryCache'
import { AdminSessionPersistenceProvider, clearAdminSessionState } from '../../../app/sessionPersistence'
import { ResponsiveActionButton } from '../../../app/components/ResponsiveActionButton'
import { Icon } from '../../../app/components/icons'
import { ADMIN_LOGIN_PATH } from '../../../app/publicRoutes'
import { getAccessContext, mapSignInError, signIn, signOut, type AccessContext, validateLoginIdentifier } from '../api/adminAccess'

type Access = { state: 'loading' | 'denied' | 'error' } | { state: 'allowed'; context: AccessContext }
type LoginField = 'identifier' | 'password'
type LoginFieldErrors = Partial<Record<LoginField, string>>
type SignOutHandler = () => Promise<void>

function AdminContent({ render, closeSession, context }: { render: (closeSession: SignOutHandler, context: AccessContext) => ReactNode; closeSession: SignOutHandler; context: AccessContext }) {
  return <>{render(closeSession, context)}</>
}

function CashierContent({ render, context, closeSession }: { render: (context: AccessContext, closeSession: SignOutHandler) => ReactNode; context: AccessContext; closeSession: SignOutHandler }) {
  return <>{render(context, closeSession)}</>
}

export const AUTH_REFRESH_INTERVAL_MS = 10 * 60 * 1000

export function AdminBoundary({ children, admin, cashier, showLogin = true, onSessionClosed }: { children: ReactNode; admin?: (closeSession: SignOutHandler, context: AccessContext) => ReactNode; cashier?: (context: AccessContext, closeSession: SignOutHandler) => ReactNode; showLogin?: boolean; onSessionClosed?: () => void }) {
  const [access, setAccess] = useState<Access>({ state: 'loading' })
  const [signingIn, setSigningIn] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<LoginFieldErrors>({})
  const [loginErrorSequence, setLoginErrorSequence] = useState(0)
  const sequence = useRef(0)
  const checkInFlight = useRef<Promise<void> | null>(null)
  const signingInRef = useRef(false)
  const alert = useRef<HTMLDivElement>(null)
  const appQueryCache = useAppQueryCache()
  const clearSessionState = useCallback(async (context: AccessContext | null) => {
    await clearAppQueryCache(appQueryCache)
    if (context) clearAdminSessionState({ userId: context.userId, branchId: context.branch?.id ?? null })
  }, [appQueryCache])
  const check = useCallback((showLoading = true, previousContext: AccessContext | null = null) => {
    if (checkInFlight.current) return checkInFlight.current

    const current = ++sequence.current
    if (showLoading) setAccess({ state: 'loading' })
    const request = (async () => {
      try {
        const context = await getAccessContext()
        if (current !== sequence.current) return
        if (context) {
          if (showLoading) setAccess({ state: 'allowed', context })
          else setAccess((currentAccess) => currentAccess.state === 'allowed' ? { state: 'allowed', context } : currentAccess)
          return
        }

        if (previousContext) {
          try {
            await clearSessionState(previousContext)
          } catch {
            // Revoked access must still return to login if local cleanup is unavailable.
          }
        }
        setAccess({ state: 'denied' })
      } catch {
        if (current === sequence.current && showLoading) setAccess({ state: 'error' })
      }
    })()
    checkInFlight.current = request
    void request.then(() => {
      if (checkInFlight.current === request) checkInFlight.current = null
    })
    return request
  }, [clearSessionState])
  const accessContext = access.state === 'allowed' ? access.context : null
  const closeSession = useCallback(async () => {
    sequence.current += 1
    try {
      await signOut()
    } catch {
      console.error('Admin sign-out failed; local session was closed.')
    } finally {
      try {
        await clearSessionState(accessContext)
      } catch {
        console.error('Admin session cleanup failed during sign-out.')
      }
      setAccess({ state: 'denied' })
      onSessionClosed?.()
    }
  }, [accessContext, clearSessionState, onSessionClosed])
  useEffect(() => { queueMicrotask(() => { void check() }) }, [check])
  useEffect(() => {
    if (access.state !== 'allowed') return

    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void check(false, accessContext)
    }
    const interval = window.setInterval(refreshIfVisible, AUTH_REFRESH_INTERVAL_MS)
    document.addEventListener('visibilitychange', refreshIfVisible)
    window.addEventListener('focus', refreshIfVisible)
    return () => {
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange', refreshIfVisible)
      window.removeEventListener('focus', refreshIfVisible)
    }
  }, [access.state, accessContext, check])
  useEffect(() => {
    if (access.state === 'error' || loginError !== null) alert.current?.focus()
  }, [access.state, loginError, loginErrorSequence])

  function clearLoginErrors() {
    setLoginError(null)
    setFieldErrors({})
  }

  function showLoginError(message: string) {
    setLoginError(message)
    setLoginErrorSequence((current) => current + 1)
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (signingIn || signingInRef.current) return
    clearLoginErrors()
    const form = new FormData(event.currentTarget)
    const identifier = String(form.get('identifier') ?? '')
    const password = String(form.get('password') ?? '')
    const nextFieldErrors: LoginFieldErrors = {}
    const identifierError = validateLoginIdentifier(identifier)
    if (identifierError) nextFieldErrors.identifier = identifierError
    if (password.length === 0) nextFieldErrors.password = 'Ingresa tu contraseña.'
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors)
      showLoginError('Revisa los campos marcados antes de continuar.')
      return
    }

    setSigningIn(true)
    signingInRef.current = true
    try { await signIn(identifier.trim(), password); await check() }
    catch (error) {
      setAccess({ state: 'denied' })
      showLoginError(mapSignInError(error))
    }
    finally {
      signingInRef.current = false
      setSigningIn(false)
    }
  }

  const allowedContent = useMemo(() => {
    if (access.state !== 'allowed') return null
    if (access.context.role === 'admin') return admin ? <AdminContent render={admin} closeSession={closeSession} context={access.context} /> : children
    return cashier ? <CashierContent render={cashier} context={access.context} closeSession={closeSession} /> : null
  }, [access, admin, cashier, children, closeSession])

  if (access.state === 'allowed') return <AdminSessionPersistenceProvider scope={{ userId: access.context.userId, branchId: access.context.branch?.id ?? null }}>{allowedContent}</AdminSessionPersistenceProvider>
  if (access.state === 'loading') return <main className="grid min-h-dvh place-items-center bg-slate-950 px-4 text-slate-100"><p role="status" className="text-sm font-medium text-slate-300">Verificando acceso…</p></main>
  if (access.state === 'error') return <main className="grid min-h-dvh place-items-center bg-slate-950 px-4 text-slate-100"><div ref={alert} tabIndex={-1} role="alert" className="w-full max-w-md rounded-3xl border border-rose-500/30 bg-slate-900 p-6 shadow-xl"><p className="text-sm font-semibold text-rose-200">No se pudo verificar el acceso.</p><ResponsiveActionButton type="button" label="Reintentar" icon="refresh" className="mt-4" onClick={() => void check()} /></div></main>
  if (!showLogin) return <main className="grid min-h-dvh place-items-center bg-slate-950 px-4 text-slate-100"><section aria-label="Acceso administrativo" className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 text-center shadow-xl"><span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-500/30 bg-sky-500/10 text-sky-300"><Icon name="lock" className="h-6 w-6" /></span><h1 className="mt-5 text-xl font-black text-white">Acceso administrativo</h1><p className="mt-3 text-sm leading-relaxed text-slate-300">Esta sección está protegida. Inicia sesión para continuar con la operación.</p><a href={ADMIN_LOGIN_PATH} className="ops-focus mt-6 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-sky-500"><Icon name="login" className="h-4 w-4" />Ir a iniciar sesión</a></section></main>
  return <main className="grid min-h-dvh place-items-center bg-slate-950 px-4 text-slate-100"><section aria-label="Inicio de sesión" className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-sky-400">Paletixa Operaciones</p>
    <p className="mt-3 text-sm leading-relaxed text-slate-300">Inicia sesión con el correo del administrador o el usuario asignado por la administración.</p>
    <form aria-label="Inicio de sesión" className="mt-8 grid gap-4" onSubmit={submit}>
      {loginError && <div ref={alert} id="login-error" tabIndex={-1} role="alert" className="rounded-2xl border border-rose-500/30 bg-rose-950/30 px-4 py-3 text-sm leading-relaxed text-rose-100">{loginError}</div>}
      <label htmlFor="identifier" className="grid gap-1.5 text-sm font-medium text-slate-200">Correo electrónico o usuario<input id="identifier" name="identifier" type="text" autoComplete="username" aria-invalid={Boolean(fieldErrors.identifier)} aria-describedby={fieldErrors.identifier ? 'identifier-error' : loginError ? 'login-error' : undefined} onChange={clearLoginErrors} className={`ops-control ops-focus min-h-11 px-3 ${fieldErrors.identifier ? 'border-rose-400/70' : ''}`} />{fieldErrors.identifier && <span id="identifier-error" className="text-xs font-medium text-rose-200">{fieldErrors.identifier}</span>}</label>
      <label htmlFor="password" className="grid gap-1.5 text-sm font-medium text-slate-200">Contraseña<input id="password" name="password" type="password" autoComplete="current-password" aria-invalid={Boolean(fieldErrors.password)} aria-describedby={fieldErrors.password ? 'password-error' : loginError ? 'login-error' : undefined} onChange={clearLoginErrors} className={`ops-control ops-focus min-h-11 px-3 ${fieldErrors.password ? 'border-rose-400/70' : ''}`} />{fieldErrors.password && <span id="password-error" className="text-xs font-medium text-rose-200">{fieldErrors.password}</span>}</label>
      <ResponsiveActionButton type="submit" label={signingIn ? 'Iniciando sesión…' : 'Iniciar sesión'} icon="login" loading={signingIn} loadingLabel="Iniciando sesión…" />
    </form>
  </section></main>
}
