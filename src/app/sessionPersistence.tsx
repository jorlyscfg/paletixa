/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react'

export const ADMIN_SESSION_PERSISTENCE_VERSION = 1
export const ADMIN_SESSION_PERSISTENCE_NAMESPACE = 'paletixa:admin-session'
export const ADMIN_SESSION_PERSISTENCE_MAX_BYTES = 64 * 1024
export const ADMIN_SESSION_PERSISTENCE_MAX_AGE = 24 * 60 * 60 * 1000

export type AdminSessionScope = {
  userId: string
  branchId: string | null
}

type SessionEnvelope = {
  namespace: typeof ADMIN_SESSION_PERSISTENCE_NAMESPACE
  version: typeof ADMIN_SESSION_PERSISTENCE_VERSION
  module: string
  owner: AdminSessionScope
  savedAt: number
  state: unknown
}

export type SessionStateValidator<T> = (value: unknown) => value is T
export type SessionStorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem' | 'key' | 'length'>

export function isSessionRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}

export function isSessionString(value: unknown): value is string {
  return typeof value === 'string'
}

export function isSessionBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

export function isSessionStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export function isSessionStringRecord(value: unknown): value is Record<string, string> {
  return isSessionRecord(value) && Object.entries(value).every(([key, item]) => key.trim() !== '' && typeof item === 'string')
}

export function isSessionNumberRecord(value: unknown): value is Record<string, number> {
  return isSessionRecord(value) && Object.entries(value).every(([key, item]) => key.trim() !== '' && typeof item === 'number' && Number.isSafeInteger(item) && item > 0)
}

function getSessionStorage(): SessionStorageLike | undefined {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage
  } catch {
    return undefined
  }
}

function byteLength(value: string) {
  try {
    return new TextEncoder().encode(value).byteLength
  } catch {
    return value.length * 2
  }
}

function normalizedScope(scope: AdminSessionScope) {
  const userId = scope.userId.trim()
  const branchId = scope.branchId?.trim() || null
  return userId === '' ? null : { userId, branchId }
}

function normalizedModule(module: string) {
  const value = module.trim()
  return value !== '' && value.length <= 96 && /^[a-z0-9:_-]+$/i.test(value) ? value : null
}

function scopePart(value: string | null) {
  return encodeURIComponent(value ?? 'global')
}

export function createAdminSessionStorageKey(scope: AdminSessionScope, module: string) {
  const owner = normalizedScope(scope)
  const moduleName = normalizedModule(module)
  if (!owner || !moduleName) return null
  return `${ADMIN_SESSION_PERSISTENCE_NAMESPACE}:v${ADMIN_SESSION_PERSISTENCE_VERSION}:${scopePart(owner.userId)}:${scopePart(owner.branchId)}:${moduleName}`
}

function isJsonSafe(value: unknown, depth = 0, nodes = { count: 0 }): boolean {
  if (depth > 8 || nodes.count >= 1000) return false
  nodes.count += 1
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (typeof value !== 'object') return false
  if (value instanceof Date || (typeof Blob !== 'undefined' && value instanceof Blob) || (typeof File !== 'undefined' && value instanceof File)) return false
  if (Array.isArray(value)) return value.length <= 300 && value.every((entry) => isJsonSafe(entry, depth + 1, nodes))
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) return false
  return Object.entries(value).length <= 300 && Object.entries(value).every(([key, entry]) => key.length <= 160 && isJsonSafe(entry, depth + 1, nodes))
}

function parseEnvelope<T>(raw: string | null, scope: AdminSessionScope, module: string, validate: SessionStateValidator<T>) {
  if (!raw || byteLength(raw) > ADMIN_SESSION_PERSISTENCE_MAX_BYTES) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    const envelope = parsed as Partial<SessionEnvelope>
    const owner = normalizedScope(scope)
    if (!owner || envelope.namespace !== ADMIN_SESSION_PERSISTENCE_NAMESPACE || envelope.version !== ADMIN_SESSION_PERSISTENCE_VERSION || envelope.module !== module) return null
    if (!envelope.owner || typeof envelope.owner !== 'object' || envelope.owner.userId !== owner.userId || (envelope.owner.branchId ?? null) !== owner.branchId) return null
    const age = Date.now() - Number(envelope.savedAt)
    if (!Number.isFinite(envelope.savedAt) || age < 0 || age > ADMIN_SESSION_PERSISTENCE_MAX_AGE || !isJsonSafe(envelope.state) || !validate(envelope.state)) return null
    return envelope.state
  } catch {
    return null
  }
}

export function createAdminSessionPersistence(scope: AdminSessionScope, storage: SessionStorageLike | undefined = getSessionStorage()) {
  function read<T>(module: string, validate: SessionStateValidator<T>) {
    const key = createAdminSessionStorageKey(scope, module)
    if (!key || !storage) return null
    try {
      const raw = storage.getItem(key)
      const value = parseEnvelope(raw, scope, module.trim(), validate)
      if (raw !== null && value === null) storage.removeItem(key)
      return value
    } catch {
      return null
    }
  }

  function write<T>(module: string, state: T) {
    const key = createAdminSessionStorageKey(scope, module)
    const owner = normalizedScope(scope)
    if (!key || !owner || !storage || !isJsonSafe(state)) return false
    try {
      const serialized = JSON.stringify({
        namespace: ADMIN_SESSION_PERSISTENCE_NAMESPACE,
        version: ADMIN_SESSION_PERSISTENCE_VERSION,
        module: module.trim(),
        owner,
        savedAt: Date.now(),
        state,
      } satisfies SessionEnvelope)
      if (byteLength(serialized) > ADMIN_SESSION_PERSISTENCE_MAX_BYTES) return false
      storage.setItem(key, serialized)
      return true
    } catch {
      return false
    }
  }

  function remove(module: string) {
    const key = createAdminSessionStorageKey(scope, module)
    if (!key || !storage) return
    try { storage.removeItem(key) } catch { /* Storage is an optional enhancement. */ }
  }

  function clear() {
    const owner = normalizedScope(scope)
    if (!owner || !storage) return
    const namespacePrefix = `${ADMIN_SESSION_PERSISTENCE_NAMESPACE}:v`
    const ownerMarker = `:${scopePart(owner.userId)}:${scopePart(owner.branchId)}:`
    try {
      const keys: string[] = []
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index)
        if (key?.startsWith(namespacePrefix) && key.includes(ownerMarker)) keys.push(key)
      }
      keys.forEach((key) => storage.removeItem(key))
    } catch {
      // A broken or unavailable storage must never block logout.
    }
  }

  return { read, write, remove, clear }
}

type AdminSessionPersistence = ReturnType<typeof createAdminSessionPersistence>
const AdminSessionPersistenceContext = createContext<AdminSessionPersistence | null>(null)

export function AdminSessionPersistenceProvider({ scope, children }: { scope: AdminSessionScope; children: ReactNode }) {
  const { userId, branchId } = scope
  const persistence = useMemo(() => createAdminSessionPersistence({ userId, branchId }), [branchId, userId])
  return <AdminSessionPersistenceContext.Provider value={persistence}>{children}</AdminSessionPersistenceContext.Provider>
}

export function useAdminSessionPersistence() {
  return useContext(AdminSessionPersistenceContext)
}

export function useAdminSessionState<T>(module: string, fallback: T, validate: SessionStateValidator<T>): [T, Dispatch<SetStateAction<T>>] {
  const persistence = useAdminSessionPersistence()
  const [state, setState] = useState<T>(() => persistence?.read(module, validate) ?? fallback)

  // State is written only after the authenticated provider has mounted. No auth material is part of this state.
  useEffect(() => { persistence?.write(module, state) }, [module, persistence, state])

  return [state, setState]
}

export function clearAdminSessionState(scope: AdminSessionScope) {
  createAdminSessionPersistence(scope).clear()
}
