import type { ReactNode } from 'react'

export function MobileBottomActionBar({ children, dataTestId, className = '' }: { children: ReactNode; dataTestId?: string; className?: string }) {
  return <div data-testid={dataTestId} className={`ops-mobile-action-bar lg:hidden ${className}`.trim()}>
    <div className="mx-auto grid w-full max-w-[90rem] gap-3">
      {children}
    </div>
  </div>
}
