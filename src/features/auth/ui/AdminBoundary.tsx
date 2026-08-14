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
  if (access === 'loading') return <p role="status" className="text-slate-700">Checking access…</p>
  if (access === 'error') return <div ref={alert} tabIndex={-1} role="alert"><p>Access could not be checked.</p><button className="mt-4 min-h-11 rounded-xl bg-slate-950 px-5 text-white" onClick={check}>Try again</button></div>
  return <section aria-labelledby="access-title" className="max-w-md">
    <h1 id="access-title" className="text-3xl font-semibold tracking-tight">Access unavailable</h1>
    <p className="mt-3 text-slate-700">Sign in with an eligible administrator account.</p>
    <form aria-label="Administrator sign in" className="mt-8 grid gap-4" onSubmit={submit}>
      <label className="grid gap-1.5 font-medium">Email<input required name="email" type="email" autoComplete="username" className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 focus:outline-none focus:ring-2 focus:ring-sky-600" /></label>
      <label className="grid gap-1.5 font-medium">Password<input required name="password" type="password" autoComplete="current-password" className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 focus:outline-none focus:ring-2 focus:ring-sky-600" /></label>
      <button disabled={signingIn} className="min-h-11 rounded-xl bg-slate-950 px-5 font-medium text-white disabled:opacity-60">{signingIn ? 'Signing in…' : 'Sign in'}</button>
    </form>
  </section>
}
