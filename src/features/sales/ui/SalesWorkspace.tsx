import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { CatalogImageTile } from '../../../app/components/CatalogImageTile'
import { ResponsiveActionButton } from '../../../app/components/ResponsiveActionButton'
import { SearchInput } from '../../../app/components/SearchInput'
import { listProducts, type Product } from '../../products/api/products'
import { recordSale, type SaleReceipt, type SalesChannel, SALES_CHANNELS } from '../api/sales'

type QuantityByProduct = Record<string, string>
type LoadState = 'loading' | 'ready' | 'error'
type Submission = { status: 'submitting' | 'error' | 'success'; requestId: string; receipt?: SaleReceipt }

const channelLabels: Record<SalesChannel, string> = { pos: 'POS', wholesale: 'Wholesale', event: 'Event' }
const selectedChannelClass = 'bg-sky-600 text-white shadow-lg shadow-sky-950/30'
const inactiveChannelClass = 'text-slate-300 hover:bg-slate-800 hover:text-white'
const selectedCategoryClass = 'border-sky-400 bg-sky-500/15 text-sky-200'
const inactiveCategoryClass = 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white'

function formatMxn(value: number) {
  return `$${value.toFixed(2)} MXN`
}

function priceFor(product: Product, channel: SalesChannel) {
  return channel === 'wholesale' ? product.wholesalePriceMxn : product.retailPriceMxn
}

function parseQuantity(value: string) {
  if (value.trim() === '') return null
  const quantity = Number(value)
  return Number.isInteger(quantity) && quantity > 0 ? quantity : null
}

function getSaleItems(products: Product[], quantities: QuantityByProduct) {
  return products.flatMap((product) => {
    const quantity = parseQuantity(quantities[product.id] ?? '')
    return quantity === null ? [] : [{ product, quantity }]
  })
}

function matchesSearch(product: Product, query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const searchableText = `${product.name} ${product.sku} ${product.category}`.toLowerCase()
  return terms.every((term) => searchableText.includes(term))
}

function createRequestId() {
  const randomUUID = globalThis.crypto?.randomUUID
  return typeof randomUUID === 'function' ? randomUUID.call(globalThis.crypto) : `sale-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function SalesWorkspace() {
  const [products, setProducts] = useState<Product[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [channel, setChannel] = useState<SalesChannel>('pos')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [quantities, setQuantities] = useState<QuantityByProduct>({})
  const [reviewed, setReviewed] = useState(false)
  const [validationError, setValidationError] = useState('')
  const [loadError, setLoadError] = useState(false)
  const [submission, setSubmission] = useState<Submission | null>(null)
  const sequence = useRef(0)
  const alert = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const current = ++sequence.current
    setLoadState('loading')
    setLoadError(false)
    try {
      const next = await listProducts()
      if (current === sequence.current) {
        setProducts(next.filter(({ active }) => active))
        setLoadState('ready')
      }
    } catch {
      if (current === sequence.current) {
        setProducts([])
        setLoadState('error')
        setLoadError(true)
      }
    }
  }, [])

  useEffect(() => { queueMicrotask(() => void load()) }, [load])
  useEffect(() => {
    if (loadError || validationError || submission?.status === 'error') alert.current?.focus()
  }, [loadError, validationError, submission])

  function changeChannel(next: SalesChannel) {
    setChannel(next)
    setReviewed(false)
    setValidationError('')
    setSubmission(null)
  }

  function changeQuantity(productId: string, value: string) {
    setQuantities((current) => ({ ...current, [productId]: value }))
    setReviewed(false)
    setValidationError('')
    setSubmission(null)
  }

  function addProduct(productId: string) {
    const current = parseQuantity(quantities[productId] ?? '') ?? 0
    changeQuantity(productId, String(current + 1))
  }

  function adjustQuantity(productId: string, delta: number) {
    const current = parseQuantity(quantities[productId] ?? '') ?? 0
    const next = Math.max(0, current + delta)
    changeQuantity(productId, next === 0 ? '' : String(next))
  }

  function clearCart() {
    setQuantities({})
    setReviewed(false)
    setValidationError('')
    setSubmission(null)
  }

  function reviewSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const items = getSaleItems(products, quantities)
    const hasInvalidQuantity = products.some((product) => {
      const value = quantities[product.id] ?? ''
      return value.trim() !== '' && parseQuantity(value) === null
    })
    if (hasInvalidQuantity) {
      setValidationError('Use a positive whole number for each selected product.')
      return
    }
    if (items.length === 0) {
      setValidationError('Select at least one product by adding it to the sale.')
      return
    }
    setValidationError('')
    setSubmission(null)
    setReviewed(true)
  }

  async function submitSale() {
    const items = getSaleItems(products, quantities)
    if (items.length === 0) return
    const requestId = submission?.requestId ?? createRequestId()
    setSubmission({ status: 'submitting', requestId })
    try {
      const receipt = await recordSale({ requestId, channel, items: items.map(({ product, quantity }) => ({ productId: product.id, quantity })) })
      setSubmission({ status: 'success', requestId, receipt })
    } catch {
      setSubmission({ status: 'error', requestId })
    }
  }

  function startAnotherSale() {
    clearCart()
  }

  const isSubmitting = submission?.status === 'submitting'
  const isComplete = submission?.status === 'success'
  const categories = ['All', ...Array.from(new Set(products.map((product) => product.category).filter(Boolean)))]
  const filteredProducts = products.filter((product) => {
    const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory
    return matchesCategory && matchesSearch(product, searchQuery)
  })
  const cartProducts = products.filter((product) => (quantities[product.id] ?? '').trim() !== '')
  const saleItems = getSaleItems(products, quantities)
  const itemCount = saleItems.reduce((total, { quantity }) => total + quantity, 0)
  const displayEstimate = saleItems.reduce((total, { product, quantity }) => total + quantity * priceFor(product, channel), 0)

  return <section aria-labelledby="sales-title" className="w-full rounded-[1.75rem] border border-slate-800 bg-slate-950 p-4 text-slate-100 shadow-xl sm:p-6 lg:p-8">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-sky-400">Sales desk</p>
        <h1 id="sales-title" className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">Record a sale</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">Choose a channel, add products to the cart, and review the server-confirmed total before submitting.</p>
      </div>
      <ResponsiveActionButton
        type="button"
        label="Refresh products"
        icon="refresh"
        mobileDisplay="text"
        disabled={loadState === 'loading' || isSubmitting}
        onClick={() => void load()}
        className="border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
      >Refresh products</ResponsiveActionButton>
    </div>

    <form onSubmit={reviewSale} className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)]">
      <div className="min-w-0">
        <section aria-labelledby="channel-title" className="border-b border-slate-800 pb-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="channel-title" className="text-sm font-bold uppercase tracking-[0.12em] text-slate-300">Sales channel</h2>
              <p className="mt-1 text-xs text-slate-500">POS and events use retail prices. Wholesale uses wholesale prices.</p>
            </div>
            <span className="text-xs font-semibold text-slate-500">{products.length} active {products.length === 1 ? 'product' : 'products'}</span>
          </div>
          <div role="tablist" aria-label="Sales channel" className="mt-4 grid grid-cols-3 gap-1 rounded-2xl border border-slate-800 bg-slate-900/70 p-1">
            {SALES_CHANNELS.map((option) => <ResponsiveActionButton
              key={option}
              id={`${option}-tab`}
              type="button"
              role="tab"
              aria-selected={channel === option}
              aria-controls="sale-products"
              label={channelLabels[option]}
              mobileDisplay="text"
              disabled={isComplete}
              onClick={() => changeChannel(option)}
              className={channel === option ? selectedChannelClass : inactiveChannelClass}
            >{channelLabels[option]}</ResponsiveActionButton>)}
          </div>
        </section>

        {loadState === 'loading' && <div role="status" className="mt-6">
          <p className="text-sm font-semibold text-slate-300">Loading products…</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4].map((placeholder) => <div key={placeholder} aria-hidden="true" className="aspect-[4/5] animate-pulse rounded-2xl border border-slate-800 bg-slate-900/70" />)}
          </div>
        </div>}

        {loadState === 'error' && <div ref={alert} tabIndex={-1} role="alert" className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100">
          <p className="font-semibold">Products could not be loaded.</p>
          <p className="mt-1 text-sm text-rose-200/80">Check the catalog connection and try again.</p>
          <ResponsiveActionButton type="button" label="Try again" icon="refresh" mobileDisplay="text" onClick={() => void load()} className="mt-4 bg-rose-600 text-white hover:bg-rose-500">Try again</ResponsiveActionButton>
        </div>}

        {loadState === 'ready' && products.length === 0 && <p className="mt-6 rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-6 text-sm text-slate-300">No active products are in the catalog. Add an active product before recording a sale.</p>}

        {loadState === 'ready' && products.length > 0 && <div id="sale-products" role="tabpanel" aria-labelledby={`${channel}-tab`} className="mt-6">
          <div className="flex flex-col gap-4">
            <SearchInput
              label="Search products"
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search by product, SKU, or category"
              containerClassName="w-full"
              className="border-slate-800 bg-slate-900/80 text-white placeholder:text-slate-500"
            />
            <div role="tablist" aria-label="Product categories" className="flex min-w-0 gap-2 overflow-x-auto pb-1">
              {categories.map((category) => <ResponsiveActionButton
                key={category}
                type="button"
                role="tab"
                aria-selected={selectedCategory === category}
                label={category}
                mobileDisplay="text"
                onClick={() => setSelectedCategory(category)}
                className={`shrink-0 border px-4 text-xs ${selectedCategory === category ? selectedCategoryClass : inactiveCategoryClass}`}
              >{category}</ResponsiveActionButton>)}
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-300">Product catalog</h2>
              <p className="mt-1 text-xs text-slate-500">Tap add to build the sale. Quantities can be adjusted in the cart.</p>
            </div>
            <span className="shrink-0 text-xs font-semibold text-slate-500">{filteredProducts.length} shown</span>
          </div>

          {filteredProducts.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center">
            <p className="text-sm font-semibold text-slate-300">No products match these filters.</p>
            <ResponsiveActionButton type="button" label="Clear product filters" mobileDisplay="text" onClick={() => { setSearchQuery(''); setSelectedCategory('All') }} className="mt-4 border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700">Clear filters</ResponsiveActionButton>
          </div> : <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((product) => {
              const quantity = parseQuantity(quantities[product.id] ?? '') ?? 0
              const price = priceFor(product, channel)
              return <article key={product.id} data-testid="sales-product-card" className="group flex min-w-0 flex-col rounded-2xl border border-slate-800 bg-slate-900/65 p-3 transition-colors hover:border-slate-700 hover:bg-slate-900">
                <CatalogImageTile
                  src={null}
                  alt={product.name}
                  imageClassName="transition-transform duration-200 group-hover:scale-105"
                  className="aspect-square w-full border-slate-800 bg-slate-950"
                >
                  {quantity > 0 && <span className="absolute right-2 top-2 rounded-full border border-sky-400/30 bg-sky-500/90 px-2 py-1 text-[10px] font-black text-white">{quantity} in cart</span>}
                </CatalogImageTile>
                <div className="mt-3 min-w-0">
                  <h3 className="truncate text-sm font-bold text-white" title={product.name}>{product.name}</h3>
                  <p className="mt-1 truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{product.category} · {product.sku}</p>
                  <p className="mt-2 text-xs font-semibold text-slate-300">{channelLabels[channel]} price <span className="font-black text-white">{formatMxn(price)}</span></p>
                </div>
                <ResponsiveActionButton
                  type="button"
                  label={`${quantity > 0 ? 'Add another' : 'Add'} ${product.name} to sale`}
                  mobileDisplay="text"
                  disabled={isSubmitting || isComplete}
                  onClick={() => addProduct(product.id)}
                  className="mt-3 w-full border border-slate-700 bg-slate-950 text-slate-200 hover:border-sky-500 hover:text-white"
                >{quantity > 0 ? 'Add more' : 'Add to sale'}</ResponsiveActionButton>
              </article>
            })}
          </div>}
        </div>}
      </div>

      <aside aria-labelledby={reviewed ? 'review-title' : 'cart-title'} className={`h-fit rounded-2xl border bg-slate-900/85 p-4 shadow-xl lg:sticky lg:top-6 ${reviewed ? 'border-sky-500/40' : 'border-slate-800'}`}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h2 id={reviewed ? 'review-title' : 'cart-title'} className="text-base font-black text-white">{reviewed ? 'Review sale' : 'Cart summary'}</h2>
            <p className="mt-1 text-xs text-slate-500">{channelLabels[channel]} · {itemCount} {itemCount === 1 ? 'item' : 'items'}</p>
          </div>
          {cartProducts.length > 0 && <ResponsiveActionButton type="button" label="Clear sale selection" icon="close" mobileDisplay="text" onClick={clearCart} disabled={isSubmitting || isComplete} className="text-xs text-slate-400 hover:bg-slate-800 hover:text-white">Clear</ResponsiveActionButton>}
        </div>

        {cartProducts.length === 0 ? <div className="py-10 text-center">
          <p className="text-sm font-semibold text-slate-300">Cart is empty.</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">Add products from the catalog to start a sale.</p>
        </div> : <ul className="divide-y divide-slate-800">
          {cartProducts.map((product) => {
            const value = quantities[product.id] ?? ''
            const quantity = parseQuantity(value)
            const invalid = value.trim() !== '' && quantity === null
            const price = priceFor(product, channel)
            return <li key={product.id} className="py-4 first:pt-5 last:pb-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-sm font-bold text-white" title={product.name}>{product.name}</h3>
                  <p className="mt-1 text-xs text-slate-500">{channelLabels[channel]} · {formatMxn(price)} / unit</p>
                </div>
                <span className="shrink-0 text-sm font-black text-white">{quantity === null ? '—' : formatMxn(quantity * price)}</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div role="group" aria-label={`Quantity controls for ${product.name}`} className="flex items-center rounded-xl border border-slate-700 bg-slate-950 p-1">
                  <button type="button" aria-label={`Decrease ${product.name} quantity`} disabled={isSubmitting || isComplete} onClick={() => adjustQuantity(product.id, -1)} className="ops-focus inline-flex h-11 w-11 items-center justify-center rounded-lg text-lg font-bold text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50">−</button>
                  <input
                    aria-label={`Quantity for ${product.name}`}
                    aria-invalid={invalid}
                    disabled={isSubmitting || isComplete}
                    inputMode="numeric"
                    type="text"
                    value={value}
                    onChange={(event) => changeQuantity(product.id, event.target.value)}
                    className="min-h-11 w-14 border-0 bg-transparent px-1 text-center text-sm font-black text-white outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <button type="button" aria-label={`Increase ${product.name} quantity`} disabled={isSubmitting || isComplete} onClick={() => adjustQuantity(product.id, 1)} className="ops-focus inline-flex h-11 w-11 items-center justify-center rounded-lg text-lg font-bold text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50">+</button>
                </div>
                {invalid ? <span className="text-right text-[11px] font-semibold text-amber-300">Use a whole number</span> : <span className="text-xs font-semibold text-slate-500">{quantity} {quantity === 1 ? 'unit' : 'units'}</span>}
              </div>
            </li>
          })}
        </ul>}

        <div className="mt-4 border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between gap-3 text-sm font-bold text-slate-300"><span>Display estimate</span><span className="text-lg font-black text-sky-300">{formatMxn(displayEstimate)}</span></div>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">The final total is confirmed by the server when you submit.</p>
        </div>

        {validationError && <div ref={alert} tabIndex={-1} role="alert" className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">{validationError}</div>}
        {submission?.status === 'error' && <div ref={alert} tabIndex={-1} role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-rose-100">
          <p className="text-sm font-semibold">The sale could not be recorded. Try again.</p>
          <ResponsiveActionButton type="button" label="Retry sale" icon="refresh" mobileDisplay="text" onClick={() => void submitSale()} className="mt-3 w-full bg-rose-600 text-white hover:bg-rose-500">Retry sale</ResponsiveActionButton>
        </div>}

        {submission?.status === 'success' && submission.receipt && <div role="status" className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-100">
          <h3 className="font-bold">{submission.receipt.replayed ? 'Sale already recorded' : 'Sale recorded'}</h3>
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between gap-4"><dt>Channel</dt><dd className="font-semibold">{channelLabels[submission.receipt.channel]}</dd></div>
            <div className="flex justify-between gap-4"><dt>Server total</dt><dd className="font-semibold">{formatMxn(submission.receipt.totalMxn)}</dd></div>
            <div className="flex justify-between gap-4"><dt>Receipt ID</dt><dd className="max-w-[12rem] truncate font-semibold" title={submission.receipt.id}>{submission.receipt.id}</dd></div>
          </dl>
          <ResponsiveActionButton type="button" label="Start another sale" icon="refresh" mobileDisplay="text" onClick={startAnotherSale} className="mt-4 w-full border border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/10">Start another sale</ResponsiveActionButton>
        </div>}

        {!isComplete && submission?.status !== 'error' && <div className="mt-5 max-lg:sticky max-lg:bottom-3 max-lg:z-10 max-lg:-mx-1 max-lg:rounded-2xl max-lg:bg-slate-900/95 max-lg:p-1">
          {!reviewed ? <ResponsiveActionButton type="submit" label="Review sale" icon="sale" mobileDisplay="text" disabled={isSubmitting || cartProducts.length === 0} className="w-full bg-sky-600 text-white shadow-lg shadow-sky-950/30 hover:bg-sky-500 disabled:opacity-40">Review sale</ResponsiveActionButton> : <ResponsiveActionButton type="button" label={isSubmitting ? 'Recording sale' : 'Submit sale'} icon="sale" mobileDisplay="text" loading={isSubmitting} loadingLabel="Recording sale" disabled={isSubmitting || saleItems.length === 0} onClick={() => void submitSale()} className="w-full bg-sky-600 text-white shadow-lg shadow-sky-950/30 hover:bg-sky-500 disabled:opacity-40">{isSubmitting ? 'Recording sale' : 'Submit sale'}</ResponsiveActionButton>}
        </div>}
      </aside>
    </form>
  </section>
}
