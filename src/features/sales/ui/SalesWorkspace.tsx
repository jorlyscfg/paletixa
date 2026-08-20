import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { listProducts, type Product } from '../../products/api/products'
import { recordSale, type SaleReceipt, type SalesChannel, SALES_CHANNELS } from '../api/sales'

type QuantityByProduct = Record<string, string>
type LoadState = 'loading' | 'ready' | 'error'
type Submission = { status: 'submitting' | 'error' | 'success'; requestId: string; receipt?: SaleReceipt }

const channelLabels: Record<SalesChannel, string> = { pos: 'POS', wholesale: 'Wholesale', event: 'Event' }

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

function createRequestId() {
  const randomUUID = globalThis.crypto?.randomUUID
  return typeof randomUUID === 'function' ? randomUUID.call(globalThis.crypto) : `sale-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function SalesWorkspace() {
  const [products, setProducts] = useState<Product[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [channel, setChannel] = useState<SalesChannel>('pos')
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
      setValidationError('Select at least one product by entering a positive whole-number quantity.')
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
    setQuantities({})
    setReviewed(false)
    setValidationError('')
    setSubmission(null)
  }

  const isSubmitting = submission?.status === 'submitting'
  const isComplete = submission?.status === 'success'

  return <section aria-labelledby="sales-title" className="w-full">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="font-medium text-sky-700">Sales</p>
        <h1 id="sales-title" className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Record a sale</h1>
        <p className="mt-3 max-w-2xl text-slate-700">One entry surface for POS, wholesale, and events. The server confirms the final total.</p>
      </div>
      <button type="button" disabled={loadState === 'loading' || isSubmitting} className="min-h-11 rounded-xl border border-slate-300 bg-white px-4 font-medium focus:outline-none focus:ring-2 focus:ring-sky-600 disabled:opacity-60" onClick={() => void load()}>Refresh products</button>
    </div>

    <div className="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(18rem,0.8fr)]">
      <div>
        <section aria-labelledby="channel-title">
          <h2 id="channel-title" className="text-lg font-semibold">Choose a channel</h2>
          <div role="tablist" aria-label="Sales channel" className="mt-3 grid grid-cols-3 gap-1 rounded-2xl bg-slate-200 p-1">
            {SALES_CHANNELS.map((option) => <button key={option} id={`${option}-tab`} type="button" role="tab" aria-selected={channel === option} aria-controls="sale-products" disabled={isComplete} className={`min-h-11 rounded-xl px-3 font-medium focus:outline-none focus:ring-2 focus:ring-sky-600 ${channel === option ? 'bg-slate-950 text-white' : 'text-slate-700 hover:bg-white'}`} onClick={() => changeChannel(option)}>{channelLabels[option]}</button>)}
          </div>
          <p className="mt-2 text-sm text-slate-600">POS and events use retail prices. Wholesale uses wholesale prices.</p>
        </section>

        {loadState === 'loading' && <p role="status" className="mt-8 text-slate-700">Loading products…</p>}
        {loadState === 'error' && <div ref={alert} tabIndex={-1} role="alert" className="mt-8 rounded-xl bg-rose-50 p-4 text-rose-900"><p>Products could not be loaded.</p><button type="button" className="mt-3 min-h-11 rounded-xl bg-rose-900 px-4 font-medium text-white focus:outline-none focus:ring-2 focus:ring-rose-700 focus:ring-offset-2" onClick={() => void load()}>Try again</button></div>}
        {loadState === 'ready' && products.length === 0 && <p className="mt-8 rounded-2xl bg-white p-6 text-slate-700 shadow-sm">No active products are in the catalog. Add an active product before recording a sale.</p>}
        {loadState === 'ready' && products.length > 0 && <form id="sale-products" role="tabpanel" aria-labelledby={`${channel}-tab`} aria-label="Sale entry" className="mt-8" onSubmit={reviewSale}>
          <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-semibold">Select products</h2><p className="mt-1 text-sm text-slate-600">Enter a positive whole number for each product to include.</p></div><p className="text-sm font-medium text-slate-600">{products.length} active {products.length === 1 ? 'product' : 'products'}</p></div>
          <ul className="mt-4 divide-y divide-slate-200 rounded-2xl bg-white px-4 shadow-sm">
            {products.map((product) => { const value = quantities[product.id] ?? ''; const invalid = value.trim() !== '' && parseQuantity(value) === null; return <li key={product.id} className="flex flex-col gap-4 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0"><h3 className="font-semibold">{product.name}</h3><p className="mt-1 text-sm text-slate-600">{product.sku} · {product.category}</p><p className="mt-2 text-sm text-slate-700">{channelLabels[channel]} price {formatMxn(priceFor(product, channel))}</p></div>
              <label className="grid min-w-36 gap-1.5 font-medium sm:shrink-0">Quantity for {product.name}<input aria-invalid={invalid} aria-label={`Quantity for ${product.name}`} disabled={isSubmitting || isComplete} inputMode="numeric" type="text" value={value} onChange={(event) => changeQuantity(product.id, event.target.value)} className="min-h-11 rounded-xl border border-slate-300 bg-white px-3 focus:outline-none focus:ring-2 focus:ring-sky-600 disabled:bg-slate-100" /></label>
            </li> })}
          </ul>
          {validationError && <div ref={alert} tabIndex={-1} role="alert" className="mt-4 rounded-xl bg-amber-50 p-4 text-amber-950">{validationError}</div>}
          <button type="submit" disabled={isSubmitting || isComplete} className="mt-5 min-h-11 rounded-xl bg-slate-950 px-5 font-medium text-white focus:outline-none focus:ring-2 focus:ring-sky-600 focus:ring-offset-2 disabled:opacity-60">Review sale</button>
        </form>}
      </div>

      {reviewed && <section aria-labelledby="review-title" className="h-fit rounded-2xl bg-white p-5 shadow-sm lg:sticky lg:top-6">
        <h2 id="review-title" className="text-lg font-semibold">Review sale</h2>
        <p className="mt-1 text-sm text-slate-600">{channelLabels[channel]} · {getSaleItems(products, quantities).length} line items</p>
        <ul className="mt-4 divide-y divide-slate-200 border-y border-slate-200">
          {getSaleItems(products, quantities).map(({ product, quantity }) => <li key={product.id} className="flex justify-between gap-4 py-3 text-sm"><span>{quantity} × {product.name}</span><span className="font-medium">{formatMxn(quantity * priceFor(product, channel))}</span></li>)}
        </ul>
        <p className="mt-4 flex justify-between gap-4 font-medium"><span>Display estimate</span><span>{formatMxn(getSaleItems(products, quantities).reduce((total, { product, quantity }) => total + quantity * priceFor(product, channel), 0))}</span></p>
        <p className="mt-2 text-xs text-slate-600">Final total is confirmed by the server when you submit.</p>
        {submission?.status === 'error' && <div ref={alert} tabIndex={-1} role="alert" className="mt-4 rounded-xl bg-rose-50 p-4 text-rose-900"><p>The sale could not be recorded. Try again.</p><button type="button" className="mt-3 min-h-11 rounded-xl bg-rose-900 px-4 font-medium text-white focus:outline-none focus:ring-2 focus:ring-rose-700 focus:ring-offset-2" onClick={() => void submitSale()}>Retry sale</button></div>}
        {submission?.status === 'success' && submission.receipt && <div role="status" className="mt-5 rounded-xl bg-emerald-50 p-4 text-emerald-950"><h3 className="font-semibold">{submission.receipt.replayed ? 'Sale already recorded' : 'Sale recorded'}</h3><dl className="mt-3 grid gap-2 text-sm"><div className="flex justify-between gap-4"><dt>Channel</dt><dd className="font-medium">{channelLabels[submission.receipt.channel]}</dd></div><div className="flex justify-between gap-4"><dt>Server total</dt><dd className="font-medium">{formatMxn(submission.receipt.totalMxn)}</dd></div><div className="flex justify-between gap-4"><dt>Receipt ID</dt><dd className="max-w-[12rem] truncate font-medium" title={submission.receipt.id}>{submission.receipt.id}</dd></div></dl><button type="button" className="mt-4 min-h-11 rounded-xl border border-emerald-800 px-4 font-medium text-emerald-950 focus:outline-none focus:ring-2 focus:ring-emerald-700" onClick={startAnotherSale}>Start another sale</button></div>}
        {!isComplete && <button type="button" disabled={isSubmitting} className="mt-5 min-h-11 w-full rounded-xl bg-slate-950 px-5 font-medium text-white focus:outline-none focus:ring-2 focus:ring-sky-600 focus:ring-offset-2 disabled:opacity-60" onClick={() => void submitSale()}>{isSubmitting ? 'Recording sale…' : 'Submit sale'}</button>}
      </section>}
    </div>
  </section>
}
