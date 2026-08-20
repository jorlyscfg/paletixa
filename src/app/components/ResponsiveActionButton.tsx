import type { ButtonHTMLAttributes } from 'react'
import { Icon, type IconName } from './icons'

export type ActionIconName = IconName

type ResponsiveActionButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  label: string
  icon?: ActionIconName
  loading?: boolean
  loadingLabel?: string
  mobileDisplay?: 'icon' | 'full-icon' | 'text'
  'aria-label'?: string
}

export function ResponsiveActionButton({
  label,
  icon,
  loading = false,
  loadingLabel,
  mobileDisplay = 'icon',
  className = '',
  disabled,
  children,
  title,
  'aria-label': ariaLabel,
  ...buttonProps
}: ResponsiveActionButtonProps) {
  const currentLabel = loading ? loadingLabel ?? label : label
  const visibleLabel = loading ? loadingLabel ?? label : children ?? label
  const iconOnly = mobileDisplay === 'icon'

  return <button
    {...buttonProps}
    type={buttonProps.type ?? 'button'}
    aria-label={ariaLabel ?? currentLabel}
    aria-busy={loading || undefined}
    title={title ?? currentLabel}
    disabled={disabled || loading}
    className={`ops-action ops-focus inline-flex items-center justify-center gap-2 ${iconOnly ? 'max-sm:h-11 max-sm:w-11 max-sm:px-0' : mobileDisplay === 'full-icon' ? 'max-sm:min-h-11 max-sm:w-full' : 'min-h-11'} ${className}`}
  >
    {loading ? <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> : icon ? <Icon name={icon} className="h-4 w-4 shrink-0" /> : null}
    {mobileDisplay === 'text' ? visibleLabel : <span className="hidden sm:inline">{visibleLabel}</span>}
  </button>
}
