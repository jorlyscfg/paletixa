import type { SalesReportDetail } from '../api/sales'

export type SalesProductRanking = {
  productName: string
  quantity: number
  totalMxn: number
}

export function rankSalesProducts(rows: SalesReportDetail[], limit = 5): SalesProductRanking[] {
  const products = new Map<string, SalesProductRanking>()
  for (const row of rows) {
    const current = products.get(row.productName) ?? { productName: row.productName, quantity: 0, totalMxn: 0 }
    current.quantity += row.quantity
    current.totalMxn += row.lineTotalMxn
    products.set(row.productName, current)
  }
  return [...products.values()]
    .sort((left, right) => right.quantity - left.quantity || right.totalMxn - left.totalMxn || left.productName.localeCompare(right.productName, 'es-MX'))
    .slice(0, limit)
}
