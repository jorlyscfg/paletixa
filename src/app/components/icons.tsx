import type { ReactNode } from 'react'

export type IconName =
  | 'menu'
  | 'close'
  | 'catalog'
  | 'dashboard'
  | 'sale'
  | 'reports'
  | 'branches'
  | 'search'
  | 'eye'
  | 'eye-off'
  | 'plus'
  | 'minus'
  | 'refresh'
  | 'save'
  | 'edit'
  | 'key'
  | 'trash'
  | 'power'
  | 'bell'
  | 'login'
  | 'grid'
  | 'table'
  | 'calendar'
  | 'wallet'
  | 'globe'
  | 'info'
  | 'package'
  | 'users'
  | 'send'
  | 'check'
  | 'arrow-right'
  | 'copy'
  | 'lock'
  | 'unlock'
  | 'chevron-down'
  | 'chevron-left'
  | 'chevron-right'
   | 'print'
  | 'settings'
  | 'sun'
  | 'moon'

const paths: Record<IconName, ReactNode> = {
  menu: <><path d="M4 6h16M4 12h16M4 18h16" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  catalog: <><path d="M4 5.5A3.5 3.5 0 0 1 7.5 4H11v16H7.5A3.5 3.5 0 0 0 4 21V5.5Z" /><path d="M20 5.5A3.5 3.5 0 0 0 16.5 4H13v16h3.5A3.5 3.5 0 0 1 20 21V5.5Z" /></>,
  dashboard: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
  sale: <><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6m-6 4h3m1 4 1.5 1.5L17 15" /></>,
  reports: <><path d="M4 19V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14" /><path d="M8 17v-4m4 4V8m4 9v-7" /></>,
  branches: <><path d="M6 3v18M18 3v18M6 8h12M6 16h12" /><circle cx="6" cy="3" r="2" /><circle cx="18" cy="21" r="2" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  eye: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
  'eye-off': <><path d="M3 3l18 18" /><path d="M10.6 6.2A10.5 10.5 0 0 1 12 6c6 0 9.5 6 9.5 6a16.7 16.7 0 0 1-3.1 3.7M6.5 6.8C3.8 8.5 2.5 12 2.5 12s3.5 6 9.5 6a9.7 9.7 0 0 0 2.3-.3" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  minus: <><path d="M5 12h14" /></>,
  refresh: <><path d="M20 7v5h-5M4 17v-5h5" /><path d="M18 10a7 7 0 0 0-12-3L4 12m16 0-2 5a7 7 0 0 1-12 0" /></>,
  save: <><path d="M5 4h11l3 3v13H5V4Z" /><path d="M8 4v6h8V4M8 20v-5h8v5" /></>,
  edit: <><path d="m4 16-.8 4.8L8 20l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17Z" /><path d="m14 8 3 3" /></>,
  key: <><circle cx="8" cy="15" r="3.5" /><path d="m10.5 12.5 8-8M15 7l2 2m-5 1 2 2" /></>,
  trash: <><path d="M4 7h16M10 11v6m4-6v6M9 7V4h6v3m-9 0 1 13h10l1-13" /></>,
  power: <><path d="M12 3v9" /><path d="M18.4 6.6a9 9 0 1 1-12.8 0" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  login: <><path d="M10 17l5-5-5-5M15 12H3" /><path d="M14 4h5v16h-5" /></>,
  grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
  table: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M9 10v10M15 10v10" /></>,
  calendar: <><path d="M8 3v4m8-4v4M4 10h16" /><rect x="4" y="5" width="16" height="16" rx="2" /></>,
  wallet: <><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H6.5A2.5 2.5 0 0 1 4 16.5v-9Z" /><path d="M4 8h15m-3 5h.01" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9Z" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8v.01" /></>,
  package: <><path d="m4 7 8-4 8 4v10l-8 4-8-4V7Z" /><path d="m4 7 8 4 8-4M12 11v10" /></>,
  users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>,
  send: <><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  'arrow-right': <><path d="M5 12h14M13 6l6 6-6 6" /></>,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3" /></>,
  lock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></>,
  unlock: <><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 7-2" /></>,
  'chevron-down': <path d="m6 9 6 6 6-6" />,
  'chevron-left': <path d="m15 18-6-6 6-6" />,
  'chevron-right': <path d="m9 6 6 6-6 6" />,
  print: <><path d="M7 9V4h10v5" /><path d="M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" /><path d="M7 14h10v7H7z" /><path d="M17 13h.01" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.42 1.42-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.04 1.56V21h-2v-.48A1.7 1.7 0 0 0 12.36 19a1.7 1.7 0 0 0-1.88-.34l-.06.06L9 17.3l.06-.06A1.7 1.7 0 0 0 9.4 15a1.7 1.7 0 0 0-1.56-1.04H7v-2h.84A1.7 1.7 0 0 0 9.4 11a1.7 1.7 0 0 0-.34-1.88L9 9.06 10.42 7.64l.06.06a1.7 1.7 0 0 0 1.88.34A1.7 1.7 0 0 0 13.4 6.48V6h2v.48A1.7 1.7 0 0 0 16.44 8a1.7 1.7 0 0 0 1.88-.34l.06-.06L19.8 9l-.06.06A1.7 1.7 0 0 0 19.4 11a1.7 1.7 0 0 0 1.56 1.04H22v2h-1.04A1.7 1.7 0 0 0 19.4 15Z" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.41 1.41m11.32 11.32 1.41 1.41M4.93 19.07l1.41-1.41m12.73-12.73 1.41-1.41" /></>,
  moon: <path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5 8.5 8.5 0 1 0 20.5 15.5Z" />,
}

export function Icon({ name, className = 'h-5 w-5' }: { name: IconName; className?: string }) {
  return <svg aria-hidden="true" className={className} data-icon={name} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}
