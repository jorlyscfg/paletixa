import { useEffect, useId, useState, type ReactNode } from 'react'
import { ResponsiveActionButton } from './components/ResponsiveActionButton'
import { Icon, type IconName } from './components/icons'

export type AppModule = 'catalog' | 'pos' | 'wholesale' | 'events' | 'reports' | 'branches'

const modules: Array<{ id: AppModule; label: string; description: string; icon: IconName }> = [
  { id: 'catalog', label: 'Catálogo', description: 'Productos compartidos', icon: 'catalog' },
  { id: 'pos', label: 'Punto de venta', description: 'Venta en mostrador', icon: 'sale' },
  { id: 'wholesale', label: 'Mayoristas', description: 'Venta por volumen', icon: 'sale' },
  { id: 'events', label: 'Eventos', description: 'Ventas para eventos', icon: 'sale' },
  { id: 'reports', label: 'Reportes', description: 'Visibilidad de ventas', icon: 'reports' },
  { id: 'branches', label: 'Sucursales', description: 'Acceso administrativo', icon: 'branches' },
]

function ModuleNavigation({ activeModule, onModuleChange, mobile = false }: { activeModule: AppModule; onModuleChange: (module: AppModule) => void; mobile?: boolean }) {
  return <nav aria-label={mobile ? 'Navegación de módulos móvil' : 'Navegación de módulos de escritorio'} className="grid gap-1">
    {modules.map((module) => <button key={module.id} type="button" aria-label={module.label} aria-current={activeModule === module.id ? 'page' : undefined} onClick={() => onModuleChange(module.id)} className={`ops-focus flex min-h-11 items-center gap-3 rounded-xl px-3 text-left transition-colors ${activeModule === module.id ? 'bg-sky-700 shadow-lg shadow-sky-950/25' : 'hover:bg-slate-800'}`}>
      <Icon name={module.icon} className={`h-5 w-5 shrink-0 ${activeModule === module.id ? 'text-white' : 'text-slate-300'}`} /><span className="min-w-0"><span className={`block text-sm font-semibold ${activeModule === module.id ? 'text-white' : 'text-slate-300'}`}>{module.label}</span><span className={`block truncate text-xs ${activeModule === module.id ? 'text-sky-100' : 'text-slate-500'}`}>{module.description}</span></span>
    </button>)}
  </nav>
}

export function AppShell({ activeModule, onModuleChange, children }: { activeModule: AppModule; onModuleChange: (module: AppModule) => void; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = `mobile-nav-${useId().replace(/:/g, '')}`
  const active = modules.find((module) => module.id === activeModule) ?? modules[0]

  useEffect(() => {
    if (!menuOpen) return
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') setMenuOpen(false) }
    document.addEventListener('keydown', closeOnEscape)
    return () => document.removeEventListener('keydown', closeOnEscape)
  }, [menuOpen])

  function selectModule(module: AppModule) {
    onModuleChange(module)
    setMenuOpen(false)
  }

  return <div className="ops-shell min-h-dvh bg-slate-950 text-slate-100">
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-950/95 backdrop-blur">
      <div className="flex min-h-16 items-center gap-3 px-4 sm:px-6">
        <ResponsiveActionButton label={menuOpen ? 'Cerrar menú de navegación' : 'Abrir menú de navegación'} icon={menuOpen ? 'close' : 'menu'} mobileDisplay="icon" className="text-slate-300 hover:bg-slate-800 md:hidden" onClick={() => setMenuOpen((current) => !current)} aria-expanded={menuOpen} aria-controls={menuId} />
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-700 text-lg font-black text-white">P</span>
          <div className="min-w-0"><p className="truncate text-sm font-bold tracking-tight text-white sm:text-base">Paletixa Operaciones</p><p className="hidden text-xs text-slate-400 sm:block">Catálogo y ventas compartidas</p></div>
        </div>
        <div className="ml-auto flex items-center gap-3 text-right"><span className="hidden text-xs text-slate-400 sm:block">Espacio administrativo</span><span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-300">{active.label}</span></div>
      </div>
    </header>

    <div className="flex min-h-[calc(100dvh-4rem)]">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-950 px-4 py-6 md:flex"><p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Módulos</p><ModuleNavigation activeModule={activeModule} onModuleChange={selectModule} /><p className="mt-auto px-3 pt-8 text-xs leading-relaxed text-slate-400">Administra el catálogo, registra ventas y consulta los reportes del MVP.</p></aside>
      <div className="min-w-0 flex-1 bg-slate-950"><main id="main-content" className="min-h-[calc(100dvh-4rem)] px-3 py-4 text-slate-100 sm:px-6 sm:py-8 lg:px-10"><div className="mx-auto w-full max-w-6xl">{children}</div></main></div>
    </div>

    {menuOpen && <div id={menuId} role="dialog" aria-modal="true" aria-label="Navegación de módulos" className="fixed inset-0 z-40 md:hidden"><button type="button" aria-label="Cerrar menú de navegación" className="absolute inset-0 h-full w-full bg-slate-950/70" onClick={() => setMenuOpen(false)} /><div className="absolute inset-x-3 top-20 rounded-2xl border border-slate-700 bg-slate-900 p-3 shadow-2xl"><div className="mb-2 flex items-center justify-between px-2"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">Módulos</p><button type="button" className="ops-focus inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-300 hover:bg-slate-800 hover:text-white" aria-label="Cerrar navegación de módulos" onClick={() => setMenuOpen(false)}><Icon name="close" className="h-4 w-4" /></button></div><ModuleNavigation activeModule={activeModule} onModuleChange={selectModule} mobile /></div></div>}
  </div>
}
