import { type ChangeEvent, type FormEvent, useCallback, useEffect, useId, useRef, useState } from 'react'
import { CatalogImageTile } from '../../../app/components/CatalogImageTile'
import { ResponsiveActionButton } from '../../../app/components/ResponsiveActionButton'
import { SearchInput } from '../../../app/components/SearchInput'
import { normalizeCapitalizedText } from '../../../lib/textNormalization'
import { listProductCategories, type ProductCategory } from '../api/productCategories'
import { listProductTags, type ProductTag } from '../api/productTags'
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
import { ProductCategoryManagerModal } from './ProductCategoryManagerModal'

type Draft = CreateProductInput & { active: boolean; imageFile: File | null; removeImage: boolean }

const ALL_CATEGORIES = 'Todas las categorías'
const emptyDraft: Draft = { name: '', sku: '', categoryId: '', retailPriceMxn: 0, wholesalePriceMxn: 0, tags: [], active: true, imageFile: null, removeImage: false }

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

function normalizeCategoryFilter(value: string) {
  return value.toLocaleLowerCase().replace(/\s+/g, '')
}

function ProductForm({
  product,
  categories,
  categorySelection,
  tagSuggestions,
  busy,
  onCancel,
  onManageCategories,
  onSubmit,
}: {
  product: Product | null
  categories: ProductCategory[]
  categorySelection: ProductCategory | null
  tagSuggestions: string[]
  busy: boolean
  onCancel: () => void
  onManageCategories: () => void
  onSubmit: (draft: Draft) => void
}) {
  const initial = product
    ? { name: product.name, sku: product.sku, category: product.category, categoryId: product.categoryId, retailPriceMxn: product.retailPriceMxn, wholesalePriceMxn: product.wholesalePriceMxn, tags: product.tags, active: product.active }
    : emptyDraft
  const [tags, setTags] = useState<string[]>(initial.tags ?? [])
  const [categoryInput, setCategoryInput] = useState(product?.category ?? '')
  const [categoryId, setCategoryId] = useState(initial.categoryId)
  const [categoryError, setCategoryError] = useState('')
  const [categoryFocused, setCategoryFocused] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [activeCategoryIndex, setActiveCategoryIndex] = useState(0)
  const [tagInput, setTagInput] = useState('')
  const [tagFocused, setTagFocused] = useState(false)
  const [tagOpen, setTagOpen] = useState(false)
  const [activeTagIndex, setActiveTagIndex] = useState(0)
  const [tagError, setTagError] = useState('')
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [removeImage, setRemoveImage] = useState(false)
  const [imageError, setImageError] = useState('')
  const imagePreviewRef = useRef<string | null>(null)

  useEffect(() => () => {
    if (imagePreviewRef.current) URL.revokeObjectURL(imagePreviewRef.current)
  }, [])

  useEffect(() => {
    if (!categorySelection) return
    queueMicrotask(() => {
      setCategoryInput(categorySelection.name)
      setCategoryId(categorySelection.id)
      setCategoryError('')
      setCategoryOpen(false)
    })
  }, [categorySelection])

  const displayedImageUrl = imagePreviewUrl ?? (removeImage ? null : product?.imageUrl ?? null)

  function addTag(rawValue = tagInput) {
    if (rawValue.trim() === '') {
      setTagError('Escribe una etiqueta antes de agregarla.')
      return
    }
    try {
      setTags(normalizeProductTags([...tags, rawValue]))
      setTagInput('')
      setTagOpen(false)
      setActiveTagIndex(0)
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
    if (!categoryId || !categories.some(({ id }) => id === categoryId)) {
      setCategoryError('Selecciona una categoría existente de la lista antes de guardar.')
      return
    }
    const values = new FormData(event.currentTarget)
    onSubmit({
      name: normalizeCapitalizedText(String(values.get('name') ?? '')),
      sku: normalizeCapitalizedText(String(values.get('sku') ?? '')),
      categoryId,
      retailPriceMxn: Number(values.get('retailPriceMxn')),
      wholesalePriceMxn: Number(values.get('wholesalePriceMxn')),
      tags,
      active: values.get('active') === 'on',
      imageFile: selectedImage,
      removeImage: removeImage && !selectedImage,
    })
  }

  const inputClassName = 'ops-control ops-focus h-11 min-h-11 w-full px-3 text-sm font-medium placeholder:text-slate-500'
  const imageActionClassName = 'inline-flex h-11 min-h-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 px-3 text-sm font-bold text-slate-200 transition-colors hover:border-sky-500 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:pointer-events-none disabled:opacity-50'
  const categoryMatches = categoryInput.trim() === '' ? [] : categories.filter(({ name }) => normalizeCategoryFilter(name).includes(normalizeCategoryFilter(categoryInput)))
  const tagMatches = tagInput.trim() === '' ? [] : tagSuggestions.filter((tag) => !tags.some((selectedTag) => normalizeCategoryFilter(selectedTag) === normalizeCategoryFilter(tag)) && normalizeCategoryFilter(tag).includes(normalizeCategoryFilter(tagInput)))
  const categorySuggestionsVisible = categoryFocused && categoryOpen && categoryInput.trim() !== ''
  const tagSuggestionsVisible = tagFocused && tagOpen && tagInput.trim() !== ''
  const categoryListId = 'product-category-options'
  const tagListId = 'product-tag-options'

  return <form key={product?.id ?? 'new'} aria-label={product ? `Editar ${product.name}` : 'Crear producto'} className="grid gap-5 rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-xl sm:p-6" onSubmit={submit}>
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="grid content-start gap-2 text-sm font-semibold text-slate-300">Nombre<input required maxLength={160} name="name" defaultValue={initial.name} className={inputClassName} /></label>
      <label className="grid content-start gap-2 text-sm font-semibold text-slate-300">SKU / código<input required maxLength={80} name="sku" defaultValue={initial.sku} className={inputClassName} /></label>
      <div className="relative grid content-start gap-2 text-sm font-semibold text-slate-300">
        <label htmlFor="product-category">Categoría</label>
        <div className="relative">
          <input id="product-category" required maxLength={120} name="category" value={categoryInput} autoComplete="off" role="combobox" aria-autocomplete="list" aria-controls={categoryListId} aria-expanded={categorySuggestionsVisible} aria-activedescendant={categorySuggestionsVisible && categoryMatches[activeCategoryIndex] ? `product-category-option-${categoryMatches[activeCategoryIndex].id}` : undefined} aria-describedby="product-category-help product-category-error" className={`${inputClassName} pr-14`} onFocus={() => { setCategoryFocused(true); setCategoryOpen(categoryInput.trim() !== '') }} onBlur={() => { setCategoryFocused(false); setCategoryOpen(false) }} onChange={(event) => { setCategoryInput(event.target.value); setCategoryId(''); setCategoryError(''); setActiveCategoryIndex(0); setCategoryOpen(event.target.value.trim() !== '') }} onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setCategoryOpen(categoryInput.trim() !== '')
              setActiveCategoryIndex((current) => categoryMatches.length === 0 ? 0 : (current + 1) % categoryMatches.length)
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              setCategoryOpen(categoryInput.trim() !== '')
              setActiveCategoryIndex((current) => categoryMatches.length === 0 ? 0 : (current - 1 + categoryMatches.length) % categoryMatches.length)
            } else if (event.key === 'Enter' && categorySuggestionsVisible && categoryMatches[activeCategoryIndex]) {
              event.preventDefault()
              setCategoryInput(categoryMatches[activeCategoryIndex].name)
              setCategoryId(categoryMatches[activeCategoryIndex].id)
              setCategoryError('')
              setCategoryOpen(false)
            } else if (event.key === 'Escape') {
              setCategoryOpen(false)
            }
          }} />
          <button type="button" aria-label="Administrar categorías" title="Administrar categorías" disabled={busy} className="ops-focus absolute right-1 top-1/2 inline-flex h-11 min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-lg border-0 bg-transparent text-lg font-bold text-slate-200 hover:bg-transparent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 disabled:pointer-events-none disabled:opacity-50" onClick={onManageCategories}>+</button>
          {categorySuggestionsVisible && <ul id={categoryListId} role="listbox" aria-label="Categorías disponibles" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-2xl">
            {categoryMatches.length > 0 ? categoryMatches.map((category, index) => <li id={`product-category-option-${category.id}`} key={category.id} role="option" aria-selected={category.id === categoryId} className={`flex h-11 min-h-11 cursor-pointer items-center rounded-lg px-3 py-2 text-sm font-semibold ${index === activeCategoryIndex ? 'bg-sky-500/15 text-white' : 'text-white/80 hover:bg-slate-800 hover:text-white'}`} onMouseDown={(event) => event.preventDefault()} onClick={() => { setCategoryInput(category.name); setCategoryId(category.id); setCategoryError(''); setCategoryOpen(false) }}>{category.name}</li>) : <li className="flex h-11 min-h-11 items-center px-3 py-2 text-sm font-normal text-white/60">No hay categorías que coincidan.</li>}
          </ul>}
        </div>
        <p id="product-category-help" className="text-xs font-normal leading-relaxed text-slate-500">Escribe para filtrar y selecciona una categoría existente.</p>
        {categoryError && <p id="product-category-error" role="alert" className="text-xs font-semibold text-rose-300">{categoryError}</p>}
      </div>
      <label className="grid content-start gap-2 text-sm font-semibold text-slate-300">Precio de menudeo (MXN)<input required min="0" step="0.01" name="retailPriceMxn" type="number" defaultValue={initial.retailPriceMxn} className={inputClassName} /></label>
      <label className="grid content-start gap-2 text-sm font-semibold text-slate-300">Precio mayorista (MXN)<input required min="0" step="0.01" name="wholesalePriceMxn" type="number" defaultValue={initial.wholesalePriceMxn} className={inputClassName} /></label>
      <div className="grid content-start gap-2 sm:col-span-2">
        <label htmlFor="product-tags" className="text-sm font-semibold text-slate-300">Etiquetas</label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-0 sm:flex-1">
            <input id="product-tags" value={tagInput} maxLength={MAX_PRODUCT_TAG_LENGTH} className={`${inputClassName} sm:flex-1`} placeholder="Ej. paleta, mango, con chile" autoComplete="off" role="combobox" aria-autocomplete="list" aria-controls={tagListId} aria-expanded={tagSuggestionsVisible} aria-activedescendant={tagSuggestionsVisible && tagMatches[activeTagIndex] ? `product-tag-option-${tagMatches[activeTagIndex]}` : undefined} onFocus={() => { setTagFocused(true); setTagOpen(tagInput.trim() !== '') }} onBlur={() => { setTagFocused(false); setTagOpen(false) }} onChange={(event) => { setTagInput(event.target.value); setTagError(''); setActiveTagIndex(0); setTagOpen(event.target.value.trim() !== '') }} onKeyDown={(event) => {
              if (event.key === 'ArrowDown' && tagSuggestionsVisible) {
                event.preventDefault()
                setActiveTagIndex((current) => tagMatches.length === 0 ? 0 : (current + 1) % tagMatches.length)
              } else if (event.key === 'ArrowUp' && tagSuggestionsVisible) {
                event.preventDefault()
                setActiveTagIndex((current) => tagMatches.length === 0 ? 0 : (current - 1 + tagMatches.length) % tagMatches.length)
              } else if (event.key === 'Enter') {
                event.preventDefault()
                if (tagSuggestionsVisible && tagMatches[activeTagIndex]) addTag(tagMatches[activeTagIndex])
                else addTag()
              } else if (event.key === ',') {
                event.preventDefault()
                addTag()
              } else if (event.key === 'Escape') {
                setTagOpen(false)
              }
            }} aria-describedby="product-tags-help product-tags-error" />
            {tagSuggestionsVisible && <ul id={tagListId} role="listbox" aria-label="Etiquetas disponibles" className="absolute left-0 right-0 top-full z-30 mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-700 bg-slate-900 p-1 shadow-2xl">
              {tagMatches.length > 0 ? tagMatches.map((tag, index) => <li id={`product-tag-option-${tag}`} key={tag} role="option" aria-selected={false} className={`flex h-11 min-h-11 cursor-pointer items-center rounded-lg px-3 py-2 text-sm font-semibold ${index === activeTagIndex ? 'bg-sky-500/15 text-white' : 'text-white/80 hover:bg-slate-800 hover:text-white'}`} onMouseDown={(event) => event.preventDefault()} onClick={() => addTag(tag)}>{tag}</li>) : <li className="flex h-11 min-h-11 items-center px-3 py-2 text-sm font-normal text-white/60">No hay etiquetas que coincidan. Presiona Enter para agregarla.</li>}
            </ul>}
          </div>
          <ResponsiveActionButton type="button" label="Agregar etiqueta" mobileDisplay="text" disabled={busy || tags.length >= MAX_PRODUCT_TAGS} className="h-11 min-h-11 border border-slate-700 bg-slate-900 text-slate-200 hover:border-sky-500 hover:bg-slate-800 sm:w-auto" onClick={() => addTag()}>Agregar</ResponsiveActionButton>
        </div>
        <p id="product-tags-help" className="text-xs leading-relaxed text-slate-500">Usa etiquetas libres para familias como paletas, eskimos, bolis, nieves en vaso, aguas frescas o sandwiches, además de sabores, presentaciones y atributos. Hasta {MAX_PRODUCT_TAGS} etiquetas de {MAX_PRODUCT_TAG_LENGTH} caracteres.</p>
        {tags.length > 0 && <ul aria-label="Etiquetas seleccionadas" className="flex flex-wrap gap-2">
          {tags.map((tag) => <li key={tag} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-sky-500/30 bg-sky-500/10 pl-3 pr-1 text-xs font-bold text-sky-200">
            <span>{tag}</span>
            <button type="button" aria-label={`Quitar etiqueta ${tag}`} disabled={busy} className="min-h-11 min-w-11 rounded-full text-sky-300 hover:bg-sky-500/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400" onClick={() => removeTag(tag)}>×</button>
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
      <ResponsiveActionButton type="button" label={product ? 'Cancelar edición' : 'Cancelar'} mobileDisplay="text" disabled={busy} className="border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800" onClick={onCancel}>Cancelar</ResponsiveActionButton>
    </div>
  </form>
}

function ProductModal({
  product,
  categories,
  categorySelection,
  tagSuggestions,
  busy,
  error,
  errorRef,
  onClose,
  onManageCategories,
  onSubmit,
}: {
  product: Product | null
  categories: ProductCategory[]
  categorySelection: ProductCategory | null
  tagSuggestions: string[]
  busy: boolean
  error: string
  errorRef: React.RefObject<HTMLDivElement | null>
  onClose: () => void
  onManageCategories: () => void
  onSubmit: (draft: Draft) => void
}) {
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const headingId = useId()
  const busyRef = useRef(false)

  useEffect(() => {
    busyRef.current = busy
  }, [busy])

  const requestClose = useCallback(() => {
    if (!busyRef.current) onClose()
  }, [onClose])

  useEffect(() => {
    const previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeButtonRef.current?.focus()

    function handleKeyDown(event: KeyboardEvent) {
      if (event.target !== document && event.target instanceof Node && !dialogRef.current?.contains(event.target)) return
      if (event.key === 'Escape') {
        event.preventDefault()
        requestClose()
        return
      }

      if (event.key !== 'Tab') return
      const focusableElements = dialogRef.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
      if (!focusableElements || focusableElements.length === 0) return

      const firstFocusableElement = focusableElements[0]
      const lastFocusableElement = focusableElements[focusableElements.length - 1]
      if (event.shiftKey && document.activeElement === firstFocusableElement) {
        event.preventDefault()
        lastFocusableElement.focus()
      } else if (!event.shiftKey && document.activeElement === lastFocusableElement) {
        event.preventDefault()
        firstFocusableElement.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
      previousActiveElement?.focus()
    }
  }, [requestClose])

  return <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/80 p-4 backdrop-blur-sm sm:p-6" onClick={(event) => { if (event.target === event.currentTarget) requestClose() }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={headingId} className="mx-auto flex max-h-[calc(100vh-2rem)] min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl sm:max-h-[calc(100vh-3rem)]">
      <div className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-3 sm:px-6">
        <h2 id={headingId} className="text-lg font-extrabold tracking-tight text-white">{product ? 'Editar producto' : 'Agregar producto'}</h2>
        <button ref={closeButtonRef} type="button" aria-label="Cerrar formulario de producto" title="Cerrar formulario de producto" disabled={busy} className="ops-action ops-focus inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-2xl leading-none text-slate-200 hover:border-sky-500 hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-50" onClick={requestClose}>×</button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {error && <div ref={errorRef} tabIndex={-1} role="alert" className="mx-4 mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm font-semibold text-rose-300 sm:mx-6">{error}</div>}
        <div className="p-4 sm:p-6"><ProductForm product={product} categories={categories} categorySelection={categorySelection} tagSuggestions={tagSuggestions} busy={busy} onCancel={requestClose} onManageCategories={onManageCategories} onSubmit={onSubmit} /></div>
      </div>
    </div>
  </div>
}

export function ProductWorkspace() {
  const [products, setProducts] = useState<Product[]>([])
  const [productCategories, setProductCategories] = useState<ProductCategory[]>([])
  const [productTags, setProductTags] = useState<ProductTag[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [editing, setEditing] = useState<Product | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false)
  const [categorySelection, setCategorySelection] = useState<ProductCategory | null>(null)
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
      const [nextProducts, nextCategories, nextTags] = await Promise.all([listProducts(), listProductCategories(), listProductTags()])
      if (current === sequence.current) {
        setProducts(nextProducts)
        setProductCategories(nextCategories)
        setProductTags(nextTags)
        setState('ready')
      }
    } catch {
      if (current === sequence.current) setState('error')
    }
  }, [])

  useEffect(() => { queueMicrotask(() => void load()) }, [load])
  useEffect(() => { if (state === 'error' || error) alert.current?.focus() }, [state, error])

  const closeForm = useCallback(() => {
    setFormOpen(false)
    setEditing(null)
  }, [])

  function openCreateForm() {
    setError('')
    setNotice('')
    setEditing(null)
    setCategorySelection(null)
    setFormOpen(true)
  }

  function openEditForm(product: Product) {
    setError('')
    setNotice('')
    setEditing(product)
    setCategorySelection(null)
    setFormOpen(true)
  }

  function openCategoryManager() {
    setError('')
    setCategoryManagerOpen(true)
  }

  async function handleCategoryChanged(category: ProductCategory | null, mutation: 'created' | 'updated' | 'deleted') {
    if (category && mutation !== 'deleted') {
      setProductCategories((current) => [...current.filter(({ id }) => id !== category.id), category].sort((a, b) => a.name.localeCompare(b.name)))
    }
    await load()
    if (category && mutation !== 'deleted') setCategorySelection(category)
  }

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
      categoryId: draft.categoryId,
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
    setFormOpen(false)
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
  const tagSuggestions = productTags.map(({ name }) => name)
  const filteredProducts = products.filter((product) => matchesProduct(product, searchQuery, selectedCategory))

  return <>
    <section aria-labelledby="products-title" className="w-full rounded-3xl bg-slate-900 p-4 text-slate-100 shadow-2xl sm:p-6 lg:p-8">
    <header className="flex flex-col gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
      <h1 id="products-title" className="text-3xl font-black tracking-tight text-white sm:text-4xl">Productos</h1>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
        <SearchInput label="Buscar productos" value={searchQuery} onChange={setSearchQuery} placeholder="Busca por nombre, SKU, categoría o etiqueta…" containerClassName="w-full sm:w-80" className="border-slate-800 bg-slate-950 text-sm text-white placeholder:text-slate-500" />
        <ResponsiveActionButton type="button" label="Agregar producto" mobileDisplay="text" className="min-w-11 border border-sky-500/40 bg-sky-600 px-3 text-xl font-black leading-none text-white shadow-lg shadow-sky-950/30 hover:bg-sky-500 sm:w-11" onClick={openCreateForm}>+</ResponsiveActionButton>
      </div>
    </header>

    <p aria-live="polite" className="mt-4 min-h-5 text-sm font-semibold text-emerald-300">{notice}</p>
    {error && !formOpen && <div ref={alert} tabIndex={-1} role="alert" className="mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm font-semibold text-rose-300">{error}</div>}

    {state === 'loading' && <p role="status" className="mt-8 rounded-2xl border border-slate-800 bg-slate-950 p-6 text-sm font-semibold text-slate-300">Cargando productos…</p>}
    {state === 'error' && <div ref={alert} tabIndex={-1} role="alert" className="mt-8 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200"><p className="font-semibold">No se pudieron cargar los productos.</p><ResponsiveActionButton label="Reintentar" mobileDisplay="text" className="mt-3 bg-rose-900 text-white hover:bg-rose-800" onClick={load}>Reintentar</ResponsiveActionButton></div>}
    {state === 'ready' && products.length === 0 && <p className="mt-8 rounded-2xl border border-slate-800 bg-slate-950 p-6 text-sm text-slate-300">Aún no hay productos. Agrega el primero para iniciar el catálogo compartido.</p>}

    {state === 'ready' && products.length > 0 && <div className="mt-6 rounded-3xl border border-slate-800 bg-slate-950 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold text-slate-400">{filteredProducts.length} de {products.length} productos mostrados</p>
        <ResponsiveActionButton label="Actualizar productos" icon="refresh" mobileDisplay="text" disabled={busy} className="w-full border border-slate-700 bg-slate-900 text-slate-200 hover:bg-slate-800 sm:w-auto" onClick={load}>Actualizar productos</ResponsiveActionButton>
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
            <ResponsiveActionButton label={`Editar ${product.name}`} mobileDisplay="text" disabled={busy} className="w-full border border-slate-700 bg-slate-950 text-slate-200 hover:bg-slate-800" onClick={() => openEditForm(product)}>Editar</ResponsiveActionButton>
            <ResponsiveActionButton label={`${product.active ? 'Desactivar' : 'Activar'} ${product.name}`} mobileDisplay="text" disabled={busy} className={`w-full border ${product.active ? 'border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'}`} onClick={() => void setActive(product)}>{product.active ? 'Desactivar' : 'Activar'}</ResponsiveActionButton>
          </div>
        </li>)}
      </ul>}
    </div>}
    {formOpen && <ProductModal product={editing} categories={productCategories} categorySelection={categorySelection} tagSuggestions={tagSuggestions} busy={busy} error={error} errorRef={alert} onClose={closeForm} onManageCategories={openCategoryManager} onSubmit={save} />}
    </section>
    {categoryManagerOpen && <ProductCategoryManagerModal categories={productCategories} onClose={() => setCategoryManagerOpen(false)} onChanged={handleCategoryChanged} />}
  </>
}
