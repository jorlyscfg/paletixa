import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { CatalogImageTile } from '../../../app/components/CatalogImageTile'
import { createProduct, deactivateProduct, listProducts, updateProduct, type CreateProductInput, type Product } from '../api/products'

type Draft = CreateProductInput & { active: boolean }
const emptyDraft: Draft = { name: '', sku: '', category: '', retailPriceMxn: 0, wholesalePriceMxn: 0, active: true }

function ProductForm({ product, busy, onCancel, onSubmit }: { product: Product | null; busy: boolean; onCancel: () => void; onSubmit: (draft: Draft) => void }) {
  const initial = product ? { name: product.name, sku: product.sku, category: product.category, retailPriceMxn: product.retailPriceMxn, wholesalePriceMxn: product.wholesalePriceMxn, active: product.active } : emptyDraft
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    onSubmit({
      name: String(values.get('name') ?? ''), sku: String(values.get('sku') ?? ''), category: String(values.get('category') ?? ''),
      retailPriceMxn: Number(values.get('retailPriceMxn')), wholesalePriceMxn: Number(values.get('wholesalePriceMxn')), active: values.get('active') === 'on',
    })
  }
  return <form key={product?.id ?? 'new'} aria-label={product ? `Edit ${product.name}` : 'Create product'} className="grid gap-4 rounded-2xl bg-white p-5 shadow-sm" onSubmit={submit}>
    <div><h2 className="text-lg font-semibold">{product ? `Edit ${product.name}` : 'Add a product'}</h2><p className="mt-1 text-sm text-slate-600">Keep the shared catalog ready for every sales channel.</p></div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-1.5 font-medium">Name<input required maxLength={160} name="name" defaultValue={initial.name} className="min-h-11 rounded-xl border border-slate-300 px-3 focus:outline-none focus:ring-2 focus:ring-sky-600" /></label>
      <label className="grid gap-1.5 font-medium">SKU / code<input required maxLength={80} name="sku" defaultValue={initial.sku} className="min-h-11 rounded-xl border border-slate-300 px-3 focus:outline-none focus:ring-2 focus:ring-sky-600" /></label>
      <label className="grid gap-1.5 font-medium">Category<input required maxLength={120} name="category" defaultValue={initial.category} className="min-h-11 rounded-xl border border-slate-300 px-3 focus:outline-none focus:ring-2 focus:ring-sky-600" /></label>
      <label className="grid gap-1.5 font-medium">Retail price (MXN)<input required min="0" step="0.01" name="retailPriceMxn" type="number" defaultValue={initial.retailPriceMxn} className="min-h-11 rounded-xl border border-slate-300 px-3 focus:outline-none focus:ring-2 focus:ring-sky-600" /></label>
      <label className="grid gap-1.5 font-medium">Wholesale price (MXN)<input required min="0" step="0.01" name="wholesalePriceMxn" type="number" defaultValue={initial.wholesalePriceMxn} className="min-h-11 rounded-xl border border-slate-300 px-3 focus:outline-none focus:ring-2 focus:ring-sky-600" /></label>
    </div>
    <label className="flex min-h-11 items-center gap-3 font-medium"><input name="active" type="checkbox" defaultChecked={initial.active} className="h-5 w-5 accent-sky-700" />Active in sales channels</label>
    <div className="flex flex-wrap gap-3"><button disabled={busy} className="min-h-11 rounded-xl bg-slate-950 px-5 font-medium text-white focus:outline-none focus:ring-2 focus:ring-sky-600 focus:ring-offset-2 disabled:opacity-60">{product ? 'Save product' : 'Create product'}</button>{product && <button type="button" disabled={busy} className="min-h-11 rounded-xl border border-slate-300 bg-white px-5 font-medium focus:outline-none focus:ring-2 focus:ring-sky-600 disabled:opacity-60" onClick={onCancel}>Cancel</button>}</div>
  </form>
}

export function ProductWorkspace() {
  const [products, setProducts] = useState<Product[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [editing, setEditing] = useState<Product | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const sequence = useRef(0)
  const alert = useRef<HTMLDivElement>(null)
  const load = useCallback(async () => {
    const current = ++sequence.current
    setState('loading')
    try { const next = await listProducts(); if (current === sequence.current) { setProducts(next); setState('ready') } }
    catch { if (current === sequence.current) setState('error') }
  }, [])
  useEffect(() => { queueMicrotask(() => void load()) }, [load])
  useEffect(() => { if (state === 'error' || error) alert.current?.focus() }, [state, error])

  function merge(product: Product) { setProducts((items) => [...items.filter(({ id }) => id !== product.id), product].sort((a, b) => a.name.localeCompare(b.name))) }
  async function save(draft: Draft) {
    setBusy(true); setError(''); setNotice(''); ++sequence.current
    try { const result = editing ? await updateProduct(editing.id, draft) : await createProduct(draft); merge(result); setEditing(null); setState('ready'); setNotice(editing ? 'Product updated.' : 'Product created.') }
    catch { setError(editing ? 'The product could not be updated.' : 'The product could not be created.') }
    finally { setBusy(false) }
  }
  async function setActive(product: Product) {
    setBusy(true); setError(''); setNotice(''); ++sequence.current
    try { merge(await (product.active ? deactivateProduct(product.id) : updateProduct(product.id, { active: true }))); setNotice(product.active ? 'Product deactivated.' : 'Product activated.') }
    catch { setError(product.active ? 'The product could not be deactivated.' : 'The product could not be activated.') }
    finally { setBusy(false) }
  }

  return <section aria-labelledby="products-title" className="w-full">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="font-medium text-sky-700">Administration</p><h1 id="products-title" className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Products</h1><p className="mt-3 max-w-2xl text-slate-700">One catalog for POS, wholesale, and events. Inventory is not part of this workspace.</p></div><button disabled={busy} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 font-medium focus:outline-none focus:ring-2 focus:ring-sky-600 disabled:opacity-60" onClick={load}>Refresh products</button></div>
    <div className="mt-8"><ProductForm product={editing} busy={busy} onCancel={() => setEditing(null)} onSubmit={save} /></div>
    <p aria-live="polite" className="mt-4 text-sm font-medium text-emerald-700">{notice}</p>
    {error && <div ref={alert} tabIndex={-1} role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-rose-900">{error}</div>}
    {state === 'loading' && <p role="status" className="mt-8 text-slate-700">Loading products…</p>}
    {state === 'error' && <div ref={alert} tabIndex={-1} role="alert" className="mt-8 rounded-xl bg-rose-50 p-4 text-rose-900"><p>Products could not be loaded.</p><button className="mt-3 min-h-11 rounded-xl bg-rose-900 px-4 font-medium text-white focus:outline-none focus:ring-2 focus:ring-rose-700 focus:ring-offset-2" onClick={load}>Try again</button></div>}
    {state === 'ready' && products.length === 0 && <p className="mt-8 rounded-2xl bg-white p-6 text-slate-700 shadow-sm">No products yet. Add the first product to start the shared catalog.</p>}
    {state === 'ready' && products.length > 0 && <ul className="mt-6 divide-y divide-slate-200 rounded-2xl bg-white px-5 shadow-sm">{products.map((product) => <li key={product.id} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between"><div className="flex min-w-0 items-start gap-4"><CatalogImageTile alt={`${product.name} catalog placeholder`} className="h-16 w-16 shrink-0" /><div className="min-w-0"><h2 className="font-semibold">{product.name}</h2><p className="mt-1 text-sm text-slate-600">{product.sku} · {product.category}</p><p className="mt-2 text-sm text-slate-700">Retail ${product.retailPriceMxn.toFixed(2)} MXN · Wholesale ${product.wholesalePriceMxn.toFixed(2)} MXN</p><p className={`mt-1 text-sm font-medium ${product.active ? 'text-emerald-700' : 'text-slate-500'}`}>{product.active ? 'Active' : 'Inactive'}</p></div></div><div className="flex flex-wrap gap-3"><button disabled={busy} className="min-h-11 rounded-xl border border-slate-300 px-4 font-medium focus:outline-none focus:ring-2 focus:ring-sky-600 disabled:opacity-60" onClick={() => setEditing(product)}>Edit</button><button disabled={busy} className="min-h-11 rounded-xl border border-slate-300 px-4 font-medium focus:outline-none focus:ring-2 focus:ring-sky-600 disabled:opacity-60" onClick={() => void setActive(product)}>{product.active ? 'Deactivate' : 'Activate'}</button></div></li>)}</ul>}
  </section>
}
