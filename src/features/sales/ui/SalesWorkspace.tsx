import { type FormEvent, type KeyboardEvent, useContext, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { NavigationDrawerOpenContext } from '../../../app/navigationDrawerContext'
import { CatalogControlsHeader, CatalogMobileSummary, CatalogPricePair, CatalogSelectionCard } from '../../../app/components/CatalogPresentation'
import { CatalogImageTile } from '../../../app/components/CatalogImageTile'
import { CustomSelect } from '../../../app/components/CustomSelect'
import { InfoButton } from '../../../app/components/InfoButton'
import { Modal } from '../../../app/components/Modal'
import { ResponsiveActionButton } from '../../../app/components/ResponsiveActionButton'
import { SearchInput } from '../../../app/components/SearchInput'
import { Icon } from '../../../app/components/icons'
import { isSessionBoolean, isSessionRecord, isSessionString, isSessionStringRecord, useAdminSessionPersistence } from '../../../app/sessionPersistence'
import { getOperationalConfiguration } from '../../configuration/api/configuration'
import { getSalesReceiptConfiguration } from '../../configuration/api/salesReceipt'
import { subscribeToProductCatalogChanges } from '../../products/api/catalogRealtime'
import { listActiveProductsForPos, type Product } from '../../products/api/products'
import { POS_CATALOG_QUERY_KEY } from '../api/posCatalog'
import {
  POS_PAYMENT_METHODS,
  WHOLESALE_DELIVERY_METHODS,
  WHOLESALE_PAYMENT_METHODS,
  recordSale,
  POS_PAYMENT_CURRENCIES,
  type PosPaymentCurrency,
  type PosPaymentMethod,
  type SaleDetails,
  type SaleItemInput,
  type SaleReceipt,
  type SaleReceiptLine,
  type SalesChannel,
  type WholesaleDeliveryMethod,
  type WholesalePaymentMethod,
} from '../api/sales'
import { DEFAULT_POS_USD_MXN_RATE, type PosShift } from '../api/posShifts'
import { buildPosCatalogCategories, createRequestId, getPosCashChange, getPosCategoryPriceLabel, getPosCategoryQuantityById, getPosCategoryUnitPrice, getPosPriceLabel, getPosUsdReceivedMxn, getPosUnitPrice, getValidatedCategoryPrice, isPosWholesaleQuantity, type PosCatalogCategory } from './posUtils'
import { PosTicketPreview } from './PosTicketPreview'

type QuantityByLine = Record<string, string>
type Submission = { status: 'submitting' | 'error' | 'success'; requestId: string; receipt?: SaleReceipt }
type SaleFormState = {
  customerName: string
  phone: string
  deliveryMethod: WholesaleDeliveryMethod | ''
  paymentMethod: PosPaymentMethod | WholesalePaymentMethod | ''
  paymentCurrency: PosPaymentCurrency
  usdPaid: string
  receivedAmountMxn: string
}
type SaleValidationErrors = Record<string, string>
type SalesSessionState = {
  searchQuery: string
  selectedCategory: string
  viewMode: 'products' | 'categories'
  productsInfoOpen: boolean
  catalogInfoOpen: boolean
  estimateInfoOpen: boolean
  quantities: QuantityByLine
  saleForm: SaleFormState
  mobileCheckoutStep: 'catalog' | 'review'
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
  cardBorderClass: string
  quantityBadgeClass: string
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
    detailsDescription: '',
    priceLabel: 'Precio de menudeo',
    accentClass: 'text-sky-400',
    cardBorderClass: 'border-sky-500/40',
    quantityBadgeClass: 'border-sky-400/30 bg-sky-500/90',
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
    cardBorderClass: 'border-amber-500/40',
    quantityBadgeClass: 'border-amber-400/30 bg-amber-500/90',
  },
  event: {
    label: 'Eventos',
    eyebrow: 'Venta para eventos',
    title: 'Registrar venta para evento',
    description: 'Arma una venta para un evento con los productos compartidos. Este canal aplica el precio de menudeo al registrar la venta.',
    productsTitle: 'Productos para eventos',
    productsDescription: 'Selecciona los productos y cantidades que llevarás a la venta del evento.',
    detailsTitle: 'Datos del evento',
    detailsDescription: 'Las ventas de Eventos se generan únicamente al completar una reserva.',
    priceLabel: 'Precio para evento',
    accentClass: 'text-violet-400',
    cardBorderClass: 'border-violet-500/40',
    quantityBadgeClass: 'border-violet-400/30 bg-violet-500/90',
  },
}
const ALL_CATEGORIES = 'Todas las categorías'
const POS_SALE_DRAFT_STORAGE_KEY = 'paletixa:pos-sale-draft'
const posPaymentLabels: Record<PosPaymentMethod, string> = { cash: 'Efectivo', card: 'Tarjeta' }
const wholesalePaymentLabels: Record<WholesalePaymentMethod, string> = { credit: 'Crédito', cash: 'Efectivo', transfer: 'Transferencia' }
const deliveryLabels: Record<WholesaleDeliveryMethod, string> = { delivery: 'Entrega', pickup: 'Recoger' }
const NO_WHOLESALE_PRICE = 'Sin precio mayorista'
const CATALOG_INVALIDATION_DEBOUNCE_MS = 100

function initialSaleForm(channel: SalesChannel = 'pos'): SaleFormState {
  return {
    customerName: '',
    phone: '',
    deliveryMethod: '',
    paymentMethod: channel === 'pos' ? 'cash' : '',
    paymentCurrency: 'mxn',
    usdPaid: '',
    receivedAmountMxn: '',
  }
}

function isSalesSessionState(value: unknown): value is SalesSessionState {
  if (!isSessionRecord(value) || !isSessionString(value.searchQuery) || !isSessionString(value.selectedCategory) || !isSessionString(value.viewMode) || !['products', 'categories'].includes(value.viewMode) || !isSessionBoolean(value.productsInfoOpen) || !isSessionBoolean(value.catalogInfoOpen) || !isSessionBoolean(value.estimateInfoOpen) || !isSessionStringRecord(value.quantities) || !isSessionRecord(value.saleForm) || !isSessionString(value.mobileCheckoutStep) || !['catalog', 'review'].includes(value.mobileCheckoutStep)) return false
  const form = value.saleForm
  return isSessionString(form.customerName) && isSessionString(form.phone) && isSessionString(form.deliveryMethod) && ['', ...WHOLESALE_DELIVERY_METHODS].includes(form.deliveryMethod) && isSessionString(form.paymentMethod) && [...POS_PAYMENT_METHODS, ...WHOLESALE_PAYMENT_METHODS, ''].includes(form.paymentMethod) && isSessionString(form.paymentCurrency) && POS_PAYMENT_CURRENCIES.includes(form.paymentCurrency as PosPaymentCurrency) && isSessionString(form.usdPaid) && isSessionString(form.receivedAmountMxn)
}

function formatMxn(value: number) {
  return `$${value.toFixed(2)} MXN`
}

function formatCatalogPrice(value: number) {
  return `$${value.toFixed(2)}`
}

function formatWholesaleCatalogPrice(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? formatCatalogPrice(value) : NO_WHOLESALE_PRICE
}

function wholesalePriceClass(value: number | null | undefined, availableClass = 'text-amber-300') {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? availableClass : 'text-slate-400'
}

function PosPricePair({ retailPriceMxn, wholesalePriceMxn, appliedLabel }: { retailPriceMxn: number; wholesalePriceMxn: number | null; appliedLabel?: string }) {
  const retailIsActive = appliedLabel === 'Precio de menudeo'
  const wholesaleIsActive = appliedLabel === 'Precio de mayoreo'
  return <CatalogPricePair
    dataTestId="pos-price-pair"
    dataActivePrice={appliedLabel}
    active={retailIsActive ? 'retail' : wholesaleIsActive ? 'wholesale' : undefined}
    retailValue={formatCatalogPrice(retailPriceMxn)}
    wholesaleValue={<span className={wholesalePriceClass(wholesalePriceMxn)}>{formatWholesaleCatalogPrice(wholesalePriceMxn)}</span>}
  />
}

function priceFor(product: Product, channel: SalesChannel, categoryQuantity = 0, wholesaleThreshold?: number) {
  if (channel === 'wholesale') return product.wholesalePriceMxn
  if (channel === 'pos') return getPosUnitPrice(product, categoryQuantity, wholesaleThreshold)
  return product.retailPriceMxn
}

function priceLabelFor(channel: SalesChannel, categoryQuantity: number, wholesalePriceMxn?: number | null, wholesaleThreshold?: number) {
  return channel === 'pos' ? getPosPriceLabel(categoryQuantity, wholesalePriceMxn, wholesaleThreshold) : channelPresentations[channel].priceLabel
}

function parseQuantity(value: string) {
  if (value.trim() === '') return null
  const quantity = Number(value)
  return Number.isInteger(quantity) && quantity > 0 ? quantity : null
}

function readPosQuantityDraft(): QuantityByLine {
  try {
    if (typeof window === 'undefined') return {}
    const stored = window.localStorage.getItem(POS_SALE_DRAFT_STORAGE_KEY)
    if (stored === null) return {}
    const parsed: unknown = JSON.parse(stored)
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    const entries = Object.entries(parsed)
    if (entries.some(([key, value]) => typeof key !== 'string' || key.trim() === '' || typeof value !== 'string' || value.trim() === '')) return {}
    return Object.fromEntries(entries)
  } catch {
    return {}
  }
}

function persistPosQuantities(quantities: QuantityByLine) {
  try {
    if (typeof window === 'undefined') return
    const entries = Object.entries(quantities).filter(([key, value]) => typeof key === 'string' && key.trim() !== '' && typeof value === 'string' && value.trim() !== '')
    if (entries.length === 0) {
      window.localStorage.removeItem(POS_SALE_DRAFT_STORAGE_KEY)
      return
    }
    window.localStorage.setItem(POS_SALE_DRAFT_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // Local draft persistence is an enhancement; sales remain usable without localStorage.
  }
}

type SaleWorkspaceLine =
  | { key: string; lineKind: 'product'; product: Product; quantity: number }
  | { key: string; lineKind: 'category'; category: PosCatalogCategory; quantity: number }
type ValidatedSale = { items: SaleWorkspaceLine[]; details: SaleDetails }

type DisplaySaleWorkspaceLine =
  | { key: string; lineKind: 'product'; product: Product; quantity: number | null }
  | { key: string; lineKind: 'category'; category: PosCatalogCategory; quantity: number | null }

function toSaleItemInput(item: SaleWorkspaceLine): SaleItemInput {
  return item.lineKind === 'category'
    ? { lineKind: 'category', categoryId: item.category.id, quantity: item.quantity }
    : { productId: item.product.id, quantity: item.quantity }
}

function getSaleItems(products: Product[], categories: PosCatalogCategory[], quantities: QuantityByLine): SaleWorkspaceLine[] {
  const productLines = products.flatMap((product) => {
    const quantity = parseQuantity(quantities[product.id] ?? '')
    return quantity === null ? [] : [{ key: product.id, lineKind: 'product' as const, product, quantity }]
  })
  const categoryLines = categories.flatMap((category) => {
    const quantity = parseQuantity(quantities[`category:${category.id}`] ?? '')
    return quantity === null ? [] : [{ key: `category:${category.id}`, lineKind: 'category' as const, category, quantity }]
  })
  return [...productLines, ...categoryLines]
}

function getCartItems(products: Product[], categories: PosCatalogCategory[], quantities: QuantityByLine): DisplaySaleWorkspaceLine[] {
  const productLines = products.flatMap((product) => {
    const value = quantities[product.id] ?? ''
    return value.trim() === '' ? [] : [{ key: product.id, lineKind: 'product' as const, product, quantity: parseQuantity(value) }]
  })
  const categoryLines = categories.flatMap((category) => {
    const value = quantities[`category:${category.id}`] ?? ''
    return value.trim() === '' ? [] : [{ key: `category:${category.id}`, lineKind: 'category' as const, category, quantity: parseQuantity(value) }]
  })
  return [...productLines, ...categoryLines]
}

function lineUsesUnavailableWholesalePrice(products: Product[], item: SaleWorkspaceLine | DisplaySaleWorkspaceLine, channel: SalesChannel) {
  if (channel !== 'wholesale') return false
  if (item.lineKind === 'product') {
    return !Number.isFinite(item.product.wholesalePriceMxn) || item.product.wholesalePriceMxn <= 0
  }
  return getValidatedCategoryPrice(products, item.category.id, true) === null
}

function matchesSearch(product: Product, query: string) {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const searchableText = `${product.name} ${product.sku} ${product.category} ${product.tags.join(' ')}`.toLowerCase()
  return terms.every((term) => searchableText.includes(term))
}

function requiredDetail(value: string, label: string) {
  const normalized = value.trim()
  if (normalized === '') throw new Error(`${label} es obligatorio.`)
  return normalized
}

function fieldErrorId(field: string) {
  return `sale-field-error-${field.replace(/[^a-zA-Z0-9]+/g, '-')}`
}

function formatValidationErrors(errors: SaleValidationErrors) {
  return [...new Set(Object.values(errors))].join(' ')
}

function activateCatalogCard(event: KeyboardEvent<HTMLElement>, action: () => void, disabled: boolean) {
  if (disabled || (event.key !== 'Enter' && event.key !== ' ')) return
  event.preventDefault()
  action()
}

function addTextValidationError(errors: SaleValidationErrors, field: keyof SaleFormState, value: string, label: string) {
  const normalized = value.trim()
  if (normalized === '') {
    errors[field] = `${label} es obligatorio.`
  } else if (normalized.length < 2) {
    errors[field] = `${label} debe tener al menos 2 caracteres.`
  } else if (normalized.length > 160) {
    errors[field] = `${label} no puede superar 160 caracteres.`
  }
}

function validateSaleForm(channel: SalesChannel, form: SaleFormState, activeShift?: PosShift, displayEstimate?: number, configuredRate?: number): SaleValidationErrors {
  const errors: SaleValidationErrors = {}

  if (channel === 'pos') {
    if (!POS_PAYMENT_METHODS.includes(form.paymentMethod as PosPaymentMethod)) errors.paymentMethod = 'Selecciona una forma de pago.'
    if (!POS_PAYMENT_CURRENCIES.includes(form.paymentCurrency)) errors.paymentCurrency = 'Selecciona la moneda del pago.'
    if (form.paymentCurrency === 'usd' && form.paymentMethod !== 'cash') errors.paymentCurrency = 'Selecciona efectivo para pagar en USD.'

    const usdMxnRate = activeShift?.usdMxnRate ?? configuredRate ?? DEFAULT_POS_USD_MXN_RATE
    if (form.paymentCurrency === 'usd' && (!Number.isFinite(usdMxnRate) || usdMxnRate <= 0)) {
      errors.usdPaid = 'No hay un tipo de cambio válido para calcular el pago en USD.'
    }

    if (form.paymentCurrency === 'usd') {
      if (form.usdPaid.trim() === '') {
        errors.usdPaid = 'Captura el monto recibido en USD.'
      } else {
        const usdPaid = Number(form.usdPaid)
        if (!Number.isFinite(usdPaid) || usdPaid <= 0) errors.usdPaid = 'El monto recibido en USD debe ser positivo y finito.'
      }
    }

    if (form.receivedAmountMxn.trim() !== '') {
      const receivedAmountMxn = Number(form.receivedAmountMxn)
      if (!Number.isFinite(receivedAmountMxn) || receivedAmountMxn < 0) errors.receivedAmountMxn = 'El efectivo recibido en MXN debe ser finito y no negativo.'
    }
    if (form.paymentMethod === 'cash' && displayEstimate !== undefined) {
      const receivedText = form.paymentCurrency === 'usd' ? form.usdPaid : form.receivedAmountMxn
      if (receivedText.trim() !== '') {
        const received = Number(receivedText)
        const change = getPosCashChange(received, displayEstimate, form.paymentCurrency, usdMxnRate)
        const field = form.paymentCurrency === 'usd' ? 'usdPaid' : 'receivedAmountMxn'
        if (!errors[field] && change !== null && change < 0) errors[field] = 'El efectivo recibido debe cubrir el total de la venta.'
      }
    }
    return errors
  }

  if (channel === 'wholesale') {
    addTextValidationError(errors, 'customerName', form.customerName, 'El nombre del cliente')
    const phone = form.phone.trim()
    if (phone === '') {
      errors.phone = 'El teléfono del cliente es obligatorio.'
    } else {
      const digits = phone.replace(/\D/g, '')
      if (phone.length > 40 || !/^\+?[0-9][0-9 ()-]{6,38}$/.test(phone) || digits.length < 7 || digits.length > 15) {
        errors.phone = 'Ingresa un teléfono válido de 7 a 15 dígitos.'
      }
    }
    if (!WHOLESALE_DELIVERY_METHODS.includes(form.deliveryMethod as WholesaleDeliveryMethod)) errors.deliveryMethod = 'Selecciona un método de entrega.'
    if (!WHOLESALE_PAYMENT_METHODS.includes(form.paymentMethod as WholesalePaymentMethod)) errors.paymentMethod = 'Selecciona una forma de pago para el pedido.'
    return errors
  }

  return errors
}

function buildSaleDetails(channel: SalesChannel, form: SaleFormState, activeShift?: PosShift, displayEstimate?: number, configuredRate?: number): SaleDetails {
  const validationErrors = validateSaleForm(channel, form, activeShift, displayEstimate, configuredRate)
  if (Object.keys(validationErrors).length > 0) throw new Error(formatValidationErrors(validationErrors))

  if (channel === 'pos') {
    if (!POS_PAYMENT_METHODS.includes(form.paymentMethod as PosPaymentMethod)) throw new Error('Selecciona una forma de pago para la venta.')
    if (!POS_PAYMENT_CURRENCIES.includes(form.paymentCurrency)) throw new Error('Selecciona la moneda del pago.')
    const usdPaid = form.usdPaid.trim() === '' ? undefined : Number(form.usdPaid)
    const receivedAmountMxn = form.receivedAmountMxn.trim() === '' ? undefined : Number(form.receivedAmountMxn)
    if (form.paymentCurrency === 'usd' && (!Number.isFinite(usdPaid) || (usdPaid ?? 0) <= 0)) throw new Error('Captura el monto recibido en USD.')
    if (form.paymentCurrency === 'mxn' && form.paymentMethod === 'cash' && receivedAmountMxn !== undefined && (!Number.isFinite(receivedAmountMxn) || (receivedAmountMxn ?? 0) < 0)) throw new Error('Captura el efectivo recibido en MXN.')
    return {
      channel,
      paymentMethod: form.paymentMethod as PosPaymentMethod,
       ...(form.paymentCurrency === 'usd' ? { paymentCurrency: 'usd' as const, usdMxnRate: activeShift?.usdMxnRate ?? configuredRate ?? DEFAULT_POS_USD_MXN_RATE, usdPaid: usdPaid as number } : {}),
      ...(receivedAmountMxn === undefined ? {} : { receivedAmountMxn }),
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
  throw new Error('Las ventas de Eventos deben completarse desde una reserva de evento.')
}

function SaleDetailsSection({
  channel,
  presentation,
  form,
  usdMxnRate,
  displayEstimate,
  errors,
  disabled,
  onChange,
}: {
  channel: SalesChannel
  presentation: ChannelPresentation
  form: SaleFormState
  usdMxnRate: number
  displayEstimate: number
  errors: SaleValidationErrors
  disabled: boolean
  onChange: (field: keyof SaleFormState, value: string) => void
}) {
  const inputClass = 'ops-control w-full px-3 text-sm'
  const choiceClass = 'ops-choice'
  const inputClassFor = (field: keyof SaleFormState, withTopMargin = true) => `${inputClass}${withTopMargin ? ' mt-2' : ''}${errors[field] ? ' border-rose-400/80' : ''}`
  const describedBy = (field: keyof SaleFormState) => errors[field] ? fieldErrorId(field) : undefined
  const cashReceivedValue = form.paymentCurrency === 'usd' ? form.usdPaid : form.receivedAmountMxn
  const cashReceived = cashReceivedValue.trim() === '' ? null : Number(cashReceivedValue)
  const cashChange = cashReceived === null ? null : getPosCashChange(cashReceived, displayEstimate, form.paymentCurrency, usdMxnRate)
  const cashChangePaddingClass = cashChange === null ? '' : form.paymentCurrency === 'usd' ? 'pr-52' : 'pr-40'
  const [paymentInfoOpen, setPaymentInfoOpen] = useState(false)
  const sectionClass = channel === 'pos'
    ? `mb-2 rounded-2xl border bg-slate-950/55 p-3 ${presentation.cardBorderClass}`
    : `mb-3 rounded-2xl border bg-slate-950/55 p-3 sm:p-4 ${presentation.cardBorderClass}`

  return <section aria-labelledby="sale-details-title" className={sectionClass}>
    <h2 id="sale-details-title" className={`text-sm font-black uppercase tracking-[0.12em] ${presentation.accentClass}`}>{presentation.detailsTitle}</h2>
    {channel !== 'pos' && presentation.detailsDescription && <p className="mt-1 text-xs leading-relaxed text-slate-400">{presentation.detailsDescription}</p>}

    {channel === 'pos' && <div className="mt-2 grid gap-2">
      <label className="ops-field-label">Cliente <span className="text-slate-500">(opcional)</span>
        <input aria-label="Cliente de la venta" className={inputClassFor('customerName', false)} maxLength={160} value={form.customerName} aria-invalid={Boolean(errors.customerName)} aria-describedby={describedBy('customerName')} disabled={disabled} onChange={(event) => onChange('customerName', event.target.value)} placeholder="Nombre del cliente" />
        {errors.customerName && <p id={fieldErrorId('customerName')} role="alert" className="ops-field-error mt-1 text-xs font-semibold text-rose-300">{errors.customerName}</p>}
      </label>
      <fieldset>
        <legend className="relative pr-11 text-xs font-bold text-slate-300"><span>Forma de pago <span className="text-amber-300">(obligatoria)</span></span><span className="absolute right-0 top-1/2 -translate-y-1/2"><InfoButton id="pos-payment-method-info" label="Explicar forma de pago" open={paymentInfoOpen} onToggle={() => setPaymentInfoOpen((current) => !current)}>Selecciona la forma de pago y captura los importes recibidos cuando corresponda.</InfoButton></span></legend>
        <div data-testid="pos-payment-method" role="group" aria-label="Forma de pago" className="mt-1 grid grid-cols-2 gap-1.5">
          {POS_PAYMENT_METHODS.map((method) => <button key={method} type="button" aria-pressed={form.paymentMethod === method} aria-invalid={Boolean(errors.paymentMethod)} aria-describedby={describedBy('paymentMethod')} disabled={disabled} onClick={() => onChange('paymentMethod', method)} className="ops-action ops-focus min-w-0 px-2 text-xs">
            {posPaymentLabels[method]}
          </button>)}
        </div>
         {errors.paymentMethod && <p id={fieldErrorId('paymentMethod')} role="alert" className="ops-field-error mt-1 text-xs font-semibold text-rose-300">{errors.paymentMethod}</p>}
      </fieldset>
      {form.paymentMethod === 'cash' ? <fieldset>
          <legend className="sr-only">Moneda del pago e importe recibido</legend>
          <div data-testid="cash-payment-row" className="grid min-w-0 grid-cols-[minmax(0,1fr)_7rem] items-start gap-2">
            <div className="min-w-0">
              {form.paymentCurrency === 'mxn' && <label className="ops-field-label"><span className="block">Importe recibido</span>
                <div data-testid="cash-input-row-mxn" className="relative mt-1 min-w-0">
                  <input aria-label="Efectivo recibido en MXN" className={`${inputClassFor('receivedAmountMxn', false)} ops-no-number-spinner ${cashChangePaddingClass}`} type="number" min="0" step="0.01" inputMode="decimal" value={form.receivedAmountMxn} aria-invalid={Boolean(errors.receivedAmountMxn)} aria-describedby={describedBy('receivedAmountMxn')} disabled={disabled} onChange={(event) => onChange('receivedAmountMxn', event.target.value)} placeholder="Importe recibido" />
                  {cashChange !== null && <div data-testid="cash-change-mxn" className="pointer-events-none absolute inset-y-0 left-3 right-3 flex min-w-0 items-center justify-end gap-1 overflow-hidden whitespace-nowrap text-right text-[11px] leading-tight" role={cashChange < 0 ? 'alert' : undefined} aria-live="polite"><span className="min-w-0 truncate text-slate-500">{cashChange < 0 ? 'Faltan' : 'Cambio'}</span><strong className={`shrink-0 ${cashChange < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>{formatMxn(Math.abs(cashChange))}</strong></div>}
                </div>
                 {errors.receivedAmountMxn && <p id={fieldErrorId('receivedAmountMxn')} role="alert" className="ops-field-error mt-1 text-xs font-semibold text-rose-300">{errors.receivedAmountMxn}</p>}
              </label>}
              {form.paymentCurrency === 'usd' && <label className="ops-field-label"><span className="block">Importe recibido</span>
                <div data-testid="cash-input-row-usd" className="relative mt-1 min-w-0">
                  <input aria-label="USD recibido" className={`${inputClassFor('usdPaid', false)} ops-no-number-spinner ${cashChangePaddingClass}`} type="number" min="0.01" step="0.01" inputMode="decimal" required aria-invalid={Boolean(errors.usdPaid)} aria-describedby={describedBy('usdPaid')} value={form.usdPaid} disabled={disabled} onChange={(event) => onChange('usdPaid', event.target.value)} placeholder="Importe recibido" />
                  {cashChange !== null && <div data-testid="cash-change-usd" className="pointer-events-none absolute inset-y-0 left-3 right-3 flex min-w-0 items-center justify-end gap-1 overflow-hidden whitespace-nowrap text-right text-[11px] leading-tight" role={cashChange < 0 ? 'alert' : undefined} aria-live="polite"><span className="min-w-0 truncate text-slate-500">{cashChange < 0 ? 'Faltan en MXN' : 'Cambio en MXN'}</span><strong className={`shrink-0 ${cashChange < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>{formatMxn(Math.abs(cashChange))}</strong></div>}
                </div>
                {form.usdPaid.trim() !== '' && getPosUsdReceivedMxn(Number(form.usdPaid), usdMxnRate) !== null && <p role="status" aria-live="polite" className="mt-1 text-xs font-semibold text-cyan-300">Equivalente recibido en MXN: {formatMxn(getPosUsdReceivedMxn(Number(form.usdPaid), usdMxnRate) ?? 0)} · Tipo de cambio: {formatMxn(usdMxnRate)} por USD</p>}
                 {errors.usdPaid && <p id={fieldErrorId('usdPaid')} role="alert" className="ops-field-error mt-1 text-xs font-semibold text-rose-300">{errors.usdPaid}</p>}
              </label>}
            </div>
            <div data-testid="pos-payment-currency" role="group" aria-label="Moneda del pago" className="grid w-28 shrink-0 grid-cols-2 gap-1.5 pt-5">
              {POS_PAYMENT_CURRENCIES.map((currency) => <button key={currency} type="button" aria-pressed={form.paymentCurrency === currency} aria-invalid={Boolean(errors.paymentCurrency)} aria-describedby={describedBy('paymentCurrency')} disabled={disabled} onClick={() => onChange('paymentCurrency', currency)} className="ops-action ops-focus min-w-0 px-2 text-xs">
                {currency.toUpperCase()}
              </button>)}
            </div>
          </div>
           {errors.paymentCurrency && <p id={fieldErrorId('paymentCurrency')} role="alert" className="ops-field-error mt-1 text-xs font-semibold text-rose-300">{errors.paymentCurrency}</p>}
        </fieldset> : <div data-testid="pos-card-currency" role="group" aria-label="Moneda del pago: MXN" className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950/70 px-3 text-xs">
          <span className="font-bold text-slate-300">Moneda del pago</span>
          <strong className="text-slate-100">MXN · tarjeta</strong>
        </div>}
    </div>}

    {channel === 'wholesale' && <div className="mt-4 grid gap-4">
      <label className="ops-field-label">Nombre del cliente <span className="text-amber-300">(obligatorio)</span>
        <input aria-label="Nombre del cliente" className={inputClassFor('customerName')} required minLength={2} maxLength={160} value={form.customerName} aria-invalid={Boolean(errors.customerName)} aria-describedby={describedBy('customerName')} disabled={disabled} onChange={(event) => onChange('customerName', event.target.value)} placeholder="Ej. Tienda La Plaza" />
         {errors.customerName && <p id={fieldErrorId('customerName')} role="alert" className="ops-field-error mt-2 text-xs font-semibold text-rose-300">{errors.customerName}</p>}
      </label>
      <label className="ops-field-label">Teléfono <span className="text-amber-300">(obligatorio)</span>
        <input aria-label="Teléfono" className={inputClassFor('phone')} required minLength={7} maxLength={40} pattern="[+]?[0-9][0-9 ()-]{6,38}" value={form.phone} aria-invalid={Boolean(errors.phone)} aria-describedby={describedBy('phone')} disabled={disabled} onChange={(event) => onChange('phone', event.target.value)} inputMode="tel" placeholder="Ej. 55 1234 5678" />
         {errors.phone && <p id={fieldErrorId('phone')} role="alert" className="ops-field-error mt-2 text-xs font-semibold text-rose-300">{errors.phone}</p>}
      </label>
      <label className="ops-field-label">Método de entrega <span className="text-amber-300">(obligatorio)</span>
        <CustomSelect className="mt-2" value={form.deliveryMethod} disabled={disabled} label="Método de entrega" placeholder="Selecciona una opción" required ariaInvalid={Boolean(errors.deliveryMethod)} ariaDescribedBy={describedBy('deliveryMethod')} options={WHOLESALE_DELIVERY_METHODS.map((method) => ({ value: method, label: deliveryLabels[method] }))} onChange={(value) => onChange('deliveryMethod', value)} />
         {errors.deliveryMethod && <p id={fieldErrorId('deliveryMethod')} role="alert" className="ops-field-error mt-2 text-xs font-semibold text-rose-300">{errors.deliveryMethod}</p>}
      </label>
      <fieldset>
        <legend className="text-xs font-bold text-slate-300">Forma de pago <span className="text-amber-300">(obligatoria)</span></legend>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {WHOLESALE_PAYMENT_METHODS.map((method) => <label key={method} className={choiceClass}>
            <input type="radio" name="wholesale-payment-method" value={method} checked={form.paymentMethod === method} required={method === WHOLESALE_PAYMENT_METHODS[0]} aria-invalid={Boolean(errors.paymentMethod)} aria-describedby={describedBy('paymentMethod')} disabled={disabled} onChange={(event) => onChange('paymentMethod', event.target.value)} />
            {wholesalePaymentLabels[method]}
          </label>)}
        </div>
         {errors.paymentMethod && <p id={fieldErrorId('paymentMethod')} role="alert" className="ops-field-error mt-2 text-xs font-semibold text-rose-300">{errors.paymentMethod}</p>}
      </fieldset>
    </div>}

  </section>
}

type SalesWorkspaceProps = { channel: SalesChannel; branchName?: string; cashierName?: string | null; activeShift?: PosShift; ticketImageUrl?: string | null; initialViewMode?: 'products' | 'categories'; mobileFooterBleed?: 'admin' | 'cashier' }

export function SalesWorkspace(props: SalesWorkspaceProps) {
  if (props.channel === 'event') {
    return <section data-testid="event-sales-disabled" aria-label="Ventas de eventos deshabilitadas" className="ops-workspace-frame flex min-h-0 min-w-0 flex-1 flex-col items-center justify-center gap-3 rounded-3xl border border-amber-500/30 bg-slate-900 p-6 text-center text-slate-100 shadow-2xl"><h1 className="text-xl font-black text-white">Las ventas de eventos se gestionan en Eventos</h1><p className="max-w-md text-sm leading-relaxed text-slate-400">Crea o confirma una reserva desde el módulo Eventos. La venta se genera únicamente al completar la entrega.</p></section>
  }
  return <SalesWorkspaceContent {...props} />
}

function SalesWorkspaceContent({ channel, branchName, cashierName, activeShift, ticketImageUrl, initialViewMode = 'categories', mobileFooterBleed = 'admin' }: SalesWorkspaceProps) {
  const persistence = useAdminSessionPersistence()
  const navigationDrawerOpen = useContext(NavigationDrawerOpenContext)?.isOpen ?? false
  const sessionModule = `sales:${channel}`
  const [restoredSession] = useState<SalesSessionState>(() => persistence?.read(sessionModule, isSalesSessionState) ?? {
    searchQuery: '',
    selectedCategory: ALL_CATEGORIES,
    viewMode: initialViewMode,
    productsInfoOpen: false,
    catalogInfoOpen: false,
    estimateInfoOpen: false,
    quantities: persistence ? {} : channel === 'pos' ? readPosQuantityDraft() : {},
    saleForm: initialSaleForm(channel),
    mobileCheckoutStep: 'catalog',
  })
  const queryClient = useQueryClient()
  const { data: operationalConfiguration } = useQuery({ queryKey: ['operational-configuration'], queryFn: getOperationalConfiguration, enabled: channel === 'pos' && !activeShift, retry: 0 })
  const { data: receiptConfiguration } = useQuery({ queryKey: ['sales-receipt-configuration'], queryFn: getSalesReceiptConfiguration, enabled: channel === 'pos', retry: 0 })
  const configuredRate = operationalConfiguration?.find((setting) => setting.key === 'pos_usd_mxn_rate')?.value
  const wholesaleThreshold = operationalConfiguration?.find((setting) => setting.key === 'pos_wholesale_threshold')?.value
  const usdMxnRate = activeShift?.usdMxnRate ?? configuredRate ?? DEFAULT_POS_USD_MXN_RATE
  const { data, isError, isLoading, refetch } = useQuery({
    queryKey: POS_CATALOG_QUERY_KEY,
    queryFn: listActiveProductsForPos,
    retry: 0,
  })
  const products = (data ?? []).filter(({ active }) => active)
  const loadState = isLoading ? 'loading' : isError ? 'error' : 'ready'
  const [searchQuery, setSearchQuery] = useState(restoredSession.searchQuery)
  const [selectedCategory, setSelectedCategory] = useState(restoredSession.selectedCategory)
  const [viewMode, setViewMode] = useState<'products' | 'categories'>(restoredSession.viewMode)
  const [productsInfoOpen, setProductsInfoOpen] = useState(restoredSession.productsInfoOpen)
  const [catalogInfoOpen, setCatalogInfoOpen] = useState(restoredSession.catalogInfoOpen)
  const [estimateInfoOpen, setEstimateInfoOpen] = useState(restoredSession.estimateInfoOpen)
  const [quantities, setQuantities] = useState<QuantityByLine>(restoredSession.quantities)
  const [saleForm, setSaleForm] = useState<SaleFormState>(restoredSession.saleForm)
  const [confirmationModalOpen, setConfirmationModalOpen] = useState(false)
  const [pendingSale, setPendingSale] = useState<ValidatedSale | null>(null)
  const [validationError, setValidationError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<SaleValidationErrors>({})
  const [submission, setSubmission] = useState<Submission | null>(null)
  const [ticketModalOpen, setTicketModalOpen] = useState(false)
  const [mobileCheckoutStep, setMobileCheckoutStep] = useState<'catalog' | 'review'>(restoredSession.mobileCheckoutStep)
  const alert = useRef<HTMLDivElement>(null)
  const salesFormRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (channel !== 'pos') return

    let disposed = false
    let invalidationTimer: ReturnType<typeof setTimeout> | undefined
    const handleCatalogChanged = () => {
      if (disposed) return
      if (invalidationTimer !== undefined) clearTimeout(invalidationTimer)
      invalidationTimer = setTimeout(() => {
        invalidationTimer = undefined
        if (!disposed) void queryClient.invalidateQueries({ queryKey: POS_CATALOG_QUERY_KEY })
      }, CATALOG_INVALIDATION_DEBOUNCE_MS)
    }

    let stop: (() => void) | undefined
    void subscribeToProductCatalogChanges(handleCatalogChanged).then((cleanup) => {
      if (disposed) cleanup()
      else stop = cleanup
    }).catch(() => {
      // Realtime is an enhancement; the existing manual catalog refresh remains available.
    })

    return () => {
      disposed = true
      if (invalidationTimer !== undefined) clearTimeout(invalidationTimer)
      stop?.()
    }
  }, [channel, queryClient])

  useEffect(() => {
    if (isError || validationError || submission?.status === 'error') alert.current?.focus()
  }, [isError, validationError, submission])

  useEffect(() => {
    if (Object.keys(fieldErrors).length === 0) return
    const timeoutId = window.setTimeout(() => salesFormRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0)
    return () => window.clearTimeout(timeoutId)
  }, [fieldErrors])

  useEffect(() => {
    const state: SalesSessionState = { searchQuery, selectedCategory, viewMode, productsInfoOpen, catalogInfoOpen, estimateInfoOpen, quantities, saleForm, mobileCheckoutStep }
    if (persistence) {
      persistence.write(sessionModule, state)
      try { window.localStorage.removeItem(POS_SALE_DRAFT_STORAGE_KEY) } catch { /* Legacy storage is optional. */ }
    } else if (channel === 'pos') {
      persistPosQuantities(quantities)
    }
  }, [catalogInfoOpen, channel, estimateInfoOpen, mobileCheckoutStep, persistence, productsInfoOpen, quantities, saleForm, searchQuery, selectedCategory, sessionModule, viewMode])

  function changeQuantity(lineKey: string, value: string) {
    setQuantities((current) => ({ ...current, [lineKey]: value }))
    setPendingSale(null)
    setValidationError('')
    setFieldErrors({})
    setSubmission(null)
  }

  function changeSaleDetail(field: keyof SaleFormState, value: string) {
    setSaleForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'paymentMethod' && value === 'card' ? { paymentCurrency: 'mxn' as const, usdPaid: '' } : {}),
    }))
    setPendingSale(null)
    setValidationError('')
    setFieldErrors({})
    setSubmission(null)
  }

  function addProduct(productId: string) {
    const current = parseQuantity(quantities[productId] ?? '') ?? 0
    changeQuantity(productId, String(current + 1))
  }

  function addCategory(categoryId: string) {
    const lineKey = `category:${categoryId}`
    const current = parseQuantity(quantities[lineKey] ?? '') ?? 0
    changeQuantity(lineKey, String(current + 1))
  }

  function adjustQuantity(lineKey: string, delta: number) {
    const current = parseQuantity(quantities[lineKey] ?? '') ?? 0
    const next = Math.max(0, current + delta)
    changeQuantity(lineKey, next === 0 ? '' : String(next))
  }

  function clearCart() {
    setQuantities({})
    setSaleForm(initialSaleForm(channel))
    if (channel === 'pos') setMobileCheckoutStep('catalog')
    setConfirmationModalOpen(false)
    setPendingSale(null)
    setValidationError('')
    setFieldErrors({})
    setSubmission(null)
  }

  function removeLine(lineKey: string) {
    changeQuantity(lineKey, '')
  }

  function validateCurrentSale() {
    const categories = buildPosCatalogCategories(products)
    const items = getSaleItems(products, categories, quantities)
    const errors: SaleValidationErrors = {}
    Object.entries(quantities).forEach(([lineKey, value]) => {
      if (value.trim() !== '' && parseQuantity(value) === null) errors[`quantity:${lineKey}`] = 'Usa un número entero positivo para esta línea.'
    })
    if (items.length === 0) {
      errors.quantities = 'Selecciona al menos un producto para agregarlo a la venta.'
    }
    if (items.some((item) => lineUsesUnavailableWholesalePrice(products, item, channel))) {
      errors.wholesalePrice = 'No se puede revisar esta venta porque hay productos sin un precio mayorista positivo. Actualiza el precio mayorista en Productos antes de continuar.'
    }
    Object.assign(errors, validateSaleForm(channel, saleForm, activeShift, displayEstimate, configuredRate))
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors)
      setValidationError(formatValidationErrors(errors))
      return null
    }
    let details: SaleDetails
    try {
      details = buildSaleDetails(channel, saleForm, activeShift, displayEstimate, configuredRate)
    } catch (error) {
      setValidationError(error instanceof Error ? error.message : 'Completa los datos de la venta.')
      return null
    }
    setValidationError('')
    setFieldErrors({})
    return { items, details }
  }

  function requestSaleConfirmation() {
    if (isSubmitting || isComplete) return
    const validated = validateCurrentSale()
    if (!validated) return
    setPendingSale(validated)
    setConfirmationModalOpen(true)
  }

  function reviewSale(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    requestSaleConfirmation()
  }

  async function confirmSaleRegistration() {
    if (isSubmitting || isComplete || !pendingSale) return
    const requestId = submission?.requestId ?? createRequestId()
    const validated = validateCurrentSale()
    if (!validated) {
      setPendingSale(null)
      setConfirmationModalOpen(false)
      return
    }
    setPendingSale(validated)
    setConfirmationModalOpen(false)
    setSubmission({ status: 'submitting', requestId })
    try {
      const receipt = await recordSale({ requestId, channel, details: validated.details, items: validated.items.map(toSaleItemInput) })
      setSubmission({ status: 'success', requestId, receipt })
      setTicketModalOpen(true)
    } catch {
      setSubmission({ status: 'error', requestId })
    }
  }

  function closeTicketModal() {
    setTicketModalOpen(false)
    clearCart()
  }

  const isSubmitting = submission?.status === 'submitting'
  const isComplete = submission?.status === 'success'
  const presentation = channelPresentations[channel]
  const catalogCategories = buildPosCatalogCategories(products)
  const cartItems = getCartItems(products, catalogCategories, quantities)
  const categories = [ALL_CATEGORIES, ...Array.from(new Set(products.map((product) => product.category).filter(Boolean)))]
  const filteredProducts = products.filter((product) => {
    const matchesCategory = selectedCategory === ALL_CATEGORIES || product.category === selectedCategory
    return matchesCategory && matchesSearch(product, searchQuery)
  })
  const saleItems = getSaleItems(products, catalogCategories, quantities)
  const categoryQuantityById = getPosCategoryQuantityById(saleItems.map((item) => ({
    categoryId: item.lineKind === 'category' ? item.category.id : item.product.categoryId,
    quantity: item.quantity,
  })))
  const itemCount = saleItems.reduce((total, { quantity }) => total + quantity, 0)
  const hasUnavailableWholesaleSalePrice = saleItems.some((item) => {
    return lineUsesUnavailableWholesalePrice(products, item, channel)
  })
  const displayEstimate = saleItems.reduce((total, item) => {
    const categoryQuantity = categoryQuantityById.get(item.lineKind === 'category' ? item.category.id : item.product.categoryId) ?? item.quantity
      const price = item.lineKind === 'category'
        ? getPosCategoryUnitPrice(products, item.category.id, categoryQuantity, wholesaleThreshold) ?? 0
      : priceFor(item.product, channel, categoryQuantity, wholesaleThreshold)
    return total + item.quantity * price
  }, 0)
  const ticketFallbackLines: SaleReceiptLine[] = saleItems.map((item) => {
    const categoryId = item.lineKind === 'category' ? item.category.id : item.product.categoryId
    const categoryQuantity = categoryQuantityById.get(categoryId) ?? item.quantity
    const unitPriceMxn = item.lineKind === 'category'
      ? getPosCategoryUnitPrice(products, item.category.id, categoryQuantity, wholesaleThreshold) ?? 0
      : priceFor(item.product, channel, categoryQuantity, wholesaleThreshold)
    return {
      lineKind: item.lineKind,
      productId: item.lineKind === 'product' ? item.product.id : null,
      categoryId: item.lineKind === 'category' ? item.category.id : null,
      categoryName: item.lineKind === 'category' ? item.category.name : null,
      name: item.lineKind === 'category' ? item.category.name : item.product.name,
      quantity: item.quantity,
      unitPriceMxn,
      lineTotalMxn: unitPriceMxn * item.quantity,
    }
  })
  const isPosMobileReview = channel === 'pos' && mobileCheckoutStep === 'review'
  const isPosMobileCatalog = channel === 'pos' && mobileCheckoutStep === 'catalog'

  const mobileFooterBleedClass = mobileFooterBleed === 'cashier' ? '-mb-3 sm:-mb-4 lg:mb-0' : '-mb-4 sm:-mb-6 lg:mb-0'

  return <section data-testid={channel === 'pos' ? 'pos-workspace' : undefined} aria-label={channel === 'pos' ? 'Punto de venta' : presentation.title} className={`ops-workspace-frame flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden rounded-[1.75rem] border border-slate-800 bg-slate-900 p-3 text-slate-100 shadow-xl sm:p-5 lg:p-6 ${channel === 'pos' ? 'lg:h-full lg:flex lg:flex-col lg:overflow-hidden' : ''} ${isPosMobileCatalog ? mobileFooterBleedClass : ''} ${isPosMobileReview ? 'pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-[calc(1.25rem+env(safe-area-inset-bottom))] lg:pb-6' : ''}`}>
    {channel !== 'pos' && <div className="ops-module-header shrink-0 border-b border-slate-800 pb-4">
        <p className={`text-xs font-bold uppercase tracking-[0.16em] ${presentation.accentClass}`}>{branchName ? `Sucursal ${branchName}` : presentation.eyebrow}</p>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-400">{presentation.description}</p>
    </div>}

    <form ref={salesFormRef} noValidate onSubmit={reviewSale} data-testid={channel === 'pos' ? 'pos-sales-form' : undefined} className={`${channel === 'pos' ? (isPosMobileReview ? 'mt-0' : 'mt-2') : 'mt-7'} ${isPosMobileReview ? 'flex min-h-0 flex-1 flex-col overflow-hidden gap-2 lg:grid' : 'grid min-h-0 flex-1 grid-rows-[minmax(0,1fr)_auto] gap-4 overflow-hidden lg:grid-rows-[minmax(0,1fr)]'} min-w-0 lg:gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,24rem)] ${channel === 'pos' ? 'lg:min-h-0 lg:flex-1 lg:overflow-hidden' : ''}`}>
      <div data-testid={channel === 'pos' ? 'pos-catalog-column' : undefined} className={`min-w-0 flex min-h-0 flex-col overflow-hidden ${channel === 'pos' ? 'lg:flex' : 'lg:block'} ${isPosMobileReview ? 'hidden' : ''}`}>
        {channel !== 'pos' && <section aria-labelledby="product-list-title" className="border-b border-slate-800 pb-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex items-center gap-1">
              <h2 id="product-list-title" className={`text-sm font-bold uppercase tracking-[0.12em] ${presentation.accentClass}`}>{presentation.productsTitle}</h2>
              <InfoButton id={`${channel}-products-info`} label="Explicar selección de productos" open={productsInfoOpen} onToggle={() => setProductsInfoOpen((current) => !current)}>{presentation.productsDescription}</InfoButton>
            </div>
          </div>
        </section>}

         {loadState === 'loading' && <div role="status" className="ops-state ops-state-loading mt-4">
          <p className="text-sm font-semibold text-slate-300">Cargando productos…</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {[1, 2, 3, 4].map((placeholder) => <div key={placeholder} aria-hidden="true" className="aspect-[4/5] animate-pulse rounded-2xl border border-slate-800 bg-slate-900/70" />)}
          </div>
        </div>}

         {loadState === 'error' && <div ref={alert} tabIndex={-1} role="alert" className="ops-state ops-state-error mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100">
          <p className="font-semibold">No se pudieron cargar los productos.</p>
          <p className="mt-1 text-sm text-rose-200/80">Revisa la conexión con el catálogo e inténtalo de nuevo.</p>
          <ResponsiveActionButton type="button" label="Reintentar" icon="refresh" onClick={() => void refetch()} className="mt-4" />
        </div>}

         {loadState === 'ready' && products.length === 0 && <div data-testid={channel === 'pos' ? 'pos-catalog-scroll' : undefined} className={`mt-4 ${channel === 'pos' ? 'ops-scroll-region min-h-0 flex-1 overflow-y-auto overscroll-contain' : ''}`}><p className="ops-state ops-state-empty rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-6 text-sm text-slate-300">No hay productos activos en el catálogo. Agrega un producto activo antes de registrar una venta.</p></div>}

        {loadState === 'ready' && products.length > 0 && <div id="sale-products" role="tabpanel" aria-labelledby={channel === 'pos' ? undefined : 'product-list-title'} aria-label={channel === 'pos' ? 'Productos disponibles' : undefined} className={channel === 'pos' ? 'mt-2 flex min-h-0 flex-1 flex-col' : 'mt-4 flex min-h-0 flex-1 flex-col'}>
          <CatalogControlsHeader
            toolbar={<>
              <SearchInput label="Buscar productos" value={searchQuery} onChange={setSearchQuery} placeholder="Busca por producto, SKU, categoría o etiqueta" containerClassName="min-w-0 flex-1" />
              {channel === 'pos' && <div role="tablist" aria-label="Vista de catálogo" className="flex shrink-0 items-center gap-1">
                <ResponsiveActionButton type="button" role="tab" aria-selected={viewMode === 'products'} aria-controls="sale-products" label="Vista por producto" icon="catalog" iconOnly className="ops-tab" onClick={() => setViewMode('products')} />
                <ResponsiveActionButton type="button" role="tab" aria-selected={viewMode === 'categories'} aria-controls="sale-products" label="Vista por categoría" icon="package" iconOnly className="ops-tab" onClick={() => setViewMode('categories')} />
              </div>}
              <ResponsiveActionButton type="button" label="Actualizar productos" icon="refresh" disabled={isSubmitting} onClick={() => void refetch()} className="shrink-0" />
            </>}
            categoryFilters={(channel !== 'pos' || viewMode === 'products') && <div role="tablist" aria-label="Categorías de productos" className="ops-horizontal-scroll flex min-w-0 gap-2 overflow-x-auto pb-1">
              {categories.map((category) => <ResponsiveActionButton key={category} type="button" role="tab" aria-selected={selectedCategory === category} aria-controls="sale-products" label={category} onClick={() => setSelectedCategory(category)} className="ops-tab shrink-0 px-4 text-xs">{category}</ResponsiveActionButton>)}
            </div>}
            titleId={`${channel}-catalog-title`}
            title="Catálogo de productos"
            info={<InfoButton id={`${channel}-catalog-info`} label="Explicar cómo agregar productos" open={catalogInfoOpen} onToggle={() => setCatalogInfoOpen((current) => !current)}>Toca una tarjeta para armar la venta. Ajusta las cantidades en el carrito.</InfoButton>}
            count={`${filteredProducts.length} mostrados`}
          />

          <div data-testid={channel === 'pos' ? 'pos-catalog-scroll' : 'sales-catalog-scroll'} className="ops-scroll-region min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {channel === 'pos' && viewMode === 'categories' ? <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {catalogCategories.map((category) => {
              const categoryQuantity = categoryQuantityById.get(category.id) ?? 0
              const retailPrice = getValidatedCategoryPrice(products, category.id, false)
              const wholesalePrice = getValidatedCategoryPrice(products, category.id, true)
              const price = getPosCategoryUnitPrice(products, category.id, categoryQuantity, wholesaleThreshold)
               const unavailable = retailPrice === null || price === null
              const cardDisabled = isSubmitting || isComplete || unavailable
              const cardLabel = unavailable
                ? wholesalePrice === null && isPosWholesaleQuantity(categoryQuantity, wholesaleThreshold) ? `Categoría ${category.name} sin precio mayorista` : `Categoría ${category.name} sin precio uniforme`
                : `Agregar categoría ${category.name} a la venta`
              return <CatalogSelectionCard
                key={category.id}
                dataTestId="sales-category-card"
                label={cardLabel}
                disabled={cardDisabled}
                imageSrc={category.products.find((product) => product.imageUrl)?.imageUrl ?? null}
                imageAlt={`Categoría ${category.name}`}
                imageFallback={<div className="flex h-full w-full flex-col items-center justify-center gap-2 text-slate-500"><Icon name="package" className="h-8 w-8" /><span className="text-[10px] font-bold uppercase tracking-wider">Imagen pendiente</span></div>}
                badge={categoryQuantity > 0 && <span className={`absolute right-2 top-2 rounded-full border px-2 py-1 text-[10px] font-black text-white ${presentation.quantityBadgeClass}`}>{categoryQuantity} en el carrito</span>}
                title={category.name}
                metadata={`${category.products.length} productos activos`}
                pricePair={retailPrice === null ? null : <PosPricePair retailPriceMxn={retailPrice} wholesalePriceMxn={wholesalePrice} appliedLabel={categoryQuantity > 0 ? getPosCategoryPriceLabel(products, category.id, categoryQuantity, wholesaleThreshold) : undefined} />}
                notice={retailPrice === null ? 'Precio requiere revisión' : undefined}
                onSelect={() => addCategory(category.id)}
              />
            })}
           </div> : filteredProducts.length === 0 ? <div className="ops-state ops-state-filtered-empty mt-4 rounded-2xl border border-dashed border-slate-700 bg-slate-900/40 p-8 text-center">
            <p className="text-sm font-semibold text-slate-300">No hay productos que coincidan con estos filtros.</p>
             <ResponsiveActionButton type="button" label="Limpiar filtros de productos" icon="close" onClick={() => { setSearchQuery(''); setSelectedCategory(ALL_CATEGORIES) }} className="mt-4" />
          </div> : <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {filteredProducts.map((product) => {
              const quantity = parseQuantity(quantities[product.id] ?? '') ?? 0
              const price = priceFor(product, channel, categoryQuantityById.get(product.categoryId) ?? 0, wholesaleThreshold)
              const cardDisabled = isSubmitting || isComplete
              const cardLabel = `${quantity > 0 ? 'Agregar otra unidad de' : 'Agregar'} ${product.name} a la venta`
              return channel === 'pos' ? <CatalogSelectionCard
                key={product.id}
                dataTestId="sales-product-card"
                label={cardLabel}
                disabled={cardDisabled}
                imageSrc={product.imageUrl}
                imageAlt={product.name}
                imageClassName="transition-transform duration-200 group-hover:scale-105"
                badge={quantity > 0 && <span className={`absolute right-2 top-2 rounded-full border px-2 py-1 text-[10px] font-black text-white ${presentation.quantityBadgeClass}`}>{quantity} en el carrito</span>}
                title={product.name}
                metadata={product.category}
                pricePair={<PosPricePair retailPriceMxn={product.retailPriceMxn} wholesalePriceMxn={product.wholesalePriceMxn} appliedLabel={quantity > 0 ? priceLabelFor(channel, categoryQuantityById.get(product.categoryId) ?? 0, product.wholesalePriceMxn, wholesaleThreshold) : undefined} />}
                onSelect={() => addProduct(product.id)}
              /> : <article
                key={product.id}
                data-testid="sales-product-card"
                role="button"
                tabIndex={cardDisabled ? -1 : 0}
                aria-disabled={cardDisabled}
                aria-label={cardLabel}
                title={cardLabel}
                onClick={() => { if (!cardDisabled) addProduct(product.id) }}
                onKeyDown={(event) => activateCatalogCard(event, () => addProduct(product.id), cardDisabled)}
                className="group flex min-w-0 cursor-pointer flex-col rounded-2xl border border-slate-800 bg-slate-900/65 p-2.5 text-left transition-colors hover:border-slate-700 hover:bg-slate-900 focus:outline-none aria-disabled:cursor-not-allowed aria-disabled:opacity-60 ops-focus"
              >
                <CatalogImageTile src={product.imageUrl} alt={product.name} imageClassName="transition-transform duration-200 group-hover:scale-105" className="aspect-square w-full border-slate-800 bg-slate-950">
                  {quantity > 0 && <span className={`absolute right-2 top-2 rounded-full border px-2 py-1 text-[10px] font-black text-white ${presentation.quantityBadgeClass}`}>{quantity} en el carrito</span>}
                </CatalogImageTile>
                <div className="mt-2 min-w-0">
                  <h3 className="truncate text-sm font-bold text-white" title={product.name}>{product.name}</h3>
                  <p className="mt-1 truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{product.category}</p>
                  <p className="mt-2 text-xs font-semibold text-slate-300">{priceLabelFor(channel, categoryQuantityById.get(product.categoryId) ?? 0)} <span className={`font-black ${channel === 'wholesale' ? wholesalePriceClass(price, 'text-white') : 'text-white'}`}>{channel === 'wholesale' ? formatWholesaleCatalogPrice(price) : formatCatalogPrice(price)}</span></p>
                </div>
              </article>
            })}
          </div>}
          </div>
        </div>}
      </div>

            {isPosMobileReview && <div data-testid="pos-mobile-review-header" className="order-0 mb-0 flex shrink-0 items-center justify-between gap-3 lg:order-none lg:hidden"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-sky-400">Paso 2 de 2</p></div><ResponsiveActionButton type="button" label="Volver al catálogo" icon="chevron-left" showLabel onClick={() => setMobileCheckoutStep('catalog')} /></div>}
              <aside data-testid={channel === 'pos' ? 'pos-summary-column' : undefined} aria-label={confirmationModalOpen ? 'Confirmar registro de venta' : 'Resumen del carrito'} className={`${isPosMobileCatalog ? 'hidden' : ''} ${isPosMobileReview ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'h-fit'} rounded-2xl border bg-slate-900/85 p-3 shadow-xl sm:p-4 ${channel === 'pos' ? 'lg:static lg:flex lg:h-full lg:min-h-0 lg:flex-none lg:flex-col lg:overflow-hidden' : 'lg:sticky lg:top-6 lg:block'} ${confirmationModalOpen ? presentation.cardBorderClass : 'border-slate-800'}`}>
             {cartItems.length > 0 && <div className={`flex items-center justify-between gap-3 border-b border-slate-800 pb-3 ${isPosMobileReview ? 'shrink-0' : ''} lg:shrink-0`}>
             <span aria-label={`${itemCount} ${itemCount === 1 ? 'artículo' : 'artículos'}`} className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-full border border-slate-700 bg-slate-950 px-2 text-xs font-black text-slate-200">{itemCount}</span>
             <div className="flex shrink-0 items-center justify-end gap-2">
                 {!isComplete && submission?.status !== 'error' && <ResponsiveActionButton
                 type="button"
                 label="Realizar venta"
                 icon="sale"
                 showLabel
                 loading={isSubmitting}
                 loadingLabel="Registrando venta"
                  disabled={isSubmitting}
                 onClick={() => requestSaleConfirmation()}
                 className="disabled:opacity-40"
               />}
               <ResponsiveActionButton type="button" label="Vaciar selección de venta" icon="close" onClick={clearCart} disabled={isSubmitting || isComplete} />
             </div>
           </div>}

           <div data-testid="pos-lines-section" className={channel === 'pos' ? 'min-h-0 min-w-0 flex flex-1 flex-col lg:flex-1' : isPosMobileReview ? 'min-h-0 min-w-0 flex flex-1 flex-col' : ''}>
            {cartItems.length === 0 ? <div className="py-6 text-center">
             <p className="text-sm font-semibold text-slate-300">El carrito está vacío.</p>
             <p className="mt-2 text-xs leading-relaxed text-slate-500">Agrega productos del catálogo para iniciar una venta.</p>
             </div> : <ul data-testid="pos-selected-lines" className={`divide-y divide-slate-800 ${channel === 'pos' ? 'ops-scroll-region' : ''} ${isPosMobileReview ? 'min-h-0 max-h-[min(28rem,42dvh)] overflow-y-auto overscroll-contain pr-1 flex-1 lg:max-h-none' : ''} ${channel === 'pos' ? 'lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:overscroll-contain lg:pr-1' : ''}`}>
             {cartItems.map((item) => {
               const value = quantities[item.key] ?? ''
               const quantity = parseQuantity(value)
               const invalid = value.trim() !== '' && quantity === null
                 const categoryId = item.lineKind === 'category' ? item.category.id : item.product.categoryId
                 const categoryQuantity = categoryQuantityById.get(categoryId) ?? (item.quantity ?? 0)
                   const price = item.lineKind === 'category'
                      ? getPosCategoryUnitPrice(products, item.category.id, categoryQuantity, wholesaleThreshold) ?? 0
                     : priceFor(item.product, channel, categoryQuantity, wholesaleThreshold)
                  const name = item.lineKind === 'category' ? `Categoría: ${item.category.name}` : item.product.name
                return <li key={item.key} className="py-3 first:pt-4 last:pb-1">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-white" title={name}>{name}</h3>
                    </div>
                    <span className={`shrink-0 text-sm font-black ${lineUsesUnavailableWholesalePrice(products, item, channel) ? 'text-slate-400' : 'text-white'}`}>{lineUsesUnavailableWholesalePrice(products, item, channel) ? NO_WHOLESALE_PRICE : quantity === null ? '—' : formatMxn(quantity * price)}</span>
                 </div>
                 <div className="mt-3 flex items-center justify-between gap-3">
                   <div role="group" aria-label={`Controles de cantidad para ${name}`} className="flex items-center rounded-xl border border-slate-700 bg-slate-950 p-1">
                     <button type="button" aria-label={`Disminuir cantidad de ${name}`} title={`Disminuir cantidad de ${name}`} disabled={isSubmitting || isComplete} onClick={() => adjustQuantity(item.key, -1)} className="ops-icon-button ops-focus"><Icon name="minus" className="h-4 w-4" /></button>
                      <input
                        aria-label={`Cantidad de ${name}`}
                        aria-invalid={invalid || Boolean(fieldErrors[`quantity:${item.key}`])}
                        aria-describedby={invalid || fieldErrors[`quantity:${item.key}`] ? fieldErrorId(`quantity:${item.key}`) : undefined}
                        required
                        disabled={isSubmitting || isComplete}
                         inputMode="numeric"
                         pattern="[0-9]*"
                         type="text"
                        value={value}
                        onChange={(event) => changeQuantity(item.key, event.target.value)}
                        className="ops-control ops-quantity-control"
                      />
                     <button type="button" aria-label={`Aumentar cantidad de ${name}`} title={`Aumentar cantidad de ${name}`} disabled={isSubmitting || isComplete} onClick={() => adjustQuantity(item.key, 1)} className="ops-icon-button ops-focus"><Icon name="plus" className="h-4 w-4" /></button>
                   </div>
                     <div className="flex min-w-0 items-center justify-end gap-2">
                       {invalid ? <span id={fieldErrorId(`quantity:${item.key}`)} role="alert" className="ops-field-error text-right text-[11px] font-semibold text-amber-300">Usa un número entero positivo</span> : fieldErrors[`quantity:${item.key}`] ? <span id={fieldErrorId(`quantity:${item.key}`)} role="alert" className="ops-field-error text-right text-[11px] font-semibold text-rose-300">{fieldErrors[`quantity:${item.key}`]}</span> : <span className="text-xs font-semibold text-slate-500">{quantity} {quantity === 1 ? 'unidad' : 'unidades'}</span>}
                     <ResponsiveActionButton type="button" label={`Quitar ${name} de la venta`} icon="trash" disabled={isSubmitting || isComplete} onClick={() => removeLine(item.key)} />
                   </div>
                 </div>
               </li>
             })}
           </ul>}
           </div>

           <div data-testid="pos-sale-details" className={channel === 'pos' ? `${isPosMobileReview ? 'shrink-0 ' : ''}lg:shrink-0` : undefined}>
             <SaleDetailsSection channel={channel} presentation={presentation} form={saleForm} usdMxnRate={usdMxnRate} displayEstimate={displayEstimate} errors={fieldErrors} disabled={isSubmitting || isComplete} onChange={changeSaleDetail} />
           </div>

           <div data-testid="pos-visible-estimate" className={`${channel === 'pos' ? 'mt-2' : 'mt-3'} border-t border-slate-800 pt-3 ${isPosMobileReview ? 'shrink-0' : ''} ${channel === 'pos' ? 'lg:shrink-0' : ''}`}>
              <div className="flex items-center gap-1 text-sm font-bold text-slate-300"><span className="min-w-0">Estimación visible</span>{channel === 'pos' && <InfoButton className="shrink-0" id="pos-visible-estimate-info" label="Explicar estimación visible" open={estimateInfoOpen} onToggle={() => setEstimateInfoOpen((current) => !current)}>El total final lo confirma el servidor al registrar la venta.</InfoButton>}<span className={`ml-auto shrink-0 text-lg font-black ${hasUnavailableWholesaleSalePrice ? 'text-slate-400' : 'text-sky-300'}`}>{hasUnavailableWholesaleSalePrice ? NO_WHOLESALE_PRICE : formatMxn(displayEstimate)}</span></div>
           {channel !== 'pos' && <p className="mt-2 text-xs leading-relaxed text-slate-500">El total final lo confirma el servidor al registrar la venta.</p>}
         </div>

            {validationError && <div ref={alert} tabIndex={-1} role="alert" className={`ops-state ops-state-error mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-100 ${isPosMobileReview ? 'shrink-0' : ''} ${channel === 'pos' ? 'lg:shrink-0' : ''}`}>{validationError}</div>}
          {submission?.status === 'error' && <div ref={alert} tabIndex={-1} role="alert" className={`ops-state ops-state-error mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-rose-100 ${isPosMobileReview ? 'shrink-0' : ''} ${channel === 'pos' ? 'lg:shrink-0' : ''}`}>
          <p className="text-sm font-semibold">No se pudo registrar la venta. Inténtalo de nuevo.</p>
            <ResponsiveActionButton type="button" label="Reintentar venta" icon="refresh" onClick={() => requestSaleConfirmation()} className="mt-3 w-full" />
        </div>}

           </aside>
    </form>
     {isPosMobileCatalog && <CatalogMobileSummary dataTestId="pos-mobile-summary-bar" ariaHidden={navigationDrawerOpen} inert={navigationDrawerOpen} count={itemCount} singularLabel="artículo" pluralLabel="artículos" total={hasUnavailableWholesaleSalePrice ? NO_WHOLESALE_PRICE : formatMxn(displayEstimate)} actionLabel="Revisar venta" disabled={saleItems.length === 0} onAction={() => setMobileCheckoutStep('review')} detailsTestId="pos-mobile-summary-details" />}
    {confirmationModalOpen && <Modal
      title="Confirmar registro de venta"
      description="Verifica la venta antes de registrarla."
      closeLabel="Cancelar confirmación"
      onClose={() => setConfirmationModalOpen(false)}
      busy={isSubmitting}
      bodyClassName="p-4 sm:p-6"
      maxWidthClassName="max-w-lg"
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-100">
          <p className="font-semibold">¿Verificaste la venta antes de registrarla?</p>
          <p className="mt-2 text-sm leading-relaxed text-amber-100/80">Al confirmar, la venta se registrará en el sistema.</p>
        </div>
        <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
          <ResponsiveActionButton type="button" label="Cancelar" onClick={() => setConfirmationModalOpen(false)} disabled={isSubmitting} />
          <ResponsiveActionButton type="button" label="Confirmar y registrar" icon="sale" showLabel loading={isSubmitting} loadingLabel="Registrando venta" onClick={() => void confirmSaleRegistration()} className="bg-sky-600 text-white hover:bg-sky-500" />
        </div>
      </div>
    </Modal>}
    {ticketModalOpen && submission?.status === 'success' && submission.receipt && <Modal
      title={submission.receipt.replayed ? 'Venta ya registrada' : 'Venta registrada'}
      description="Revisa el ticket y elige si deseas imprimirlo. Cerrar el modal inicia una venta nueva."
      closeLabel="Cerrar ticket"
      onClose={closeTicketModal}
      maxWidthClassName="max-w-2xl"
      bodyClassName="p-4 sm:p-6"
      headerActions={<ResponsiveActionButton type="button" label="Imprimir ticket" icon="print" showLabel onClick={() => { if (typeof window.print === 'function') window.print() }} />}
    >
      <div role="status" className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-100">
        <p className="font-bold">{submission.receipt.replayed ? 'La venta ya estaba registrada' : 'Ticket listo para revisar'}</p>
        <dl className="mt-3 grid gap-2 text-sm">
          <div className="flex justify-between gap-4"><dt>Canal</dt><dd className="font-semibold">{channelPresentations[submission.receipt.channel].label}</dd></div>
          <div className="flex justify-between gap-4"><dt>Total confirmado</dt><dd className="font-semibold">{formatMxn(submission.receipt.totalMxn)}</dd></div>
          <div className="flex justify-between gap-4"><dt>ID del recibo</dt><dd className="max-w-[12rem] truncate font-semibold" title={submission.receipt.id}>{submission.receipt.id}</dd></div>
        </dl>
       <PosTicketPreview receipt={submission.receipt} fallbackLines={ticketFallbackLines} branchName={branchName} cashierName={cashierName} customerName={saleForm.customerName} activeShift={activeShift} ticketImageUrl={ticketImageUrl} receiptConfiguration={receiptConfiguration} />
      </div>
    </Modal>}
  </section>
}
