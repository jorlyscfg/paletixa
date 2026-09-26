import { type FormEvent, useState } from 'react'
import { Modal } from '../../../app/components/Modal'
import { ResponsiveActionButton } from '../../../app/components/ResponsiveActionButton'
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

  return <Modal
    title="Administrar categorías"
    description="Crea, renombra o elimina las categorías del catálogo."
    closeLabel="Cerrar administrador de categorías"
    onClose={onClose}
    busy={busy}
    maxWidthClassName="max-w-2xl"
    zIndexClassName="z-[60]"
    bodyClassName="p-4 sm:p-6"
    headerActions={editingId
      ? <ResponsiveActionButton type="submit" form={`edit-product-category-${editingId}-form`} label="Guardar categoría" icon="save" loading={busy} loadingLabel="Guardando categoría…" disabled={busy} />
      : <ResponsiveActionButton type="submit" form="create-product-category-form" label="Agregar categoría" icon="plus" loading={busy} loadingLabel="Agregando categoría…" disabled={busy} />}
  >
    {error && <div role="alert" className="mb-4 rounded-2xl border border-rose-500/20 bg-rose-500/10 p-4 text-sm font-semibold text-rose-300">{error}</div>}
    <form id="create-product-category-form" aria-label="Crear categoría" className="flex flex-col gap-2 sm:flex-row" onSubmit={addCategory}>
      <label className="sr-only" htmlFor="new-product-category">Nueva categoría</label>
      <input id="new-product-category" value={newName} maxLength={120} placeholder="Ej. Paletas" className="ops-control w-full px-3 text-sm font-medium" disabled={busy} onChange={(event) => { setNewName(event.target.value); setError('') }} />
    </form>

    {categories.length === 0 ? <p className="mt-6 rounded-2xl border border-dashed border-slate-700 bg-slate-950 p-5 text-sm text-slate-400">Aún no hay categorías. Agrega la primera para usarla en tus productos.</p> : <ul aria-label="Categorías existentes" className="mt-6 grid gap-2">
      {categories.map((category) => <li key={category.id} className="rounded-2xl border border-slate-800 bg-slate-950 p-3">
        {editingId === category.id ? <form id={`edit-product-category-${category.id}-form`} aria-label={`Renombrar ${category.name}`} className="flex flex-col gap-2 sm:flex-row" onSubmit={(event) => void saveEdit(event, category.id)}>
          <label className="sr-only" htmlFor={`edit-product-category-${category.id}`}>Nombre de la categoría</label>
          <input id={`edit-product-category-${category.id}`} value={editingName} maxLength={120} className="ops-control min-w-0 flex-1 px-3 text-sm font-medium" disabled={busy} onChange={(event) => { setEditingName(event.target.value); setError('') }} />
        </form> : <div className="flex items-center justify-between gap-3">
          <span className="min-w-0 truncate text-sm font-bold text-slate-100">{category.name}</span>
          <div className="flex shrink-0 gap-2">
             <ResponsiveActionButton type="button" label={`Renombrar categoría ${category.name}`} icon="edit" disabled={busy} onClick={() => beginEdit(category)} />
             <ResponsiveActionButton type="button" label={`Eliminar categoría ${category.name}`} icon="trash" disabled={busy} onClick={() => void removeCategory(category)} />
          </div>
        </div>}
      </li>)}
    </ul>}
  </Modal>
}
