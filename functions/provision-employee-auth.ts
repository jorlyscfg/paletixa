type RecordValue = Record<string, unknown>

export type AuthUserRecord = {
  id: string
  email: string
}

const MAX_RESPONSE_DEPTH = 8
const MAX_RESPONSE_NODES = 64
const AUTH_ID_KEYS = ['id', 'user_id', 'userId'] as const
const AUTH_WRAPPER_KEYS = ['user', 'data', 'result', 'users'] as const

function record(value: unknown): RecordValue | null {
  return typeof value === 'object' && value !== null ? value as RecordValue : null
}

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function firstNonEmptyString(source: RecordValue, keys: readonly string[]) {
  for (const key of keys) {
    const value = nonEmptyString(source[key])
    if (value) return value
  }
  return null
}

export function extractAuthUserId(value: unknown): string | null {
  const seen = new Set<object>()
  const nodes = { count: 0 }

  function visit(candidate: unknown, depth: number): string | null {
    if (depth > MAX_RESPONSE_DEPTH || nodes.count >= MAX_RESPONSE_NODES) return null
    nodes.count += 1

    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        const result = visit(item, depth + 1)
        if (result) return result
        if (nodes.count >= MAX_RESPONSE_NODES) break
      }
      return null
    }

    const source = record(candidate)
    if (!source || seen.has(source)) return null
    seen.add(source)

    for (const key of AUTH_ID_KEYS) {
      const id = nonEmptyString(source[key])
      if (id) return id
    }

    for (const key of AUTH_WRAPPER_KEYS) {
      const result = visit(source[key], depth + 1)
      if (result) return result
    }
    return null
  }

  return visit(value, 0)
}

export function normalizeAuthUserLookupResponse(value: unknown): AuthUserRecord[] {
  const users: AuthUserRecord[] = []
  const seen = new Set<object>()
  const emitted = new Set<string>()
  const nodes = { count: 0 }

  function visit(candidate: unknown, depth: number) {
    if (depth > MAX_RESPONSE_DEPTH || nodes.count >= MAX_RESPONSE_NODES) return
    nodes.count += 1

    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        visit(item, depth + 1)
        if (nodes.count >= MAX_RESPONSE_NODES) break
      }
      return
    }

    const source = record(candidate)
    if (!source || seen.has(source)) return
    seen.add(source)

    const id = firstNonEmptyString(source, AUTH_ID_KEYS)
    const email = nonEmptyString(source.email)
    if (id && email) {
      const key = `${id}\u0000${email}`
      if (!emitted.has(key)) {
        emitted.add(key)
        users.push({ id, email })
      }
    }

    for (const key of AUTH_WRAPPER_KEYS) visit(source[key], depth + 1)
  }

  visit(value, 0)
  return users
}

export function findExactAuthUser(value: unknown, email: string): AuthUserRecord | null {
  const expectedEmail = email.trim().toLocaleLowerCase('en-US')
  const matches = normalizeAuthUserLookupResponse(value).filter((user) => user.email.toLocaleLowerCase('en-US') === expectedEmail)
  return matches.length === 1 ? matches[0] : null
}
