import { type ChangeEvent, type FormEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type WheelEvent, useCallback, useEffect, useRef, useState } from 'react'
import { CatalogImageTile } from '../../../app/components/CatalogImageTile'
import { FloatingLayer } from '../../../app/components/FloatingLayer'
import { InfoButton } from '../../../app/components/InfoButton'
import { Modal } from '../../../app/components/Modal'
import { ResponsiveActionButton } from '../../../app/components/ResponsiveActionButton'
import { SearchInput } from '../../../app/components/SearchInput'
import { Icon } from '../../../app/components/icons'
import { isSessionBoolean, isSessionRecord, isSessionString, isSessionStringArray, useAdminSessionPersistence } from '../../../app/sessionPersistence'
import { normalizeCapitalizedText } from '../../../lib/textNormalization'
import { listProductCategories, type ProductCategory } from '../api/productCategories'
import { listProductTags, type ProductTag } from '../api/productTags'
import {
  createProduct,
  deactivateProduct,
  listProducts,
  MAX_PRODUCT_SKU_LENGTH,
  MAX_PRODUCT_TAG_LENGTH,
  MAX_PRODUCT_TAGS,
  PRODUCT_IMAGE_MAX_BYTES,
  PRODUCT_IMAGE_MIME_TYPES,
  normalizeProductTags,
  normalizeSku,
  removeProductImage,
  replaceProductImage,
  suggestUniqueProductSku,
  updateProduct,
  type CreateProductInput,
  type Product,
} from '../api/products'
import { ProductCategoryManagerModal } from './ProductCategoryManagerModal'

type Draft = CreateProductInput & { active: boolean; imageFile: File | null; removeImage: boolean }
type ProductFormSessionDraft = { name: string; sku: string; skuManuallyEdited: boolean; categoryInput: string; categoryId: string; tags: string[]; tagInput: string; retailPriceMxn: string; wholesalePriceMxn: string; active: boolean; removeImage: boolean }
type ProductWorkspaceSession = { searchQuery: string; selectedCategory: string; view: ProductView; formOpen: boolean; editingProductId: string | null; categoryManagerOpen: boolean; formDraft: ProductFormSessionDraft | null }
type ProductView = 'grid' | 'table'
type HorizontalDrag = { pointerId: number; startX: number; startScrollLeft: number; moved: boolean }
type TableDrag = HorizontalDrag & { startY: number; startScrollTop: number }

const ALL_CATEGORIES = 'Todas las categorías'
const NO_WHOLESALE_PRICE = 'Sin precio mayorista'
const emptyDraft: Draft = { name: '', sku: '', categoryId: '', retailPriceMxn: 0, wholesalePriceMxn: 0, tags: [], active: true, imageFile: null, removeImage: false }

function isProductFormSessionDraft(value: unknown): value is ProductFormSessionDraft {
  return isSessionRecord(value) && isSessionString(value.name) && isSessionString(value.sku) && isSessionBoolean(value.skuManuallyEdited) && isSessionString(value.categoryInput) && isSessionString(value.categoryId) && isSessionStringArray(value.tags) && isSessionString(value.tagInput) && isSessionString(value.retailPriceMxn) && isSessionString(value.wholesalePriceMxn) && isSessionBoolean(value.active) && isSessionBoolean(value.removeImage)
}

function isProductWorkspaceSession(value: unknown): value is ProductWorkspaceSession {
  return isSessionRecord(value) && isSessionString(value.searchQuery) && isSessionString(value.selectedCategory) && isSessionString(value.view) && ['grid', 'table'].includes(value.view) && isSessionBoolean(value.formOpen) && (value.editingProductId === null || isSessionString(value.editingProductId)) && isSessionBoolean(value.categoryManagerOpen) && (value.formDraft === null || isProductFormSessionDraft(value.formDraft))
}

function formatPrice(value: number) {
  return `$${value.toFixed(2)}`
}

function formatWholesalePrice(value: number) {
  return Number.isFinite(value) && value > 0 ? formatPrice(value) : NO_WHOLESALE_PRICE
}

function wholesalePriceClass(value: number) {
  return Number.isFinite(value) && value > 0 ? 'text-amber-300' : 'text-slate-400'
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

function clampScroll(value: number, max: number) {
  return Math.max(0, Math.min(max, value))
}

function scrollHorizontallyOnWheel(event: WheelEvent<HTMLDivElement>) {
  const scrollContainer = event.currentTarget
  if (scrollContainer.scrollWidth <= scrollContainer.clientWidth || event.deltaY === 0) return

  const maxScrollLeft = scrollContainer.scrollWidth - scrollContainer.clientWidth
  const nextScrollLeft = Math.max(0, Math.min(maxScrollLeft, scrollContainer.scrollLeft + event.deltaY))
  if (nextScrollLeft === scrollContainer.scrollLeft) return

  event.preventDefault()
  scrollContainer.scrollLeft = nextScrollLeft
}

function scrollVerticallyOnWheel(event: globalThis.WheelEvent) {
  const scrollContainer = event.currentTarget as HTMLDivElement | null
  if (!scrollContainer) return
  const maxScrollTop = Math.max(0, scrollContainer.scrollHeight - scrollContainer.clientHeight)
  if (maxScrollTop === 0 || event.deltaY === 0) return

  const currentScrollTop = Math.max(0, Math.min(maxScrollTop, scrollContainer.scrollTop))
  const nextScrollTop = Math.max(0, Math.min(maxScrollTop, currentScrollTop + event.deltaY))
  if (nextScrollTop === currentScrollTop) return

  event.preventDefault()
  scrollContainer.scrollTop = nextScrollTop
}

function ProductForm({
  product,
  categories,
  categorySelection,
  tagSuggestions,
  existingSkus,
  busy,
  onManageCategories,
  restoredDraft,
  onDraftChange,
  active,
  onSubmit,
}: {
  product: Product | null
  categories: ProductCategory[]
  categorySelection: ProductCategory | null
  tagSuggestions: string[]
  existingSkus: string[]
  busy: boolean
  onManageCategories: () => void
  restoredDraft?: ProductFormSessionDraft | null
  onDraftChange?: (draft: ProductFormSessionDraft) => void
  active: boolean
  onSubmit: (draft: Draft) => void
}) {
  const initial = product
    ? { name: product.name, sku: product.sku, category: product.category, categoryId: product.categoryId, retailPriceMxn: product.retailPriceMxn, wholesalePriceMxn: product.wholesalePriceMxn, tags: product.tags, active: product.active }
    : emptyDraft
  const restored = restoredDraft ?? { name: initial.name, sku: initial.sku, skuManuallyEdited: Boolean(product), categoryInput: product?.category ?? '', categoryId: initial.categoryId, tags: initial.tags ?? [], tagInput: '', retailPriceMxn: initial.retailPriceMxn === 0 ? '' : String(initial.retailPriceMxn), wholesalePriceMxn: initial.wholesalePriceMxn === 0 ? '' : String(initial.wholesalePriceMxn), active: initial.active, removeImage: false }
  const [tags, setTags] = useState<string[]>(restored.tags)
  const [nameInput, setNameInput] = useState(restored.name)
  const [skuInput, setSkuInput] = useState(restored.sku)
  const [skuManuallyEdited, setSkuManuallyEdited] = useState(restored.skuManuallyEdited)
  const [categoryInput, setCategoryInput] = useState(restored.categoryInput)
  const [categoryId, setCategoryId] = useState(restored.categoryId)
  const [categoryError, setCategoryError] = useState('')
  const [categoryFocused, setCategoryFocused] = useState(false)
  const [categoryOpen, setCategoryOpen] = useState(false)
  const [activeCategoryIndex, setActiveCategoryIndex] = useState(0)
  const [tagInput, setTagInput] = useState(restored.tagInput)
  const [tagFocused, setTagFocused] = useState(false)
  const [tagOpen, setTagOpen] = useState(false)
  const [activeTagIndex, setActiveTagIndex] = useState(0)
  const [tagError, setTagError] = useState('')
  const [priceError, setPriceError] = useState('')
  const [skuHelpOpen, setSkuHelpOpen] = useState(false)
  const [categoryHelpOpen, setCategoryHelpOpen] = useState(false)
  const [priceHelpOpen, setPriceHelpOpen] = useState(false)
  const [tagHelpOpen, setTagHelpOpen] = useState(false)
  const [selectedImage, setSelectedImage] = useState<File | null>(null)
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string | null>(null)
  const [removeImage, setRemoveImage] = useState(restored.removeImage)
  const [retailPriceInput, setRetailPriceInput] = useState(restored.retailPriceMxn)
  const [wholesalePriceInput, setWholesalePriceInput] = useState(restored.wholesalePriceMxn)
  const [imageError, setImageError] = useState('')
  const imagePreviewRef = useRef<string | null>(null)
  const categoryAnchorRef = useRef<HTMLDivElement>(null)
  const tagAnchorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    onDraftChange?.({ name: nameInput, sku: skuInput, skuManuallyEdited, categoryInput, categoryId, tags, tagInput, retailPriceMxn: retailPriceInput, wholesalePriceMxn: wholesalePriceInput, active, removeImage })
  }, [active, categoryId, categoryInput, nameInput, onDraftChange, removeImage, retailPriceInput, skuInput, skuManuallyEdited, tagInput, tags, wholesalePriceInput])

  function focusField(id: string) {
    queueMicrotask(() => document.getElementById(id)?.focus())
  }

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
      focusField('product-tags')
      return
    }
    if (!categoryId || !categories.some(({ id }) => id === categoryId)) {
      setCategoryError('Selecciona una categoría existente de la lista antes de guardar.')
      focusField('product-category')
      return
    }
    const values = new FormData(event.currentTarget)
    const retailPriceMxn = Number(values.get('retailPriceMxn'))
    const wholesaleValue = values.get('wholesalePriceMxn')
    const wholesalePriceMxn = wholesaleValue === '' ? 0 : Number(wholesaleValue)
    const retailPriceInvalid = !Number.isFinite(retailPriceMxn) || retailPriceMxn <= 0
    const wholesalePriceInvalid = !Number.isFinite(wholesalePriceMxn) || wholesalePriceMxn < 0 || (wholesalePriceMxn > 0 && Math.round(wholesalePriceMxn * 100) / 100 <= 0)
    if (retailPriceInvalid || wholesalePriceInvalid) {
      setPriceError(
        retailPriceInvalid && wholesalePriceInvalid
          ? 'El precio de menudeo debe ser mayor que cero. El precio mayorista puede quedar vacío o ser 0, pero no puede ser negativo. Si capturas un importe positivo, debe ser de al menos $0.01.'
          : retailPriceInvalid
            ? 'El precio de menudeo debe ser mayor que cero.'
        : 'El precio mayorista puede quedar vacío o ser 0, pero no puede ser negativo. Si capturas un importe positivo, debe ser de al menos $0.01.',
      )
      focusField(retailPriceInvalid ? 'product-retail-price' : 'product-wholesale-price')
      return
    }
    setPriceError('')
    onSubmit({
      name: normalizeCapitalizedText(String(values.get('name') ?? '')),
      sku: normalizeSku(String(values.get('sku') ?? '')),
      categoryId,
      retailPriceMxn,
      wholesalePriceMxn,
      tags,
      active: values.get('active') === 'on',
      imageFile: selectedImage,
      removeImage: removeImage && !selectedImage,
    })
  }

  const inputClassName = 'ops-control w-full px-3 text-sm font-medium'
  const categoryMatches = categoryInput.trim() === '' ? [] : categories.filter(({ name }) => normalizeCategoryFilter(name).includes(normalizeCategoryFilter(categoryInput)))
  const tagMatches = tagInput.trim() === '' ? [] : tagSuggestions.filter((tag) => !tags.some((selectedTag) => normalizeCategoryFilter(selectedTag) === normalizeCategoryFilter(tag)) && normalizeCategoryFilter(tag).includes(normalizeCategoryFilter(tagInput)))
  const suggestedSku = suggestUniqueProductSku({ category: categoryInput, name: nameInput, tags }, existingSkus)
  const displayedSku = product || skuManuallyEdited ? skuInput : suggestedSku
  const categorySuggestionsVisible = categoryFocused && categoryOpen && categoryInput.trim() !== ''
  const tagSuggestionsVisible = tagFocused && tagOpen && tagInput.trim() !== ''
  const categoryListId = 'product-category-options'
  const tagListId = 'product-tag-options'

  return <form id="product-form" key={product?.id ?? 'new'} aria-label={product ? `Editar ${product.name}` : 'Crear producto'} className="ops-panel-frame grid gap-4 rounded-3xl border border-slate-800 bg-slate-950 p-4 shadow-xl sm:p-6" onSubmit={submit}>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="ops-field-label grid content-start gap-1.5 text-sm font-semibold text-slate-300">Nombre<input required maxLength={160} name="name" value={nameInput} className={inputClassName} onChange={(event) => setNameInput(event.target.value)} /></label>
      <div className="ops-field-label grid content-start gap-1.5 text-sm font-semibold text-slate-300">
        <div className="flex items-center gap-1">
          <label htmlFor="product-sku">SKU / código</label>
          <InfoButton id="product-sku-help" label="Información sobre SKU" open={skuHelpOpen} onToggle={() => setSkuHelpOpen((open) => !open)} className="h-5 w-5 min-h-5 min-w-5 p-0">{product ? 'Se conserva el SKU guardado; puedes editarlo.' : 'Se sugiere con la categoría, el nombre y las etiquetas; puedes editarlo.'}</InfoButton>
        </div>
        <input id="product-sku" required maxLength={MAX_PRODUCT_SKU_LENGTH} name="sku" value={displayedSku} className={inputClassName} onChange={(event) => { setSkuInput(event.target.value); setSkuManuallyEdited(true) }} />
      </div>
      <div className="ops-field-label relative grid content-start gap-1.5 text-sm font-semibold text-slate-300">
        <div className="flex items-center gap-1">
          <label htmlFor="product-category">Categoría</label>
          <InfoButton id="product-category-help" label="Información sobre categoría" open={categoryHelpOpen} onToggle={() => setCategoryHelpOpen((open) => !open)} className="h-5 w-5 min-h-5 min-w-5 p-0">Escribe para filtrar y selecciona una categoría existente.</InfoButton>
        </div>
        <div ref={categoryAnchorRef} className="relative">
          <input id="product-category" required maxLength={120} name="category" value={categoryInput} autoComplete="off" role="combobox" aria-autocomplete="list" aria-controls={categoryListId} aria-expanded={categorySuggestionsVisible} aria-activedescendant={categorySuggestionsVisible && categoryMatches[activeCategoryIndex] ? `product-category-option-${categoryMatches[activeCategoryIndex].id}` : undefined} aria-invalid={Boolean(categoryError)} aria-describedby={categoryError ? 'product-category-error' : undefined} className={`${inputClassName} pr-14`} onFocus={() => { setCategoryFocused(true); setCategoryOpen(categoryInput.trim() !== '') }} onBlur={() => { setCategoryFocused(false); setCategoryOpen(false) }} onChange={(event) => { setCategoryInput(event.target.value); setCategoryId(''); setCategoryError(''); setActiveCategoryIndex(0); setCategoryOpen(event.target.value.trim() !== '') }} onKeyDown={(event) => {
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
              event.stopPropagation()
              setCategoryOpen(false)
            }
          }} />
          <button type="button" aria-label="Administrar categorías" title="Administrar categorías" disabled={busy} className="ops-icon-button ops-focus border-transparent bg-transparent absolute right-1 top-1/2 -translate-y-1/2 hover:border-transparent hover:bg-transparent active:bg-transparent" onClick={onManageCategories}><Icon name="plus" className="h-5 w-5" /></button>
          <FloatingLayer anchorRef={categoryAnchorRef} open={categorySuggestionsVisible} onDismiss={() => setCategoryOpen(false)} id={categoryListId} role="listbox" ariaLabel="Categorías disponibles" width="anchor" maxHeight={192} className="ops-popover max-h-48 overflow-y-auto p-1">
             {categoryMatches.length > 0 ? categoryMatches.map((category, index) => <div id={`product-category-option-${category.id}`} key={category.id} role="option" aria-selected={category.id === categoryId} data-active={index === activeCategoryIndex || undefined} className="ops-option ops-focus" onMouseEnter={() => setActiveCategoryIndex(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => { setCategoryInput(category.name); setCategoryId(category.id); setCategoryError(''); setCategoryOpen(false) }}>{category.name}</div>) : <div className="flex min-h-11 items-center px-3 py-2 text-sm text-slate-400">No hay categorías que coincidan.</div>}
          </FloatingLayer>
        </div>
        {categoryError && <p id="product-category-error" role="alert" className="ops-field-error text-xs font-semibold text-rose-300">{categoryError}</p>}
      </div>
       <label htmlFor="product-retail-price" className="ops-field-label grid content-start gap-1.5 text-sm font-semibold text-slate-300">Precio de menudeo<input id="product-retail-price" required min="0.01" step="0.01" name="retailPriceMxn" type="number" value={retailPriceInput} onChange={(event) => { setRetailPriceInput(event.target.value); setPriceError('') }} aria-invalid={Boolean(priceError)} aria-describedby={priceError ? 'product-price-error' : undefined} className={inputClassName} /></label>
      <div className="ops-field-label grid content-start gap-1.5 text-sm font-semibold text-slate-300">
        <div className="flex items-center gap-1">
          <label htmlFor="product-wholesale-price">Precio mayorista</label>
          <InfoButton id="product-wholesale-price-help" label="Información sobre precio mayorista" open={priceHelpOpen} onToggle={() => setPriceHelpOpen((open) => !open)} className="h-5 w-5 min-h-5 min-w-5 p-0">El precio de menudeo debe ser mayor que cero. El precio mayorista es opcional: deja el campo vacío o usa 0 si aún no está definido; no puede ser negativo. Los importes positivos deben ser de al menos $0.01.</InfoButton>
        </div>
         <input id="product-wholesale-price" min="0" step="0.01" name="wholesalePriceMxn" type="number" value={wholesalePriceInput} onChange={(event) => { setWholesalePriceInput(event.target.value); setPriceError('') }} aria-invalid={Boolean(priceError)} aria-describedby={priceError ? 'product-price-error' : undefined} className={inputClassName} />
        {priceError && <p id="product-price-error" role="alert" className="ops-field-error text-xs font-semibold text-rose-300">{priceError}</p>}
      </div>
      <div className="ops-field-label grid content-start gap-1.5 text-sm font-semibold text-slate-300 sm:col-span-2 lg:col-span-1">
        <div className="flex items-center gap-1">
          <label htmlFor="product-tags" className="text-sm font-semibold text-slate-300">Etiquetas</label>
          <InfoButton id="product-tags-help" label="Información sobre etiquetas" open={tagHelpOpen} onToggle={() => setTagHelpOpen((open) => !open)} className="h-5 w-5 min-h-5 min-w-5 p-0">Usa etiquetas libres para familias como paletas, eskimos, bolis, nieves en vaso, aguas frescas o sandwiches, además de sabores, presentaciones y atributos. Hasta 20 etiquetas de 48 caracteres.</InfoButton>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <div ref={tagAnchorRef} className="relative min-w-0 sm:flex-1">
            <input id="product-tags" value={tagInput} maxLength={MAX_PRODUCT_TAG_LENGTH} className={`${inputClassName} pr-14 sm:flex-1`} placeholder="Ej. paleta, mango, con chile" autoComplete="off" role="combobox" aria-autocomplete="list" aria-controls={tagListId} aria-expanded={tagSuggestionsVisible} aria-activedescendant={tagSuggestionsVisible && tagMatches[activeTagIndex] ? `product-tag-option-${tagMatches[activeTagIndex]}` : undefined} aria-invalid={Boolean(tagError)} onFocus={() => { setTagFocused(true); setTagOpen(tagInput.trim() !== '') }} onBlur={() => { setTagFocused(false); setTagOpen(false) }} onChange={(event) => { setTagInput(event.target.value); setTagError(''); setActiveTagIndex(0); setTagOpen(event.target.value.trim() !== '') }} onKeyDown={(event) => {
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
                event.stopPropagation()
                setTagOpen(false)
              }
            }} aria-describedby={tagError ? 'product-tags-error' : undefined} />
            <button type="button" aria-label="Agregar etiqueta" title="Agregar etiqueta" disabled={busy || tags.length >= MAX_PRODUCT_TAGS} className="ops-icon-button ops-focus border-transparent bg-transparent absolute right-1 top-1/2 -translate-y-1/2 hover:border-transparent hover:bg-transparent active:bg-transparent" onClick={() => addTag()}><Icon name="plus" className="h-5 w-5" /></button>
            <FloatingLayer anchorRef={tagAnchorRef} open={tagSuggestionsVisible} onDismiss={() => setTagOpen(false)} id={tagListId} role="listbox" ariaLabel="Etiquetas disponibles" width="anchor" maxHeight={192} className="ops-popover max-h-48 overflow-y-auto p-1">
               {tagMatches.length > 0 ? tagMatches.map((tag, index) => <div id={`product-tag-option-${tag}`} key={tag} role="option" aria-selected={false} data-active={index === activeTagIndex || undefined} className="ops-option ops-focus" onMouseEnter={() => setActiveTagIndex(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => addTag(tag)}>{tag}</div>) : <div className="flex min-h-11 items-center px-3 py-2 text-sm text-slate-400">No hay etiquetas que coincidan. Presiona Enter para agregarla.</div>}
            </FloatingLayer>
          </div>
        </div>
        {tags.length > 0 && <ul aria-label="Etiquetas seleccionadas" className="flex flex-wrap gap-2">
          {tags.map((tag) => <li key={tag} className="inline-flex min-h-9 items-center gap-1 rounded-full border border-slate-700 bg-slate-900 pl-3 pr-1 text-xs font-bold text-slate-200">
            <span>{tag}</span>
            <button type="button" aria-label={`Quitar etiqueta ${tag}`} title={`Quitar etiqueta ${tag}`} disabled={busy} className="ops-icon-button ops-focus rounded-full border-transparent bg-transparent hover:border-transparent hover:bg-transparent active:bg-transparent" onClick={() => removeTag(tag)}><Icon name="close" className="h-4 w-4" /></button>
          </li>)}
        </ul>}
        {tagError && <p id="product-tags-error" role="alert" className="ops-field-error text-xs font-semibold text-rose-300">{tagError}</p>}
      </div>
    </div>

    <fieldset className="grid gap-2 border-t border-slate-800 pt-4">
      <legend className="text-sm font-semibold text-slate-300">Imagen del producto</legend>
      <div className="grid grid-cols-[8rem_minmax(0,1fr)] items-start gap-3 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-4">
        <CatalogImageTile key={displayedImageUrl ?? 'empty-product-image'} src={displayedImageUrl} alt={`Vista previa de ${product?.name ?? 'producto'}`} className="w-32 max-w-32 justify-self-start border-slate-800 bg-slate-900 sm:w-40 sm:max-w-40" />
        <div className="grid min-w-0 content-start gap-3">
          <p className="text-sm leading-relaxed text-slate-400">{selectedImage ? `Lista para optimizar y guardar: ${selectedImage.name}` : product?.imageUrl && !removeImage ? 'Se muestra la imagen actual del catálogo.' : 'Agrega una imagen para identificar el producto en el catálogo y los canales de venta.'}</p>
          <div data-testid="product-image-actions" className="flex flex-row flex-nowrap items-center gap-2">
            <input id="product-image" type="file" accept={PRODUCT_IMAGE_MIME_TYPES.join(',')} disabled={busy} className="sr-only" onChange={selectImage} aria-describedby="product-image-help product-image-error" />
             <label htmlFor="product-image" title={selectedImage || (product?.imageUrl && !removeImage) ? 'Reemplazar imagen' : 'Seleccionar imagen'} className="ops-icon-button ops-focus shrink-0"><Icon name={selectedImage || (product?.imageUrl && !removeImage) ? 'refresh' : 'plus'} className="h-4 w-4 shrink-0" /><span className="sr-only">{selectedImage || (product?.imageUrl && !removeImage) ? 'Reemplazar imagen' : 'Seleccionar imagen'}</span></label>
             {(selectedImage || (product && Boolean(product.imageUrl || product.imageKey) && !removeImage)) && <ResponsiveActionButton type="button" label="Quitar imagen" icon="trash" disabled={busy} className="shrink-0" onClick={clearImage} />}
             {product && removeImage && !selectedImage && <ResponsiveActionButton type="button" label="Restaurar imagen actual" icon="refresh" disabled={busy} className="shrink-0" onClick={() => setRemoveImage(false)} />}
          </div>
        </div>
      </div>
      <p id="product-image-help" className="text-xs leading-relaxed text-slate-500">JPEG, PNG o WebP, máximo 5 MB. Se optimiza a WebP de hasta 1600 px antes de subirla; reemplazar elimina la anterior.</p>
      {removeImage && !selectedImage && <p className="text-xs font-semibold text-amber-300">La imagen actual se quitará al guardar.</p>}
      {imageError && <p id="product-image-error" role="alert" className="text-xs font-semibold text-rose-300">{imageError}</p>}
    </fieldset>

  </form>
}

function ProductModal({
  product,
  categories,
  categorySelection,
  tagSuggestions,
  existingSkus,
  busy,
  error,
  errorRef,
  onClose,
  onManageCategories,
  restoredDraft,
  onDraftChange,
  onSubmit,
}: {
  product: Product | null
  categories: ProductCategory[]
  categorySelection: ProductCategory | null
  tagSuggestions: string[]
  existingSkus: string[]
  busy: boolean
  error: string
  errorRef: React.RefObject<HTMLDivElement | null>
  onClose: () => void
  onManageCategories: () => void
  restoredDraft?: ProductFormSessionDraft | null
  onDraftChange?: (draft: ProductFormSessionDraft) => void
  onSubmit: (draft: Draft) => void
}) {
  const saveLabel = product ? 'Guardar producto' : 'Crear producto'
  const [active, setActive] = useState(restoredDraft?.active ?? product?.active ?? true)

  return <Modal
    title={product ? 'Editar producto' : 'Agregar producto'}
    closeLabel="Cerrar formulario de producto"
    onClose={onClose}
    busy={busy}
    maxWidthClassName="max-w-3xl"
    zIndexClassName="z-50"
    headerActions={<>
      <ResponsiveActionButton type="submit" form="product-form" label={saveLabel} icon="save" loading={busy} loadingLabel="Guardando producto" disabled={busy} />
      <label htmlFor="product-active" title="Producto activo en los canales de venta" className="ops-control ops-check-control">
         <input id="product-active" form="product-form" name="active" type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} disabled={busy} aria-label="Producto activo en los canales de venta" />
      </label>
    </>}
  >
    {error && <div ref={errorRef} tabIndex={-1} role="alert" className="mx-4 mt-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm font-semibold text-rose-300 sm:mx-6">{error}</div>}
     <div className="p-4 sm:p-6"><ProductForm product={product} categories={categories} categorySelection={categorySelection} tagSuggestions={tagSuggestions} existingSkus={existingSkus} busy={busy} restoredDraft={restoredDraft} onDraftChange={onDraftChange} active={active} onManageCategories={onManageCategories} onSubmit={onSubmit} /></div>
  </Modal>
}

function ProductTable({ products, busy, onEdit, onToggle }: { products: Product[]; busy: boolean; onEdit: (product: Product) => void; onToggle: (product: Product) => void }) {
  const tableWrapperRef = useRef<HTMLDivElement>(null)
  const tableDrag = useRef<TableDrag | null>(null)
  const suppressTableClick = useRef(false)

  useEffect(() => {
    const tableWrapper = tableWrapperRef.current
    if (!tableWrapper) return

    tableWrapper.addEventListener('wheel', scrollVerticallyOnWheel, { passive: false })
    return () => tableWrapper.removeEventListener('wheel', scrollVerticallyOnWheel)
  }, [])

  function startTableDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const isPrimaryPointer = event.pointerType === 'mouse' ? event.button === 0 : event.isPrimary
    if (!isPrimaryPointer) return
    suppressTableClick.current = false
    tableDrag.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: event.currentTarget.scrollLeft,
      startScrollTop: event.currentTarget.scrollTop,
      moved: false,
    }
  }

  function moveTableDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = tableDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const deltaX = event.clientX - drag.startX
    const deltaY = event.clientY - drag.startY
    if (!drag.moved && Math.max(Math.abs(deltaX), Math.abs(deltaY)) < 4) return
    if (!drag.moved) event.currentTarget.setPointerCapture?.(event.pointerId)
    drag.moved = true
    event.preventDefault()
    const table = event.currentTarget
    const maxScrollLeft = Math.max(0, table.scrollWidth - table.clientWidth)
    table.scrollLeft = clampScroll(drag.startScrollLeft - deltaX, maxScrollLeft)
    const maxScrollTop = Math.max(0, table.scrollHeight - table.clientHeight)
    table.scrollTop = clampScroll(drag.startScrollTop - deltaY, maxScrollTop)
  }

  function finishTableDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = tableDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (drag.moved) suppressTableClick.current = true
    tableDrag.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function ignoreDraggedTableClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!suppressTableClick.current) return
    suppressTableClick.current = false
    if (event.detail === 0) return
    event.preventDefault()
    event.stopPropagation()
  }

  return <div ref={tableWrapperRef} className="ops-scroll-region ops-horizontal-scroll mt-4 min-h-0 min-w-0 max-w-full flex-1 cursor-grab touch-none overflow-x-auto overflow-y-auto overscroll-contain rounded-2xl border border-slate-800 active:cursor-grabbing" data-testid="products-table-wrapper" onPointerDownCapture={startTableDrag} onPointerMoveCapture={moveTableDrag} onPointerUpCapture={finishTableDrag} onPointerCancelCapture={finishTableDrag} onClickCapture={ignoreDraggedTableClick}>
    <table className="min-w-[56rem] w-full border-collapse text-left text-sm">
      <caption className="sr-only">Catálogo de productos filtrados</caption>
      <thead className="sticky top-0 z-10 bg-slate-900 text-xs font-extrabold uppercase tracking-[0.08em] text-slate-400">
        <tr>
          <th scope="col" className="w-14 px-2 py-2">Imagen</th>
          <th scope="col" className="min-w-36 px-2 py-2">Producto</th>
          <th scope="col" className="min-w-20 px-2 py-2">SKU</th>
          <th scope="col" className="min-w-28 px-2 py-2">Categoría</th>
          <th scope="col" className="min-w-28 px-2 py-2">Etiquetas</th>
          <th scope="col" className="min-w-24 px-2 py-2">Menudeo</th>
          <th scope="col" className="min-w-24 px-2 py-2">Mayorista</th>
          <th scope="col" className="min-w-20 px-2 py-2">Estado</th>
          <th scope="col" className="min-w-24 px-2 py-2">Acciones</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800 bg-slate-950">
        {products.map((product) => <tr key={product.id} className="align-middle transition-colors hover:bg-slate-900/70">
          <td className="px-2 py-2">
            <CatalogImageTile src={product.imageUrl} alt={`Imagen de ${product.name}`} className="h-11 w-11 rounded-lg border-slate-800 bg-slate-900" />
          </td>
          <th scope="row" className="px-2 py-2 text-left font-extrabold text-white"><span className="block max-w-36 truncate" title={product.name}>{product.name}</span></th>
          <td className="max-w-24 truncate px-2 py-2 font-semibold text-slate-300" title={product.sku}>{product.sku}</td>
          <td className="max-w-28 truncate px-2 py-2 font-semibold text-slate-300" title={product.category}>{product.category}</td>
          <td className="px-2 py-2">
            <div aria-label={`Etiquetas de ${product.name}`} className="flex min-w-28 max-w-32 flex-wrap gap-1">
              {product.tags.length > 0 ? product.tags.map((tag) => <span key={tag} title={tag} className="max-w-28 truncate rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-1 text-[10px] font-bold text-sky-200">{tag}</span>) : <span className="text-xs font-semibold text-sky-300">Sin etiquetas</span>}
            </div>
          </td>
          <td className="whitespace-nowrap px-2 py-2 font-black text-white">{formatPrice(product.retailPriceMxn)}</td>
          <td className={`whitespace-nowrap px-2 py-2 font-black ${wholesalePriceClass(product.wholesalePriceMxn)}`}>{formatWholesalePrice(product.wholesalePriceMxn)}</td>
          <td className="px-2 py-2">
            <span className={`inline-flex min-h-8 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-extrabold ${product.active ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300' : 'border-slate-700 bg-slate-800 text-white/70'}`}><span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${product.active ? 'bg-emerald-400' : 'bg-slate-500'}`} />{product.active ? 'Activo' : 'Inactivo'}</span>
          </td>
          <td className="whitespace-nowrap px-2 py-2">
            <div className="flex w-max flex-nowrap gap-1">
              <ResponsiveActionButton label={`Editar ${product.name}`} icon="edit" iconOnly disabled={busy} className="shrink-0" onClick={() => onEdit(product)} />
               <ResponsiveActionButton label={`${product.active ? 'Desactivar' : 'Activar'} ${product.name}`} icon="power" iconOnly disabled={busy} className="shrink-0" onClick={() => onToggle(product)} />
            </div>
          </td>
        </tr>)}
      </tbody>
    </table>
  </div>
}

export function ProductWorkspace() {
  const persistence = useAdminSessionPersistence()
  const sessionModule = 'products'
  const [restoredSession] = useState<ProductWorkspaceSession | null>(() => persistence?.read(sessionModule, isProductWorkspaceSession) ?? null)
  const [products, setProducts] = useState<Product[]>([])
  const [productCategories, setProductCategories] = useState<ProductCategory[]>([])
  const [productTags, setProductTags] = useState<ProductTag[]>([])
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [editing, setEditing] = useState<Product | null>(null)
  const [formOpen, setFormOpen] = useState(restoredSession?.formOpen ?? false)
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(restoredSession?.categoryManagerOpen ?? false)
  const [categorySelection, setCategorySelection] = useState<ProductCategory | null>(null)
  const [searchQuery, setSearchQuery] = useState(restoredSession?.searchQuery ?? '')
  const [selectedCategory, setSelectedCategory] = useState(restoredSession?.selectedCategory ?? ALL_CATEGORIES)
  const [view, setView] = useState<ProductView>(restoredSession?.view ?? 'grid')
  const [formDraft, setFormDraft] = useState<ProductFormSessionDraft | null>(restoredSession?.formDraft ?? null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const sequence = useRef(0)
  const alert = useRef<HTMLDivElement>(null)
  const categoryDrag = useRef<HorizontalDrag | null>(null)
  const suppressCategoryClick = useRef(false)

  useEffect(() => {
    persistence?.write(sessionModule, { searchQuery, selectedCategory, view, formOpen, editingProductId: editing?.id ?? null, categoryManagerOpen, formDraft })
  }, [categoryManagerOpen, editing, formDraft, formOpen, persistence, searchQuery, selectedCategory, sessionModule, view])

  const load = useCallback(async () => {
    const current = ++sequence.current
    setState('loading')
    try {
      const [nextProducts, nextCategories, nextTags] = await Promise.all([listProducts(), listProductCategories(), listProductTags()])
      if (current === sequence.current) {
        setProducts(nextProducts)
        setProductCategories(nextCategories)
        setProductTags(nextTags)
        if (restoredSession?.formOpen) {
          const restoredProduct = restoredSession.editingProductId ? nextProducts.find((product) => product.id === restoredSession.editingProductId) : null
          setEditing(restoredProduct ?? null)
          setFormOpen(restoredProduct || restoredSession.editingProductId === null ? true : false)
          if (!restoredProduct && restoredSession.editingProductId) setFormDraft(null)
        }
        setState('ready')
      }
    } catch {
      if (current === sequence.current) setState('error')
    }
  }, [restoredSession])

  useEffect(() => { queueMicrotask(() => void load()) }, [load])
  useEffect(() => { if (state === 'error' || error) alert.current?.focus() }, [state, error])
  const closeForm = useCallback(() => {
    setFormOpen(false)
    setEditing(null)
    setFormDraft(null)
  }, [])

  function openCreateForm() {
    setError('')
    setNotice('')
    setEditing(null)
    setFormDraft(null)
    setCategorySelection(null)
    setFormOpen(true)
  }

  function openEditForm(product: Product) {
    setError('')
    setNotice('')
    setEditing(product)
    setFormDraft(null)
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

  function imageSaveError(error: unknown) {
    if (error instanceof Error && error.name === 'ProductImageOptimizationError') return 'No se pudo optimizar la imagen en este navegador. Selecciona otra imagen o usa un navegador compatible.'
    return ''
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
    } catch (imageError) {
      const optimizationMessage = imageSaveError(imageError)
      if (!editingExisting) {
        merge(result)
        setEditing(result)
        setState('ready')
        setError(optimizationMessage || 'Producto creado, pero no se pudo guardar la imagen. El producto quedó sin este cambio; inténtalo de nuevo.')
      } else {
        setError(optimizationMessage || 'La información del producto se actualizó, pero no se pudo completar el cambio de imagen. Verifica el estado de la imagen e inténtalo de nuevo.')
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

  function startCategoryDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || event.button !== 0) return
    suppressCategoryClick.current = false
    categoryDrag.current = { pointerId: event.pointerId, startX: event.clientX, startScrollLeft: event.currentTarget.scrollLeft, moved: false }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }

  function moveCategoryDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = categoryDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const distance = event.clientX - drag.startX
    if (!drag.moved && Math.abs(distance) < 4) return
    drag.moved = true
    event.preventDefault()
    const maxScrollLeft = event.currentTarget.scrollWidth - event.currentTarget.clientWidth
    event.currentTarget.scrollLeft = Math.max(0, Math.min(maxScrollLeft, drag.startScrollLeft - distance))
  }

  function finishCategoryDrag(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = categoryDrag.current
    if (!drag || drag.pointerId !== event.pointerId) return
    if (drag.moved) suppressCategoryClick.current = true
    categoryDrag.current = null
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  function ignoreDraggedCategoryClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!suppressCategoryClick.current || event.detail === 0) return
    suppressCategoryClick.current = false
    event.preventDefault()
    event.stopPropagation()
  }

  return <>
      <section aria-label="Módulo Productos" className="ops-workspace-frame flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-3 text-slate-100 shadow-2xl sm:p-5 lg:p-6">
     <header className="ops-module-header flex shrink-0 flex-col gap-3 border-b border-slate-800 pb-3 sm:flex-row sm:items-center sm:justify-between">
       <div className="flex w-full min-w-0 items-center gap-3">
          <SearchInput label="Buscar productos" value={searchQuery} onChange={setSearchQuery} placeholder="Busca por nombre, SKU, categoría o etiqueta…" containerClassName="min-w-0 flex-1" className="text-sm" />
          <ResponsiveActionButton type="button" label="Agregar producto" icon="plus" iconOnly className="shrink-0" onClick={openCreateForm} />
      </div>
    </header>

     {notice && <p aria-live="polite" className="mt-2 shrink-0 text-sm font-semibold text-emerald-300">{notice}</p>}
     {error && !formOpen && <div ref={alert} tabIndex={-1} role="alert" className="mt-3 shrink-0 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm font-semibold text-rose-300">{error}</div>}

     {state === 'loading' && <p role="status" className="ops-state ops-state-loading mt-5 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm font-semibold text-slate-300">Cargando productos…</p>}
      {state === 'error' && <div ref={alert} tabIndex={-1} role="alert" className="ops-state ops-state-error mt-5 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm text-rose-200"><p className="font-semibold">No se pudieron cargar los productos.</p><ResponsiveActionButton label="Reintentar" icon="refresh" className="mt-3" onClick={load} /></div>}
     {state === 'ready' && products.length === 0 && <p className="ops-state ops-state-empty mt-5 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm text-slate-300">Aún no hay productos. Agrega el primero para iniciar el catálogo compartido.</p>}

      {state === 'ready' && products.length > 0 && <div className="ops-panel-frame mt-2 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 p-3 sm:p-4">
        <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
         <p className="text-xs font-semibold text-slate-400">{filteredProducts.length} de {products.length} productos mostrados</p>
         <div className="flex w-full flex-row items-center justify-end gap-2 sm:w-auto">
           <div role="group" aria-label="Vista del catálogo" className="inline-flex min-w-0 flex-1 rounded-xl border border-slate-700 bg-slate-900 p-1 sm:w-auto sm:flex-none">
               <button type="button" aria-label="Vista de tarjetas" title="Vista de tarjetas" aria-pressed={view === 'grid'} className="ops-action ops-icon-button ops-focus flex-1 sm:flex-none" onClick={() => setView('grid')}>
                <Icon name="grid" className="h-4 w-4 shrink-0" />
              </button>
               <button type="button" aria-label="Vista de tabla" title="Vista de tabla" aria-pressed={view === 'table'} className="ops-action ops-icon-button ops-focus flex-1 sm:flex-none" onClick={() => setView('table')}>
                <Icon name="table" className="h-4 w-4 shrink-0" />
             </button>
           </div>
             <ResponsiveActionButton label="Actualizar productos" icon="refresh" iconOnly disabled={busy} onClick={load} />
         </div>
       </div>

       <div data-testid="product-category-tabs" role="tablist" aria-label="Categorías de productos" onWheelCapture={scrollHorizontallyOnWheel} onPointerDownCapture={startCategoryDrag} onPointerMoveCapture={moveCategoryDrag} onPointerUpCapture={finishCategoryDrag} onPointerCancelCapture={finishCategoryDrag} onClickCapture={ignoreDraggedCategoryClick} className="ops-horizontal-scroll mt-4 flex w-full min-w-0 shrink-0 cursor-grab touch-pan-x gap-2 overflow-x-auto border-b border-slate-800 pb-2 scrollbar-none active:cursor-grabbing">
        {categories.map((category) => {
          const selected = selectedCategory === category
            return <ResponsiveActionButton key={category} type="button" role="tab" aria-selected={selected} aria-pressed={selected} label={`Filtrar por ${category}`} className="ops-tab shrink-0 px-4 text-xs" onClick={() => setSelectedCategory(category)}>{category}</ResponsiveActionButton>
        })}
      </div>

           <div data-testid="product-list-scroll" className={`ops-scroll-region min-h-0 flex-1 pr-1 ${view === 'table' ? 'flex flex-col overflow-hidden' : 'touch-pan-y overflow-y-auto overscroll-contain'}`}>
        {filteredProducts.length === 0 ? <p className="ops-state ops-state-filtered-empty mt-4 py-8 text-center text-sm font-semibold text-slate-400">No hay productos que coincidan con los filtros actuales.</p> : view === 'grid' ? <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-4 xl:grid-cols-5">
         {filteredProducts.map((product) => <li key={product.id} className="group flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-3 shadow-lg transition-colors hover:border-slate-700">
          <CatalogImageTile src={product.imageUrl} alt={`Imagen de ${product.name}`} className="mb-3 w-full border-slate-800 bg-slate-950 text-slate-400" imageClassName="transition-transform duration-200 group-hover:scale-105" />
          <div className="min-w-0">
            <div className="min-w-0">
              <h3 className="truncate text-sm font-extrabold text-white" title={product.name}>{product.name}</h3>
              <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500" title={`${product.sku} · ${product.category}`}>{product.sku} · {product.category}</p>
            </div>
             <div aria-label={`Etiquetas de ${product.name}`} className="mt-2 flex min-h-6 flex-wrap gap-1.5">
              {product.tags.length > 0 ? product.tags.map((tag) => <span key={tag} className="rounded-full border border-sky-500/20 bg-sky-500/10 px-2 py-1 text-[10px] font-bold text-sky-200">{tag}</span>) : <span className="text-[10px] font-semibold text-sky-300">Sin etiquetas</span>}
            </div>
             <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-800 pt-3">
              <div><p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Menudeo</p><p className="mt-1 text-sm font-black text-white">{formatPrice(product.retailPriceMxn)}</p></div>
               <div><p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">Mayorista</p><p className={`mt-1 text-sm font-black ${wholesalePriceClass(product.wholesalePriceMxn)}`}>{formatWholesalePrice(product.wholesalePriceMxn)}</p></div>
            </div>
          </div>
            <div className="mt-3 flex items-center justify-end gap-2">
               <ResponsiveActionButton label={`Editar ${product.name}`} icon="edit" iconOnly disabled={busy} onClick={() => openEditForm(product)} />
               <ResponsiveActionButton label={`${product.active ? 'Desactivar' : 'Activar'} ${product.name}`} icon="power" iconOnly disabled={busy} onClick={() => void setActive(product)} />
              <span role="status" aria-label={`${product.active ? 'Activo' : 'Inactivo'} ${product.name}`} title={`${product.active ? 'Activo' : 'Inactivo'} ${product.name}`} className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${product.active ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-slate-700 bg-slate-800'}`}><span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${product.active ? 'bg-emerald-400' : 'bg-slate-500'}`} /></span>
            </div>
        </li>)}
        </ul> : <ProductTable products={filteredProducts} busy={busy} onEdit={openEditForm} onToggle={(product) => void setActive(product)} />}
       </div>
     </div>}
     {formOpen && <ProductModal product={editing} categories={productCategories} categorySelection={categorySelection} tagSuggestions={tagSuggestions} existingSkus={products.map(({ sku }) => sku)} busy={busy} error={error} errorRef={alert} onClose={closeForm} onManageCategories={openCategoryManager} restoredDraft={formDraft} onDraftChange={setFormDraft} onSubmit={save} />}
    </section>
    {categoryManagerOpen && <ProductCategoryManagerModal categories={productCategories} onClose={() => setCategoryManagerOpen(false)} onChanged={handleCategoryChanged} />}
  </>
}
