import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ database: { rpc: vi.fn() }, functions: { invoke: vi.fn() } }))
vi.mock('../../../lib/insforge', () => ({ insforge: sdk }))

import { getSalesReceiptConfiguration, SALES_RECEIPT_COMPANY_EMAIL_MAX_LENGTH, SALES_RECEIPT_COMPANY_PHONE_MAX_LENGTH, setSalesReceiptConfiguration, uploadSalesReceiptLogo, validateCompanyEmail } from './salesReceipt'

const row = {
  logo_key: null,
  show_logo: true,
  show_branch: true,
  show_cashier: true,
  show_customer: false,
  show_payment_method: true,
  owner_id: 'admin-1',
  updated_at: '2026-08-29T12:00:00.000Z',
}

const receiptDraft = {
  logoKey: null,
  showLogo: true,
  showBranch: true,
  showCashier: true,
  showCustomer: true,
  showPaymentMethod: true,
}

describe('sales receipt configuration API', () => {
  beforeEach(() => vi.resetAllMocks())

  it('maps global visibility settings without exposing a logo URL when none is configured', async () => {
    sdk.database.rpc.mockResolvedValue({ data: row, error: null })

    await expect(getSalesReceiptConfiguration()).resolves.toEqual({
      logoUrl: null,
      logoKey: null,
      companyPhone: null,
      companyEmail: null,
      showLogo: true,
      showBranch: true,
      showCashier: true,
      showCustomer: false,
      showPaymentMethod: true,
      showCompanyPhone: true,
      showCompanyEmail: true,
      showCustomerUrl: true,
      ownerId: 'admin-1',
      updatedAt: '2026-08-29T12:00:00.000Z',
    })
    expect(sdk.database.rpc).toHaveBeenCalledWith('get_sales_receipt_configuration')
    expect(sdk.functions.invoke).not.toHaveBeenCalled()
  })

  it('sends typed visibility values, signs the configured private logo, and ignores a legacy customer URL', async () => {
    sdk.database.rpc
      .mockResolvedValueOnce({ data: { ...row, logo_key: 'receipts/logo.png', company_phone: '+52 999 000 0000', company_email: 'hola@paletixa.example', customer_url: 'https://paletixa.example/clientes', show_company_phone: true, show_company_email: false, show_customer_url: true }, error: null })
      .mockResolvedValueOnce({ data: { ...row, logo_key: 'receipts/logo.png', show_branch: false, company_phone: '+52 999 000 0000', company_email: 'hola@paletixa.example', customer_url: 'https://paletixa.example/clientes', show_company_phone: true, show_company_email: false, show_customer_url: true }, error: null })
    sdk.functions.invoke.mockResolvedValue({ data: { url: 'https://signed.example/logo.png', key: 'receipts/logo.png' }, error: null })

    const loaded = await getSalesReceiptConfiguration()
    expect(loaded).toMatchObject({ logoKey: 'receipts/logo.png', logoUrl: 'https://signed.example/logo.png', companyPhone: '+52 999 000 0000', companyEmail: 'hola@paletixa.example', showCompanyEmail: false })
    expect(loaded).not.toHaveProperty('customerUrl')
    const saved = await setSalesReceiptConfiguration({ requestId: 'request-1', configuration: { logoKey: 'receipts/logo.png', companyPhone: '+52 999 000 0000', companyEmail: 'hola@paletixa.example', showLogo: true, showBranch: false, showCashier: true, showCustomer: false, showPaymentMethod: true, showCompanyPhone: true, showCompanyEmail: false, showCustomerUrl: true } })
    expect(saved).toMatchObject({ logoKey: 'receipts/logo.png', logoUrl: 'https://signed.example/logo.png', showBranch: false, companyPhone: '+52 999 000 0000', companyEmail: 'hola@paletixa.example', showCompanyEmail: false })
    expect(saved).not.toHaveProperty('customerUrl')
    expect(sdk.database.rpc).toHaveBeenLastCalledWith('set_sales_receipt_configuration', {
      p_request_id: 'request-1',
      p_logo_key: 'receipts/logo.png',
      p_show_logo: true,
      p_show_branch: false,
      p_show_cashier: true,
      p_show_customer: false,
      p_show_payment_method: true,
      p_company_phone: '+52 999 000 0000',
      p_company_email: 'hola@paletixa.example',
      p_show_company_phone: true,
      p_show_company_email: false,
      p_show_customer_url: true,
    })
  })

  it('allows empty contact values to clear text fields without a customer URL payload', async () => {
    sdk.database.rpc.mockResolvedValue({ data: { ...row, company_phone: null, company_email: null, customer_url: 'https://legacy.example/clientes' }, error: null })
    const result = await setSalesReceiptConfiguration({ requestId: 'request-clear', configuration: { logoKey: null, companyPhone: '', companyEmail: '  ', showLogo: true, showBranch: true, showCashier: true, showCustomer: true, showPaymentMethod: true } })
    expect(result).toMatchObject({ companyPhone: null, companyEmail: null })
    expect(result).not.toHaveProperty('customerUrl')
    expect(sdk.database.rpc).toHaveBeenCalledWith('set_sales_receipt_configuration', expect.objectContaining({ p_company_phone: null, p_company_email: null, p_show_company_phone: true, p_show_company_email: true, p_show_customer_url: true }))
    expect(sdk.database.rpc.mock.calls[0][1]).not.toHaveProperty('p_customer_url')
  })

  it('rejects invalid company emails before invoking the RPC while allowing empty values', async () => {
    expect(validateCompanyEmail(' hola@paletixa.example ')).toBe('hola@paletixa.example')
    expect(validateCompanyEmail('')).toBeNull()
    expect(() => validateCompanyEmail('not-an-email')).toThrow('company email is invalid')

    await expect(setSalesReceiptConfiguration({ requestId: 'request-invalid-email', configuration: { ...receiptDraft, companyEmail: 'not-an-email' } })).rejects.toThrow('company email is invalid')
    expect(sdk.database.rpc).not.toHaveBeenCalled()
  })

  it('rejects contact values beyond the SQL-aligned limits before invoking the RPC', async () => {
    await expect(setSalesReceiptConfiguration({ requestId: 'request-long-phone', configuration: { ...receiptDraft, companyPhone: '1'.repeat(SALES_RECEIPT_COMPANY_PHONE_MAX_LENGTH + 1) } })).rejects.toThrow('too long')
    await expect(setSalesReceiptConfiguration({ requestId: 'request-long-email', configuration: { ...receiptDraft, companyEmail: 'a'.repeat(SALES_RECEIPT_COMPANY_EMAIL_MAX_LENGTH + 1) } })).rejects.toThrow('too long')
    expect(sdk.database.rpc).not.toHaveBeenCalled()
  })

  it('rejects unsupported or oversized logo files before invoking storage', async () => {
    await expect(uploadSalesReceiptLogo(new File(['logo'], 'logo.gif', { type: 'image/gif' }))).rejects.toThrow('JPG, PNG o WebP')
    await expect(uploadSalesReceiptLogo(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'logo.png', { type: 'image/png' }))).rejects.toThrow('2 MB')
    expect(sdk.functions.invoke).not.toHaveBeenCalled()
  })
})
