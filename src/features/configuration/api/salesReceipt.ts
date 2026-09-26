import { insforge } from '../../../lib/insforge'

export const SALES_RECEIPT_LOGO_BUCKET = 'sales-receipt-logos'
export const SALES_RECEIPT_LOGO_MAX_BYTES = 2 * 1024 * 1024
export const SALES_RECEIPT_LOGO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const
export const SALES_RECEIPT_COMPANY_PHONE_MAX_LENGTH = 128
export const SALES_RECEIPT_COMPANY_EMAIL_MAX_LENGTH = 320
const SALES_RECEIPT_CONFIGURATION_FUNCTION = 'sales-receipt-configuration'

export type SalesReceiptConfiguration = {
  logoUrl: string | null
  logoKey: string | null
  companyPhone: string | null
  companyEmail: string | null
  showLogo: boolean
  showBranch: boolean
  showCashier: boolean
  showCustomer: boolean
  showPaymentMethod: boolean
  showCompanyPhone: boolean
  showCompanyEmail: boolean
  showCustomerUrl: boolean
  ownerId: string
  updatedAt: string
}

export type SalesReceiptConfigurationDraft = Pick<SalesReceiptConfiguration, 'logoKey' | 'showLogo' | 'showBranch' | 'showCashier' | 'showCustomer' | 'showPaymentMethod'> & Partial<Pick<SalesReceiptConfiguration, 'companyPhone' | 'companyEmail' | 'showCompanyPhone' | 'showCompanyEmail' | 'showCustomerUrl'>>

type ConfigurationRow = {
  logo_key?: unknown
  company_phone?: unknown
  company_email?: unknown
  show_logo?: unknown
  show_branch?: unknown
  show_cashier?: unknown
  show_customer?: unknown
  show_payment_method?: unknown
  show_company_phone?: unknown
  show_company_email?: unknown
  show_customer_url?: unknown
  owner_id?: unknown
  updated_at?: unknown
}

function firstRow(data: unknown): ConfigurationRow {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Sales receipt configuration response is invalid')
  return row as ConfigurationRow
}

function nullableText(value: unknown, field: string) {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} is invalid`)
  return value.trim()
}

function nullableSettingText(value: unknown, field: string, maxLength?: number) {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw new Error(`${field} is invalid`)
  const normalized = value.trim()
  if (maxLength !== undefined && normalized.length > maxLength) throw new Error(`${field} is too long`)
  return normalized === '' ? null : normalized
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim() === '') throw new Error(`${field} is invalid`)
  return value.trim()
}

function requiredBoolean(value: unknown, field: string) {
  if (typeof value !== 'boolean') throw new Error(`${field} is invalid`)
  return value
}

function optionalBoolean(value: unknown, field: string, defaultValue: boolean) {
  return value === null || value === undefined ? defaultValue : requiredBoolean(value, field)
}

export function validateCompanyEmail(value: unknown) {
  const normalized = nullableSettingText(value, 'Sales receipt company email', SALES_RECEIPT_COMPANY_EMAIL_MAX_LENGTH)
  if (!normalized) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error('Sales receipt company email is invalid')
  return normalized
}

function mapConfiguration(data: unknown, logoUrl: string | null = null): SalesReceiptConfiguration {
  const row = firstRow(data)
  return {
    logoUrl,
    logoKey: nullableText(row.logo_key, 'Sales receipt logo key'),
    companyPhone: nullableSettingText(row.company_phone, 'Sales receipt company phone', SALES_RECEIPT_COMPANY_PHONE_MAX_LENGTH),
    companyEmail: validateCompanyEmail(row.company_email),
    showLogo: requiredBoolean(row.show_logo, 'Sales receipt logo visibility'),
    showBranch: requiredBoolean(row.show_branch, 'Sales receipt branch visibility'),
    showCashier: requiredBoolean(row.show_cashier, 'Sales receipt cashier visibility'),
    showCustomer: requiredBoolean(row.show_customer, 'Sales receipt customer visibility'),
    showPaymentMethod: requiredBoolean(row.show_payment_method, 'Sales receipt payment visibility'),
    showCompanyPhone: optionalBoolean(row.show_company_phone, 'Sales receipt company phone visibility', true),
    showCompanyEmail: optionalBoolean(row.show_company_email, 'Sales receipt company email visibility', true),
    showCustomerUrl: optionalBoolean(row.show_customer_url, 'Sales receipt customer URL visibility', true),
    ownerId: requiredText(row.owner_id, 'Sales receipt configuration owner'),
    updatedAt: requiredText(row.updated_at, 'Sales receipt configuration update time'),
  }
}

function validateLogoFile(file: File) {
  if (!file || typeof file.type !== 'string' || !Number.isFinite(file.size) || file.size <= 0) throw new Error('El logo debe ser un archivo de imagen válido.')
  if (!SALES_RECEIPT_LOGO_MIME_TYPES.includes(file.type as typeof SALES_RECEIPT_LOGO_MIME_TYPES[number])) throw new Error('El logo debe ser una imagen JPG, PNG o WebP.')
  if (file.size > SALES_RECEIPT_LOGO_MAX_BYTES) throw new Error('El logo no puede superar 2 MB.')
}

function validateLogoKey(value: string | null | undefined) {
  if (value === null || value === undefined || value === '') return null
  const key = requiredText(value, 'Sales receipt logo key')
  if (!/^receipts\/[A-Za-z0-9._-]+$/.test(key) || key.includes('..')) throw new Error('La clave del logo no es válida.')
  return key
}

async function encodeFileBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunkSize = 0x6000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  return btoa(binary)
}

async function invokeLogoFunction<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await insforge.functions.invoke<T>(SALES_RECEIPT_CONFIGURATION_FUNCTION, { body })
  if (error) throw error
  if (data === null || data === undefined) throw new Error('Sales receipt logo function returned an empty response')
  return data
}

export async function refreshSalesReceiptLogoUrl(key: string): Promise<{ url: string; key: string }> {
  return invokeLogoFunction<{ url: string; key: string }>({ action: 'sign', key: validateLogoKey(key) })
}

export async function getSalesReceiptConfiguration(): Promise<SalesReceiptConfiguration> {
  const { data, error } = await insforge.database.rpc('get_sales_receipt_configuration')
  if (error) throw error
  const configuration = mapConfiguration(data)
  if (!configuration.logoKey) return configuration
  const signed = await refreshSalesReceiptLogoUrl(configuration.logoKey)
  return { ...configuration, logoUrl: signed.url }
}

export async function setSalesReceiptConfiguration(input: { requestId: string; configuration: SalesReceiptConfigurationDraft }): Promise<SalesReceiptConfiguration> {
  const requestId = requiredText(input.requestId, 'Receipt configuration request ID')
  const configuration = input.configuration
  const logoKey = validateLogoKey(configuration.logoKey)
  const companyPhone = nullableSettingText(configuration.companyPhone, 'Sales receipt company phone', SALES_RECEIPT_COMPANY_PHONE_MAX_LENGTH)
  const companyEmail = validateCompanyEmail(configuration.companyEmail)
  const showCompanyPhone = configuration.showCompanyPhone ?? true
  const showCompanyEmail = configuration.showCompanyEmail ?? true
  const showCustomerUrl = configuration.showCustomerUrl ?? true
  const values = [configuration.showLogo, configuration.showBranch, configuration.showCashier, configuration.showCustomer, configuration.showPaymentMethod, showCompanyPhone, showCompanyEmail, showCustomerUrl]
  if (values.some((value) => typeof value !== 'boolean')) throw new Error('Las opciones del comprobante deben ser booleanas.')
  const { data, error } = await insforge.database.rpc('set_sales_receipt_configuration', {
    p_request_id: requestId,
    p_logo_key: logoKey,
    p_show_logo: configuration.showLogo,
    p_show_branch: configuration.showBranch,
    p_show_cashier: configuration.showCashier,
    p_show_customer: configuration.showCustomer,
    p_show_payment_method: configuration.showPaymentMethod,
    p_company_phone: companyPhone,
    p_company_email: companyEmail,
    p_show_company_phone: showCompanyPhone,
    p_show_company_email: showCompanyEmail,
    p_show_customer_url: showCustomerUrl,
  })
  if (error) throw error
  const next = mapConfiguration(data)
  if (!next.logoKey) return next
  const signed = await refreshSalesReceiptLogoUrl(next.logoKey)
  return { ...next, logoUrl: signed.url }
}

export async function uploadSalesReceiptLogo(file: File): Promise<{ url: string; key: string }> {
  validateLogoFile(file)
  return invokeLogoFunction({ action: 'upload', fileName: file.name, fileType: file.type, fileBase64: await encodeFileBase64(file) })
}

export async function removeSalesReceiptLogo(key: string): Promise<{ key: string; removed: boolean }> {
  return invokeLogoFunction<{ key: string; removed: boolean }>({ action: 'remove', key: validateLogoKey(key) })
}
