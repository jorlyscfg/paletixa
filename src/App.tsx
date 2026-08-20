import { AppProviders } from './app/AppProviders'
import { AdminBoundary } from './features/auth/ui/AdminBoundary'
import { BranchWorkspace } from './features/branches/ui/BranchWorkspace'
import { ProductWorkspace } from './features/products/ui/ProductWorkspace'
import { SalesWorkspace } from './features/sales/ui/SalesWorkspace'

function App() { return <AppProviders><a href="#main-content" className="sr-only z-10 rounded-md bg-slate-950 px-4 py-3 text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2">Skip to main content</a><main id="main-content" className="min-h-dvh bg-slate-50 px-5 py-12 text-slate-950 sm:px-8"><div className="mx-auto grid w-full max-w-5xl gap-12"><AdminBoundary><ProductWorkspace /><SalesWorkspace /><BranchWorkspace /></AdminBoundary></div></main></AppProviders> }

export default App
