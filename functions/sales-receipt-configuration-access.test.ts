import { describe, expect, it } from 'vitest'
import { hasReceiptActionCapability } from './sales-receipt-configuration-access'

describe('sales receipt logo action capabilities', () => {
  it.each(['sales.record', 'pos.use'] as const)('allows %s to sign an active receipt logo', (capability) => {
    expect(hasReceiptActionCapability('sign', [capability])).toBe(true)
  })

  it.each(['upload', 'remove'] as const)('requires configuration.manage for %s', (action) => {
    expect(hasReceiptActionCapability(action, ['sales.record', 'pos.use'])).toBe(false)
    expect(hasReceiptActionCapability(action, ['configuration.manage'])).toBe(true)
  })
})
