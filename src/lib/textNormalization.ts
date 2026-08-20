export function normalizeCapitalizedText(value: string): string {
  const lowercase = value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase()
  if (lowercase === '') return ''

  const characters = Array.from(lowercase)
  const firstCharacter = characters.shift() ?? ''
  return `${firstCharacter.toLocaleUpperCase()}${characters.join('')}`
}
