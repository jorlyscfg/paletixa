import type { KeyboardEvent, ReactNode } from 'react'
import { CatalogImageTile } from './CatalogImageTile'
import { ResponsiveActionButton } from './ResponsiveActionButton'

export function CatalogControlsHeader({
  toolbar,
  categoryFilters,
  titleId,
  title,
  info,
  count,
  sectionTitle,
}: {
  toolbar: ReactNode
  categoryFilters?: ReactNode
  titleId: string
  title: ReactNode
  info?: ReactNode
  count?: ReactNode
  sectionTitle?: ReactNode
}) {
  return <header data-testid="catalog-controls-header" className="grid min-w-0 shrink-0 gap-3">
    <div className="flex min-w-0 items-stretch gap-2">{toolbar}</div>
    {categoryFilters}
    <div className="flex min-w-0 items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-1">
        <h2 id={titleId} className="min-w-0 text-sm font-bold uppercase tracking-[0.12em] text-slate-300">{title}</h2>
        {info}
      </div>
      {!sectionTitle && count !== undefined && <span className="shrink-0 text-xs font-semibold text-slate-500">{count}</span>}
    </div>
    {sectionTitle && <div className="flex min-w-0 items-center justify-between gap-3">
      <h3 className="min-w-0 text-sm font-bold uppercase tracking-[0.12em] text-slate-300">{sectionTitle}</h3>
      {count !== undefined && <span className="shrink-0 text-xs font-semibold text-slate-500">{count}</span>}
    </div>}
  </header>
}

export function CatalogPricePair({
  retailValue,
  wholesaleValue,
  active,
  dataActivePrice,
  dataTestId = 'catalog-price-pair',
}: {
  retailValue: ReactNode
  wholesaleValue: ReactNode
  active?: 'retail' | 'wholesale'
  dataActivePrice?: string
  dataTestId?: string
}) {
  return <dl data-testid={dataTestId} data-catalog-price-pair="" data-active-price={dataActivePrice ?? active} className="mt-2 grid min-w-0 grid-cols-2 gap-2 border-t border-slate-800 pt-2">
    <div data-price-slot="retail" className={active === 'retail' ? 'min-w-0 rounded-lg border border-sky-400/40 bg-sky-500/10 p-2' : 'min-w-0 p-2'}>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-sky-200">Menudeo</dt>
      <dd className="mt-1 break-words text-xs font-black text-white">{retailValue}</dd>
    </div>
    <div data-price-slot="wholesale" className={active === 'wholesale' ? 'min-w-0 rounded-lg border border-amber-400/50 bg-amber-500/10 p-2' : 'min-w-0 p-2'}>
      <dt className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Mayorista</dt>
      <dd className="mt-1 break-words text-xs font-black text-white">{wholesaleValue}</dd>
    </div>
  </dl>
}

export function CatalogSelectionCard({
  dataTestId,
  label,
  disabled = false,
  imageSrc,
  imageAlt,
  imageClassName,
  imageFallback,
  badge,
  title,
  metadata,
  pricePair,
  notice,
  onSelect,
}: {
  dataTestId: string
  label: string
  disabled?: boolean
  imageSrc: string | null
  imageAlt: string
  imageClassName?: string
  imageFallback?: ReactNode
  badge?: ReactNode
  title: string
  metadata: ReactNode
  pricePair: ReactNode
  notice?: ReactNode
  onSelect: () => void
}) {
  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (disabled || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    onSelect()
  }

  return <article
    data-testid={dataTestId}
    data-catalog-selection-card=""
    role="button"
    tabIndex={disabled ? -1 : 0}
    aria-disabled={disabled}
    aria-label={label}
    title={label}
    onClick={() => { if (!disabled) onSelect() }}
    onKeyDown={handleKeyDown}
    className="group flex min-w-0 cursor-pointer flex-col rounded-2xl border border-slate-800 bg-slate-900/65 p-2.5 text-left transition-colors hover:border-slate-700 hover:bg-slate-900 focus:outline-none aria-disabled:cursor-not-allowed aria-disabled:opacity-60 ops-focus"
  >
    <CatalogImageTile src={imageSrc} alt={imageAlt} fallback={imageFallback} imageClassName={imageClassName} className="aspect-square w-full border-slate-800 bg-slate-950">
      {badge}
    </CatalogImageTile>
    <div className="mt-2 min-w-0">
      <h3 className="truncate text-sm font-bold text-white" title={title}>{title}</h3>
      <div className="mt-1 min-w-0 truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{metadata}</div>
      {pricePair}
      {notice && <p className="mt-1 text-xs font-semibold text-amber-200">{notice}</p>}
    </div>
  </article>
}

export function CatalogMobileSummary({
  count,
  singularLabel,
  pluralLabel,
  total,
  actionLabel,
  disabled,
  onAction,
  dataTestId,
  detailsTestId,
  ariaHidden,
  inert,
}: {
  count: number
  singularLabel: string
  pluralLabel: string
  total: ReactNode
  actionLabel: string
  disabled: boolean
  onAction: () => void
  dataTestId: string
  detailsTestId: string
  ariaHidden?: boolean
  inert?: boolean
}) {
  return <div data-testid={dataTestId} aria-hidden={ariaHidden} inert={inert} className="-mx-3 -mb-3 mt-2 shrink-0 border-t border-slate-800 bg-slate-950/95 px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:-mx-5 sm:-mb-5 sm:px-5 lg:hidden">
    <div className="mx-auto grid w-full max-w-[90rem] gap-3">
      <div data-testid={detailsTestId} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="shrink-0 whitespace-nowrap text-xs font-bold uppercase tracking-[0.12em] text-slate-400">{count} {count === 1 ? singularLabel : pluralLabel}</p>
        <p className="shrink-0 whitespace-nowrap text-lg font-black text-white">{total}</p>
      </div>
      <ResponsiveActionButton type="button" label={actionLabel} icon="chevron-right" showLabel disabled={disabled} onClick={onAction} className="w-full bg-sky-600 text-white hover:bg-sky-500" />
    </div>
  </div>
}
