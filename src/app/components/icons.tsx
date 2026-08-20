import type { ReactNode } from 'react'

export type IconName =
  | 'menu'
  | 'close'
  | 'catalog'
  | 'sale'
  | 'reports'
  | 'branches'
  | 'search'
  | 'refresh'
  | 'calendar'
  | 'info'
  | 'package'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'

const paths: Record<IconName, ReactNode> = {
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  catalog: <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 4H11v16H7.5A3.5 3.5 0 0 0 4 21V5.5Z" /><path d="M20 5.5A3.5 3.5 0 0 0 16.5 4H13v16h3.5A3.5 3.5 0 0 1 20 21V5.5Z" /></>,
  sale: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6m-6 4h3m1 4 1.5 1.5L17 15" /></>,
  reports: <><path d="M4 19V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14" /><path d="M8 17v-4m4 4V8m4 9v-7" /></>,
  branches: <><path d="M6 3v18M18 3v18M6 8h12M6 16h12" /><circle cx="6" cy="3" r="2" /><circle cx="18" cy="21" r="2" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M18 10a7 7 0 0 0-12-3L4 12m16 0-2 5a7 7 0 0 1-12 0" /></>,
  calendar: <><path d="M8 3v4m8-4v4M4 10h16" /><rect x="4" y="5" width="16" height="16" rx="2" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8v.01" /></>,
  package: <><path d="m4 7 8-4 8 4v10l-8 4-8-4V7Z" /><path d="m4 7 8 4 8-4M12 11v10" /></>,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-left': <path d="m15 18-6-6 6-6" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
}

export function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return <svg aria-hidden="true" className={className} data-icon={name} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}
