import { describe, expect, it } from 'vitest'
import type { Product } from '../../products/api/products'
import { buildPosCatalogCategories, getPosCashChange, getPosCategoryPriceLabel, getPosCategoryQuantityById, getPosCategoryUnitPrice, getPosPriceLabel, getPosUnitPrice, getPosUsdReceivedMxn, getValidatedCategoryPrice } from './posUtils'

const product = (overrides: Partial<Product> = {}): Product => ({
  id: 'product-1', name: 'Mango', sku: 'M-01', category: 'Paletas', categoryId: 'category-1',
  retailPriceMxn: 42.5, wholesalePriceMxn: 35, active: true, tags: [], imageUrl: null, imageKey: null,
  createdAt: '2026-08-20T00:00:00Z', updatedAt: '2026-08-20T00:00:00Z', ...overrides,
})

describe('POS pricing and category normalization', () => {
  it('uses the explicit POS wholesale threshold for product-only and category-only quantities', () => {
    expect(getPosUnitPrice(product(), 9)).toBe(42.5)
    expect(getPosUnitPrice(product(), 10)).toBe(35)
    expect(getPosPriceLabel(9)).toBe('Precio de menudeo')
    expect(getPosPriceLabel(10, 35)).toBe('Precio de mayoreo')
    expect(getPosCategoryUnitPrice([product(), product({ id: 'product-2' })], 'category-1', 9)).toBe(42.5)
    expect(getPosCategoryUnitPrice([product(), product({ id: 'product-2' })], 'category-1', 10)).toBe(35)
  })

  it('applies a configured threshold at and above the boundary', () => {
    expect(getPosUnitPrice(product(), 4, 5)).toBe(42.5)
    expect(getPosUnitPrice(product(), 5, 5)).toBe(35)
    expect(getPosCategoryPriceLabel([product()], 'category-1', 5, 5)).toBe('Precio de mayoreo')
  })

  it('aggregates product and category lines before deciding the active price', () => {
    expect(getPosCategoryQuantityById([{ categoryId: 'category-1', quantity: 9 }]).get('category-1')).toBe(9)
    expect(getPosCategoryQuantityById([{ categoryId: 'category-1', quantity: 10 }]).get('category-1')).toBe(10)
    expect(getPosCategoryQuantityById([
      { categoryId: 'category-1', quantity: 4 },
      { categoryId: 'category-1', quantity: 5 },
    ]).get('category-1')).toBe(9)
    expect(getPosCategoryQuantityById([
      { categoryId: 'category-1', quantity: 4 },
      { categoryId: 'category-1', quantity: 6 },
    ]).get('category-1')).toBe(10)
  })

  it('calculates the live received MXN value from USD and the active rate', () => {
    expect(getPosUsdReceivedMxn(6, 17.25)).toBe(103.5)
    expect(getPosUsdReceivedMxn(6, 15)).toBe(90)
    expect(getPosUsdReceivedMxn(Number.NaN, 15)).toBeNull()
  })

  it('calculates cash change in MXN for both payment currencies', () => {
    expect(getPosCashChange(50, 42.5, 'mxn', 15)).toBe(7.5)
    expect(getPosCashChange(4, 42.5, 'usd', 15)).toBe(17.5)
    expect(getPosCashChange(2, 42.5, 'usd', 15)).toBe(-12.5)
    expect(getPosCashChange(Number.NaN, 42.5, 'mxn', 15)).toBeNull()
  })

  it('validates a category price only when active products agree', () => {
    const products = [product(), product({ id: 'product-2', name: 'Cacao', retailPriceMxn: 42.5, wholesalePriceMxn: 35 })]
    expect(getValidatedCategoryPrice(products, 'category-1', false)).toBe(42.5)
    expect(getValidatedCategoryPrice([...products, product({ id: 'product-3', retailPriceMxn: 50 })], 'category-1', false)).toBeNull()
  })

  it('falls back to retail for products and categories without a positive wholesale price', () => {
    const products = [product({ wholesalePriceMxn: 0 }), product({ id: 'product-2', wholesalePriceMxn: 35 })]
    expect(getValidatedCategoryPrice(products, 'category-1', false)).toBe(42.5)
    expect(getValidatedCategoryPrice(products, 'category-1', true)).toBeNull()
    expect(getPosCategoryUnitPrice(products, 'category-1', 9)).toBe(42.5)
    expect(getPosCategoryUnitPrice(products, 'category-1', 10)).toBe(42.5)
    expect(getPosCategoryPriceLabel(products, 'category-1', 10)).toBe('Precio de menudeo')
    expect(getPosUnitPrice(products[0], 10)).toBe(42.5)
    expect(getPosPriceLabel(10, products[0].wholesalePriceMxn)).toBe('Precio de menudeo')
  })

  it('keeps wholesale pricing and labels when every category product has the same positive wholesale price', () => {
    const products = [product(), product({ id: 'product-2', wholesalePriceMxn: 35 })]
    expect(getPosCategoryUnitPrice(products, 'category-1', 10)).toBe(35)
    expect(getPosCategoryPriceLabel(products, 'category-1', 10)).toBe('Precio de mayoreo')
    expect(getPosPriceLabel(10, products[0].wholesalePriceMxn)).toBe('Precio de mayoreo')
  })

  it('builds generic categories without changing product image data', () => {
    const products = [product(), product({ id: 'product-2', categoryId: 'category-2', category: 'Bolis' })]
    expect(buildPosCatalogCategories(products).map(({ id, name, products: categoryProducts }) => ({ id, name, count: categoryProducts.length }))).toEqual([
      { id: 'category-2', name: 'Bolis', count: 1 },
      { id: 'category-1', name: 'Paletas', count: 1 },
    ])
  })
})
