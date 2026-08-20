import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { CatalogImageTile } from '../../../app/components/CatalogImageTile'
import { ResponsiveActionButton } from '../../../app/components/ResponsiveActionButton'
import { SearchInput } from '../../../app/components/SearchInput'
import { listProducts, type Product } from '../../products/api/products'
import {
  EVENT_ADVANCE_PAYMENT_METHODS,
  POS_PAYMENT_METHODS,
  WHOLESALE_DELIVERY_METHODS,
  WHOLESALE_PAYMENT_METHODS,
  recordSale,
  type EventAdvancePaymentMethod,
  type PosPaymentMethod,
  type SaleDetails,
  type SaleReceipt,
  type SalesChannel,
  type WholesaleDeliveryMethod,
  type WholesalePaymentMethod,
} from '../api/sales'

type QuantityByProduct = Record<string, string>
type LoadState = 'loading' | 'ready' | 'error'
type Submission = { status: 'submitting' | 'error' | 'success'; requestId: string; receipt?: SaleReceipt }
type SaleFormState = {
  customerName: string
  phone: string
  deliveryMethod: WholesaleDeliveryMethod | ''
  paymentMethod: PosPaymentMethod | WholesalePaymentMethod | ''
  eventName: string
  eventDate: string
  responsibleName: string
  advanceAmountMxn: string
  advancePaymentMethod: EventAdvancePaymentMethod | ''
}

type ChannelPresentation = {
  label: string
  eyebrow: string
  title: string
  description: string
  productsTitle: string
  productsDescription: string
  detailsTitle: string
  detailsDescription: string
  priceLabel: string
  accentClass: string
  actionClass: string
  cardBorderClass: string
  categorySelectedClass: string
  quantityBadgeClass: string
  productButtonClass: string
}

const channelPresentations: Record<SalesChannel, ChannelPresentation> = {
  pos: {
    label: 'Punto de venta',
    eyebrow: 'Venta en mostrador',
    title: 'Registrar venta en punto de venta',
    description: 'Registra una venta de mostrador con el catálogo compartido. El servidor confirma los precios y el total antes de guardarla.',
    productsTitle: 'Productos para mostrador',
    productsDescription: 'Selecciona productos y ajusta las cantidades para esta venta.',
    detailsTitle: 'Datos de la venta de mostrador',
    detailsDescription: 'La forma de pago es obligatoria. El nombre del cliente te ayuda a identificar la venta y es opcional.',
    priceLabel: 'Precio de menudeo',
    accentClass: 'text-sky-400',
    actionClass: 'bg-sky-600 text-white shadow-lg shadow-sky-950/30 hover:bg-sky-500',
    cardBorderClass: 'border-sky-500/40',
    categorySelectedClass: 'border-sky-400 bg-sky-500/15 text-sky-200',
    quantityBadgeClass: 'border-sky-400/30 bg-sky-500/90',
    productButtonClass: 'hover:border-sky-500',
  },
  wholesale: {
    label: 'Mayoristas',
    eyebrow: 'Venta por volumen',
    title: 'Registrar venta mayorista',
    description: 'Prepara una venta por volumen con precios mayoristas. El servidor confirma el total antes de registrarla en el registro unificado de ventas.',
    productsTitle: 'Productos para mayoristas',
    productsDescription: 'Selecciona productos y arma el pedido con las cantidades acordadas.',
    detailsTitle: 'Datos del pedido mayorista',
    detailsDescription: 'Captura los datos de contacto, la entrega y la forma de pago antes de revisar el pedido.',
    priceLabel: 'Precio de mayoreo',
    accentClass: 'text-amber-400',
    actionClass: 'bg-amber-600 text-white shadow-lg shadow-amber-950/30 hover:bg-amber-500',
    cardBorderClass: 'border-amber-500/40',
    categorySelectedClass: 'border-amber-400 bg-amber-500/15 text-amber-200',
    quantityBadgeClass: 'border-amber-400/30 bg-amber-500/90',
    productButtonClass: 'hover:border-amber-500',
  },
  event: {
    label: 'Eventos',
    eyebrow: 'Venta para eventos',
    title: 'Registrar venta para evento',
    description: 'Arma una venta para un evento con los productos compartidos. Este canal aplica el precio de menudeo al registrar la venta.',
    productsTitle: 'Productos para eventos',
    productsDescription: 'Selecciona los productos y cantidades que llevarás a la venta del evento.',
    detailsTitle: 'Datos del evento',
    detailsDescription: 'Identifica el evento, la fecha y a la persona responsable. El anticipo es opcional.',
    priceLabel: 'Precio para evento',
    accentClass: 'text-violet-400',
    actionClass: 'bg-violet-600 text-white shadow-lg shadow-violet-950/30 hover:bg-violet-500',
    cardBorderClass: 'border-violet-500/40',
    categorySelectedClass: 'border-violet-400 bg-violet-500/15 text-violet-200',
    quantityBadgeClass: 'border-violet-400/30 bg-violet-500/90',
    productButtonClass: 'hover:border-violet-500',
  },
}
const ALL_CATEGORIES = 'Todas las categorías'
const inactiveCategoryClass = 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700 hover:text-white'
const posPaymentLabels: Record<PosPaymentMethod, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', other: 'Otro' }
const wholesalePaymentLabels: Record<WholesalePaymentMethod, string> = { credit: 'Crédito', cash: 'Efectivo', transfer: 'Transferencia' }
const deliveryLabels: Record<WholesaleDeliveryMethod, string> = { delivery: 'Entrega', pickup: 'Recoger' }
const advancePaymentLabels: Record<EventAdvancePaymentMethod, string> = { cash: 'Efectivo', card: 'Tarjeta' }

function initialSaleForm(): SaleFormState {
  return {
    customerName: '',
    phone: '',
    deliveryMethod: '',
    paymentMethod: '',
    eventName: '',
    eventDate: '',
    responsibleName: '',
    advanceAmountMxn: '',
    advancePaymentMethod: '',
  }
}

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

function requiredDetail(value: string, label: string) {
  const normalized = value.trim()
  if (normalized === '') throw new Error(`${label} es obligatorio.`)
  return normalized
}

function buildSaleDetails(channel: SalesChannel, form: SaleFormState): SaleDetails {
  if (channel === 'pos') {
    if (!POS_PAYMENT_METHODS.includes(form.paymentMethod as PosPaymentMethod)) throw new Error('Selecciona una forma de pago para la venta.')
    const customerName = form.customerName.trim()
    return {
      channel,
      ...(customerName ? { customerName } : {}),
      paymentMethod: form.paymentMethod as PosPaymentMethod,
    }
  }
  if (channel === 'wholesale') {
    if (!WHOLESALE_DELIVERY_METHODS.includes(form.deliveryMethod as WholesaleDeliveryMethod)) throw new Error('Selecciona un método de entrega.')
    if (!WHOLESALE_PAYMENT_METHODS.includes(form.paymentMethod as WholesalePaymentMethod)) throw new Error('Selecciona una forma de pago para el pedido.')
    return {
      channel,
      customerName: requiredDetail(form.customerName, 'El nombre del cliente'),
      phone: requiredDetail(form.phone, 'El teléfono del cliente'),
      deliveryMethod: form.deliveryMethod as WholesaleDeliveryMethod,
      paymentMethod: form.paymentMethod as WholesalePaymentMethod,
    }
  }
  const advanceText = form.advanceAmountMxn.trim()
  let advanceAmountMxn: number | undefined
  if (advanceText !== '') {
    advanceAmountMxn = Number(advanceText)
    if (!Number.isFinite(advanceAmountMxn) || advanceAmountMxn < 0) throw new Error('El anticipo debe ser un monto MXN no negativo.')
  }
  const eventDate = form.eventDate.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) throw new Error('La fecha del evento debe tener un formato válido.')
  if (advanceAmountMxn !== undefined && advanceAmountMxn > 0 && !EVENT_ADVANCE_PAYMENT_METHODS.includes(form.advancePaymentMethod as EventAdvancePaymentMethod)) {
    throw new Error('Selecciona una forma de pago para el anticipo.')
  }
  return {
    channel,
    eventName: requiredDetail(form.eventName, 'El nombre del evento'),
    eventDate,
    responsibleName: requiredDetail(form.responsibleName, 'El nombre de la persona responsable'),
    ...(advanceAmountMxn === undefined ? {} : { advanceAmountMxn }),
    ...(advanceAmountMxn !== undefined && advanceAmountMxn > 0
      ? { advancePaymentMethod: form.advancePaymentMethod as EventAdvancePaymentMethod }
      : {}),
  }
}

function SaleDetailsSection({
  channel,
  presentation,
  form,
  disabled,
  onChange,
}: {
  channel: SalesChannel
  presentation: ChannelPresentation
  form: SaleFormState
  disabled: boolean
  onChange: (field: keyof SaleFormState, value: string) => void
}) {
  const inputClass = 'ops-control mt-2 min-h-11 w-full px-3 text-sm outline-none transition-colors focus:border-sky-400 focus:ring-2 focus:ring-sky-500/30'
  const choiceClass = 'flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm font-semibold text-white transition-colors has-[:checked]:border-sky-400 has-[:checked]:bg-sky-500/10'

  return <section aria-labelledby="sale-details-title" className={`mb-5 rounded-2xl border bg-slate-950/55 p-4 ${presentation.cardBorderClass}`}>
    <h2 id="sale-details-title" className={`text-sm font-black uppercase tracking-[0.12em] ${presentation.accentClass}`}>{presentation.detailsTitle}</h2>
    <p className="mt-2 text-xs leading-relaxed text-slate-400">{presentation.detailsDescription}</p>

    {channel === 'pos' && <div className="mt-4 grid gap-4">
      <label className="text-xs font-bold text-slate-300">Nombre del cliente <span className="font-normal text-slate-500">(opcional)</span>
        <input className={inputClass} value={form.customerName} disabled={disabled} onChange={(event) => onChange('customerName', event.target.value)} placeholder="Ej. Ana López" />
      </label>
      <fieldset>
        <legend className="text-xs font-bold text-slate-300">Forma de pago <span className="text-amber-300">(obligatoria)</span></legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {POS_PAYMENT_METHODS.map((method) => <label key={method} className={choiceClass}>
            <input type="radio" name="pos-payment-method" value={method} checked={form.paymentMethod === method} disabled={disabled} onChange={(event) => onChange('paymentMethod', event.target.value)} className="h-4 w-4 accent-sky-400" />
            {posPaymentLabels[method]}
          </label>)}
        </div>
      </fieldset>
    </div>}

    {channel === 'wholesale' && <div className="mt-4 grid gap-4">
      <label className="text-xs font-bold text-slate-300">Nombre del cliente <span className="text-amber-300">(obligatorio)</span>
        <input className={inputClass} value={form.customerName} disabled={disabled} onChange={(event) => onChange('customerName', event.target.value)} placeholder="Ej. Tienda La Plaza" />
      </label>
      <label className="text-xs font-bold text-slate-300">Teléfono <span className="text-amber-300">(obligatorio)</span>
        <input className={inputClass} value={form.phone} disabled={disabled} onChange={(event) => onChange('phone', event.target.value)} inputMode="tel" placeholder="Ej. 55 1234 5678" />
      </label>
      <label className="text-xs font-bold text-slate-300">Método de entrega <span className="text-amber-300">(obligatorio)</span>
        <select className={inputClass} value={form.deliveryMethod} disabled={disabled} onChange={(event) => onChange('deliveryMethod', event.target.value)}>
          <option value="">Selecciona una opción</option>
          {WHOLESALE_DELIVERY_METHODS.map((method) => <option key={method} value={method}>{deliveryLabels[method]}</option>)}
        </select>
      </label>
      <fieldset>
        <legend className="text-xs font-bold text-slate-300">Forma de pago <span className="text-amber-300">(obligatoria)</span></legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {WHOLESALE_PAYMENT_METHODS.map((method) => <label key={method} className={choiceClass}>
            <input type="radio" name="wholesale-payment-method" value={method} checked={form.paymentMethod === method} disabled={disabled} onChange={(event) => onChange('paymentMethod', event.target.value)} className="h-4 w-4 accent-amber-400" />
            {wholesalePaymentLabels[method]}
          </label>)}
        </div>
      </fieldset>
    </div>}

    {channel === 'event' && <div className="mt-4 grid gap-4">
      <label className="text-xs font-bold text-slate-300">Nombre del evento <span className="text-amber-300">(obligatorio)</span>
        <input className={inputClass} value={form.eventName} disabled={disabled} onChange={(event) => onChange('eventName', event.target.value)} placeholder="Ej. Festival de verano" />
      </label>
      <label className="text-xs font-bold text-slate-300">Fecha del evento <span className="text-amber-300">(obligatoria)</span>
        <input className={inputClass} type="date" value={form.eventDate} disabled={disabled} onChange={(event) => onChange('eventDate', event.target.value)} />
      </label>
      <label className="text-xs font-bold text-slate-300">Responsable o cliente <span className="text-amber-300">(obligatorio)</span>
        <input className={inputClass} value={form.responsibleName} disabled={disabled} onChange={(event) => onChange('responsibleName', event.target.value)} placeholder="Ej. Mariana Torres" />
      </label>
      <label className="text-xs font-bold text-slate-300">Anticipo en MXN <span className="font-normal text-slate-500">(opcional)</span>
        <input className={inputClass} type="number" min="0" step="0.01" inputMode="decimal" value={form.advanceAmountMxn} disabled={disabled} onChange={(event) => onChange('advanceAmountMxn', event.target.value)} placeholder="0.00" />
      </label>
      {Number(form.advanceAmountMxn) > 0 && <fieldset>
        <legend className="text-xs font-bold text-slate-300">Forma de pago del anticipo <span className="text-amber-300">(obligatoria si hay anticipo)</span></legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {EVENT_ADVANCE_PAYMENT_METHODS.map((method) => <label key={method} className={choiceClass}>
            <input type="radio" name="event-advance-payment-method" value={method} checked={form.advancePaymentMethod === method} disabled={disabled} onChange={(event) => onChange('advancePaymentMethod', event.target.value)} className="h-4 w-4 accent-violet-400" />
            {advancePaymentLabels[method]}
          </label>)}
        </div>
      </fieldset>}
    </div>}
  </section>
}

export function SalesWorkspace({ channel }: { channel: SalesChannel }) {
  const [products, setProducts] = useState<Product[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES)
  const [quantities, setQuantities] = useState<QuantityByProduct>({})
  const [saleForm, setSaleForm] = useState<SaleFormState>(initialSaleForm)
  const [reviewed, setReviewed] = useState(false)
  const [reviewedDetails, setReviewedDetails] = useState<SaleDetails | null>(null)
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

  function changeQuantity(productId: string, value: string) {
    setQuantities((current) => ({ ...current, [productId]: value }))
    setReviewed(false)
    setReviewedDetails(null)
    setValidationError('')
    setSubmission(null)
  }

  function changeSaleDetail(field: keyof SaleFormState, value: string) {
    setSaleForm((current) => ({ ...current, [field]: value }))
    setReviewed(false)
    setReviewedDetails(null)
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
    setSaleForm(initialSaleForm())
    setReviewed(false)
    setReviewedDetails(null)
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
      setValidationError('Usa un número entero positivo para cada producto seleccionado.')
      return
    }
    if (items.length === 0) {
      setValidationError('Selecciona al menos un producto para agregarlo a la venta.')
      return
    }
    let details: SaleDetails
    try {
      details = buildSaleDetails(channel, saleForm)
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Completa los datos de la venta.')
      return
    }
    setValidationError('')
    setSubmission(null)
    setReviewedDetails(details)
    setReviewed(true)
  }

  async function submitSale() {
    const items = getSaleItems(products, quantities)
    if (items.length === 0) return
    if (!reviewedDetails) return
    const requestId = submission?.requestId ?? createRequestId()
    setSubmission({ status: 'submitting', requestId })
    try {
      const receipt = await recordSale({ requestId, channel, details: reviewedDetails, items: items.map(({ product, quantity }) => ({ productId: product.id, quantity })) })
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
  const presentation = channelPresentations[channel]
  const categories = [ALL_CATEGORIES, ...Array.from(new Set(products.map((product) => product.category).filter(Boolean)))]
  const filteredProducts = products.filter((product) => {
    const matchesCategory = selectedCategory === ALL_CATEGORIES || product.category === selectedCategory
    return matchesCategory && matchesSearch(product, searchQuery)
  })
  const cartProducts = products.filter((product) => (quantities[product.id] ?? '').trim() !== '')
  const saleItems = getSaleItems(products, quantities)
  const itemCount = saleItems.reduce((total, { quantity }) => total + quantity, 0)
  const displayEstimate = saleItems.reduce((total, { product, quantity }) => total + quantity * priceFor(product, channel), 0)

  return <section aria-labelledby="sales-title" className="w-full rounded-[1.75rem] border border-slate-800 bg-slate-950 p-4 text-slate-100 shadow-xl sm:p-6 lg:p-8">
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className={`text-xs font-bold uppercase tracking-[0.16em] ${presentation.accentClass}`}>{presentation.eyebrow}</p>
        <h1 id="sales-title" className="mt-2 text-2xl font-black tracking-tight text-white sm:text-3xl">{presentation.title}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">{presentation.description}</p>
      </div>
      <ResponsiveActionButton
        type="button"
        label="Actualizar productos"
        icon="refresh"
        mobileDisplay="text"
        disabled={loadState === 'loading' || isSubmitting}
        onClick={() => void load()}
        className="border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800"
      >Actualizar productos</ResponsiveActionButton>
    </div>

    <form onSubmit={reviewSale} className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)]">
      <div className="min-w-0">
        <section aria-labelledby="product-list-title" className="border-b border-slate-800 pb-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="product-list-title" className={`text-sm font-bold uppercase tracking-[0.12em] ${presentation.accentClass}`}>{presentation.productsTitle}</h2>
              <p className="mt-1 text-xs text-slate-500">{presentation.productsDescription}</p>
            </div>
            <span className="text-xs font-semibold text-slate-500">{products.length} productos activos</span>
          </div>
        </section>

        {loadState === 'loading' && <div role="status" className="mt-6">
          <p className="text-sm font-semibold text-slate-300">Cargando productos…</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4].map((placeholder) => <div key={placeholder} aria-hidden="true" className="aspect-[4/5] animate-pulse rounded-2xl border border-slate-800 bg-slate-900/70" />)}
          </div>
        </div>}

        {loadState === 'error' && <div ref={alert} tabIndex={-1} role="alert" className="mt-6 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100">
          <p className="font-semibold">No se pudieron cargar los productos.</p>
          <p className="mt-1 text-sm text-rose-200/80">Revisa la conexión con el catálogo e inténtalo de nuevo.</p>
          <ResponsiveActionButton type="button" label="Reintentar" icon="refresh" mobileDisplay="text" onClick={() => void load()} className="mt-4 bg-rose-600 text-white hover:bg-rose-500">Reintentar</ResponsiveActionButton>
        </div>}

        {loadState === 'ready' && products.length === 0 && <p className="mt-6 rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-6 text-sm text-slate-300">No hay productos activos en el catálogo. Agrega un producto activo antes de registrar una venta.</p>}

        {loadState === 'ready' && products.length > 0 && <div id="sale-products" role="tabpanel" aria-labelledby="product-list-title" className="mt-6">
          <div className="flex flex-col gap-4">
            <SearchInput
              label="Buscar productos"
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Busca por producto, SKU o categoría"
              containerClassName="w-full"
              className="border-slate-800 bg-slate-900/80 text-white placeholder:text-slate-500"
            />
            <div role="tablist" aria-label="Categorías de productos" className="flex min-w-0 gap-2 overflow-x-auto pb-1">
              {categories.map((category) => <ResponsiveActionButton
                key={category}
                type="button"
                role="tab"
                aria-selected={selectedCategory === category}
                label={category}
                mobileDisplay="text"
                onClick={() => setSelectedCategory(category)}
                className={`shrink-0 border px-4 text-xs ${selectedCategory === category ? presentation.categorySelectedClass : inactiveCategoryClass}`}
              >{category}</ResponsiveActionButton>)}
            </div>
          </div>

          <div className="mt-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-300">Catálogo de productos</h2>
              <p className="mt-1 text-xs text-slate-500">Toca Agregar para armar la venta. Ajusta las cantidades en el carrito.</p>
            </div>
            <span className="shrink-0 text-xs font-semibold text-slate-500">{filteredProducts.length} mostrados</span>
          </div>

          {filteredProducts.length === 0 ? <div className="mt-4 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center">
            <p className="text-sm font-semibold text-slate-300">No hay productos que coincidan con estos filtros.</p>
            <ResponsiveActionButton type="button" label="Limpiar filtros de productos" mobileDisplay="text" onClick={() => { setSearchQuery(''); setSelectedCategory(ALL_CATEGORIES) }} className="mt-4 border border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700">Limpiar filtros</ResponsiveActionButton>
          </div> : <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((product) => {
              const quantity = parseQuantity(quantities[product.id] ?? '') ?? 0
              const price = priceFor(product, channel)
              return <article key={product.id} data-testid="sales-product-card" className="group flex min-w-0 flex-col rounded-2xl border border-slate-800 bg-slate-900/65 p-3 transition-colors hover:border-slate-700 hover:bg-slate-900">
                <CatalogImageTile
                  src={product.imageUrl}
                  alt={product.name}
                  imageClassName="transition-transform duration-200 group-hover:scale-105"
                  className="aspect-square w-full border-slate-800 bg-slate-950"
                >
                  {quantity > 0 && <span className={`absolute right-2 top-2 rounded-full border px-2 py-1 text-[10px] font-black text-white ${presentation.quantityBadgeClass}`}>{quantity} en el carrito</span>}
                </CatalogImageTile>
                <div className="mt-3 min-w-0">
                  <h3 className="truncate text-sm font-bold text-white" title={product.name}>{product.name}</h3>
                  <p className="mt-1 truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{product.category} · {product.sku}</p>
                  <p className="mt-2 text-xs font-semibold text-slate-300">{presentation.priceLabel} <span className="font-black text-white">{formatMxn(price)}</span></p>
                </div>
                <ResponsiveActionButton
                  type="button"
                  label={`${quantity > 0 ? 'Agregar otra unidad de' : 'Agregar'} ${product.name} a la venta`}
                  mobileDisplay="text"
                  disabled={isSubmitting || isComplete}
                  onClick={() => addProduct(product.id)}
                  className={`mt-3 w-full border border-slate-700 bg-slate-950 text-slate-200 hover:text-white ${presentation.productButtonClass}`}
                >{quantity > 0 ? 'Agregar más' : 'Agregar a la venta'}</ResponsiveActionButton>
              </article>
            })}
          </div>}
        </div>}
      </div>

      <aside aria-labelledby={reviewed ? 'review-title' : 'cart-title'} className={`h-fit rounded-2xl border bg-slate-900/85 p-4 shadow-xl lg:sticky lg:top-6 ${reviewed ? presentation.cardBorderClass : 'border-slate-800'}`}>
         <div className="flex items-start justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h2 id={reviewed ? 'review-title' : 'cart-title'} className="text-base font-black text-white">{reviewed ? 'Revisar venta' : 'Resumen del carrito'}</h2>
            <p className="mt-1 text-xs text-slate-500">{presentation.label} · {itemCount} {itemCount === 1 ? 'artículo' : 'artículos'}</p>
          </div>
           {cartProducts.length > 0 && <ResponsiveActionButton type="button" label="Vaciar selección de venta" icon="close" mobileDisplay="text" onClick={clearCart} disabled={isSubmitting || isComplete} className="text-xs text-slate-400 hover:bg-slate-800 hover:text-white">Vaciar</ResponsiveActionButton>}
         </div>

         <SaleDetailsSection channel={channel} presentation={presentation} form={saleForm} disabled={isSubmitting || isComplete} onChange={changeSaleDetail} />

         {cartProducts.length === 0 ? <div className="py-10 text-center">
          <p className="text-sm font-semibold text-slate-300">El carrito está vacío.</p>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">Agrega productos del catálogo para iniciar una venta.</p>
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
                  <p className="mt-1 text-xs text-slate-500">{presentation.label} · {presentation.priceLabel} · {formatMxn(price)} / unidad</p>
                </div>
                <span className="shrink-0 text-sm font-black text-white">{quantity === null ? '—' : formatMxn(quantity * price)}</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div role="group" aria-label={`Controles de cantidad para ${product.name}`} className="flex items-center rounded-xl border border-slate-700 bg-slate-950 p-1">
                  <button type="button" aria-label={`Disminuir cantidad de ${product.name}`} disabled={isSubmitting || isComplete} onClick={() => adjustQuantity(product.id, -1)} className="ops-focus inline-flex h-11 w-11 items-center justify-center rounded-lg text-lg font-bold text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50">−</button>
                  <input
                    aria-label={`Cantidad de ${product.name}`}
                    aria-invalid={invalid}
                    disabled={isSubmitting || isComplete}
                    inputMode="numeric"
                    type="text"
                    value={value}
                    onChange={(event) => changeQuantity(product.id, event.target.value)}
                    className="min-h-11 w-14 border-0 bg-transparent px-1 text-center text-sm font-black text-white outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <button type="button" aria-label={`Aumentar cantidad de ${product.name}`} disabled={isSubmitting || isComplete} onClick={() => adjustQuantity(product.id, 1)} className="ops-focus inline-flex h-11 w-11 items-center justify-center rounded-lg text-lg font-bold text-slate-400 hover:bg-slate-800 hover:text-white disabled:opacity-50">+</button>
                </div>
                {invalid ? <span className="text-right text-[11px] font-semibold text-amber-300">Usa un número entero</span> : <span className="text-xs font-semibold text-slate-500">{quantity} {quantity === 1 ? 'unidad' : 'unidades'}</span>}
              </div>
            </li>
          })}
        </ul>}

        <div className="mt-4 border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between gap-3 text-sm font-bold text-slate-300"><span>Estimación visible</span><span className="text-lg font-black text-sky-300">{formatMxn(displayEstimate)}</span></div>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">El total final lo confirma el servidor al registrar la venta.</p>
        </div>

        {validationError && <div ref={alert} tabIndex={-1} role="alert" className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100">{validationError}</div>}
        {submission?.status === 'error' && <div ref={alert} tabIndex={-1} role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-rose-100">
          <p className="text-sm font-semibold">No se pudo registrar la venta. Inténtalo de nuevo.</p>
          <ResponsiveActionButton type="button" label="Reintentar venta" icon="refresh" mobileDisplay="text" onClick={() => void submitSale()} className="mt-3 w-full bg-rose-600 text-white hover:bg-rose-500">Reintentar venta</ResponsiveActionButton>
        </div>}

        {submission?.status === 'success' && submission.receipt && <div role="status" className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-100">
          <h3 className="font-bold">{submission.receipt.replayed ? 'La venta ya estaba registrada' : 'Venta registrada'}</h3>
          <dl className="mt-3 grid gap-2 text-sm">
            <div className="flex justify-between gap-4"><dt>Canal</dt><dd className="font-semibold">{channelPresentations[submission.receipt.channel].label}</dd></div>
            <div className="flex justify-between gap-4"><dt>Total confirmado</dt><dd className="font-semibold">{formatMxn(submission.receipt.totalMxn)}</dd></div>
            <div className="flex justify-between gap-4"><dt>ID del recibo</dt><dd className="max-w-[12rem] truncate font-semibold" title={submission.receipt.id}>{submission.receipt.id}</dd></div>
          </dl>
          <ResponsiveActionButton type="button" label="Iniciar otra venta" icon="refresh" mobileDisplay="text" onClick={startAnotherSale} className="mt-4 w-full border border-emerald-400/40 text-emerald-100 hover:bg-emerald-500/10">Iniciar otra venta</ResponsiveActionButton>
        </div>}

        {!isComplete && submission?.status !== 'error' && <div className="mt-5 max-lg:sticky max-lg:bottom-3 max-lg:z-10 max-lg:-mx-1 max-lg:rounded-2xl max-lg:bg-slate-900/95 max-lg:p-1">
          {!reviewed ? <ResponsiveActionButton type="submit" label="Revisar venta" icon="sale" mobileDisplay="text" disabled={isSubmitting || cartProducts.length === 0} className={`w-full disabled:opacity-40 ${presentation.actionClass}`}>Revisar venta</ResponsiveActionButton> : <ResponsiveActionButton type="button" label={isSubmitting ? 'Registrando venta' : 'Registrar venta'} icon="sale" mobileDisplay="text" loading={isSubmitting} loadingLabel="Registrando venta" disabled={isSubmitting || saleItems.length === 0} onClick={() => void submitSale()} className={`w-full disabled:opacity-40 ${presentation.actionClass}`}>{isSubmitting ? 'Registrando venta' : 'Registrar venta'}</ResponsiveActionButton>}
        </div>}
      </aside>
    </form>
  </section>
}
