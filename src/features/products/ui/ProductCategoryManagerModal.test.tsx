import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as categoryApi from '../api/productCategories'
import { ProductCategoryManagerModal } from './ProductCategoryManagerModal'

vi.mock('../api/productCategories', () => ({
  createProductCategory: vi.fn(),
  updateProductCategory: vi.fn(),
  deleteProductCategory: vi.fn(),
  getProductCategoryErrorMessage: (error: unknown, operation: string) => error instanceof Error ? error.message : operation === 'delete' ? 'No se pudo eliminar la categoría.' : 'No se pudo guardar la categoría.',
}))

const category: categoryApi.ProductCategory = { id: 'category-1', name: 'Paletas', normalizedName: 'paletas', createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z' }
const renamed: categoryApi.ProductCategory = { ...category, name: 'Paletas grandes', normalizedName: 'paletas grandes' }
const created: categoryApi.ProductCategory = { ...category, id: 'category-2', name: 'Helados', normalizedName: 'helados' }

describe('product category manager modal', () => {
  afterEach(cleanup)
  beforeEach(() => vi.resetAllMocks())

  it('creates, renames, and deletes categories through the CRUD API', async () => {
    const onClose = vi.fn()
    const onChanged = vi.fn()
    vi.mocked(categoryApi.createProductCategory).mockResolvedValue(created)
    vi.mocked(categoryApi.updateProductCategory).mockResolvedValue(renamed)
    vi.mocked(categoryApi.deleteProductCategory).mockResolvedValue()
    render(<ProductCategoryManagerModal categories={[category]} onClose={onClose} onChanged={onChanged} />)

    fireEvent.change(screen.getByLabelText('Nueva categoría'), { target: { value: 'Helados' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Crear categoría' }))
    expect(await screen.findByText('Helados')).toBeInTheDocument()
    expect(categoryApi.createProductCategory).toHaveBeenCalledWith('Helados')
    expect(onChanged).toHaveBeenCalledWith(created, 'created')

    fireEvent.click(screen.getByRole('button', { name: 'Renombrar categoría Paletas' }))
    fireEvent.change(screen.getByLabelText('Nombre de la categoría'), { target: { value: 'Paletas grandes' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Renombrar Paletas' }))
    expect(await screen.findByText('Paletas grandes')).toBeInTheDocument()
    expect(categoryApi.updateProductCategory).toHaveBeenCalledWith('category-1', 'Paletas grandes')
    expect(onChanged).toHaveBeenCalledWith(renamed, 'updated')

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar categoría Helados' }))
    expect(await screen.findByRole('button', { name: 'Eliminar categoría Paletas grandes' })).toBeInTheDocument()
    expect(categoryApi.deleteProductCategory).toHaveBeenCalledWith('category-2')
    expect(onChanged).toHaveBeenCalledWith(null, 'deleted')
  })

  it('keeps the manager open and explains duplicate or in-use category errors', async () => {
    vi.mocked(categoryApi.createProductCategory).mockRejectedValue(new Error('Ya existe una categoría'))
    vi.mocked(categoryApi.deleteProductCategory).mockRejectedValue(new Error('No se puede eliminar porque category_id está en uso'))
    render(<ProductCategoryManagerModal categories={[category]} onClose={vi.fn()} onChanged={vi.fn()} />)

    fireEvent.change(screen.getByLabelText('Nueva categoría'), { target: { value: 'paletas' } })
    fireEvent.submit(screen.getByRole('form', { name: 'Crear categoría' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe una categoría')
    expect(screen.getByRole('dialog', { name: 'Administrar categorías' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Eliminar categoría Paletas' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se puede eliminar porque category_id está en uso')
  })
})
