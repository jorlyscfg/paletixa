import { useState } from 'react'
import { InfoButton } from '../../../app/components/InfoButton'
import type { ReportSnapshot } from '../api/sales'
import { ReportTrendChart } from './ReportTrendChart'

function operationScopeLabel(scope: 'all' | 'branch') {
  return scope === 'branch' ? 'Alcance de la sucursal seleccionada' : 'Alcance de todas las sucursales'
}

export function ReportTrendPanel({ snapshot }: { snapshot: ReportSnapshot }) {
  const [infoOpen, setInfoOpen] = useState(false)
  return <section aria-labelledby="sales-trend-title" className="ops-panel-frame rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-xl sm:p-5">
    <div>
      <div className="flex items-center gap-1.5">
        <h2 id="sales-trend-title" className="text-lg font-black text-white">Tendencia diaria</h2>
        <InfoButton id="sales-trend-info" label={`Explicar la tendencia diaria en ${snapshot.timezone}`} open={infoOpen} onToggle={() => setInfoOpen((current) => !current)}>
          Ventas reconocidas agrupadas por fecha local en {snapshot.timezone}; los días sin ventas permanecen visibles.
        </InfoButton>
      </div>
    </div>
    <div className="mt-5"><ReportTrendChart points={snapshot.sales.daily} /></div>
  </section>
}

export function ReportOperationsPanel({ snapshot }: { snapshot: ReportSnapshot }) {
  return <section aria-labelledby="operations-title" className="ops-panel-frame rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-xl sm:p-5">
    <div>
      <h2 id="operations-title" className="text-lg font-black text-white">Indicadores operativos</h2>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">Carga de trabajo, capacidad y estado. Estos indicadores no cambian las ventas reconocidas.</p>
    </div>
    <div className="mt-5 grid gap-4 lg:grid-cols-3">
      <article className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="text-sm font-black text-white">Carga mayorista</h3><p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Alcance global</p></div>
          <span className="rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-amber-200">Workload</span>
        </div>
        <p className="mt-6 text-3xl font-black text-white">{snapshot.operations.wholesale.workloadCount}</p>
        <p className="mt-1 text-xs font-semibold text-slate-400">pedidos pendientes o en procesamiento</p>
        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-800 pt-3 text-xs"><div><dt className="text-slate-500">Pendientes</dt><dd className="mt-1 font-bold text-slate-200">{snapshot.operations.wholesale.pendingCount}</dd></div><div><dt className="text-slate-500">En procesamiento</dt><dd className="mt-1 font-bold text-slate-200">{snapshot.operations.wholesale.processingCount}</dd></div></dl>
      </article>
      <article className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="text-sm font-black text-white">Capacidad de Eventos</h3><p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Alcance global</p></div>
          <span className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-sky-200">Capacidad</span>
        </div>
        <p className="mt-6 text-3xl font-black text-white">{snapshot.operations.event.availableCount}</p>
        <p className="mt-1 text-xs font-semibold text-slate-400">carritos disponibles en el rango</p>
        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-800 pt-3 text-xs"><div><dt className="text-slate-500">Límite diario</dt><dd className="mt-1 font-bold text-slate-200">{snapshot.operations.event.capacityLimit}</dd></div><div><dt className="text-slate-500">Asignados</dt><dd className="mt-1 font-bold text-slate-200">{snapshot.operations.event.allocatedCount}</dd></div><div><dt className="text-slate-500">Pendientes</dt><dd className="mt-1 font-bold text-slate-200">{snapshot.operations.event.pendingCount}</dd></div><div><dt className="text-slate-500">Reservados</dt><dd className="mt-1 font-bold text-slate-200">{snapshot.operations.event.reservedCount}</dd></div></dl>
      </article>
      <article className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <div className="flex items-start justify-between gap-3">
          <div><h3 className="text-sm font-black text-white">Turnos de Punto de venta</h3><p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">{operationScopeLabel(snapshot.operations.pos.scope)}</p></div>
          <span className="rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2 py-1 text-[10px] font-black uppercase tracking-wider text-emerald-200">Estado</span>
        </div>
        <p className="mt-6 text-3xl font-black text-white">{snapshot.operations.pos.openShiftCount}</p>
        <p className="mt-1 text-xs font-semibold text-slate-400">turnos abiertos</p>
        <p className="mt-5 border-t border-slate-800 pt-3 text-xs font-semibold text-slate-500">El estado de turnos se mantiene separado de los ingresos reconocidos.</p>
      </article>
    </div>
  </section>
}
