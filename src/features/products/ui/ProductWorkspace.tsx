import { type ChangeEvent, type FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { CatalogImageTile } from '../../../app/components/CatalogImageTile'
import { ResponsiveActionButton } from '../../../app/components/ResponsiveActionButton'
import { SearchInput } from '../../../app/components/SearchInput'
import {
  createProduct,
  deactivateProduct,
  listProducts,
  MAX_PRODUCT_TAG_LENGTH,
  MAX_PRODUCT_TAGS,
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_MIME_TYPES,
  normalizeProductTags,
  removeProductImage,
  replaceProductImage,
  updateProduct,
  type CreateProductInput,
  type Product,
} from '../api/products'

type Draft = CreateProductInput & { active: boolean; imageFile: File | null; removeImage: boolean }

const ALL_CATEGORIES = 'Todas las categorías'
const emptyDraft: Draft = { name: '', sku: '', category: '', retailPriceMxn: 0, wholesalePriceMxn: 0, tags: [], active: true, imageFile: null, removeImage: false }

function formatPrice(value: number) {
  return `$${value.toFixed(2)} MXN`
}

function matchesProduct(product: Product, query: string, category: string) {
  if (category !== ALL_CATEGORIES && product.category !== category) return false

  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true

  const searchableFields = [product.name, product.sku, product.category, ...product.tags].map((field) => field.toLocaleLowerCase())
  return terms.every((term) => searchableFields.some((field) => field.includes(term)))
}

function validateImageFile(file: File) {
  if (!PRODUCT_IMAGE_MIME_TYPES.includes(file.type as typeof PRODUCT_IMAGE_MIME_TYPES[number])) {
    return 'Selecciona una imagen JPEG, PNG o WebP.'
  }
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) return 'La imagen no puede superar 5 MB.'
  return ''
}

function ProductForm({
  product,
  tagSuggestions,
  busy,
  onCancel,
  onSubmit,
}: {
  product: Product | null
  tagSuggestions: string[]
  busy: boolean
  onCancel: () => void
  onSubmit: (draft: Draft) => void
}) {
  const initial = product
    ? { name: product.name, sku: product.sku, category: product.category, retailPriceMxn: product.retailPriceMxn, wholesalePriceMxn: product.wholesalePriceMxn, tags: product.tags, active: product.active }
    : emptyDraft
  const [tags, setTags] = useState<string[]>(initial.tags ?? [])
  const [tagInput, setTagInput] = useState('')
  const [tagError, setTagError] = useState('')
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [imageError, setImageError] = useState('')
  const imagePreviewRef = useRef<string | null>(null)

  useEffect(() => () => {
    if (imagePreviewRef.current) URL.revokeObjectURL(imagePreviewRef.current)
  }, [])

  const displayedImageUrl = imagePreviewUrl ?? (removeImage ? null : product?.imageUrl ?? null)

  function addTag(rawValue = tagInput) {
    if (rawValue.trim() === '') {
      setTagError('Escribe una etiqueta antes de agregarla.')
      return
    }
    try {
      setTags(normalizeProductTags([...tags, rawValue]))
      setTagInput('')
      setTagError('')
    } catch (error) {
      setTagError(error instanceof Error ? error.message.replace('Tags', 'Las etiquetas') : 'No se pudo agregar la etiqueta.')
    }
  }

  function removeTag(tagToRemove: string) {
    setTags((current) => current.filter((tag) => tag !== tagToRemove))
    setTagError('')
  }

  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    const validationError = validateImageFile(file)
    if (validationError) {
      setImageError(validationError)
      return
    }
    if (imagePreviewRef.current) URL.revokeObjectURL(imagePreviewRef.current)
    const previewUrl = typeof URL.createObjectURL === 'function' ? URL.createObjectURL(file) : null
    imagePreviewRef.current = previewUrl
    setImagePreviewUrl(previewUrl)
    setSelectedImage(file)
    setRemoveImage(false)
    setImageError('')
  }

  function clearImage() {
    if (imagePreviewRef.current) URL.revokeObjectURL(imagePreviewRef.current)
    imagePreviewRef.current = null
    setImagePreviewUrl(null)
    setSelectedImage(null)
    setImageError('')
    setRemoveImage(Boolean(product?.imageUrl || product?.imageKey))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (tagInput.trim() !== '') {
      setTagError('Agrega la etiqueta escrita o borra el texto antes de guardar.')
      return
    }
    const values = new FormData(event.currentTarget)
    onSubmit({
      name: String(values.get('name') ?? ''),
      sku: String(values.get('sku') ?? ''),
      category: String(values.get('category') ?? ''),
      retailPriceMxn: Number(values.get('retailPriceMxn')),
      wholesalePriceMxn: Number(values.get('wholesalePriceMxn')),
      tags,
      active: values.get('active') === 'on',
      imageFile: selectedImage,
      removeImage: removeImage && !selectedImage,
    })
  }

  const inputClassName = 'ops-control ops-focus min-h-11 w-full px-3 text-sm font-medium placeholder:text-slate-500'
  const imageActionClassName = 'inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold text-slate-200 transition-colors hover:border-sky-500 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:pointer-events-none disabled:opacity-50'

  return <form key={product?.id ?? 'new'} aria-label={product ? `Editar ${product.name}` : 'Crear producto'} className="grid gap-5 rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-xl sm:p-6" onSubmit={submit}>
    <div>
      <p className="text-[11px] font-black uppercase tracking-[0.16em] text-sky-400">Configuración del catálogo</p>
      <h2 className="mt-2 text-lg font-extrabold tracking-tight text-white">{product ? `Editar ${product.name}` : 'Agregar producto'}</h2>
      <p className="mt-1 text-sm leading-relaxed text-slate-400">Mantén el catálogo compartido listo para Punto de venta, Mayoristas y Eventos.</p>
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="grid gap-2 text-sm font-semibold text-slate-300">Nombre<input required maxLength={160} name="name" defaultValue={initial.name} className={inputClassName} /></label>
      <label className="grid gap-2 text-sm font-semibold text-slate-300">SKU / código<input required maxLength={80} name="sku" defaultValue={initial.sku} className={inputClassName} /></label>
      <label className="grid gap-2 text-sm font-semibold text-slate-300">Categoría<input required maxLength={120} name="category" defaultValue={initial.category} className={inputClassName} /></label>
      <label className="grid gap-2 text-sm font-semibold text-slate-300">Precio de menudeo (MXN)<input required min="0" step="0.01" name="retailPriceMxn" type="number" defaultValue={initial.retailPriceMxn} className={inputClassName} /></label>
      <label className="grid gap-2 text-sm font-semibold text-slate-300">Precio mayorista (MXN)<input required min="0" step="0.01" name="wholesalePriceMxn" type="number" defaultValue={initial.wholesalePriceMxn} className={inputClassName} /></label>
      <div className="grid gap-2 sm:col-span-2">
        <label htmlFor="product-tags" className="text-sm font-semibold text-slate-300">Etiquetas</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input id="product-tags" value={tagInput} maxLength={MAX_PRODUCT_TAG_LENGTH} list="product-tag-suggestions" className={`${inputClassName} sm:flex-1`} placeholder="Ej. paleta, mango, con chile" onChange={(event) => { setTagInput(event.target.value); setTagError('') }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ',') { event.preventDefault(); addTag() } }} aria-describedby="product-tags-help product-tags-error" />
          <datalist id="product-tag-suggestions">{tagSuggestions.map((tag) => <option key={tag} value={tag} />)}</datalist>
          <ResponsiveActionButton type="button" label="Agregar etiqueta" mobileDisplay="text" disabled={busy || tags.length >= MAX_PRODUCT_TAGS} className="border border-slate-700 bg-slate-900 text-slate-200 hover:border-sky-500 hover:bg-slate-800 sm:w-auto" onClick={() => addTag()}>Agregar</ResponsiveActionButton>
        </div>
        <p id="product-tags-help" className="text-xs leading-relaxed text-slate-500">Usa etiquetas libres para familias como paletas, eskimos, bolis, nieves en vaso, aguas frescas o sandwiches, además de sabores, presentaciones y atributos. Hasta {MAX_PRODUCT_TAGS} etiquetas de {MAX_PRODUCT_TAG_LENGTH} caracteres.</p>
        {tags.length > 0 && <ul aria-label="Etiquetas seleccionadas" className="flex flex-wrap gap-2">
          {tags.map((tag) => <li key={tag} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 pl-3 pr-1 text-xs font-bold text-sky-200">
            <span>{tag}</span>
            <button type="button" aria-label={`Quitar etiqueta ${tag}`} disabled={busy} className="min-h-7 min-w-7 rounded-full text-sky-300 hover:bg-sky-500/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400" onClick={() => removeTag(tag)}>×</button>
          </li>)}
        </ul>}
        {tagError && <p id="product-tags-error" role="alert" className="text-xs font-semibold text-rose-300">{tagError}</p>}
      </div>
    </div>

    <fieldset className="grid gap-3 border-t border-slate-800 pt-5">
      <legend className="text-sm font-semibold text-slate-300">Imagen del producto</legend>
      <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)] sm:items-start">
        <CatalogImageTile key={displayedImageUrl ?? 'empty-product-image'} src={displayedImageUrl} alt={`Vista previa de ${product?.name ?? 'producto'}`} className="w-full max-w-40 border-slate-800 bg-slate-900" />
        <div className="grid content-start gap-3">
          <p className="text-sm leading-relaxed text-slate-400">{selectedImage ? `Lista para guardar: ${selectedImage.name}` : product?.imageUrl && !removeImage ? 'Se muestra la imagen actual del catálogo.' : 'Agrega una imagen para identificar el producto en el catálogo y los canales de venta.'}</p>
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            <input id="product-image" type="file" accept={PRODUCT_IMAGE_MIME_TYPES.join(',')} disabled={busy} className="sr-only" onChange={selectImage} aria-describedby="product-image-help product-image-error" />
            <label htmlFor="product-image" className={imageActionClassName}>{selectedImage || (product?.imageUrl && !removeImage) ? 'Reemplazar imagen' : 'Seleccionar imagen'}</label>
            {(selectedImage || (product && Boolean(product.imageUrl || product.imageKey) && !removeImage)) && <ResponsiveActionButton type="button" label="Quitar imagen" mobileDisplay="text" disabled={busy} className="border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20" onClick={clearImage}>Quitar imagen</ResponsiveActionButton>}
            {product && removeImage && !selectedImage && <ResponsiveActionButton type="button" label="Restaurar imagen actual" mobileDisplay="text" disabled={busy} className="border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800" onClick={() => setRemoveImage(false)}>Restaurar</ResponsiveActionButton>}
          </div>
          <p id="product-image-help" className="text-xs leading-relaxed text-slate-500">JPEG, PNG o WebP, máximo 5 MB. La imagen se sube al guardar y reemplazar elimina la anterior.</p>
          {removeImage && !selectedImage && <p className="text-xs font-semibold text-amber-300">La imagen actual se quitará al guardar.</p>}
          {imageError && <p id="product-image-error" role="alert" className="text-xs font-semibold text-rose-300">{imageError}</p>}
        </div>
      </div>
    </fieldset>

    <label className="flex min-h-11 items-center gap-3 text-sm font-semibold text-slate-300"><input name="active" type="checkbox" defaultChecked={initial.active} className="h-5 w-5 accent-sky-500" />Activo en los canales de venta</label>
    <div className="flex flex-col gap-3 sm:flex-row">
      <ResponsiveActionButton type="submit" label={product ? 'Guardar producto' : 'Crear producto'} loading={busy} loadingLabel="Guardando producto" mobileDisplay="text" disabled={busy} className="bg-sky-600 text-white shadow-lg shadow-sky-950/30 hover:bg-sky-500 disabled:opacity-50">{product ? 'Guardar producto' : 'Crear producto'}</ResponsiveActionButton>
      {product && <ResponsiveActionButton type="button" label="Cancelar edición" mobileDisplay="text" disabled={busy} className="border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800" onClick={onCancel}>Cancelar</ResponsiveActionButton>}
    </div>
  </form>
}

export function ProductWorkspace() {
  const [products, setProducts] = useState<Product[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [editing, setEditing] = useState<Product | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState(ALL_CATEGORIES)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const sequence = useRef(0)
  const alert = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const current = ++sequence.current
    setState('loading')
    try {
      const next = await listProducts()
      if (current === sequence.current) {
        setProducts(next)
        setState('ready')
      }
    } catch {
      if (current === sequence.current) setState('error')
    }
  }, [])

  useEffect(() => { queueMicrotask(() => void load()) }, [load])
  useEffect(() => { if (state === 'error' || error) alert.current?.focus() }, [state, error])

  function merge(product: Product) {
    setProducts((items) => [...items.filter(({ id }) => id !== product.id), product].sort((a, b) => a.name.localeCompare(b.name)))
  }

  async function save(draft: Draft) {
    const currentEditing = editing
    const editingExisting = currentEditing !== null
    setBusy(true)
    setError('')
    setNotice('')
    ++sequence.current

    let result: Product
    const productInput: CreateProductInput = {
      name: draft.name,
      sku: draft.sku,
      category: draft.category,
      retailPriceMxn: draft.retailPriceMxn,
      wholesalePriceMxn: draft.wholesalePriceMxn,
      tags: draft.tags,
      active: draft.active,
    }
    try {
      result = editingExisting ? await updateProduct(currentEditing.id, productInput) : await createProduct(productInput)
    } catch {
      setError(editingExisting ? 'No se pudo actualizar el producto.' : 'No se pudo crear el producto.')
      setBusy(false)
      return
    }

    try {
      if (draft.imageFile) {
        result = await replaceProductImage(result.id, result, draft.imageFile)
      } else if (editingExisting && draft.removeImage && (result.imageUrl || result.imageKey)) {
        result = await removeProductImage(result.id, result)
      }
    } catch {
      if (!editingExisting) {
        merge(result)
        setEditing(result)
        setState('ready')
        setError('Producto creado, pero no se pudo guardar la imagen. El producto quedó sin este cambio; inténtalo de nuevo.')
      } else {
        setError('La información del producto se actualizó, pero no se pudo completar el cambio de imagen. Verifica el estado de la imagen e inténtalo de nuevo.')
      }
      setBusy(false)
      return
    }

    merge(result)
    setEditing(null)
    setState('ready')
    setNotice(editingExisting ? 'Producto actualizado.' : 'Producto creado.')
    setBusy(false)
  }

  async function setActive(product: Product) {
    setBusy(true)
    setError('')
    setNotice('')
    ++sequence.current
    try {
      const result = product.active ? await deactivateProduct(product.id) : await updateProduct(product.id, { active: true })
      merge(result)
      setNotice(product.active ? 'Producto desactivado.' : 'Producto activado.')
    } catch {
      setError(product.active ? 'No se pudo desactivar el producto.' : 'No se pudo activar el producto.')
    } finally {
      setBusy(false)
    }
  }

  const categories = [ALL_CATEGORIES, ...Array.from(new Set(products.map(({ category }) => category))).sort((a, b) => a.localeCompare(b))]
  const tagSuggestions = Array.from(new Set(products.flatMap(({ tags }) => tags))).sort((a, b) => a.localeCompare(b))
  const filteredProducts = products.filter((product) => matchesProduct(product, searchQuery, selectedCategory))

  return <section aria-labelledby="products-title" className="w-full rounded-3xl bg-slate-900 p-4 text-slate-100 shadow-2xl sm:p-6 lg:p-8">
    <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-black uppercase tracking-[0.18em] text-sky-400">Administración / Catálogo</p>
        <h1 id="products-title" className="mt-2 text-3xl font-black tracking-tight text-white sm:text-4xl">Catálogo</h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-slate-400 sm:text-base">Un catálogo visual para Punto de venta, Mayoristas y Eventos. Los productos activos aparecen en cada canal de venta.</p>
      </div>
      <ResponsiveActionButton label="Actualizar productos" icon="refresh" loading={state === 'loading'} loadingLabel="Actualizando productos" mobileDisplay="text" disabled={busy} className="w-full border border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800 sm:w-auto" onClick={load}>Actualizar productos</ResponsiveActionButton>
    </div>

    <div className="mt-6"><ProductForm product={editing} tagSuggestions={tagSuggestions} busy={busy} onCancel={() => setEditing(null)} onSubmit={save} /></div>
    <p aria-live="polite" className="mt-4 min-h-5 text-sm font-semibold text-emerald-300">{notice}</p>
    {error && <div ref={alert} tabIndex={-1} role="alert" className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm font-semibold text-rose-300">{error}</div>}

    {state === 'loading' && <p role="status" className="mt-8 rounded-2xl border border-slate-800 bg-slate-950 p-6 text-sm font-semibold text-slate-300">Cargando productos…</p>}
    {state === 'error' && <div ref={alert} tabIndex={-1} role="alert" className="mt-8 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200"><p className="font-semibold">No se pudieron cargar los productos.</p><ResponsiveActionButton label="Reintentar" mobileDisplay="text" className="mt-3 bg-rose-900 text-white hover:bg-rose-800" onClick={load}>Reintentar</ResponsiveActionButton></div>}
    {state === 'ready' && products.length === 0 && <p className="mt-8 rounded-2xl border border-slate-800 bg-slate-950 p-6 text-sm text-slate-300">Aún no hay productos. Agrega el primero para iniciar el catálogo compartido.</p>}

    {state === 'ready' && products.length > 0 && <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-950 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-extrabold text-white">Productos del catálogo</h2>
          <p className="mt-1 text-xs font-semibold text-slate-400">{filteredProducts.length} de {products.length} productos mostrados</p>
        </div>
        <SearchInput label="Buscar productos" value={searchQuery} onChange={setSearchQuery} placeholder="Busca por nombre, SKU, categoría o etiqueta…" containerClassName="w-full sm:max-w-xs" className="border-slate-800 bg-slate-900 text-sm text-white placeholder:text-slate-500" />
      </div>

      <div role="tablist" aria-label="Categorías de productos" className="mt-5 flex w-full min-w-0 gap-1.5 overflow-x-auto border-b border-slate-800 pb-3 scrollbar-none">
        {categories.map((category) => {
          const selected = selectedCategory === category
          return <ResponsiveActionButton key={category} type="button" role="tab" aria-selected={selected} aria-pressed={selected} label={`Filtrar por ${category}`} mobileDisplay="text" className={`shrink-0 border px-4 text-xs font-extrabold transition-colors ${selected ? 'border-sky-500 bg-sky-500/15 text-sky-300' : 'border-slate-800 bg-slate-900/50 text-white/70 hover:border-slate-700 hover:text-white'}`} onClick={() => setSelectedCategory(category)}>{category}</ResponsiveActionButton>
        })}
      </div>

      {filteredProducts.length === 0 ? <p className="py-10 text-center text-sm font-semibold text-slate-400">No hay productos que coincidan con los filtros actuales.</p> : <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {filteredProducts.map((product) => <li key={product.id} className="group flex min-w-0 flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-3 shadow-lg transition-colors hover:border-slate-700 sm:p-4">
          <CatalogImageTile src={product.imageUrl} alt={`Imagen de ${product.name}`} className="mb-4 w-full border-slate-800 bg-slate-950 text-slate-400" imageClassName="transition-transform duration-200 group-hover:scale-105" />
          <div className="min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-extrabold text-white" title={product.name}>{product.name}</h3>
                <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500" title={`${product.sku} · ${product.category}`}>{product.sku} · {product.category}</p>
              </div>
              <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-extrabold ${product.active ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-800 text-white/70'}`}><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${product.active ? 'bg-emerald-400' : 'bg-slate-500'}`} />{product.active ? 'Activo' : 'Inactivo'}</span>
            </div>
            <div aria-label={`Etiquetas de ${product.name}`} className="mt-3 flex min-h-6 flex-wrap gap-1.5">
              {product.tags.length > 0 ? product.tags.map((tag) => <span key={tag} className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-1 text-[10px] font-bold text-sky-200">{tag}</span>) : <span className="text-[10px] font-semibold text-sky-300">Sin etiquetas</span>}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 border-t border-slate-800 pt-3">
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Menudeo</p><p className="mt-1 text-sm font-black text-white">{formatPrice(product.retailPriceMxn)}</p></div>
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Mayorista</p><p className="mt-1 text-sm font-black text-amber-300">{formatPrice(product.wholesalePriceMxn)}</p></div>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <ResponsiveActionButton label={`Editar ${product.name}`} mobileDisplay="text" disabled={busy} className="w-full border border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800" onClick={() => setEditing(product)}>Editar</ResponsiveActionButton>
            <ResponsiveActionButton label={`${product.active ? 'Desactivar' : 'Activar'} ${product.name}`} mobileDisplay="text" disabled={busy} className={`w-full border ${product.active ? 'border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'}`} onClick={() => void setActive(product)}>{product.active ? 'Desactivar' : 'Activar'}</ResponsiveActionButton>
          </div>
        </li>)}
      </ul>}
    </div>}
  </section>
}
