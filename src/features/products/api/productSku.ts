export const MAX_PRODUCT_SKU_LENGTH = 80

const SKU_STOP_WORDS = new Set(['A', 'AL', 'CON', 'DE', 'DEL', 'EL', 'EN', 'LA', 'LAS', 'LOS', 'PARA', 'POR', 'Y'])

function toAscii(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[Ææ]/gu, 'AE')
    .replace(/[Œœ]/gu, 'OE')
    .replace(/[Ðð]/gu, 'D')
    .replace(/[Łł]/gu, 'L')
    .replace(/[Øø]/gu, 'O')
    .replace(/[Þþ]/gu, 'TH')
    .replace(/ß/gu, 'SS')
}

export function normalizeSku(value: string) {
  const normalized = toAscii(value)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .replace(/-+/gu, '-')

  return normalized.slice(0, MAX_PRODUCT_SKU_LENGTH).replace(/-+$/gu, '')
}

function shortMeaningfulTokens(value: string | undefined, limit: number) {
  if (!value) return []

  return normalizeSku(value)
    .split('-')
    .filter((token) => token !== '' && !SKU_STOP_WORDS.has(token))
    .map((token) => token.slice(0, 3))
    .slice(0, limit)
}

export type ProductSkuSuggestionFields = {
  category?: string
  name?: string
  tags?: readonly string[]
}

export function suggestProductSku({ category, name, tags = [] }: ProductSkuSuggestionFields) {
  const tokens = [
    ...shortMeaningfulTokens(category, 1),
    ...shortMeaningfulTokens(name, 2),
    ...tags.flatMap((tag) => shortMeaningfulTokens(tag, 1)).slice(0, 2),
  ]
  const uniqueTokens = tokens.filter((token, index) => tokens.indexOf(token) === index)
  return normalizeSku(uniqueTokens.join('-'))
}

function withSuffix(base: string, suffix: number) {
  const suffixText = suffix < 100 ? String(suffix).padStart(2, '0') : String(suffix)
  const availableBaseLength = MAX_PRODUCT_SKU_LENGTH - suffixText.length - 1
  const boundedBase = base.slice(0, availableBaseLength).replace(/-+$/gu, '')
  return `${boundedBase}-${suffixText}`
}

export function suggestUniqueProductSku(fields: ProductSkuSuggestionFields, existingSkus: readonly string[] = []) {
  const suggestion = suggestProductSku(fields)
  if (suggestion === '') return ''

  const usedSkus = new Set(existingSkus.map((sku) => normalizeSku(sku)).filter(Boolean))
  if (!usedSkus.has(suggestion)) return suggestion

  let suffix = 2
  let candidate = withSuffix(suggestion, suffix)
  while (usedSkus.has(candidate)) {
    suffix += 1
    candidate = withSuffix(suggestion, suffix)
  }
  return candidate
}
