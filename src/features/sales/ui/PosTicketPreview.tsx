import type { PosShift } from '../api/posShifts'
import type { SaleReceipt, SaleReceiptLine } from '../api/sales'
import type { SalesReceiptConfiguration } from '../../configuration/api/salesReceipt'

function formatMxn(value: number) {
  return `$${value.toFixed(2)} MXN`
}

function formatUsd(value: number) {
  return `$${value.toFixed(2)} USD`
}

function applicationOrigin() {
  if (typeof window === 'undefined') return null
  const origin = window.location?.origin
  if (!origin) return null
  try {
    const url = new URL(origin)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null
  } catch {
    return null
  }
}

function safeTicketImageUrl(value: string | null | undefined, allowBlobImageUrl: boolean) {
  if (!value) return null
  try {
    const url = new URL(value, applicationOrigin() ?? undefined)
    const isHttpUrl = url.protocol === 'http:' || url.protocol === 'https:'
    return isHttpUrl || (allowBlobImageUrl && url.protocol === 'blob:') ? url.toString() : null
  } catch {
    return null
  }
}

type PosTicketPreviewProps = {
  receipt: SaleReceipt
  fallbackLines: SaleReceiptLine[]
  branchName?: string
  cashierName?: string | null
  customerName?: string
  activeShift?: PosShift
  ticketImageUrl?: string | null
  receiptConfiguration?: SalesReceiptConfiguration
  allowBlobImageUrl?: boolean
}

export function PosTicketPreview({ receipt, fallbackLines, branchName, cashierName, customerName, activeShift, ticketImageUrl, receiptConfiguration, allowBlobImageUrl = false }: PosTicketPreviewProps) {
  const imageUrl = safeTicketImageUrl(ticketImageUrl ?? receiptConfiguration?.logoUrl, allowBlobImageUrl)
  const lines = receipt.items ?? fallbackLines
  const companyPhone = receiptConfiguration?.companyPhone?.trim() || null
  const companyEmail = receiptConfiguration?.companyEmail?.trim() || null
  const customerOrigin = applicationOrigin()
  return <section data-testid="ticket-preview" data-print-ticket="true" aria-labelledby="ticket-preview-title" className="mx-auto mt-4 w-full max-w-[80mm] min-w-0 rounded-xl border border-slate-200 bg-white p-4 text-black">
    <div className="flex items-center gap-3 border-b border-dashed border-slate-200 pb-3">
      <div className="min-w-0"><h4 id="ticket-preview-title" className="text-sm font-black text-black">Ticket de venta</h4><p className="text-[11px] text-black">Detalle de la venta</p></div>
      {receiptConfiguration?.showLogo !== false && (imageUrl ? <img src={imageUrl} alt="Logo del ticket" className="ml-auto h-10 w-10 shrink-0 rounded-lg object-contain" /> : <div data-testid="ticket-logo-fallback" role="img" aria-label="Logo de Paletixa" className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-lg font-black text-black">P</div>)}
    </div>
    <ul className="mt-3 divide-y divide-slate-200 text-xs">
      {lines.map((line, index) => <li key={`${line.lineKind}-${line.productId ?? line.categoryId ?? index}`} className="flex justify-between gap-3 py-2"><span>{line.lineKind === 'category' ? `Categoría: ${line.categoryName ?? line.name}` : line.name} × {line.quantity}</span><strong>{formatMxn(line.lineTotalMxn)}</strong></li>)}
    </ul>
    <dl className="mt-3 grid gap-2 border-t border-slate-200 pt-3 text-xs sm:grid-cols-2">
      <div><dt className="text-black">Total MXN</dt><dd className="mt-1 font-black text-black">{formatMxn(receipt.totalMxn)}</dd></div>
      {receiptConfiguration?.showPaymentMethod !== false && <><div><dt className="text-black">Forma de pago</dt><dd className="mt-1 font-semibold text-black">{receipt.paymentMethod === 'card' ? 'Tarjeta' : receipt.paymentMethod === 'cash' ? 'Efectivo' : 'No disponible'}</dd></div>
      {receipt.paymentCurrency === 'usd' && receipt.usdMxnRate !== null && receipt.usdMxnRate !== undefined && <div><dt className="text-black">Conversión informativa</dt><dd className="mt-1 font-semibold text-black">Equivalente: {formatUsd(receipt.usdEquivalent ?? 0)} · Tipo de cambio: {formatMxn(receipt.usdMxnRate)} por USD</dd></div>}
      {receipt.receivedMxn !== null && receipt.receivedMxn !== undefined && <div><dt className="text-black">Recibido</dt><dd className="mt-1 font-semibold text-black">{receipt.paymentCurrency === 'usd' ? formatUsd(receipt.usdPaid ?? 0) : formatMxn(receipt.receivedMxn)}</dd></div>}
      {receipt.changeMxn !== null && receipt.changeMxn !== undefined && <div><dt className="text-black">Cambio</dt><dd className="mt-1 font-semibold text-black">{formatMxn(receipt.changeMxn)}</dd></div>}</>}
      {receiptConfiguration?.showCustomer !== false && <div><dt className="text-black">Cliente</dt><dd className="mt-1 font-semibold text-black">{receipt.customerName ?? customerName ?? 'No registrado'}</dd></div>}
      {receiptConfiguration?.showCashier !== false && <div><dt className="text-black">Cajero</dt><dd className="mt-1 font-semibold text-black">{receipt.cashierName ?? cashierName ?? 'No disponible'}</dd></div>}
      {receiptConfiguration?.showBranch !== false && <div><dt className="text-black">Sucursal</dt><dd className="mt-1 font-semibold text-black">{receipt.branchName ?? branchName ?? 'No disponible'}</dd></div>}
      {receiptConfiguration?.showCompanyPhone !== false && companyPhone && <div><dt className="text-black">Móvil</dt><dd className="mt-1 font-semibold text-black">{companyPhone}</dd></div>}
      {receiptConfiguration?.showCompanyEmail !== false && companyEmail && <div><dt className="text-black">Correo</dt><dd className="mt-1 break-words font-semibold text-black">{companyEmail}</dd></div>}
      {receiptConfiguration?.showCustomerUrl !== false && customerOrigin && <div><dt className="text-black">URL para clientes</dt><dd className="mt-1 break-all font-semibold text-black">{customerOrigin}</dd></div>}
      <div><dt className="text-black">Turno</dt><dd className="mt-1 font-semibold text-black">{receipt.shiftId ?? activeShift?.id ?? 'Sin turno'}</dd></div>
    </dl>
  </section>
}
