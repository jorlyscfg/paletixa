import { describe, expect, it } from 'vitest'
import { mapWholesaleOrderItem } from './mappers'

describe('wholesale order item mapper', () => {
  it('maps category lines with nullable product fields', () => {
    expect(mapWholesaleOrderItem({
      id: 'item-1',
      line_kind: 'category',
      product_id: null,
      category_id: 'category-1',
      category_name: 'Paletas',
      product_name: 'Paletas',
      unit_price_mxn: '10.00',
      quantity: '10',
      line_total_mxn: '100.00',
    })).toEqual({
      id: 'item-1',
      lineKind: 'category',
      productId: null,
      categoryId: 'category-1',
      categoryName: 'Paletas',
      productName: 'Paletas',
      unitPriceMxn: 10,
      quantity: 10,
      lineTotalMxn: 100,
    })
  })

  it('treats a legacy product row without line_kind as a product line', () => {
    expect(mapWholesaleOrderItem({
      id: 'item-1',
      product_id: 'product-1',
      product_name: 'Mango',
      unit_price_mxn: '12.50',
      quantity: 2,
      line_total_mxn: '25.00',
    })).toMatchObject({ lineKind: 'product', productId: 'product-1', categoryId: null, categoryName: null })
  })
})
