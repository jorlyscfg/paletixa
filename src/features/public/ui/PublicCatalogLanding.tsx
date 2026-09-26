import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CatalogImageTile } from '../../../app/components/CatalogImageTile'
import { SearchInput } from '../../../app/components/SearchInput'
import { ThemeToggle } from '../../../app/components/ThemeToggle'
import { Icon } from '../../../app/components/icons'
import { ADMIN_LOGIN_PATH, WHOLESALE_CUSTOMER_PORTAL_PATH } from '../../../app/publicRoutes'
import { subscribeToProductCatalogChanges } from '../../products/api/catalogRealtime'
import { listPublicWholesaleCatalog, type WholesaleCatalogProduct } from '../../wholesale/api/catalog'
import aguaFrescaJamaicaImage from '../../../../imagenes/agua_fresca_jamaica.jpg'
import bolisSaborinesChamoyImage from '../../../../imagenes/bolis_saborines_chamoy.jpg'
import nieveVasoNuezImage from '../../../../imagenes/nieve_en_vaso_nuez.jpg'
import paletaAguaLimonImage from '../../../../imagenes/paleta_agua_limon.jpg'
import paletaCremaFresaImage from '../../../../imagenes/paleta_crema_fresa_con_crema.jpg'
import trompitoCremaFresaImage from '../../../../imagenes/trompito-crema-fresa.jpg'

/**
 * THESIS: A tropical product showroom lets people discover the live selection first, refusing the dark admin-dashboard landing pattern.
 * OWN-WORLD: Coral, mango, mint, berry, and warm canvas fields frame local product photography with editorial asymmetry.
 * STORY: Visitors understand the antojo-to-business offer, choose a consumer or wholesale path, see current products, and know how to connect.
 * FIRST VIEWPORT: A local image collage sits beside the verified promise, live availability proof, and the catalog CTA.
 * FORM: Image-led storytelling surrounds a searchable product wall with honest loading, error, empty, filtered-empty, and refreshing states.
 */

const CATALOG_REFETCH_DEBOUNCE_MS = 150
const ALL_CATEGORIES = 'Todas'
const BUSINESS_PHONE = '9842047347'
const BUSINESS_PHONE_HREF = `tel:${BUSINESS_PHONE}`
const MARKETING_CATEGORIES = [
  { name: 'Bolis', icon: 'package' },
  { name: 'Saborines', icon: 'package' },
  { name: 'Paletas', icon: 'catalog' },
  { name: 'Nieves', icon: 'globe' },
  { name: 'Aguas frescas', icon: 'send' },
] as const
const SOCIAL_LINKS = [
  { label: 'Facebook', description: "Página de La Paleti'Xa", href: 'https://www.facebook.com/p/La-PaletiXa-61556650520980/?locale=es_LA', icon: 'users' },
  { label: 'Anuncio en Facebook', description: 'La llegada a Playa del Carmen', href: 'https://www.facebook.com/61556650520980/posts/la-paletiixa-lleg%C3%B3-a-playa-del-carmen-y-con-ella-los-mejores-productos-al-mejor-p/122093892080221684/', icon: 'info' },
  { label: 'Instagram', description: "Publicación de La Paleti'Xa", href: 'https://www.instagram.com/p/DYA87G2DTOf/', icon: 'globe' },
] as const
const retailPriceFormatter = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' })

function formatRetailPrice(value: number) {
  return retailPriceFormatter.format(value)
}

function formatWholesalePrice(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? formatRetailPrice(value) : 'Consultar'
}

function matchesProduct(product: WholesaleCatalogProduct, query: string, category: string) {
  if (category !== ALL_CATEGORIES && product.category !== category) return false
  const terms = query.trim().toLocaleLowerCase('es-MX').split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const searchableFields = [product.name, product.sku, product.category].map((field) => field.toLocaleLowerCase('es-MX'))
  return terms.every((term) => searchableFields.some((field) => field.includes(term)))
}

function ProductCard({ product }: { product: WholesaleCatalogProduct }) {
  const retailPrice = formatRetailPrice(product.retailPriceMxn)
  const wholesalePrice = formatWholesalePrice(product.wholesalePriceMxn)

  return <article data-testid="public-product-card" className="public-product-card public-card-surface group grid min-w-0 gap-3 rounded-[1.35rem] border p-2.5 shadow-[0_18px_40px_rgb(2_6_23_/_0.18)] sm:p-3">
    <CatalogImageTile src={product.imageUrl} alt={`Imagen de ${product.name}`} imageClassName="object-cover transition-transform duration-500 group-hover:scale-105" className="aspect-square rounded-[1.05rem] border-slate-700 bg-slate-950">
      <div className="pointer-events-none absolute inset-0 flex items-start justify-between gap-2 p-3">
        <span className="public-available-badge rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em]">Disponible</span>
        <span className="public-image-category max-w-[55%] truncate rounded-full px-2 py-1 text-[10px] font-bold">{product.category}</span>
      </div>
    </CatalogImageTile>
    <div className="grid gap-2 px-1.5 pb-1.5">
      <div className="min-w-0">
        <p className="public-cyan-text truncate text-[11px] font-bold">{product.category}</p>
        <h3 className="public-ink mt-1 min-h-[2.75rem] break-words text-base font-black leading-tight sm:text-lg">{product.name}</h3>
        <p className="public-ink-subtle mt-1 truncate text-xs">SKU {product.sku}</p>
      </div>
      <dl className="grid gap-2 border-t border-slate-800 pt-2">
        <div className="flex items-baseline justify-between gap-2">
          <dt className="public-price-label text-[11px] font-semibold leading-tight">Precio al público</dt>
          <dd data-testid="public-retail-price" aria-label={`Precio al público: ${retailPrice}`} className="public-retail-price shrink-0 text-base font-black sm:text-lg">{retailPrice}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <dt className="public-price-label text-[11px] font-semibold leading-tight">Precio mayorista</dt>
          <dd data-testid="public-wholesale-price" aria-label={`Precio mayorista: ${wholesalePrice}`} className="public-wholesale-price shrink-0 text-base font-black sm:text-lg">{wholesalePrice}</dd>
        </div>
      </dl>
    </div>
  </article>
}

function ProductSkeleton() {
  return <div aria-hidden="true" className="grid gap-3 rounded-[1.35rem] border border-slate-800/80 bg-slate-900/70 p-2.5 sm:p-3">
    <div className="aspect-square animate-pulse rounded-[1.05rem] bg-slate-800" />
    <div className="grid gap-2 px-1.5 pb-1.5"><div className="h-3 w-1/3 animate-pulse rounded bg-slate-800" /><div className="h-5 w-4/5 animate-pulse rounded bg-slate-800" /><div className="h-4 w-2/5 animate-pulse rounded bg-slate-800" /></div>
  </div>
}

function ImageCaption({ children }: { children: ReactNode }) {
  return <figcaption className="public-caption absolute inset-x-3 bottom-3 rounded-xl px-3 py-2 text-xs font-black backdrop-blur-sm">{children}</figcaption>
}

function BrandImageShowcase({ availabilityCopy, catalogCount, categoryCount, isRefreshing }: { availabilityCopy: string; catalogCount: number; categoryCount: number; isRefreshing: boolean }) {
  return <div data-testid="brand-image-showcase" className="public-showcase-frame public-showcase-enter relative mx-auto min-h-[30rem] w-full max-w-xl overflow-hidden rounded-[2.25rem] border border-rose-500/30 p-3 shadow-[0_28px_70px_rgb(87_29_45_/_0.22)] sm:min-h-[35rem] sm:p-5">
    <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-cyan-300/55" aria-hidden="true" />
    <div className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-rose-500/30" aria-hidden="true" />
    <div className="relative grid h-full min-h-[28rem] grid-cols-[minmax(0,1.12fr)_minmax(5.75rem,0.7fr)] gap-3 sm:min-h-[32rem] sm:gap-4">
      <figure className="relative mt-8 aspect-[4/5] overflow-hidden rounded-[2rem] rounded-bl-[4rem] bg-rose-100 shadow-[0_20px_35px_rgb(87_29_45_/_0.18)] sm:mt-12">
        <img src={paletaCremaFresaImage} alt="Paleta cremosa de fresa con fruta" width="800" height="1000" loading="eager" decoding="async" className="h-full w-full object-cover" />
        <ImageCaption>Fresa con crema</ImageCaption>
      </figure>
      <div className="grid content-start gap-3 sm:gap-4">
        <figure className="relative aspect-square overflow-hidden rounded-[1.75rem] rounded-tr-[3.5rem] bg-rose-100 shadow-[0_18px_30px_rgb(87_29_45_/_0.16)]">
          <img src={bolisSaborinesChamoyImage} alt="Boli de chamoy de La Paleti'Xa" width="800" height="800" loading="lazy" decoding="async" className="h-full w-full object-cover" />
          <ImageCaption>Bolis & saborines</ImageCaption>
        </figure>
        <div className="public-cyan-surface grid content-center gap-2 rounded-[1.75rem] p-4 sm:min-h-40 sm:p-5">
          <span className="text-[10px] font-black uppercase tracking-[0.12em]">Catálogo en vivo</span>
          <strong className="text-3xl font-black leading-none sm:text-4xl">{catalogCount}</strong>
          <span className="text-xs font-bold leading-tight">{catalogCount === 1 ? 'producto publicado' : 'productos publicados'}</span>
        </div>
      </div>
      <div className="public-panel-surface absolute -bottom-1 left-3 right-3 grid gap-3 rounded-[1.5rem] border border-slate-800/80 p-3 shadow-[0_18px_35px_rgb(2_6_23_/_0.22)] sm:left-8 sm:right-8 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:p-4">
        <div>
          <p className="public-mango-muted text-[10px] font-black uppercase tracking-[0.14em]">Disponibilidad pública</p>
          <p className="public-ink mt-1 text-lg font-black leading-tight">{availabilityCopy}</p>
        </div>
        <span data-testid="public-catalog-live-status" role="status" aria-live="polite" className="public-live-status inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-[10px] font-black"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-300" />{isRefreshing ? 'Actualizando…' : 'Al día'}</span>
      </div>
    </div>
    <div className="relative mt-5 grid grid-cols-2 gap-3 border-t border-rose-500/20 pt-4 text-xs text-slate-200 sm:mt-7">
      <div><p className="public-ink-subtle">Selección visible</p><p className="public-cyan-text mt-1 text-lg font-black">{catalogCount}</p></div>
      <div><p className="public-ink-subtle">Categorías activas</p><p className="public-retail-price mt-1 text-lg font-black">{categoryCount}</p></div>
    </div>
  </div>
}

function AudiencePaths() {
  return <section id="mayoristas" data-testid="audience-paths" aria-labelledby="public-audience-title" className="public-coral-surface border-y border-slate-800/80 px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
    <div className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:gap-16">
      <div>
        <h2 id="public-audience-title" className="max-w-xl text-3xl font-black leading-tight tracking-tight sm:text-5xl">Dos maneras de entrar a La Paleti'Xa.</h2>
        <p className="public-coral-muted mt-4 max-w-md text-sm leading-relaxed sm:text-base">La misma vitrina pública acompaña a quien viene por un antojo y a quien está explorando una conversación mayorista.</p>
      </div>
      <div className="grid gap-8 sm:grid-cols-2 sm:gap-0">
        <div className="sm:pr-8">
          <p className="text-lg font-black">Para descubrir productos</p>
          <p className="public-coral-muted mt-2 text-sm leading-relaxed">Consulta la selección publicada, revisa el precio al público y filtra por lo que buscas.</p>
          <a href="#catalogo" className="public-mango-action ops-focus mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-4 py-3 text-sm font-black">Ver productos <Icon name="arrow-right" className="h-4 w-4" /></a>
        </div>
        <div className="public-coral-divider border-t pt-8 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
          <p className="text-lg font-black">Para explorar mayoreo</p>
          <p className="public-coral-muted mt-2 text-sm leading-relaxed">Conoce el portal para clientes mayoristas y conecta con la propuesta de quienes fabrican y distribuyen.</p>
          <div className="mt-4 flex flex-wrap gap-2 text-xs font-black"><span className="public-coral-divider rounded-full border px-3 py-1.5">Fabricantes</span><span className="public-coral-divider rounded-full border px-3 py-1.5">Distribuidores</span></div>
          <a href={WHOLESALE_CUSTOMER_PORTAL_PATH} className="public-coral-portal ops-focus mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl border px-4 py-3 text-sm font-black">Portal para clientes mayoristas <Icon name="arrow-right" className="h-4 w-4" /></a>
        </div>
      </div>
    </div>
  </section>
}

function ProductStorySection() {
  return <section id="sabores" data-testid="product-storytelling" aria-labelledby="public-story-title" className="public-section-surface px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
    <div className="mx-auto w-full max-w-7xl">
      <div className="grid gap-6 lg:grid-cols-[0.72fr_1.28fr] lg:items-end lg:gap-16">
        <div>
          <h2 id="public-story-title" className="public-ink max-w-lg text-3xl font-black leading-tight tracking-tight sm:text-5xl">Una vitrina para mirar con calma.</h2>
          <p className="public-ink-muted mt-4 max-w-xl text-sm leading-relaxed sm:text-base">Bolis, Saborines, Paletas, Nieves y Aguas frescas aparecen aquí como familias de producto para que encuentres tu siguiente búsqueda.</p>
        </div>
        <p className="public-mango-muted max-w-md text-sm font-bold leading-relaxed lg:justify-self-end">La selección que ves abajo es la que está publicada ahora.</p>
      </div>
      <div className="mt-10 grid gap-3 sm:grid-cols-12 sm:grid-rows-[12rem_12rem] sm:gap-4 lg:mt-14 lg:grid-rows-[15rem_15rem]">
        <figure className="group relative min-h-64 overflow-hidden rounded-[2rem] rounded-bl-[4rem] bg-rose-100 sm:col-span-5 sm:row-span-2">
          <img src={bolisSaborinesChamoyImage} alt="Bolis de chamoy de La Paleti'Xa" width="800" height="1000" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          <ImageCaption>Bolis y Saborines</ImageCaption>
        </figure>
        <figure className="group relative min-h-48 overflow-hidden rounded-[1.75rem] bg-amber-100 sm:col-span-4">
          <img src={aguaFrescaJamaicaImage} alt="Agua fresca de jamaica" width="800" height="800" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          <ImageCaption>Aguas frescas</ImageCaption>
        </figure>
        <figure className="group relative min-h-48 overflow-hidden rounded-[1.75rem] rounded-tr-[3rem] bg-amber-100 sm:col-span-3">
          <img src={nieveVasoNuezImage} alt="Nieve en vaso de nuez" width="800" height="800" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          <ImageCaption>Nieves</ImageCaption>
        </figure>
        <figure className="group relative min-h-48 overflow-hidden rounded-[1.75rem] bg-rose-100 sm:col-span-4">
          <img src={paletaAguaLimonImage} alt="Paleta de agua de limón" width="800" height="800" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          <ImageCaption>Paletas</ImageCaption>
        </figure>
        <figure className="group relative min-h-48 overflow-hidden rounded-[1.75rem] rounded-br-[3rem] bg-rose-100 sm:col-span-3">
          <img src={trompitoCremaFresaImage} alt="Trompito de crema y fresa" width="800" height="800" loading="lazy" decoding="async" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" />
          <ImageCaption>Más para descubrir</ImageCaption>
        </figure>
      </div>
      <ul aria-label="Categorías de productos" className="mt-10 grid border-y border-slate-800 sm:grid-cols-5">
        {MARKETING_CATEGORIES.map((category) => <li key={category.name} className="flex min-h-16 items-center gap-3 border-b border-slate-800 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:px-4 sm:first:pl-0 sm:last:border-r-0 sm:last:pr-0">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-300/15 text-cyan-300"><Icon name={category.icon} className="h-4 w-4" /></span>
          <span className="public-ink text-sm font-black">{category.name}</span>
        </li>)}
      </ul>
    </div>
  </section>
}

function HowItWorksSection() {
  return <section id="como-funciona" aria-labelledby="public-how-title" className="public-mango-surface px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
    <div className="mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[0.62fr_1.38fr] lg:items-start lg:gap-16">
      <div>
        <h2 id="public-how-title" className="max-w-md text-3xl font-black leading-tight tracking-tight sm:text-5xl">Muévete por la vitrina sin rodeos.</h2>
        <p className="public-mango-muted mt-4 max-w-md text-sm leading-relaxed sm:text-base">Tres pasos para pasar de mirar a encontrar el camino correcto.</p>
      </div>
      <ol className="grid gap-0 sm:grid-cols-3 sm:divide-x sm:divide-slate-950/20">
        <li className="border-b border-slate-950/20 py-5 sm:border-b-0 sm:px-6 sm:py-0 sm:first:pl-0">
          <span className="public-mango-border flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-black">01</span>
          <h3 className="mt-5 text-lg font-black">Explora</h3>
          <p className="public-mango-muted mt-2 text-sm leading-relaxed">Mira los productos publicados y sus categorías.</p>
        </li>
        <li className="border-b border-slate-950/20 py-5 sm:border-b-0 sm:px-6 sm:py-0">
          <span className="public-mango-border flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-black">02</span>
          <h3 className="mt-5 text-lg font-black">Filtra</h3>
          <p className="public-mango-muted mt-2 text-sm leading-relaxed">Busca por nombre, SKU o categoría.</p>
        </li>
        <li className="py-5 sm:px-6 sm:py-0 sm:last:pr-0">
          <span className="public-mango-border flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-black">03</span>
          <h3 className="mt-5 text-lg font-black">Conecta</h3>
          <p className="public-mango-muted mt-2 text-sm leading-relaxed">Llama o entra al portal mayorista según tu camino.</p>
        </li>
      </ol>
    </div>
  </section>
}

function FaqSection() {
  const questions = [
    { question: '¿La disponibilidad puede cambiar?', answer: 'Sí. El catálogo se vuelve a consultar cuando detecta cambios y también puedes actualizarlo manualmente.' },
    { question: '¿Puedo buscar por SKU o categoría?', answer: 'Sí. El buscador acepta nombre, SKU o categoría, y los botones de categoría filtran la selección.' },
    { question: '¿Dónde está La Paleti\'Xa?', answer: 'La marca está en Playa del Carmen y la Riviera Maya.' },
    { question: '¿Cómo conecto si exploro mayoreo?', answer: 'Puedes entrar al portal para clientes mayoristas o llamar al 9842047347.' },
  ]

  return <section id="preguntas" aria-labelledby="public-faq-title" className="public-panel-surface px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
    <div className="mx-auto grid w-full max-w-7xl gap-8 lg:grid-cols-[0.75fr_1.25fr] lg:gap-20">
      <div>
        <h2 id="public-faq-title" className="public-ink max-w-md text-3xl font-black leading-tight tracking-tight sm:text-5xl">Lo que necesitas saber antes de elegir.</h2>
        <p className="public-ink-muted mt-4 max-w-md text-sm leading-relaxed sm:text-base">Respuestas cortas sobre lo que esta página sí hace y cómo continuar.</p>
      </div>
      <div className="border-t border-slate-800">
        {questions.map((item) => <details key={item.question} className="group border-b border-slate-800">
          <summary className="public-ink ops-focus flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 py-4 text-base font-black marker:hidden [&::-webkit-details-marker]:hidden">
            <span>{item.question}</span><Icon name="chevron-down" className="h-5 w-5 shrink-0 text-cyan-300 transition-transform duration-200 group-open:rotate-180" />
          </summary>
          <p className="public-ink-muted max-w-2xl pb-5 pr-8 text-sm leading-relaxed">{item.answer}</p>
        </details>)}
      </div>
    </div>
  </section>
}

function SocialContactSection() {
  return <section id="conoce-mas" aria-labelledby="public-social-title" className="public-cyan-surface px-4 py-12 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
    <div className="mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:items-center lg:gap-16">
      <div>
        <h2 id="public-social-title" className="max-w-lg text-3xl font-black leading-tight tracking-tight sm:text-5xl">La Paleti'Xa, cerca de ti.</h2>
        <p className="public-cyan-muted mt-4 max-w-xl text-sm leading-relaxed sm:text-base">Conoce la llegada de la marca a Playa del Carmen y encuentra sus canales públicos.</p>
        <a href={BUSINESS_PHONE_HREF} className="ops-focus mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl border-2 border-slate-950/25 px-4 py-3 text-sm font-black transition-colors hover:bg-slate-950/10"><Icon name="send" className="h-4 w-4" />Llamar al {BUSINESS_PHONE}</a>
      </div>
      <div className="grid gap-4 sm:grid-cols-[0.8fr_1.2fr] sm:items-stretch">
        <div className="public-panel-surface rounded-[1.75rem] p-5 sm:p-6">
          <p className="public-mango-muted text-xs font-black uppercase tracking-[0.14em]">Ubicación pública</p>
          <p className="public-ink mt-5 text-2xl font-black leading-tight">Playa del Carmen</p>
          <p className="public-ink-muted mt-1 text-sm font-bold">Riviera Maya</p>
          <p className="public-ink-subtle mt-8 text-xs leading-relaxed">Para preguntas, utiliza el teléfono de La Paleti'Xa.</p>
        </div>
        <ul className="grid gap-2 sm:grid-cols-3">
          {SOCIAL_LINKS.map((social) => <li key={social.href}>
            <a href={social.href} target="_blank" rel="noopener noreferrer" aria-label={`${social.label}: ${social.description} (se abre en una pestaña nueva)`} className="ops-focus group flex min-h-32 flex-col justify-between rounded-[1.35rem] border-2 border-slate-950/20 p-4 transition-[background-color,border-color,box-shadow,transform] duration-200 hover:-translate-y-1 hover:bg-slate-950/10 sm:min-h-full">
              <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-slate-950/25"><Icon name={social.icon} className="h-4 w-4" /></span>
              <span className="mt-5 block"><span className="block text-sm font-black">{social.label}</span><span className="public-cyan-muted mt-1 block text-xs leading-relaxed">{social.description}</span></span>
              <span className="mt-4 inline-flex items-center gap-1 text-xs font-black">Abrir enlace <Icon name="arrow-right" className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></span>
            </a>
          </li>)}
        </ul>
      </div>
    </div>
  </section>
}

export function PublicCatalogLanding() {
  const [catalog, setCatalog] = useState<WholesaleCatalogProduct[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const disposedRef = useRef(false)
  const requestSequence = useRef(0)
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasLoadedRef = useRef(false)

  const loadCatalog = useCallback((showLoading = false) => {
    if (disposedRef.current) return
    if (debounceTimer.current !== null) {
      clearTimeout(debounceTimer.current)
      debounceTimer.current = null
    }
    const request = ++requestSequence.current
    if (showLoading) setIsLoading(true)
    else setIsRefreshing(true)
    void listPublicWholesaleCatalog()
      .then((nextCatalog) => {
        if (disposedRef.current || request !== requestSequence.current) return
        setCatalog(nextCatalog)
        hasLoadedRef.current = true
        setError(null)
        setLastUpdated(new Date())
      })
      .catch(() => {
        if (disposedRef.current || request !== requestSequence.current) return
        setError(hasLoadedRef.current ? 'No se pudo actualizar la disponibilidad. Seguimos mostrando el último catálogo disponible.' : 'No se pudo cargar el catálogo. Intenta actualizar nuevamente.')
      })
      .finally(() => {
        if (disposedRef.current || request !== requestSequence.current) return
        setIsLoading(false)
        setIsRefreshing(false)
      })
  }, [])

  useEffect(() => {
    let active = true
    disposedRef.current = false
    queueMicrotask(() => { if (active) loadCatalog(true) })
    const handleCatalogChanged = () => {
      if (!active || disposedRef.current) return
      setIsRefreshing(true)
      if (debounceTimer.current !== null) clearTimeout(debounceTimer.current)
      debounceTimer.current = setTimeout(() => {
        debounceTimer.current = null
        if (!active) return
        loadCatalog()
      }, CATALOG_REFETCH_DEBOUNCE_MS)
    }
    let stop: (() => void) | undefined
    void subscribeToProductCatalogChanges(handleCatalogChanged).then((cleanup) => {
      if (!active) cleanup()
      else stop = cleanup
    }).catch(() => {
      // Realtime is an enhancement; the initial public catalog remains usable without it.
    })
    return () => {
      active = false
      disposedRef.current = true
      if (debounceTimer.current !== null) clearTimeout(debounceTimer.current)
      debounceTimer.current = null
      stop?.()
    }
  }, [loadCatalog])

  const categories = useMemo(() => [ALL_CATEGORIES, ...Array.from(new Set(catalog.map((product) => product.category))).sort((a, b) => a.localeCompare(b, 'es-MX'))], [catalog])
  const visibleCatalog = useMemo(() => catalog.filter((product) => matchesProduct(product, searchQuery, selectedCategory)), [catalog, searchQuery, selectedCategory])
  const availabilityCopy = isLoading ? 'Cargando catálogo…' : `${catalog.length} ${catalog.length === 1 ? 'producto disponible' : 'productos disponibles'}`

  return <div className="public-landing flex h-dvh min-h-0 flex-col overflow-hidden" aria-busy={isLoading || isRefreshing}>
    <header className="z-30 shrink-0 border-b border-slate-800/80 bg-slate-950/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 w-full max-w-7xl items-center gap-3 px-3 sm:px-6 lg:px-8">
        <a href="/" aria-label="La Paleti'Xa, inicio" className="ops-focus flex min-w-0 items-center gap-2 rounded-xl sm:gap-3">
          <span className="public-coral-surface flex h-10 w-10 shrink-0 items-center justify-center rounded-[1.15rem] text-lg font-black">P</span>
          <span className="public-ink max-[30rem]:hidden truncate text-sm font-black tracking-tight sm:text-base">La Paleti'Xa</span>
        </a>
        <nav aria-label="Navegación pública" className="ml-auto flex items-center gap-1 sm:gap-2">
          <a href="#catalogo" className="public-nav-link ops-focus hidden min-h-11 items-center rounded-xl px-2 text-sm font-bold sm:inline-flex">Catálogo</a>
          <a href="#mayoristas" className="public-nav-link ops-focus hidden min-h-11 items-center rounded-xl px-2 text-sm font-bold md:inline-flex">Mayoristas</a>
          <a href="#conoce-mas" className="public-nav-link ops-focus hidden min-h-11 items-center rounded-xl px-2 text-sm font-bold lg:inline-flex">Conoce más</a>
          <ThemeToggle className="border-slate-700 text-slate-200" />
          <a href="#catalogo" aria-label="Abrir catálogo" className="public-mango-action ops-focus inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-xs font-black hover:-translate-y-0.5 sm:px-4 sm:text-sm"><Icon name="catalog" className="h-4 w-4" /><span className="hidden sm:inline">Catálogo</span></a>
        </nav>
      </div>
    </header>

    <main data-testid="public-catalog-landing" className="public-landing-scroll min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain" aria-busy={isLoading || isRefreshing}>
    <section aria-labelledby="public-landing-title" className="relative overflow-hidden px-4 pb-14 pt-10 sm:px-6 sm:pb-20 sm:pt-16 lg:px-8 lg:pb-24 lg:pt-20">
      <div className="pointer-events-none absolute right-[-6rem] top-16 h-72 w-72 rounded-full bg-rose-500/20" aria-hidden="true" />
      <div className="pointer-events-none absolute bottom-[-8rem] left-[-5rem] h-80 w-80 rounded-full bg-cyan-300/15" aria-hidden="true" />
      <div className="relative mx-auto grid w-full max-w-7xl gap-10 lg:grid-cols-[minmax(0,0.92fr)_minmax(22rem,1.08fr)] lg:items-center lg:gap-16">
        <div className="max-w-2xl">
          <p className="public-cyan-text flex items-center gap-2 text-xs font-black uppercase tracking-[0.14em]"><span className="h-2 w-2 rounded-full bg-cyan-300" />Productos que llegan con la marca</p>
          <h1 id="public-landing-title" className="public-ink mt-5 max-w-xl text-[clamp(2.75rem,9vw,5.8rem)] font-black leading-[0.92] tracking-[-0.055em]">Del <span className="public-accent-text">antojo</span> a tu propio negocio.</h1>
          <p className="public-ink-muted mt-6 max-w-xl text-base leading-relaxed sm:text-lg">La Paleti'Xa llegó a Playa del Carmen con productos para disfrutar un simple antojo y una propuesta que puede acompañar el inicio de tu propio negocio.</p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <a href="#catalogo" className="public-mango-action ops-focus inline-flex min-h-12 items-center gap-2 rounded-xl px-5 py-3 text-sm font-black shadow-[0_12px_24px_rgb(245_173_63_/_0.2)] hover:-translate-y-0.5">Ver catálogo <Icon name="arrow-right" className="h-4 w-4" /></a>
            <a href={WHOLESALE_CUSTOMER_PORTAL_PATH} className="public-coral-outline ops-focus inline-flex min-h-12 items-center gap-2 rounded-xl border px-4 py-3 text-sm font-black hover:-translate-y-0.5">Explorar mayoreo <Icon name="users" className="h-4 w-4" /></a>
          </div>
          <div className="public-ink-muted mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-slate-800 pt-5 text-sm font-bold">
            <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-300" />Disponibilidad en vivo</span>
            <span className="public-ink-subtle">Se actualiza cuando cambia la selección</span>
          </div>
        </div>
        <BrandImageShowcase availabilityCopy={availabilityCopy} catalogCount={catalog.length} categoryCount={Math.max(0, categories.length - 1)} isRefreshing={isRefreshing} />
      </div>
    </section>

    <AudiencePaths />
    <ProductStorySection />
    <HowItWorksSection />

    <section id="catalogo" data-testid="public-catalog-section" className="scroll-mt-20 border-t border-slate-800/80 bg-slate-950/90 px-4 py-12 sm:scroll-mt-24 sm:px-6 sm:py-16 lg:px-8 lg:py-20">
      <div className="mx-auto w-full max-w-7xl">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="public-cyan-text text-sm font-black">Catálogo público</p><h2 className="public-ink mt-3 max-w-2xl text-3xl font-black leading-tight tracking-tight sm:text-5xl">Lo que está disponible ahora.</h2><p className="public-ink-muted mt-4 max-w-2xl text-sm leading-relaxed sm:text-base">Busca por producto, SKU o categoría. La disponibilidad se revisa automáticamente cuando el catálogo cambia.</p></div>
          <button type="button" onClick={() => loadCatalog(!hasLoadedRef.current)} className="ops-focus inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-slate-700 bg-slate-900 px-4 text-sm font-bold text-slate-200 transition-[background-color,border-color,box-shadow,color,transform] duration-200 hover:-translate-y-0.5 hover:border-slate-500 hover:text-white lg:self-end"><Icon name="refresh" className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />Actualizar catálogo</button>
        </div>

        <div className="mt-8 grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"><SearchInput value={searchQuery} onChange={setSearchQuery} label="Buscar en el catálogo" placeholder="Buscar por producto, SKU o categoría" className="border-slate-700 bg-slate-900" /><div className="ops-horizontal-scroll flex gap-2 pb-1" role="group" aria-label="Filtrar por categoría">{categories.map((category) => <button key={category} type="button" aria-pressed={selectedCategory === category} onClick={() => setSelectedCategory(category)} className="public-category-filter ops-focus min-h-11 shrink-0 rounded-xl px-3 text-xs font-bold">{category}</button>)}</div></div>

        {error && catalog.length > 0 && <div role="alert" className="public-alert mt-5 flex flex-col gap-3 border-y px-4 py-4 text-sm sm:flex-row sm:items-center sm:justify-between"><p>{error}</p><button type="button" onClick={() => loadCatalog(false)} className="ops-focus inline-flex min-h-11 shrink-0 items-center justify-center gap-2 self-start rounded-xl border border-current px-3 text-xs font-bold transition-[background-color,border-color,box-shadow,color,transform] duration-200 hover:-translate-y-0.5 hover:bg-current/10 sm:self-auto"><Icon name="refresh" className="h-4 w-4" />Reintentar</button></div>}
        <div
          data-testid="public-catalog-results-region"
          role="region"
          aria-label="Resultados del catálogo"
          tabIndex={0}
          className="public-catalog-results-region mt-8 max-h-[min(48rem,70vh)] overflow-y-auto overscroll-contain sm:max-h-[min(54rem,72vh)] lg:max-h-[min(60rem,75vh)]"
        >
          <div aria-live="polite">
            {isLoading ? <div data-testid="public-catalog-loading" className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-5">{Array.from({ length: 4 }, (_, index) => <ProductSkeleton key={index} />)}</div>
              : error && catalog.length === 0 ? <div className="ops-state ops-state-error grid gap-4 rounded-[1.5rem] p-6 sm:p-8"><div><h3 className="text-lg font-black">No pudimos mostrar el catálogo.</h3><p className="mt-2 text-sm leading-relaxed">Revisa tu conexión e intenta cargar la selección nuevamente.</p></div><button type="button" onClick={() => loadCatalog(true)} className="public-coral-action ops-focus inline-flex min-h-11 w-fit items-center gap-2 rounded-xl px-4 text-sm font-bold hover:-translate-y-0.5"><Icon name="refresh" className="h-4 w-4" />Intentar de nuevo</button></div>
              : catalog.length === 0 ? <div className="ops-state ops-state-empty grid gap-2 rounded-[1.5rem] p-8"><Icon name="package" className="mx-auto h-8 w-8 text-slate-500" /><h3 className="text-lg font-black text-slate-200">La selección está por llegar.</h3><p className="text-sm leading-relaxed">En este momento no hay productos publicados. Vuelve pronto para descubrir novedades.</p></div>
              : visibleCatalog.length === 0 ? <div className="ops-state ops-state-filtered-empty grid gap-4 rounded-[1.5rem] p-8"><div><h3 className="text-lg font-black text-slate-200">No encontramos coincidencias.</h3><p className="mt-2 text-sm leading-relaxed">Prueba con otro término o elimina los filtros para ver toda la selección.</p></div><button type="button" onClick={() => { setSearchQuery(''); setSelectedCategory(ALL_CATEGORIES) }} className="ops-focus mx-auto inline-flex min-h-11 items-center rounded-xl border border-slate-700 px-4 text-sm font-bold text-slate-200 transition-[background-color,border-color,box-shadow,color,transform] duration-200 hover:-translate-y-0.5 hover:bg-slate-900">Limpiar filtros</button></div>
              : <><div className="mb-4 flex flex-wrap items-center justify-between gap-2 text-sm"><p className="public-ink-muted font-bold">{visibleCatalog.length} {visibleCatalog.length === 1 ? 'producto encontrado' : 'productos encontrados'}</p>{lastUpdated && <p className="public-ink-subtle text-xs">Actualizado {lastUpdated.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}</p>}</div><div data-testid="public-catalog-grid" className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 lg:gap-5">{visibleCatalog.map((product) => <ProductCard key={product.id} product={product} />)}</div></>
            }
          </div>
        </div>
      </div>
    </section>

    <FaqSection />
    <SocialContactSection />

    <section aria-labelledby="public-closing-title" className="public-coral-surface px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
        <div><h2 id="public-closing-title" className="max-w-2xl text-4xl font-black leading-[0.95] tracking-[-0.04em] sm:text-6xl">Tu siguiente descubrimiento empieza aquí.</h2><p className="public-coral-muted mt-5 max-w-xl text-sm leading-relaxed sm:text-base">Vuelve a la selección publicada o continúa al portal mayorista.</p></div>
        <div className="flex flex-wrap gap-3"><a href="#catalogo" className="public-mango-action ops-focus inline-flex min-h-12 items-center gap-2 rounded-xl px-5 py-3 text-sm font-black hover:-translate-y-0.5">Volver al catálogo <Icon name="arrow-right" className="h-4 w-4" /></a><a href={WHOLESALE_CUSTOMER_PORTAL_PATH} className="public-coral-portal ops-focus inline-flex min-h-12 items-center gap-2 rounded-xl border px-4 py-3 text-sm font-black hover:-translate-y-0.5">Portal mayorista <Icon name="users" className="h-4 w-4" /></a></div>
      </div>
    </section>

    <footer className="public-panel-surface border-t border-slate-800/80 px-4 py-8 sm:px-6 lg:px-8"><div className="mx-auto flex w-full max-w-7xl flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between"><p className="public-ink-muted"><span className="public-ink font-bold">La Paleti'Xa</span> · Playa del Carmen / Riviera Maya</p><a href={ADMIN_LOGIN_PATH} className="public-cyan-text ops-focus inline-flex min-h-11 items-center gap-2 self-start font-bold hover:-translate-y-0.5"><Icon name="lock" className="h-4 w-4" />Acceso de administración</a></div></footer>
    </main>
  </div>
}
