import { useState } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import { Icon } from './icons'

export const CATALOG_IMAGE_TILE_DEFAULT_FALLBACK = <Icon name="package" className="h-7 w-7 text-slate-500" />
type CatalogImageTileProps = HTMLAttributes<HTMLDivElement> & { src?: string | null; alt: string; fallback?: ReactNode; imageClassName?: string }

export function CatalogImageTile({ src, alt, fallback = CATALOG_IMAGE_TILE_DEFAULT_FALLBACK, imageClassName = '', className = '', children, ...props }: CatalogImageTileProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const failed = Boolean(src) && failedSource === src
  const showImage = Boolean(src) && !failed
  return <div {...props} className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-slate-950 text-slate-400 ${className}`}>
    {showImage ? <img src={src ?? undefined} alt={alt} className={`h-full w-full object-cover ${imageClassName}`} onError={() => setFailedSource(src ?? null)} /> : <div role="img" aria-label={alt} className="flex items-center justify-center">{fallback}</div>}
    {children ? <div className="absolute inset-0">{children}</div> : null}
  </div>
}
