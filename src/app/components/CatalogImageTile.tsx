import { useState } from 'react'
import type { HTMLAttributes, ReactNode } from 'react'
import { Icon } from './icons'

export const CATALOG_IMAGE_TILE_DEFAULT_FALLBACK = <Icon name="package" className="h-7 w-7 text-slate-500" />
type CatalogImageTileProps = HTMLAttributes<HTMLDivElement> & { src?: string | null; alt: string; fallback?: ReactNode; imageClassName?: string }

export function CatalogImageTile({ src, alt, fallback = CATALOG_IMAGE_TILE_DEFAULT_FALLBACK, imageClassName = '', className = '', children, ...props }: CatalogImageTileProps) {
  const [failed, setFailed] = useState(false)
  const showImage = Boolean(src) && !failed
  return <div {...props} className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100 text-slate-500 ${className}`}>
    {showImage ? <img src={src ?? undefined} alt={alt} className={`h-full w-full object-cover ${imageClassName}`} onError={() => setFailed(true)} /> : <div role="img" aria-label={alt} className="flex items-center justify-center">{fallback}</div>}
    {children ? <div className="absolute inset-0">{children}</div> : null}
  </div>
}
