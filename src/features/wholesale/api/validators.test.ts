import { describe, expect, it } from 'vitest'
import {
  normalizeMexicoMobile,
  normalizePin,
  normalizeWholesaleCompletion,
  normalizeTransferTicket,
  normalizeWholesaleOrderItems,
  normalizeWholesaleOrderState,
  normalizeWholesalePaymentMethod,
} from './validators'

describe('wholesale validators', () => {
  it('normalizes supported Mexico and WhatsApp mobile formats to one canonical value', () => {
    expect(normalizeMexicoMobile('55 1234 5678')).toBe('+525512345678')
    expect(normalizeMexicoMobile('+52 55 1234 5678')).toBe('+525512345678')
    expect(normalizeMexicoMobile('+52 1 55 1234 5678')).toBe('+525512345678')
  })

  it('rejects mobile values that are not a Mexico mobile number', () => {
    expect(() => normalizeMexicoMobile('551234567')).toThrow('valid Mexico mobile')
    expect(() => normalizeMexicoMobile('15512345678')).toThrow('valid Mexico mobile')
    expect(() => normalizeMexicoMobile('55-1234-5678 ext 1')).toThrow('valid Mexico mobile')
  })

  it('accepts exactly four decimal PIN digits', () => {
    expect(normalizePin('0042')).toBe('0042')
    expect(() => normalizePin('42')).toThrow('exactly 4 digits')
    expect(() => normalizePin('12a4')).toThrow('exactly 4 digits')
  })

  it('restricts states and payment methods to the native order contract', () => {
    expect(normalizeWholesaleOrderState('pending')).toBe('pending')
    expect(normalizeWholesaleOrderState('completed')).toBe('completed')
    expect(normalizeWholesalePaymentMethod('transfer')).toBe('transfer')
    expect(() => normalizeWholesaleOrderState('draft')).toThrow('state is invalid')
    expect(() => normalizeWholesalePaymentMethod('credit')).toThrow('payment method is invalid')
  })

  it('requires a complete transfer ticket and rejects it for cash payments', () => {
    expect(normalizeTransferTicket('transfer', { url: 'https://example.invalid/ticket', key: 'orders/1' })).toEqual({
      url: 'https://example.invalid/ticket',
      key: 'orders/1',
    })
    expect(normalizeTransferTicket('transfer')).toBeNull()
    expect(() => normalizeTransferTicket('transfer', { url: 'https://example.invalid/ticket' })).toThrow('provided together')
    expect(() => normalizeTransferTicket('cash', { url: 'https://example.invalid/ticket', key: 'orders/1' })).toThrow('only available')
  })

  it('normalizes completion data without allowing client-controlled confirmation actors or timestamps', () => {
    expect(normalizeWholesaleCompletion({
      paymentAmount: 145.5,
      paymentCurrency: 'mxn',
      paymentReference: ' transfer-42 ',
      paymentNote: 'Confirmed at the counter',
      deliveryAgreement: 'pickup',
    })).toEqual({
      payment_amount: 145.5,
      payment_currency: 'mxn',
      payment_reference: 'transfer-42',
      payment_note: 'Confirmed at the counter',
      delivery_agreement: 'pickup',
    })
    expect(() => normalizeWholesaleCompletion({ paymentAmount: 0, deliveryAgreement: 'pickup' })).toThrow('positive')
    expect(() => normalizeWholesaleCompletion({ paymentAmount: 10, deliveryAgreement: 'delivery', confirmedBy: 'admin-1' })).toThrow('unknown fields')
  })

  it('maps order item inputs to a server-owned product and quantity payload', () => {
    expect(normalizeWholesaleOrderItems([{ productId: 'product-1', quantity: 2 }])).toEqual([{ product_id: 'product-1', quantity: 2 }])
    expect(() => normalizeWholesaleOrderItems([])).toThrow('At least one')
    expect(() => normalizeWholesaleOrderItems([
      { productId: 'product-1', quantity: 1 },
      { productId: 'product-1', quantity: 2 },
    ])).toThrow('Duplicate')
    expect(() => normalizeWholesaleOrderItems([{ productId: 'product-1', quantity: 0 }])).toThrow('positive integer')
  })

  it('serializes category lines while accepting legacy product inputs without line kind', () => {
    expect(normalizeWholesaleOrderItems([
      { lineKind: 'category', categoryId: 'category-1', quantity: 10 },
      { productId: 'product-1', quantity: 2 },
    ])).toEqual([
      { line_kind: 'category', category_id: 'category-1', quantity: 10 },
      { product_id: 'product-1', quantity: 2 },
    ])
    expect(() => normalizeWholesaleOrderItems([
      { lineKind: 'category', categoryId: 'category-1', quantity: 1 },
      { lineKind: 'category', categoryId: 'category-1', quantity: 2 },
    ])).toThrow('Duplicate wholesale order category')
  })
})
