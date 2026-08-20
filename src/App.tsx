import { useState } from 'react'
import { AppProviders } from './app/AppProviders'
import { AppShell, type AppModule } from './app/AppShell'
import { AdminBoundary } from './features/auth/ui/AdminBoundary'
import { BranchWorkspace } from './features/branches/ui/BranchWorkspace'
import { ProductWorkspace } from './features/products/ui/ProductWorkspace'
import { SalesReportWorkspace } from './features/sales/ui/SalesReportWorkspace'
import { SalesWorkspace } from './features/sales/ui/SalesWorkspace'

const salesChannelsByModule = { pos: 'pos', wholesale: 'wholesale', events: 'event' } as const

function App() {
  const [activeModule, setActiveModule] = useState<AppModule>('catalog')
  const view = activeModule === 'catalog'
    ? <ProductWorkspace />
    : activeModule === 'reports'
      ? <SalesReportWorkspace />
      : activeModule === 'branches'
        ? <BranchWorkspace />
        : <SalesWorkspace key={activeModule} channel={salesChannelsByModule[activeModule]} />

  return <AppProviders><a href="#main-content" className="sr-only z-10 rounded-md bg-slate-950 px-4 py-3 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2">Saltar al contenido principal</a><AdminBoundary><AppShell activeModule={activeModule} onModuleChange={setActiveModule}>{view}</AppShell></AdminBoundary></AppProviders>
}

export default App
