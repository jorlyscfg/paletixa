import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { AccessContext } from '../../auth/api/adminAccess'
import { getCurrentPosShift, type PosShift } from '../api/posShifts'
import type { ReportEmployeeAggregate, ReportProductAggregate } from '../api/sales'
import { rankReportAggregates, rankReportEmployees } from './salesReportUtils'

type CatalogTab = 'top-products' | 'least-products' | 'top-categories' | 'least-categories'
type CatalogTabDefinition = {
  id: CatalogTab
  label: string
  lineKind: ReportProductAggregate['lineKind']
  direction: 'asc' | 'desc'
  emptyLabel: string
}

const catalogTabs: readonly CatalogTabDefinition[] = [
  { id: 'top-products', label: 'Productos más vendidos', lineKind: 'product', direction: 'desc', emptyLabel: 'No hay productos con ventas reconocidas en el periodo.' },
  { id: 'least-products', label: 'Productos menos vendidos', lineKind: 'product', direction: 'asc', emptyLabel: 'No hay productos en el catálogo para este periodo.' },
  { id: 'top-categories', label: 'Categorías más vendidas', lineKind: 'category', direction: 'desc', emptyLabel: 'No hay categorías con ventas reconocidas en el periodo.' },
  { id: 'least-categories', label: 'Categorías menos vendidas', lineKind: 'category', direction: 'asc', emptyLabel: 'No hay categorías en el catálogo para este periodo.' },
]

function formatMxn(value: number) {
  return `$${value.toFixed(2)} MXN`
}

function catalogItemName(row: ReportProductAggregate) {
  return row.lineKind === 'category' ? row.categoryName ?? row.productName : row.productName
}

function catalogItemSecondaryLabel(row: ReportProductAggregate) {
  return row.lineKind === 'category' ? 'Categoría del catálogo' : row.categoryName ?? 'Producto sin categoría'
}

function catalogItemKey(row: ReportProductAggregate) {
  return `${row.lineKind}-${row.productId ?? row.categoryId ?? row.productName}`
}

function CatalogRankingList({ rows, emptyLabel, direction }: { rows: ReportProductAggregate[]; emptyLabel: string; direction: 'asc' | 'desc' }) {
  if (rows.length === 0) return <div role="status" className="ops-state ops-state-empty mt-5 rounded-2xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">{emptyLabel}</div>

  const allZero = direction === 'asc' && rows.every((row) => row.quantity === 0)
  return <>
    {allZero && <p role="status" className="mt-5 rounded-xl border border-dashed border-sky-500/30 bg-sky-500/5 p-3 text-xs leading-relaxed text-sky-100">No hay ventas reconocidas de estos elementos en el periodo. El catálogo completo permanece visible para detectar artículos sin movimiento.</p>}
    <ol className="mt-5 divide-y divide-slate-800/80">
      {rows.map((row, index) => <li key={catalogItemKey(row)} className="flex min-w-0 items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 rounded-lg border border-slate-800 bg-slate-900 px-2 py-1 text-xs font-black text-slate-400">#{index + 1}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-white" title={catalogItemName(row)}>{catalogItemName(row)}</p>
            <p className="mt-0.5 truncate text-[10px] font-semibold uppercase tracking-wider text-slate-500">{catalogItemSecondaryLabel(row)}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs font-black text-sky-400">{row.quantity} {row.quantity === 1 ? 'pieza' : 'piezas'}</p>
          <p className="mt-0.5 text-[10px] font-semibold text-slate-500">{formatMxn(row.totalMxn)}</p>
        </div>
      </li>)}
    </ol>
  </>
}

export function ReportCatalogRankingsPanel({ products, categories }: { products: ReportProductAggregate[]; categories: ReportProductAggregate[] }) {
  const [activeTab, setActiveTab] = useState<CatalogTab>('top-products')
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([])
  const activeDefinition = catalogTabs.find((tab) => tab.id === activeTab) ?? catalogTabs[0]
  const sourceRows = activeDefinition.lineKind === 'product' ? products : categories
  const rows = rankReportAggregates(sourceRows, activeDefinition.lineKind, activeDefinition.direction, activeDefinition.direction === 'desc' ? 5 : undefined)

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number | null = null
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (index + 1) % catalogTabs.length
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (index - 1 + catalogTabs.length) % catalogTabs.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = catalogTabs.length - 1
    if (nextIndex === null) return
    event.preventDefault()
    const next = catalogTabs[nextIndex]
    setActiveTab(next.id)
    tabRefs.current[nextIndex]?.focus()
  }

  return <section aria-labelledby="catalog-rankings-title" className="ops-panel-frame rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-xl sm:p-5">
    <div>
      <h2 id="catalog-rankings-title" className="text-lg font-black text-white">Análisis del catálogo</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">Resultados del periodo seleccionado. Las categorías incluyen ventas por producto y por línea de categoría.</p>
    </div>
    <div role="tablist" aria-label="Rankings de productos y categorías" className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {catalogTabs.map((tab, index) => <button
        key={tab.id}
        ref={(node) => { tabRefs.current[index] = node }}
        id={`report-tab-${tab.id}`}
        type="button"
        role="tab"
        aria-controls="report-catalog-tabpanel"
        aria-selected={activeTab === tab.id}
        tabIndex={activeTab === tab.id ? 0 : -1}
        onClick={() => setActiveTab(tab.id)}
        onKeyDown={(event) => onTabKeyDown(event, index)}
        className={`ops-focus min-h-11 rounded-xl border px-3 py-2 text-left text-xs font-bold leading-snug transition-colors ${
          activeTab === tab.id
            ? 'border-sky-400/50 bg-sky-950 text-sky-100'
            : 'border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-slate-200'
        }`}
      >{tab.label}</button>)}
    </div>
    <div id="report-catalog-tabpanel" role="tabpanel" aria-labelledby={`report-tab-${activeDefinition.id}`} tabIndex={0} className="ops-focus mt-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h3 className="text-sm font-black text-white">{activeDefinition.label}</h3>
          <p className="mt-1 text-xs text-slate-500">{activeDefinition.direction === 'asc' ? 'El catálogo completo se ordena desde menor movimiento.' : 'Los primeros cinco resultados se ordenan por piezas e importe.'}</p>
        </div>
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{sourceRows.length} {activeDefinition.lineKind === 'product' ? 'productos' : 'categorías'} del catálogo</span>
      </div>
      <CatalogRankingList rows={rows} emptyLabel={activeDefinition.emptyLabel} direction={activeDefinition.direction} />
    </div>
  </section>
}

function EmployeeRankingList({ rows, emptyLabel }: { rows: ReportEmployeeAggregate[]; emptyLabel: string }) {
  if (rows.length === 0) return <div role="status" className="mt-4 rounded-2xl border border-dashed border-slate-700 p-5 text-sm text-slate-400">{emptyLabel}</div>
  return <ol className="mt-4 divide-y divide-slate-800/80">
    {rows.map((employee, index) => <li key={employee.employeeId} className="flex min-w-0 items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 rounded-lg border border-slate-800 bg-slate-950 px-2 py-1 text-xs font-black text-slate-400">#{index + 1}</span>
        <p className="truncate text-sm font-bold text-white" title={employee.employeeName}>{employee.employeeName.trim() || 'Empleado sin nombre'}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-xs font-black text-sky-400">{employee.saleCount} {employee.saleCount === 1 ? 'venta' : 'ventas'}</p>
        <p className="mt-0.5 text-[10px] font-semibold text-slate-500">{formatMxn(employee.totalMxn)}</p>
      </div>
    </li>)}
  </ol>
}

export function ReportEmployeeRankingsPanel({ employees, scopeLabel }: { employees: ReportEmployeeAggregate[]; scopeLabel: string }) {
  return <section aria-labelledby="employee-rankings-title" className="ops-panel-frame rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-xl sm:p-5">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h2 id="employee-rankings-title" className="text-lg font-black text-white">Ventas por empleado</h2>
        <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate-500">Atribución por <code className="font-semibold text-slate-300">sales.created_by</code>: cuenta quién completó la venta. No se cuentan ventas revertidas ni no reconocidas.</p>
      </div>
      <span className="shrink-0 text-[10px] font-black uppercase tracking-widest text-slate-500">Alcance: {scopeLabel}</span>
    </div>
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <article className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="text-sm font-black text-white">Empleados con más ventas</h3>
        <p className="mt-1 text-xs text-slate-500">Mayor cantidad de transacciones reconocidas.</p>
        <EmployeeRankingList rows={rankReportEmployees(employees, 'desc', 5)} emptyLabel="No hay empleados con ventas reconocidas en el periodo." />
      </article>
      <article className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h3 className="text-sm font-black text-white">Empleados con menos ventas</h3>
        <p className="mt-1 text-xs text-slate-500">Menor cantidad entre quienes registraron ventas reconocidas.</p>
        <EmployeeRankingList rows={rankReportEmployees(employees, 'asc')} emptyLabel="No hay empleados con ventas reconocidas en el periodo." />
      </article>
    </div>
  </section>
}

function formatUsd(value: number) {
  return `$${value.toFixed(2)} USD`
}

function ShiftMetric({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return <div className="min-w-0 rounded-xl border border-slate-800 bg-slate-950 p-3"><dt className="break-words text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-black text-white">{value}</dd>{helper && <dd className="mt-1 break-words text-[11px] leading-snug text-slate-500">{helper}</dd>}</div>
}

function ShiftMetrics({ shift }: { shift: PosShift }) {
  return <>
    <dl className="mt-5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <ShiftMetric label="Apertura de efectivo MXN" value={formatMxn(shift.openingCashMxn)} />
      <ShiftMetric label="Ventas en efectivo MXN" value={formatMxn(shift.cashSalesMxn)} />
      <ShiftMetric label="Ventas en efectivo USD" value={formatUsd(shift.cashSalesUsd)} />
      <ShiftMetric label="Ventas con tarjeta" value={formatMxn(shift.cardSalesMxn)} />
      <ShiftMetric label="Efectivo MXN esperado" value={formatMxn(shift.openingCashMxn + shift.cashSalesMxn)} helper="Apertura más ventas en efectivo." />
      <ShiftMetric label="Tipo de cambio del turno" value={`${formatMxn(shift.usdMxnRate)} por USD`} />
    </dl>
    {shift.status === 'closed' && <dl className="mt-4 grid gap-2 border-t border-slate-800 pt-4 sm:grid-cols-3">
      <ShiftMetric label="Diferencia efectivo MXN" value={formatMxn(shift.cashMxnDifference ?? 0)} />
      <ShiftMetric label="Diferencia efectivo USD" value={formatUsd(shift.cashUsdDifference ?? 0)} />
      <ShiftMetric label="Diferencia tarjeta" value={formatMxn(shift.cardDifference ?? 0)} />
    </dl>}
  </>
}

export function ReportOperatorPanel({ context }: { context?: AccessContext }) {
  const [shift, setShift] = useState<PosShift | null>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>(context?.branch ? 'loading' : 'ready')
  const [loadedBranchId, setLoadedBranchId] = useState<string | null>(null)
  const branchId = context?.branch?.id ?? null

  useEffect(() => {
    let mounted = true
    if (!branchId) {
      return () => { mounted = false }
    }
    queueMicrotask(() => {
      void getCurrentPosShift().then((current) => {
        if (!mounted) return
        setShift(current)
        setLoadedBranchId(branchId)
        setState('ready')
      }).catch(() => {
        if (mounted) {
          setLoadedBranchId(branchId)
          setState('error')
        }
      })
    })
    return () => { mounted = false }
  }, [branchId])

  const employeeName = context?.displayName?.trim() || 'Empleado sin nombre'
  const branchName = context?.branch?.name?.trim() || 'Sin sucursal asignada'
  const branchState = !branchId ? 'ready' : loadedBranchId === branchId ? state : 'loading'
  const branchShift = loadedBranchId === branchId ? shift : null
  const statusLabel = !context ? 'No disponible' : !context.branch ? 'Sin turno POS' : branchState === 'loading' ? 'Cargando…' : branchState === 'error' ? 'No disponible' : branchShift?.status === 'open' ? 'Abierto' : branchShift?.status === 'closed' ? 'Reconciliado / cerrado' : 'Apertura requerida'

  return <section aria-labelledby="operator-account-title" className="ops-panel-frame rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-xl sm:p-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 id="operator-account-title" className="text-lg font-black text-white">Operador y cuenta actual</h2>
        <p className="mt-1 text-xs leading-relaxed text-slate-500">Identidad de la sesión y estado de caja al momento de consultar este reporte.</p>
      </div>
      <span className={`w-fit rounded-full border px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider ${
        branchShift?.status === 'open'
          ? 'border-emerald-400/30 bg-emerald-950 text-emerald-200'
          : branchShift?.status === 'closed'
            ? 'border-slate-700 bg-slate-900 text-slate-200'
            : 'border-amber-400/30 bg-amber-950 text-amber-200'
      }`}>{statusLabel}</span>
    </div>
    <dl className="mt-5 grid gap-3 border-t border-slate-800 pt-4 sm:grid-cols-2">
      <div><dt className="text-xs text-slate-500">Empleado</dt><dd className="mt-1 truncate text-sm font-bold text-white" title={employeeName}>{employeeName}</dd></div>
      <div><dt className="text-xs text-slate-500">Sucursal</dt><dd className="mt-1 truncate text-sm font-bold text-white" title={branchName}>{branchName}</dd></div>
    </dl>
    {!context && <p role="status" className="mt-4 rounded-xl border border-dashed border-slate-700 p-3 text-sm text-slate-400">No se pudo identificar el contexto del operador.</p>}
    {context && !context.branch && <div role="status" className="mt-4 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-4 text-sm leading-relaxed text-amber-100"><p className="font-bold">Sin sucursal asignada y sin turno POS</p><p className="mt-1 text-amber-100/80">Este acceso administrativo no abre un turno POS. Las ventas de canales externos, como WhatsApp o móvil, pueden atribuirse al administrador que las completa.</p></div>}
    {context?.branch && branchState === 'loading' && <p role="status" className="mt-4 rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300">Cargando estado de cuenta…</p>}
    {context?.branch && branchState === 'error' && <p role="alert" className="mt-4 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-100">No se pudo consultar el estado del turno de caja.</p>}
    {context?.branch && branchState === 'ready' && !branchShift && <p role="status" className="mt-4 rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-4 text-sm leading-relaxed text-amber-100">No hay un turno POS abierto o reconciliado para esta sucursal. Se requiere apertura para registrar ventas de mostrador.</p>}
    {context?.branch && branchState === 'ready' && branchShift && <ShiftMetrics shift={branchShift} />}
  </section>
}
