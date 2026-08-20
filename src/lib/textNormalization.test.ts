import { describe, expect, it } from 'vitest'
import { normalizeCapitalizedText } from './textNormalization'

describe('normalizeCapitalizedText', () => {
  it.each([
    ['mANGO  CON   CHILE', 'Mango con chile'],
    ['pALEtas', 'Paletas'],
    ['nIEVE\t dE\n fRESA', 'Nieve de fresa'],
    ['SKU-01', 'Sku-01'],
    ['  ÁRBOL\u00a0DE   LIMÓN  ', 'Árbol de limón'],
  ])('normalizes %j to %j', (value, expected) => {
    expect(normalizeCapitalizedText(value)).toBe(expected)
  })

  it('returns an empty string for whitespace-only values', () => {
    expect(normalizeCapitalizedText('\u00a0 \t\n')).toBe('')
  })
})
