import { useEffect, useId, useState, type ReactNode } from 'react'
import { ResponsiveActionButton } from './components/ResponsiveActionButton'
import { Icon, type IconName } from './components/icons'

export type AppModule = 'catalog' | 'sales' | 'reports' | 'branches'

const modules: Array<{ id: AppModule; label: string; description: string; icon: IconName }> = [
  { id: 'catalog', label: 'Catalog', description: 'Shared products', icon: 'catalog' },
  { id: 'sales', label: 'Sales', description: 'POS, wholesale, events', icon: 'sale' },
  { id: 'reports', label: 'Reports', description: 'Sales visibility', icon: 'reports' },
  { id: 'branches', label: 'Branches', description: 'Admin access', icon: 'branches' },
]

function ModuleNavigation({ activeModule, onModuleChange, mobile = false }: { activeModule: AppModule; onModuleChange: (module: AppModule) => void; mobile?: boolean }) {
  return <nav aria-label={mobile ? 'Mobile module navigation' : 'Desktop module navigation'} className="grid gap-1">
    {modules.map((module) => <button key={module.id} type="button" aria-label={module.label} aria-current={activeModule === module.id ? 'page' : undefined} onClick={() => onModuleChange(module.id)} className={`ops-focus flex min-h-11 items-center gap-3 rounded-xl px-3 text-left transition-colors ${activeModule === module.id ? 'bg-sky-700 text-white shadow-lg shadow-sky-950/25' : 'text-slate-400 hover:bg-slate-800 hover:text-slate-100'}`}>
      <Icon name={module.icon} className="h-5 w-5 shrink-0" /><span className="min-w-0"><span className="block text-sm font-semibold">{module.label}</span><span className={`block truncate text-xs ${activeModule === module.id ? 'text-white' : 'text-slate-500'}`}>{module.description}</span></span>
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
        <ResponsiveActionButton label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} icon={menuOpen ? 'close' : 'menu'} mobileDisplay="icon" className="text-slate-300 hover:bg-slate-800 md:hidden" onClick={() => setMenuOpen((current) => !current)} aria-expanded={menuOpen} aria-controls={menuId} />
        <div className="flex min-w-0 items-center gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sky-700 text-lg font-black text-white">P</span>
          <div className="min-w-0"><p className="truncate text-sm font-bold tracking-tight text-white sm:text-base">Paletixa Operations</p><p className="hidden text-xs text-slate-500 sm:block">Shared catalog and sales desk</p></div>
        </div>
        <div className="ml-auto flex items-center gap-3 text-right"><span className="hidden text-xs text-slate-500 sm:block">Admin workspace</span><span className="rounded-full border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-medium text-slate-300">{active.label}</span></div>
      </div>
    </header>

    <div className="flex min-h-[calc(100dvh-4rem)]">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-950 px-4 py-6 md:flex"><p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-600">Operations</p><ModuleNavigation activeModule={activeModule} onModuleChange={selectModule} /><p className="mt-auto px-3 pt-8 text-xs leading-relaxed text-slate-600">One workspace for the product catalog, shared sales entry, and admin reports.</p></aside>
      <div className="min-w-0 flex-1 bg-slate-100"><main id="main-content" className="min-h-[calc(100dvh-4rem)] px-4 py-6 text-slate-950 sm:px-6 sm:py-8 lg:px-10"><div className="mx-auto w-full max-w-6xl">{children}</div></main></div>
    </div>

    {menuOpen && <div id={menuId} role="dialog" aria-modal="true" aria-label="Module navigation" className="fixed inset-0 z-40 md:hidden"><button type="button" aria-label="Close navigation menu" className="absolute inset-0 h-full w-full bg-slate-950/70" onClick={() => setMenuOpen(false)} /><div className="absolute inset-x-3 top-20 rounded-2xl border border-slate-700 bg-slate-900 p-3 shadow-2xl"><div className="mb-2 flex items-center justify-between px-2"><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Modules</p><button type="button" className="ops-focus inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close module navigation" onClick={() => setMenuOpen(false)}><Icon name="close" className="h-4 w-4" /></button></div><ModuleNavigation activeModule={activeModule} onModuleChange={selectModule} mobile /></div></div>}
  </div>
}
