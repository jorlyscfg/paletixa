import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { createBranch, listBranches, setBranchStatus, type Branch } from '../api/branches'

type Failed = { kind: 'create'; name: string; requestId: string } | { kind: 'status'; branch: Branch; status: Branch['status']; requestId: string }

export function BranchWorkspace() {
  const [branches, setBranches] = useState<Branch[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [failed, setFailed] = useState<Failed | null>(null)
  const [notice, setNotice] = useState('')
  const [mutating, setMutating] = useState(false)
  const mutation = useRef(false)
  const readSequence = useRef(0)
  const alert = useRef<HTMLDivElement>(null)
  const load = useCallback(async () => {
    if (mutation.current) return
    const current = ++readSequence.current
    setState('loading')
    try { const next = await listBranches(); if (current === readSequence.current) { setBranches(next); setState('ready') } }
    catch { if (current === readSequence.current) setState('error') }
  }, [])
  useEffect(() => { queueMicrotask(() => void load()) }, [load])
  useEffect(() => { if (state === 'error' || failed) alert.current?.focus() }, [state, failed])

  function merge(next: Branch) { setBranches((items) => [...items.filter(({ id }) => id !== next.id), next].sort((a, b) => a.name.localeCompare(b.name))) }
  async function run(action: Failed) {
    if (mutation.current) return
    mutation.current = true; setMutating(true); ++readSequence.current
    setFailed(null); setNotice('')
    try {
      const result = action.kind === 'create'
        ? await createBranch(action.name, action.requestId)
        : await setBranchStatus(action.branch.id, action.status, action.requestId)
      merge(result); setState('ready')
      setNotice(action.kind === 'create' ? 'Sucursal creada.' : 'Estado de la sucursal actualizado.')
    } catch { setState('ready'); setFailed(action) }
    finally { mutation.current = false; setMutating(false) }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const name = String(new FormData(form).get('name')).trim()
    void run({ kind: 'create', name, requestId: crypto.randomUUID() }).then(() => form.reset())
  }

  return <section aria-labelledby="branches-title" className="w-full max-w-4xl">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-medium text-sky-400">Administración</p><h1 id="branches-title" className="mt-1 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Sucursales</h1></div><button type="button" disabled={mutating} className="ops-action ops-focus border border-slate-700 bg-slate-900 px-4 font-medium text-slate-200 hover:bg-slate-800" onClick={load}>Actualizar sucursales</button></div>
    <form aria-label="Crear sucursal" className="mt-8 flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-xl sm:flex-row sm:items-end" onSubmit={submit}>
      <label className="grid flex-1 gap-1.5 text-sm font-medium text-slate-200">Nombre de la sucursal<input required maxLength={120} name="name" className="ops-control ops-focus min-h-11 px-3" /></label>
      <button disabled={mutating} className="ops-action ops-focus min-h-11 bg-sky-600 px-5 font-medium text-white hover:bg-sky-500 disabled:opacity-60">Crear sucursal</button>
    </form>
    <p aria-live="polite" className="mt-4 min-h-5 text-sm font-medium text-emerald-300">{notice}</p>
    {failed && <div ref={alert} tabIndex={-1} role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100"><p>{failed.kind === 'create' ? 'No se pudo crear la sucursal.' : 'No se pudo cambiar el estado de la sucursal.'}</p><button className="ops-action ops-focus mt-3 bg-rose-800 px-4 font-medium text-white hover:bg-rose-700" onClick={() => run(failed)}>Reintentar {failed.kind === 'create' ? 'creación' : 'cambio de estado'}</button></div>}
    {state === 'loading' && <p role="status" className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-sm text-slate-300">Cargando sucursales…</p>}
    {state === 'error' && <div ref={alert} tabIndex={-1} role="alert" className="mt-8 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100"><p>No se pudieron cargar las sucursales.</p><button className="ops-action ops-focus mt-3 bg-rose-800 px-4 font-medium text-white hover:bg-rose-700" onClick={load}>Reintentar</button></div>}
    {state === 'ready' && branches.length === 0 && <p className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6 text-slate-300 shadow-xl">Aún no hay sucursales.</p>}
    {state === 'ready' && branches.length > 0 && <ul className="mt-6 divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-900 px-4 shadow-xl">{branches.map((branch) => { const next = branch.status === 'active' ? 'suspended' : 'active'; return <li key={branch.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold text-white">{branch.name}</h2><p className="mt-1 text-sm text-slate-400">{branch.status === 'active' ? 'Activa' : 'Suspendida'}</p></div><button type="button" disabled={mutating} className="ops-action ops-focus border border-slate-700 bg-slate-950 px-4 font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-60" aria-label={`${next === 'active' ? 'Activar' : 'Suspender'} ${branch.name}`} onClick={() => run({ kind: 'status', branch, status: next, requestId: crypto.randomUUID() })}>{next === 'active' ? 'Activar' : 'Suspender'}</button></li> })}</ul>}
  </section>
}
