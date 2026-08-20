import { type FormEvent, useCallback, useEffect, useId, useRef, useState } from 'react'
import { normalizeCapitalizedText } from '../../../lib/textNormalization'
import {
  createProductCategory,
  deleteProductCategory,
  getProductCategoryErrorMessage,
  updateProductCategory,
  type ProductCategory,
} from '../api/productCategories'

type CategoryMutation = 'created' | 'updated' | 'deleted'

type ProductCategoryManagerModalProps = {
  categories: ProductCategory[]
  onClose: () => void
  onChanged: (category: ProductCategory | null, mutation: CategoryMutation) => void | Promise<void>
}

export function ProductCategoryManagerModal({ categories: initialCategories, onClose, onChanged }: ProductCategoryManagerModalProps) {
  const [categories, setCategories] = useState(initialCategories)
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
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

  async function addCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const created = await createProductCategory(normalizeCapitalizedText(newName))
      setCategories((current) => [...current.filter(({ id }) => id !== created.id), created].sort((a, b) => a.name.localeCompare(b.name)))
      setNewName('')
      await onChanged(created, 'created')
    } catch (mutationError) {
      setError(getProductCategoryErrorMessage(mutationError, 'create'))
    } finally {
      setBusy(false)
    }
  }

  function beginEdit(category: ProductCategory) {
    setEditingId(category.id)
    setEditingName(category.name)
    setError('')
  }

  function cancelEdit() {
    setEditingId(null)
    setEditingName('')
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>, categoryId: string) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const updated = await updateProductCategory(categoryId, normalizeCapitalizedText(editingName))
      setCategories((current) => [...current.filter(({ id }) => id !== updated.id), updated].sort((a, b) => a.name.localeCompare(b.name)))
      cancelEdit()
      await onChanged(updated, 'updated')
    } catch (mutationError) {
      setError(getProductCategoryErrorMessage(mutationError, 'update'))
    } finally {
      setBusy(false)
    }
  }

  async function removeCategory(category: ProductCategory) {
    setBusy(true)
    setError('')
    try {
      await deleteProductCategory(category.id)
      setCategories((current) => current.filter(({ id }) => id !== category.id))
      if (editingId === category.id) cancelEdit()
      await onChanged(null, 'deleted')
    } catch (mutationError) {
      setError(getProductCategoryErrorMessage(mutationError, 'delete'))
    } finally {
      setBusy(false)
    }
  }

  return <div className="fixed inset-0 z-[60] overflow-hidden bg-slate-950/80 p-4 backdrop-blur-sm sm:p-6" onClick={(event) => { if (event.target === event.currentTarget) requestClose() }}>
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={headingId} className="mx-auto flex max-h-[calc(100vh-2rem)] min-h-0 w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-slate-700 bg-slate-900 shadow-2xl sm:max-h-[calc(100vh-3rem)]">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-800 px-4 py-3 sm:px-6">
        <div>
          <h2 id={headingId} className="text-lg font-extrabold tracking-tight text-white">Administrar categorías</h2>
          <p className="mt-1 text-xs text-slate-400">Crea, renombra o elimina las categorías del catálogo.</p>
        </div>
        <button ref={closeButtonRef} type="button" aria-label="Cerrar administrador de categorías" title="Cerrar administrador de categorías" disabled={busy} className="ops-action ops-focus inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-slate-700 bg-slate-950 text-2xl leading-none text-slate-200 hover:border-sky-500 hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-50" onClick={requestClose}>×</button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
        {error && <div role="alert" className="mb-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm font-semibold text-rose-300">{error}</div>}
        <form aria-label="Crear categoría" className="flex flex-col gap-2 sm:flex-row" onSubmit={addCategory}>
          <label className="sr-only" htmlFor="new-product-category">Nueva categoría</label>
          <input id="new-product-category" value={newName} maxLength={120} placeholder="Ej. Paletas" className="ops-control ops-focus min-h-11 w-full px-3 text-sm font-medium placeholder:text-slate-500" disabled={busy} onChange={(event) => { setNewName(event.target.value); setError('') }} />
          <button type="submit" disabled={busy} className="ops-action ops-focus min-h-11 shrink-0 bg-sky-600 px-4 font-bold text-white hover:bg-sky-500 disabled:pointer-events-none disabled:opacity-50">Agregar categoría</button>
        </form>

        {categories.length === 0 ? <p className="mt-6 rounded-2xl border border-dashed border-slate-700 bg-slate-950 p-5 text-sm text-slate-400">Aún no hay categorías. Agrega la primera para usarla en tus productos.</p> : <ul aria-label="Categorías existentes" className="mt-6 grid gap-2">
          {categories.map((category) => <li key={category.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
            {editingId === category.id ? <form aria-label={`Renombrar ${category.name}`} className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => void saveEdit(event, category.id)}>
              <label className="sr-only" htmlFor={`edit-product-category-${category.id}`}>Nombre de la categoría</label>
              <input id={`edit-product-category-${category.id}`} value={editingName} maxLength={120} className="ops-control ops-focus min-h-11 min-w-0 flex-1 px-3 text-sm font-medium" disabled={busy} onChange={(event) => { setEditingName(event.target.value); setError('') }} />
              <button type="submit" disabled={busy} className="ops-action ops-focus min-h-11 bg-sky-600 px-3 text-sm font-bold text-white hover:bg-sky-500 disabled:pointer-events-none disabled:opacity-50">Guardar</button>
              <button type="button" disabled={busy} className="ops-action ops-focus min-h-11 border border-slate-700 bg-slate-900 px-3 text-sm font-bold text-slate-300 hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-50" onClick={cancelEdit}>Cancelar</button>
            </form> : <div className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-sm font-bold text-slate-100">{category.name}</span>
              <div className="flex shrink-0 gap-2">
                <button type="button" aria-label={`Renombrar categoría ${category.name}`} title={`Renombrar categoría ${category.name}`} disabled={busy} className="ops-action ops-focus min-h-10 border border-slate-700 bg-slate-900 px-3 text-xs font-bold text-slate-300 hover:border-sky-500 hover:bg-slate-800 disabled:pointer-events-none disabled:opacity-50" onClick={() => beginEdit(category)}>Editar</button>
                <button type="button" aria-label={`Eliminar categoría ${category.name}`} title={`Eliminar categoría ${category.name}`} disabled={busy} className="ops-action ops-focus min-h-10 border border-rose-500/30 bg-rose-500/10 px-3 text-xs font-bold text-rose-300 hover:bg-rose-500/20 disabled:pointer-events-none disabled:opacity-50" onClick={() => void removeCategory(category)}>Eliminar</button>
              </div>
            </div>}
          </li>)}
        </ul>}
      </div>
    </div>
  </div>
}
