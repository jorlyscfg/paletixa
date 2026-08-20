import { type FormEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { getAdminAccess, signIn } from '../api/adminAccess'

type Access = 'loading' | 'allowed' | 'denied' | 'error'

export function AdminBoundary({ children }: { children: ReactNode }) {
  const [access, setAccess] = useState<Access>('loading')
  const [signingIn, setSigningIn] = useState(false)
  const sequence = useRef(0)
  const alert = useRef<HTMLDivElement>(null)
  const check = useCallback(async () => {
    const current = ++sequence.current
    setAccess('loading')
    try {
      const allowed = await getAdminAccess()
      if (current === sequence.current) setAccess(allowed ? 'allowed' : 'denied')
    } catch {
      if (current === sequence.current) setAccess('error')
    }
  }, [])
  useEffect(() => { queueMicrotask(() => void check()) }, [check])
  useEffect(() => { if (access === 'error') alert.current?.focus() }, [access])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setSigningIn(true)
    try { await signIn(String(form.get('email')), String(form.get('password'))); await check() }
    catch { setAccess('denied') }
    finally { setSigningIn(false) }
  }

  if (access === 'allowed') return children
  if (access === 'loading') return <main className="grid min-h-dvh place-items-center bg-slate-950 px-4 text-slate-100"><p role="status" className="text-sm font-medium text-slate-300">Verificando acceso…</p></main>
  if (access === 'error') return <main className="grid min-h-dvh place-items-center bg-slate-950 px-4 text-slate-100"><div ref={alert} tabIndex={-1} role="alert" className="w-full max-w-md rounded-3xl border border-rose-500/30 bg-slate-900 p-6 shadow-xl"><p className="text-sm font-semibold text-rose-200">No se pudo verificar el acceso.</p><button className="ops-action ops-focus mt-4 bg-slate-800 text-slate-100 hover:bg-slate-700" onClick={check}>Reintentar</button></div></main>
  return <main className="grid min-h-dvh place-items-center bg-slate-950 px-4 text-slate-100"><section aria-labelledby="access-title" className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
    <p className="text-[11px] font-black uppercase tracking-[0.16em] text-sky-400">Paletixa Operaciones</p>
    <h1 id="access-title" className="mt-2 text-3xl font-semibold tracking-tight text-white">Acceso no disponible</h1>
    <p className="mt-3 text-sm leading-relaxed text-slate-300">Inicia sesión con una cuenta de administrador autorizada.</p>
    <form aria-label="Inicio de sesión de administrador" className="mt-8 grid gap-4" onSubmit={submit}>
      <label className="grid gap-1.5 text-sm font-medium text-slate-200">Correo electrónico<input required name="email" type="email" autoComplete="username" className="ops-control ops-focus min-h-11 px-3" /></label>
      <label className="grid gap-1.5 text-sm font-medium text-slate-200">Contraseña<input required name="password" type="password" autoComplete="current-password" className="ops-control ops-focus min-h-11 px-3" /></label>
      <button disabled={signingIn} className="ops-action ops-focus min-h-11 bg-sky-600 px-5 font-medium text-white hover:bg-sky-500 disabled:opacity-60">{signingIn ? 'Iniciando sesión…' : 'Iniciar sesión'}</button>
    </form>
  </section></main>
}
