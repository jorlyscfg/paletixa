import { afterEach, describe, expect, it } from 'vitest'
import { createAdminSessionPersistence, createAdminSessionStorageKey, isSessionRecord } from './sessionPersistence'

const scope = { userId: 'user/one', branchId: 'branch-a' }
const otherScope = { userId: 'user/two', branchId: 'branch-a' }

describe('admin session persistence', () => {
  afterEach(() => sessionStorage.clear())

  it('creates versioned keys scoped to the authenticated owner and branch', () => {
    expect(createAdminSessionStorageKey(scope, 'products')).toBe('paletixa:admin-session:v1:user%2Fone:branch-a:products')
    expect(createAdminSessionStorageKey({ userId: ' user/one ', branchId: '' }, 'products')).toBe('paletixa:admin-session:v1:user%2Fone:global:products')
  })

  it('round-trips validated state without sharing it across owners', () => {
    const persistence = createAdminSessionPersistence(scope, sessionStorage)
    expect(persistence.write('products', { query: 'mango' })).toBe(true)
    expect(persistence.read('products', isSessionRecord)).toEqual({ query: 'mango' })
    expect(createAdminSessionPersistence(otherScope, sessionStorage).read('products', isSessionRecord)).toBeNull()
  })

  it('drops malformed, stale, and oversized records', () => {
    const key = createAdminSessionStorageKey(scope, 'products')!
    sessionStorage.setItem(key, '{not-json')
    const persistence = createAdminSessionPersistence(scope, sessionStorage)
    expect(persistence.read('products', isSessionRecord)).toBeNull()
    expect(sessionStorage.getItem(key)).toBeNull()

    sessionStorage.setItem(key, JSON.stringify({ namespace: 'paletixa:admin-session', version: 1, module: 'products', owner: scope, savedAt: Date.now() - 25 * 60 * 60 * 1000, state: {} }))
    expect(persistence.read('products', isSessionRecord)).toBeNull()
    expect(sessionStorage.getItem(key)).toBeNull()
    expect(persistence.write('products', { value: 'x'.repeat(70_000) })).toBe(false)
  })

  it('rejects binary state and clears only the current owner scope', () => {
    const persistence = createAdminSessionPersistence(scope, sessionStorage)
    expect(persistence.write('products', { image: new File(['image'], 'product.png', { type: 'image/png' }) })).toBe(false)
    persistence.write('products', { query: 'mango' })
    createAdminSessionPersistence(otherScope, sessionStorage).write('products', { query: 'other' })
    persistence.clear()
    expect(sessionStorage.getItem(createAdminSessionStorageKey(scope, 'products')!)).toBeNull()
    expect(sessionStorage.getItem(createAdminSessionStorageKey(otherScope, 'products')!)).not.toBeNull()
  })
})
