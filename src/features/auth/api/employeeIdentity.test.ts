import { describe, expect, it } from 'vitest'
import { employeeAuthEmail, normalizeEmployeeUsername } from '../../../../shared/employeeIdentity'

describe('employee identity mapping', () => {
  it('normalizes usernames deterministically before deriving the internal auth email', () => {
    expect(normalizeEmployeeUsername('  CAJERO_01  ')).toBe('cajero_01')
    expect(employeeAuthEmail('  CAJERO_01  ')).toBe('cajero_01@employees.paletixa.internal')
  })

  it('rejects ambiguous or unsafe usernames', () => {
    expect(() => normalizeEmployeeUsername('ab')).toThrow('3 to 32')
    expect(() => normalizeEmployeeUsername('cajero@example.com')).toThrow('3 to 32')
    expect(() => normalizeEmployeeUsername('cajero/01')).toThrow('3 to 32')
  })
})
