import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ functions: { invoke: vi.fn() } }))
vi.mock('../../../lib/insforge', () => ({ insforge: sdk }))
import { cleanupEventTransferTickets, cleanupWholesaleTransferTickets, refreshAdminEventTransferTicketUrl, refreshEventTransferTicketUrl, refreshWholesaleAdminTransferTicketUrl, refreshWholesaleTransferTicketUrl, removeAdminEventTransferTicket, removeEventTransferTicket, uploadAdminEventTransferTicket, uploadEventTransferTicket, removeWholesaleTransferTicket, uploadWholesaleTransferTicket, WHOLESALE_TRANSFER_TICKET_MAX_BYTES } from './transferTickets'

function invocationBody() {
  return sdk.functions.invoke.mock.calls[0]?.[1]?.body as Record<string, unknown>
}

describe('private wholesale transfer ticket storage boundary', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    sdk.functions.invoke.mockResolvedValue({ data: { url: 'https://example.invalid/ticket', key: 'customers/customer-1/file.webp' }, error: null })
  })

  it('optimizes a valid image when browser APIs are available and invokes only the function boundary', async () => {
    const file = new File(['ticket'], 'receipt.webp', { type: 'image/webp' })

    await expect(uploadWholesaleTransferTicket('session-token', file)).resolves.toEqual({ url: 'https://example.invalid/ticket', key: 'customers/customer-1/file.webp' })
    expect(sdk.functions.invoke).toHaveBeenCalledWith('wholesale-transfer-ticket', expect.objectContaining({ headers: { 'X-Wholesale-Session': 'session-token' } }))
    expect(invocationBody()).toMatchObject({ action: 'upload', fileName: 'receipt.webp', fileType: 'image/webp' })
    expect(typeof invocationBody().fileBase64).toBe('string')
    expect(atob(invocationBody().fileBase64 as string)).toBe('ticket')
  })

  it('rejects PDF files before touching the function boundary', async () => {
    const file = new File(['ticket'], 'receipt.pdf', { type: 'application/pdf' })

    await expect(uploadWholesaleTransferTicket('session-token', file)).rejects.toThrow('una imagen JPEG, PNG o WebP')
    expect(sdk.functions.invoke).not.toHaveBeenCalled()
  })

  it('rejects source images larger than 8 MB before optimization or upload', async () => {
    const file = new File([new Uint8Array(WHOLESALE_TRANSFER_TICKET_MAX_BYTES + 1)], 'receipt.png', { type: 'image/png' })

    await expect(uploadWholesaleTransferTicket('session-token', file)).rejects.toThrow('no puede superar 8 MB')
    expect(sdk.functions.invoke).not.toHaveBeenCalled()
  })

  it('rejects empty image files before touching the function boundary', async () => {
    const file = new File([], 'receipt.png', { type: 'image/png' })

    await expect(uploadWholesaleTransferTicket('session-token', file)).rejects.toThrow('archivo de imagen válido')
    expect(sdk.functions.invoke).not.toHaveBeenCalled()
  })

  it('sends remove actions with the custom session header and owned-key candidate', async () => {
    sdk.functions.invoke.mockResolvedValue({ data: { key: 'customers/customer-1/file.webp', removed: true, referenced: false }, error: null })

    await expect(removeWholesaleTransferTicket('session-token', 'customers/customer-1/file.webp')).resolves.toEqual({ key: 'customers/customer-1/file.webp', removed: true, referenced: false })
    expect(sdk.functions.invoke).toHaveBeenCalledWith('wholesale-transfer-ticket', expect.objectContaining({ headers: { 'X-Wholesale-Session': 'session-token' } }))
    expect(invocationBody()).toEqual({ action: 'remove', key: 'customers/customer-1/file.webp' })
  })

  it('refreshes a referenced ticket URL through the signed action and keeps its key', async () => {
    sdk.functions.invoke.mockResolvedValue({ data: { url: 'https://example.invalid/refreshed-ticket', key: 'customers/customer-1/file.webp' }, error: null })

    await expect(refreshWholesaleTransferTicketUrl('session-token', 'customers/customer-1/file.webp')).resolves.toEqual({
      url: 'https://example.invalid/refreshed-ticket',
      key: 'customers/customer-1/file.webp',
    })
    expect(sdk.functions.invoke).toHaveBeenCalledWith('wholesale-transfer-ticket', expect.objectContaining({ headers: { 'X-Wholesale-Session': 'session-token' } }))
    expect(invocationBody()).toEqual({ action: 'sign', key: 'customers/customer-1/file.webp' })
  })

  it('refreshes an admin ticket URL with the order contract and no customer session header', async () => {
    sdk.functions.invoke.mockResolvedValue({ data: { url: 'https://example.invalid/admin-refreshed-ticket', key: 'customers/customer-1/file.webp' }, error: null })

    await expect(refreshWholesaleAdminTransferTicketUrl('order-1', 'customers/customer-1/file.webp')).resolves.toEqual({
      url: 'https://example.invalid/admin-refreshed-ticket',
      key: 'customers/customer-1/file.webp',
    })
    expect(sdk.functions.invoke).toHaveBeenCalledWith('wholesale-transfer-ticket', {
      body: { action: 'admin-sign', orderId: 'order-1', key: 'customers/customer-1/file.webp' },
    })
    expect(sdk.functions.invoke.mock.calls[0]?.[1]).not.toHaveProperty('headers')
  })

  it('sends cleanup actions and optionally preserves a newly uploaded key', async () => {
    sdk.functions.invoke.mockResolvedValue({ data: { removedKeys: [], retainedKeys: ['customers/customer-1/new.webp'] }, error: null })

    await expect(cleanupWholesaleTransferTickets('session-token', 'customers/customer-1/new.webp')).resolves.toEqual({ removedKeys: [], retainedKeys: ['customers/customer-1/new.webp'] })
    expect(sdk.functions.invoke).toHaveBeenCalledWith('wholesale-transfer-ticket', expect.objectContaining({ headers: { 'X-Wholesale-Session': 'session-token' } }))
    expect(invocationBody()).toEqual({ action: 'cleanup', keepKey: 'customers/customer-1/new.webp' })
  })
})

describe('private event transfer ticket storage boundary', () => {
  const requestId = '11111111-1111-4111-8111-111111111111'

  beforeEach(() => {
    vi.resetAllMocks()
    sdk.functions.invoke.mockResolvedValue({ data: { url: 'https://example.invalid/event-ticket', key: `events/${requestId}/file.webp` }, error: null })
  })

  it('uploads a public event receipt without a customer session header and uses the event namespace', async () => {
    const file = new File(['ticket'], 'receipt.webp', { type: 'image/webp' })

    await expect(uploadEventTransferTicket(requestId, file)).resolves.toEqual({ url: 'https://example.invalid/event-ticket', key: `events/${requestId}/file.webp` })
    expect(sdk.functions.invoke).toHaveBeenCalledWith('wholesale-transfer-ticket', expect.objectContaining({ body: expect.objectContaining({ action: 'event-upload', requestId }) }))
    expect(sdk.functions.invoke.mock.calls[0]?.[1]).not.toHaveProperty('headers')
  })

  it('uploads an admin event receipt with a separate authorized action', async () => {
    const file = new File(['ticket'], 'receipt.webp', { type: 'image/webp' })

    await uploadAdminEventTransferTicket(requestId, file)
    expect(sdk.functions.invoke).toHaveBeenCalledWith('wholesale-transfer-ticket', expect.objectContaining({ body: expect.objectContaining({ action: 'event-admin-upload', requestId }) }))
  })

  it('keeps public event remove and sign actions scoped to the request namespace', async () => {
    const key = `events/${requestId}/file.webp`

    sdk.functions.invoke.mockResolvedValue({ data: { key, removed: true, referenced: false }, error: null })
    await expect(removeEventTransferTicket(requestId, key)).resolves.toEqual({ key, removed: true, referenced: false })
    expect(sdk.functions.invoke).toHaveBeenCalledWith('wholesale-transfer-ticket', { body: { action: 'event-remove', requestId, key } })

    sdk.functions.invoke.mockResolvedValue({ data: { url: 'https://example.invalid/refreshed-event-ticket', key }, error: null })
    await expect(refreshEventTransferTicketUrl(requestId, key)).resolves.toEqual({ url: 'https://example.invalid/refreshed-event-ticket', key })
    expect(sdk.functions.invoke).toHaveBeenLastCalledWith('wholesale-transfer-ticket', { body: { action: 'event-sign', requestId, key } })
  })

  it('uses the admin reservation contract for event signed URLs and cleanup', async () => {
    const key = `events/${requestId}/file.webp`
    sdk.functions.invoke.mockResolvedValue({ data: { url: 'https://example.invalid/admin-event-ticket', key }, error: null })

    await expect(refreshAdminEventTransferTicketUrl('reservation-1', requestId, key)).resolves.toEqual({ url: 'https://example.invalid/admin-event-ticket', key })
    expect(sdk.functions.invoke).toHaveBeenCalledWith('wholesale-transfer-ticket', { body: { action: 'event-admin-sign', reservationId: 'reservation-1', requestId, key } })

    sdk.functions.invoke.mockResolvedValue({ data: { removedKeys: [], retainedKeys: [key] }, error: null })
    await expect(cleanupEventTransferTickets(requestId, key, true)).resolves.toEqual({ removedKeys: [], retainedKeys: [key] })
    expect(sdk.functions.invoke).toHaveBeenLastCalledWith('wholesale-transfer-ticket', { body: { action: 'event-admin-cleanup', requestId, keepKey: key } })
  })

  it('keeps a replacement event receipt while removing the abandoned key', async () => {
    const oldKey = `events/${requestId}/old.webp`
    const newKey = `events/${requestId}/new.webp`
    sdk.functions.invoke.mockResolvedValue({ data: { key: oldKey, removed: true, referenced: false }, error: null })

    await removeAdminEventTransferTicket(requestId, oldKey, newKey)

    expect(sdk.functions.invoke).toHaveBeenCalledWith('wholesale-transfer-ticket', {
      body: { action: 'event-admin-remove', requestId, key: oldKey, keepKey: newKey },
    })
  })
})
