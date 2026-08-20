import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { CatalogImageTile } from '../../../app/components/CatalogImageTile'
import { ResponsiveActionButton } from '../../../app/components/ResponsiveActionButton'
import { SearchInput } from '../../../app/components/SearchInput'
import { createProduct, deactivateProduct, listProducts, updateProduct, type CreateProductInput, type Product } from '../api/products'

type Draft = CreateProductInput & { active: boolean }

const ALL_CATEGORIES = 'All products'
const emptyDraft: Draft = { name: '', sku: '', category: '', retailPriceMxn: 0, wholesalePriceMxn: 0, active: true }

function formatPrice(value: number) {
  return `$${value.toFixed(2)} MXN`
}

function matchesProduct(product: Product, query: string, category: string) {
  if (category !== ALL_CATEGORIES && product.category !== category) return false

  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true

  const searchableFields = [product.name, product.sku, product.category].map((field) => field.toLocaleLowerCase())
  return terms.every((term) => searchableFields.some((field) => field.includes(term)))
}

function ProductForm({ product, busy, onCancel, onSubmit }: { product: Product | null; busy: boolean; onCancel: () => void; onSubmit: (draft: Draft) => void }) {
  const initial = product ? { name: product.name, sku: product.sku, category: product.category, retailPriceMxn: product.retailPriceMxn, wholesalePriceMxn: product.wholesalePriceMxn, active: product.active } : emptyDraft

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const values = new FormData(event.currentTarget)
    onSubmit({
      name: String(values.get('name') ?? ''),
      sku: String(values.get('sku') ?? ''),
      category: String(values.get('category') ?? ''),
      retailPriceMxn: Number(values.get('retailPriceMxn')),
      wholesalePriceMxn: Number(values.get('wholesalePriceMxn')),
      active: values.get('active') === 'on',
    })
  }

  const inputClassName = 'ops-control ops-focus min-h-11 w-full px-3 text-sm font-medium placeholder:text-slate-500'

  return <form key={product?.id ?? 'new'} aria-label={product ? `Edit ${product.name}` : 'Create product'} className="grid gap-5 rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-xl sm:p-6" onSubmit={submit}>
    <div>
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-sky-400">Catalog setup</p>
      <h2 className="mt-2 text-lg font-extrabold tracking-tight text-white">{product ? `Edit ${product.name}` : 'Add a product'}</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-400">Keep the shared catalog ready for POS, wholesale, and events.</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-semibold text-slate-300">Name<input required maxLength={160} name="name" defaultValue={initial.name} className={inputClassName} /></label>
      <label className="grid gap-2 text-sm font-semibold text-slate-300">SKU / code<input required maxLength={80} name="sku" defaultValue={initial.sku} className={inputClassName} /></label>
      <label className="grid gap-2 text-sm font-semibold text-slate-300">Category<input required maxLength={120} name="category" defaultValue={initial.category} className={inputClassName} /></label>
      <label className="grid gap-2 text-sm font-semibold text-slate-300">Retail price (MXN)<input required min="0" step="0.01" name="retailPriceMxn" type="number" defaultValue={initial.retailPriceMxn} className={inputClassName} /></label>
      <label className="grid gap-2 text-sm font-semibold text-slate-300">Wholesale price (MXN)<input required min="0" step="0.01" name="wholesalePriceMxn" type="number" defaultValue={initial.wholesalePriceMxn} className={inputClassName} /></label>
    </div>
    <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-slate-300"><input name="active" type="checkbox" defaultChecked={initial.active} className="h-5 w-5 accent-sky-500" />Active in sales channels</label>
    <div className="flex flex-col gap-3 sm:flex-row">
      <ResponsiveActionButton type="submit" label={product ? 'Save product' : 'Create product'} mobileDisplay="text" disabled={busy} className="bg-sky-600 text-white shadow-lg shadow-sky-950/30 hover:bg-sky-500 disabled:opacity-50">{product ? 'Save product' : 'Create product'}</ResponsiveActionButton>
      {product && <ResponsiveActionButton type="button" label="Cancel editing" mobileDisplay="text" disabled={busy} className="border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800" onClick={onCancel}>Cancel</ResponsiveActionButton>}
    </div>
  </form>
}

export function ProductWorkspace() {
  const [products, setProducts] = useState<Product[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [editing, setEditing] = useState<Product | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const sequence = useRef(0)
  const alert = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const current = ++sequence.current
    setState('loading')
    try {
      const next = await listProducts()
      if (current === sequence.current) {
        setProducts(next)
        setState('ready')
      }
    } catch {
      if (current === sequence.current) setState('error')
    }
  }, [])

  useEffect(() => { queueMicrotask(() => void load()) }, [load])
  useEffect(() => { if (state === 'error' || error) alert.current?.focus() }, [state, error])

  function merge(product: Product) {
    setProducts((items) => [...items.filter(({ id }) => id !== product.id), product].sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function save(draft: Draft) {
    setBusy(true)
    setError('')
    setNotice('')
    ++sequence.current
    try {
      const result = editing ? await updateProduct(editing.id, draft) : await createProduct(draft)
      merge(result)
      setEditing(null)
      setState('ready')
      setNotice(editing ? 'Product updated.' : 'Product created.')
    } catch {
      setError(editing ? 'The product could not be updated.' : 'The product could not be created.')
    } finally {
      setBusy(false)
    }
  }

  async function setActive(product: Product) {
    setBusy(true)
    setError('')
    setNotice('')
    ++sequence.current
    try {
      const result = product.active ? await deactivateProduct(product.id) : await updateProduct(product.id, { active: true })
      merge(result)
      setNotice(product.active ? 'Product deactivated.' : 'Product activated.')
    } catch {
      setError(product.active ? 'The product could not be deactivated.' : 'The product could not be activated.')
    } finally {
      setBusy(false)
    }
  }

  const categories = [ALL_CATEGORIES, ...Array.from(new Set(products.map(({ category }) => category)))]
  const filteredProducts = products.filter((product) => matchesProduct(product, searchQuery, selectedCategory))

  return <section aria-labelledby="products-title" className="w-full rounded-3xl bg-slate-900 p-4 text-slate-100 shadow-2xl sm:p-6 lg:p-8">
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-sky-400">Administration / Catalog</p>
        <h1 id="products-title" className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Products</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">One visual catalog for POS, wholesale, and events. Active products are visible in every sales channel.</p>
      </div>
      <ResponsiveActionButton label="Refresh products" icon="refresh" loading={state === 'loading'} loadingLabel="Refreshing products" mobileDisplay="text" disabled={busy} className="w-full border border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800 sm:w-auto" onClick={load}>Refresh products</ResponsiveActionButton>
    </div>

    <div className="mt-6"><ProductForm product={editing} busy={busy} onCancel={() => setEditing(null)} onSubmit={save} /></div>
    <p aria-live="polite" className="mt-4 min-h-5 text-sm font-semibold text-emerald-300">{notice}</p>
    {error && <div ref={alert} tabIndex={-1} role="alert" className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm font-semibold text-rose-300">{error}</div>}

    {state === 'loading' && <p role="status" className="mt-8 rounded-2xl border border-slate-800 bg-slate-950 p-6 text-sm font-semibold text-slate-300">Loading products…</p>}
    {state === 'error' && <div ref={alert} tabIndex={-1} role="alert" className="mt-8 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200"><p className="font-semibold">Products could not be loaded.</p><ResponsiveActionButton label="Try again" mobileDisplay="text" className="mt-3 bg-rose-900 text-white hover:bg-rose-800" onClick={load}>Try again</ResponsiveActionButton></div>}
    {state === 'ready' && products.length === 0 && <p className="mt-8 rounded-2xl border border-slate-800 bg-slate-950 p-6 text-sm text-slate-300">No products yet. Add the first product to start the shared catalog.</p>}

    {state === 'ready' && products.length > 0 && <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-950 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-white">Catalog products</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">{filteredProducts.length} of {products.length} products shown</p>
        </div>
        <SearchInput label="Search products" value={searchQuery} onChange={setSearchQuery} placeholder="Search name, SKU, or category…" containerClassName="w-full sm:max-w-xs" className="border-slate-800 bg-slate-900 text-sm text-white placeholder:text-slate-500" />
      </div>

      <div role="tablist" aria-label="Product categories" className="mt-5 flex w-full min-w-0 gap-1.5 overflow-x-auto border-b border-slate-800 pb-3 scrollbar-none">
        {categories.map((category) => {
          const selected = selectedCategory === category
          return <ResponsiveActionButton key={category} type="button" role="tab" aria-selected={selected} aria-pressed={selected} label={`Filter by ${category}`} mobileDisplay="text" className={`shrink-0 border px-4 text-xs font-extrabold transition-colors ${selected ? 'border-sky-500 bg-sky-500/15 text-sky-300' : 'border-slate-800 bg-slate-900/50 text-white/70 hover:border-slate-700 hover:text-white'}`} onClick={() => setSelectedCategory(category)}>{category}</ResponsiveActionButton>
        })}
      </div>

      {filteredProducts.length === 0 ? <p className="py-10 text-center text-sm font-semibold text-slate-500">No products match the current filters.</p> : <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {filteredProducts.map((product) => <li key={product.id} className="group flex min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-3 shadow-lg transition-colors hover:border-slate-700 sm:p-4">
          <CatalogImageTile alt={`${product.name} product image`} className="mb-4 w-full border-slate-800 bg-slate-950 text-slate-500" imageClassName="transition-transform duration-200 group-hover:scale-105" />
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-extrabold text-white" title={product.name}>{product.name}</h3>
                <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500" title={`${product.sku} · ${product.category}`}>{product.sku} · {product.category}</p>
              </div>
              <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-extrabold ${product.active ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-800 text-white/70'}`}><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${product.active ? 'bg-emerald-400' : 'bg-slate-500'}`} />{product.active ? 'Active' : 'Inactive'}</span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-800 pt-3">
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Retail</p><p className="mt-1 text-sm font-black text-white">{formatPrice(product.retailPriceMxn)}</p></div>
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Wholesale</p><p className="mt-1 text-sm font-black text-amber-300">{formatPrice(product.wholesalePriceMxn)}</p></div>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <ResponsiveActionButton label={`Edit ${product.name}`} mobileDisplay="text" disabled={busy} className="w-full border border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800" onClick={() => setEditing(product)}>Edit</ResponsiveActionButton>
            <ResponsiveActionButton label={`${product.active ? 'Deactivate' : 'Activate'} ${product.name}`} mobileDisplay="text" disabled={busy} className={`w-full border ${product.active ? 'border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'}`} onClick={() => void setActive(product)}>{product.active ? 'Deactivate' : 'Activate'}</ResponsiveActionButton>
          </div>
        </li>)}
      </ul>}
    </div>}
  </section>
}
