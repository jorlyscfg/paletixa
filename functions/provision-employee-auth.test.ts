import { describe, expect, it } from 'vitest'
import { extractAuthUserId, findExactAuthUser, normalizeAuthUserLookupResponse } from './provision-employee-auth'

describe('provision employee auth response helpers', () => {
  it('extracts IDs through bounded auth response wrappers and arrays', () => {
    expect(extractAuthUserId({ data: { result: [{ user: { user_id: ' user-1 ' } }] } })).toBe('user-1')
    expect(extractAuthUserId([{ ignored: true }, { data: { userId: 'user-2' } }])).toBe('user-2')
  })

  it('does not scan unbounded arbitrary response properties', () => {
    const response = Array.from({ length: 100 }, () => ({ ignored: true }))
    response.push({ id: 'user-after-bound' })
    expect(extractAuthUserId(response)).toBeNull()
  })

  it('normalizes wrapped user lists without exposing unrelated response fields', () => {
    expect(normalizeAuthUserLookupResponse({ success: true, data: { users: [{ id: 'user-1', email: 'cashier@employees.paletixa.internal', password: 'secret' }] } })).toEqual([
      { id: 'user-1', email: 'cashier@employees.paletixa.internal' },
    ])
  })

  it('returns only one exact email match', () => {
    const response = { data: [{ id: 'user-1', email: 'cashier@employees.paletixa.internal' }, { id: 'user-2', email: 'cashier-other@employees.paletixa.internal' }] }
    expect(findExactAuthUser(response, 'cashier@employees.paletixa.internal')).toEqual({ id: 'user-1', email: 'cashier@employees.paletixa.internal' })
    expect(findExactAuthUser(response, 'cashier@employees.paletixa.internal.example')).toBeNull()
    expect(findExactAuthUser({ data: [{ id: 'user-1', email: 'cashier@employees.paletixa.internal' }, { id: 'user-2', email: 'CASHIER@employees.paletixa.internal' }] }, 'cashier@employees.paletixa.internal')).toBeNull()
  })
})
