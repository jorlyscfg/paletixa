import type { ButtonHTMLAttributes } from 'react'
import { Icon, type IconName } from './icons'

export type ActionIconName = IconName

type ResponsiveActionButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  label: string
  icon?: ActionIconName
  loading?: boolean
  loadingLabel?: string
  iconOnly?: boolean
  showLabel?: boolean
  'aria-label'?: string
}

export function ResponsiveActionButton({
  label,
  icon,
  loading = false,
  loadingLabel,
  iconOnly = false,
  showLabel = false,
  className = '',
  disabled,
  children,
  title,
  'aria-label': ariaLabel,
  ...buttonProps
}: ResponsiveActionButtonProps) {
  const currentLabel = loading ? loadingLabel ?? label : label
  const visibleLabel = loading ? loadingLabel ?? label : children ?? label
  const displaysLabel = !iconOnly && (!icon || showLabel)
  const sizeClassName = displaysLabel ? 'min-h-11' : 'h-11 w-11 min-h-11 min-w-11 px-0'

  return <button
    {...buttonProps}
    type={buttonProps.type ?? 'button'}
    aria-label={ariaLabel ?? currentLabel}
    aria-busy={loading || undefined}
    title={title ?? currentLabel}
    disabled={disabled || loading}
    className={`ops-action ${displaysLabel ? '' : 'ops-icon-button'} ops-focus inline-flex items-center justify-center gap-2 ${sizeClassName} ${className}`}
  >
    {loading ? <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" /> : icon ? <Icon name={icon} className="h-4 w-4 shrink-0" /> : null}
    {displaysLabel && <span className="min-w-0 truncate">{visibleLabel}</span>}
  </button>
}
