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
      setNotice(action.kind === 'create' ? 'Branch created.' : 'Branch status updated.')
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
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-medium text-sky-700">Administration</p><h1 id="branches-title" className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Branches</h1></div><button disabled={mutating} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 font-medium focus:outline-none focus:ring-2 focus:ring-sky-600 disabled:opacity-60" onClick={load}>Refresh branches</button></div>
    <form aria-label="Create branch" className="mt-8 flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm sm:flex-row sm:items-end" onSubmit={submit}>
      <label className="grid flex-1 gap-1.5 font-medium">Branch name<input required maxLength={120} name="name" className="min-h-11 rounded-xl border border-slate-300 px-3 focus:outline-none focus:ring-2 focus:ring-sky-600" /></label>
      <button disabled={mutating} className="min-h-11 rounded-xl bg-slate-950 px-5 font-medium text-white focus:outline-none focus:ring-2 focus:ring-sky-600 focus:ring-offset-2 disabled:opacity-60">Create branch</button>
    </form>
    <p aria-live="polite" className="mt-4 text-sm font-medium text-emerald-700">{notice}</p>
    {failed && <div ref={alert} tabIndex={-1} role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-rose-900"><p>{failed.kind === 'create' ? 'The branch was not created.' : 'The branch status was not changed.'}</p><button className="mt-3 min-h-11 rounded-xl bg-rose-900 px-4 font-medium text-white" onClick={() => run(failed)}>Retry {failed.kind === 'create' ? 'create' : 'status change'}</button></div>}
    {state === 'loading' && <p role="status" className="mt-8 text-slate-700">Loading branches…</p>}
    {state === 'error' && <div ref={alert} tabIndex={-1} role="alert" className="mt-8 rounded-xl bg-rose-50 p-4 text-rose-900"><p>Branches could not be loaded.</p><button className="mt-3 min-h-11 rounded-xl bg-rose-900 px-4 font-medium text-white" onClick={load}>Try again</button></div>}
    {state === 'ready' && branches.length === 0 && <p className="mt-8 rounded-2xl bg-white p-6 text-slate-700 shadow-sm">No branches yet.</p>}
    {state === 'ready' && branches.length > 0 && <ul className="mt-6 divide-y divide-slate-200 rounded-2xl bg-white px-4 shadow-sm">{branches.map((branch) => { const next = branch.status === 'active' ? 'suspended' : 'active'; return <li key={branch.id} className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="font-semibold">{branch.name}</h2><p className="mt-1 text-sm text-slate-600">{branch.status === 'active' ? 'Active' : 'Suspended'}</p></div><button disabled={mutating} className="min-h-11 rounded-xl border border-slate-300 px-4 font-medium focus:outline-none focus:ring-2 focus:ring-sky-600 disabled:opacity-60" aria-label={`${next === 'active' ? 'Activate' : 'Suspend'} ${branch.name}`} onClick={() => run({ kind: 'status', branch, status: next, requestId: crypto.randomUUID() })}>{next === 'active' ? 'Activate' : 'Suspend'}</button></li> })}</ul>}
  </section>
}
