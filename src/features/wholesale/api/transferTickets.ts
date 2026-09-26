import { insforge } from '../../../lib/insforge'
import type { EventTransferTicket } from '../../events/api/types'
import type { WholesaleTransferTicket } from './types'

export const WHOLESALE_TRANSFER_TICKET_BUCKET = 'wholesale-transfer-tickets'
export const WHOLESALE_TRANSFER_TICKET_MAX_BYTES = 8 * 1024 * 1024
export const WHOLESALE_TRANSFER_TICKET_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

const WHOLESALE_TRANSFER_TICKET_FUNCTION = 'wholesale-transfer-ticket'
const WHOLESALE_TRANSFER_TICKET_MAX_DIMENSION = 1920
const WHOLESALE_TRANSFER_TICKET_WEBP_QUALITY = 0.82

export type WholesaleTransferTicketCleanupResult = {
  removedKeys: string[]
  retainedKeys: string[]
}

export type WholesaleTransferTicketRemovalResult = {
  key: string
  removed: boolean
  referenced: boolean
}

type WholesaleTransferTicketRequest =
  | { action: 'upload'; fileName: string; fileType: string; fileBase64: string }
  | { action: 'sign'; key: string }
  | { action: 'admin-sign'; orderId: string; key: string }
  | { action: 'remove'; key: string }
  | { action: 'cleanup'; keepKey?: string }

type EventTransferTicketRequest =
  | { action: 'event-upload' | 'event-admin-upload'; requestId: string; fileName: string; fileType: string; fileBase64: string }
  | { action: 'event-sign'; requestId: string; key: string }
  | { action: 'event-admin-sign'; reservationId: string; requestId: string; key: string }
  | { action: 'event-remove' | 'event-admin-remove'; requestId: string; key: string; keepKey?: string }
  | { action: 'event-cleanup' | 'event-admin-cleanup'; requestId: string; keepKey?: string }

function createActionBody<T extends WholesaleTransferTicketRequest['action']>(action: T, sessionToken: string) {
  if (typeof sessionToken !== 'string' || sessionToken.trim() === '') throw new Error('Customer session token is required')
  return { action }
}

async function invokeTransferTicketFunction<T>(sessionToken: string, body: WholesaleTransferTicketRequest): Promise<T> {
  const { data, error } = await insforge.functions.invoke<T>(WHOLESALE_TRANSFER_TICKET_FUNCTION, {
    body,
    headers: { 'X-Wholesale-Session': sessionToken },
  })
  if (error) throw error
  if (data === null || data === undefined) throw new Error('Transfer ticket function returned an empty response')
  return data
}

async function invokeAdminTransferTicketFunction<T>(body: Extract<WholesaleTransferTicketRequest, { action: 'admin-sign' }>): Promise<T> {
  const { data, error } = await insforge.functions.invoke<T>(WHOLESALE_TRANSFER_TICKET_FUNCTION, { body })
  if (error) throw error
  if (data === null || data === undefined) throw new Error('Transfer ticket function returned an empty response')
  return data
}

async function invokeEventTransferTicketFunction<T>(body: EventTransferTicketRequest): Promise<T> {
  const { data, error } = await insforge.functions.invoke<T>(WHOLESALE_TRANSFER_TICKET_FUNCTION, { body })
  if (error) throw error
  if (data === null || data === undefined) throw new Error('Transfer ticket function returned an empty response')
  return data
}

function validateTicketFile(file: File) {
  if (!file || typeof file.type !== 'string' || !Number.isFinite(file.size) || file.size <= 0) {
    throw new Error('El comprobante debe ser un archivo de imagen válido.')
  }
  if (!WHOLESALE_TRANSFER_TICKET_MIME_TYPES.includes(file.type as typeof WHOLESALE_TRANSFER_TICKET_MIME_TYPES[number])) {
    throw new Error('El comprobante debe ser una imagen JPEG, PNG o WebP.')
  }
  if (file.size > WHOLESALE_TRANSFER_TICKET_MAX_BYTES) throw new Error('El comprobante no puede superar 8 MB.')
}

function optimizedFileName(file: File) {
  const baseName = file.name.replace(/\.[^./\\]*$/, '') || 'transfer-ticket'
  return `${baseName}.webp`
}

async function encodeTicketImage(file: File, source: CanvasImageSource, width: number, height: number) {
  if (typeof document === 'undefined') return file

  try {
    const canvas = document.createElement('canvas')
    const context = canvas.getContext('2d')
    if (!context || width <= 0 || height <= 0) return file

    const scale = Math.min(1, WHOLESALE_TRANSFER_TICKET_MAX_DIMENSION / width, WHOLESALE_TRANSFER_TICKET_MAX_DIMENSION / height)
    canvas.width = Math.max(1, Math.round(width * scale))
    canvas.height = Math.max(1, Math.round(height * scale))
    context.drawImage(source, 0, 0, canvas.width, canvas.height)

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', WHOLESALE_TRANSFER_TICKET_WEBP_QUALITY))
    if (!blob || blob.size === 0 || blob.size >= file.size) return file
    return new File([blob], optimizedFileName(file), { type: 'image/webp', lastModified: file.lastModified })
  } catch {
    return file
  }
}

async function optimizeTicketImage(file: File) {
  const imageBitmapFactory = typeof globalThis.createImageBitmap === 'function' ? globalThis.createImageBitmap.bind(globalThis) : null
  if (imageBitmapFactory) {
    try {
      const bitmap = await imageBitmapFactory(file)
      try {
        return await encodeTicketImage(file, bitmap, bitmap.width, bitmap.height)
      } finally {
        bitmap.close()
      }
    } catch {
      // Fall through to the HTMLImageElement path when bitmap decoding is unavailable.
    }
  }

  if (typeof document === 'undefined' || typeof Image === 'undefined' || typeof URL.createObjectURL !== 'function') return file
  try {
    const canvas = document.createElement('canvas')
    if (!canvas.getContext('2d')) return file
  } catch {
    return file
  }

  let objectUrl: string | null = null
  try {
    objectUrl = URL.createObjectURL(file)
    const image = new Image()
    image.decoding = 'async'
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve()
      image.onerror = () => reject(new Error('Image decode failed'))
      image.src = objectUrl as string
    })
    if (typeof image.decode === 'function') await image.decode()
    return await encodeTicketImage(file, image, image.naturalWidth || image.width, image.naturalHeight || image.height)
  } catch {
    return file
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

async function encodeFileBase64(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  let binary = ''
  const chunkSize = 0x6000
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize))
  }
  return btoa(binary)
}

export async function uploadWholesaleTransferTicket(sessionToken: string, file: File): Promise<WholesaleTransferTicket> {
  validateTicketFile(file)
  const optimizedFile = await optimizeTicketImage(file)
  validateTicketFile(optimizedFile)
  const actionBody = createActionBody('upload', sessionToken)

  try {
    const body: WholesaleTransferTicketRequest = {
      ...actionBody,
      fileName: optimizedFile.name,
      fileType: optimizedFile.type,
      fileBase64: await encodeFileBase64(optimizedFile),
    }
    return await invokeTransferTicketFunction<WholesaleTransferTicket>(sessionToken, body)
  } catch {
    throw new Error('No se pudo adjuntar el comprobante. El bucket privado de comprobantes todavía no está disponible; no se usó product-images.')
  }
}

export async function refreshWholesaleTransferTicketUrl(sessionToken: string, key: string): Promise<WholesaleTransferTicket> {
  if (typeof key !== 'string' || key.trim() === '') throw new Error('Transfer ticket key is required')
  const actionBody = createActionBody('sign', sessionToken)
  try {
    const body: WholesaleTransferTicketRequest = { ...actionBody, key }
    return await invokeTransferTicketFunction<WholesaleTransferTicket>(sessionToken, body)
  } catch {
    throw new Error('No se pudo actualizar el comprobante. El pedido se conservó; inténtalo de nuevo.')
  }
}

export async function refreshWholesaleAdminTransferTicketUrl(orderId: string, key: string): Promise<WholesaleTransferTicket> {
  if (typeof orderId !== 'string' || orderId.trim() === '') throw new Error('El identificador del pedido es obligatorio.')
  if (typeof key !== 'string' || key.trim() === '') throw new Error('La clave del comprobante es obligatoria.')

  try {
    return await invokeAdminTransferTicketFunction<WholesaleTransferTicket>({ action: 'admin-sign', orderId: orderId.trim(), key: key.trim() })
  } catch {
    throw new Error('No se pudo actualizar el comprobante del pedido. El pedido se conservó; inténtalo de nuevo.')
  }
}

export async function removeWholesaleTransferTicket(sessionToken: string, key: string): Promise<WholesaleTransferTicketRemovalResult> {
  if (typeof key !== 'string' || key.trim() === '') throw new Error('Transfer ticket key is required')
  const actionBody = createActionBody('remove', sessionToken)
  try {
    const body: WholesaleTransferTicketRequest = { ...actionBody, key }
    return await invokeTransferTicketFunction<WholesaleTransferTicketRemovalResult>(sessionToken, body)
  } catch {
    throw new Error('No se pudo retirar el comprobante. El borrador se conservó; inténtalo de nuevo.')
  }
}

export async function cleanupWholesaleTransferTickets(sessionToken: string, keepKey?: string | null): Promise<WholesaleTransferTicketCleanupResult> {
  const actionBody = createActionBody('cleanup', sessionToken)
  try {
    const body: WholesaleTransferTicketRequest = {
      ...actionBody,
      ...(typeof keepKey === 'string' && keepKey.trim() !== '' ? { keepKey } : {}),
    }
    return await invokeTransferTicketFunction<WholesaleTransferTicketCleanupResult>(sessionToken, body)
  } catch {
    throw new Error('No se pudo confirmar la limpieza segura de comprobantes. El borrador se conservó; inténtalo de nuevo.')
  }
}

function eventRequestId(requestId: string) {
  if (typeof requestId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId.trim())) {
    throw new Error('Event request ID is invalid')
  }
  return requestId.trim().toLowerCase()
}

function eventTicketKey(key: string) {
  if (typeof key !== 'string' || key.trim() === '' || key.length > 512) throw new Error('Event transfer ticket key is required')
  return key.trim()
}

async function uploadEventTicket(requestId: string, file: File, action: 'event-upload' | 'event-admin-upload'): Promise<EventTransferTicket> {
  validateTicketFile(file)
  const optimizedFile = await optimizeTicketImage(file)
  validateTicketFile(optimizedFile)
  const normalizedRequestId = eventRequestId(requestId)
  try {
    return await invokeEventTransferTicketFunction<EventTransferTicket>({
      action,
      requestId: normalizedRequestId,
      fileName: optimizedFile.name,
      fileType: optimizedFile.type,
      fileBase64: await encodeFileBase64(optimizedFile),
    })
  } catch {
    throw new Error('No se pudo adjuntar el comprobante del evento. El bucket privado de comprobantes todavía no está disponible; no se usó product-images.')
  }
}

export function uploadEventTransferTicket(requestId: string, file: File) {
  return uploadEventTicket(requestId, file, 'event-upload')
}

export function uploadAdminEventTransferTicket(requestId: string, file: File) {
  return uploadEventTicket(requestId, file, 'event-admin-upload')
}

export async function refreshEventTransferTicketUrl(requestId: string, key: string): Promise<EventTransferTicket> {
  const normalizedRequestId = eventRequestId(requestId)
  const normalizedKey = eventTicketKey(key)
  try {
    return await invokeEventTransferTicketFunction<EventTransferTicket>({ action: 'event-sign', requestId: normalizedRequestId, key: normalizedKey })
  } catch {
    throw new Error('No se pudo actualizar el comprobante del evento. La solicitud se conservó; inténtalo de nuevo.')
  }
}

export async function refreshAdminEventTransferTicketUrl(reservationId: string, requestId: string, key: string): Promise<EventTransferTicket> {
  if (typeof reservationId !== 'string' || reservationId.trim() === '') throw new Error('El identificador de la reserva es obligatorio.')
  const normalizedRequestId = eventRequestId(requestId)
  const normalizedKey = eventTicketKey(key)
  try {
    return await invokeEventTransferTicketFunction<EventTransferTicket>({ action: 'event-admin-sign', reservationId: reservationId.trim(), requestId: normalizedRequestId, key: normalizedKey })
  } catch {
    throw new Error('No se pudo actualizar el comprobante de la reserva. La reserva se conservó; inténtalo de nuevo.')
  }
}

export async function removeEventTransferTicket(requestId: string, key: string, keepKey?: string): Promise<WholesaleTransferTicketRemovalResult> {
  const normalizedRequestId = eventRequestId(requestId)
  const normalizedKey = eventTicketKey(key)
  try {
    return await invokeEventTransferTicketFunction<WholesaleTransferTicketRemovalResult>({ action: 'event-remove', requestId: normalizedRequestId, key: normalizedKey, ...(keepKey ? { keepKey: eventTicketKey(keepKey) } : {}) })
  } catch {
    throw new Error('No se pudo retirar el comprobante del evento. El borrador se conservó; inténtalo de nuevo.')
  }
}

export async function removeAdminEventTransferTicket(requestId: string, key: string, keepKey?: string): Promise<WholesaleTransferTicketRemovalResult> {
  const normalizedRequestId = eventRequestId(requestId)
  const normalizedKey = eventTicketKey(key)
  try {
    return await invokeEventTransferTicketFunction<WholesaleTransferTicketRemovalResult>({ action: 'event-admin-remove', requestId: normalizedRequestId, key: normalizedKey, ...(keepKey ? { keepKey: eventTicketKey(keepKey) } : {}) })
  } catch {
    throw new Error('No se pudo retirar el comprobante de la reserva. El borrador se conservó; inténtalo de nuevo.')
  }
}

export async function cleanupEventTransferTickets(requestId: string, keepKey?: string | null, admin = false): Promise<WholesaleTransferTicketCleanupResult> {
  const normalizedRequestId = eventRequestId(requestId)
  const normalizedKeepKey = keepKey ? eventTicketKey(keepKey) : undefined
  try {
    return await invokeEventTransferTicketFunction<WholesaleTransferTicketCleanupResult>({
      action: admin ? 'event-admin-cleanup' : 'event-cleanup',
      requestId: normalizedRequestId,
      ...(normalizedKeepKey ? { keepKey: normalizedKeepKey } : {}),
    })
  } catch {
    throw new Error('No se pudo confirmar la limpieza segura de comprobantes del evento. El borrador se conservó; inténtalo de nuevo.')
  }
}
