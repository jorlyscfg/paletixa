import type { IconName } from './components/icons'

export type AppModule = 'dashboard' | 'catalog' | 'pos' | 'wholesale' | 'customers' | 'events' | 'reports' | 'branches' | 'configuration'

export const APP_MODULES: Array<{ id: AppModule; label: string; description: string; icon: IconName }> = [
  { id: 'dashboard', label: 'Dashboard', description: 'Visión operativa', icon: 'dashboard' },
  { id: 'catalog', label: 'Catálogo', description: 'Productos compartidos', icon: 'catalog' },
  { id: 'pos', label: 'Punto de venta', description: 'Venta en mostrador', icon: 'sale' },
  { id: 'wholesale', label: 'Mayoristas', description: 'Venta por volumen', icon: 'package' },
  { id: 'customers', label: 'Clientes', description: 'Accesos mayoristas', icon: 'users' },
  { id: 'events', label: 'Eventos', description: 'Ventas para eventos', icon: 'calendar' },
  { id: 'reports', label: 'Reportes', description: 'Visibilidad de ventas', icon: 'reports' },
  { id: 'branches', label: 'Sucursales', description: 'Acceso administrativo', icon: 'branches' },
  { id: 'configuration', label: 'Configuración', description: 'Reglas operativas', icon: 'settings' },
]
