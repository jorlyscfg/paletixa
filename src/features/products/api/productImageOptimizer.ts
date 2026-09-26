export const PRODUCT_IMAGE_OUTPUT_TYPE = 'image/webp'
export const PRODUCT_IMAGE_MAX_DIMENSION = 1600
export const PRODUCT_IMAGE_QUALITY = 0.82
export const OPTIMIZABLE_PRODUCT_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const

export class ProductImageOptimizationError extends Error {
  constructor(message = 'Product image could not be optimized in this browser') {
    super(message)
    this.name = 'ProductImageOptimizationError'
  }
}

type DecodedImage = {
  width: number
  height: number
  source: CanvasImageSource
  close?: () => void
}

function optimizationError(cause?: unknown) {
  const detail = cause instanceof Error && cause.message ? `: ${cause.message}` : ''
  return new ProductImageOptimizationError(`Product image could not be optimized in this browser${detail}`)
}

async function decodeProductImage(file: File): Promise<DecodedImage> {
  if (typeof globalThis.createImageBitmap === 'function') {
    try {
      const bitmap = await globalThis.createImageBitmap(file)
      if (bitmap.width <= 0 || bitmap.height <= 0) throw new Error('Image dimensions are invalid')
      return { width: bitmap.width, height: bitmap.height, source: bitmap, close: () => bitmap.close() }
    } catch (error) {
      throw optimizationError(error)
    }
  }

  if (typeof Image !== 'function' || typeof URL.createObjectURL !== 'function') throw optimizationError()

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error('Image decoding failed'))
      element.src = objectUrl
    })
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) throw new Error('Image dimensions are invalid')
    return { width: image.naturalWidth, height: image.naturalHeight, source: image }
  } catch (error) {
    throw optimizationError(error)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function optimizedFileName(fileName: string) {
  const baseName = fileName.replace(/\.[^./\\]+$/u, '') || 'product-image'
  return `${baseName}.webp`
}

export async function optimizeProductImage(file: File) {
  if (!OPTIMIZABLE_PRODUCT_IMAGE_TYPES.includes(file.type as typeof OPTIMIZABLE_PRODUCT_IMAGE_TYPES[number])) throw optimizationError(new Error('Unsupported image type'))
  if (typeof document === 'undefined') throw optimizationError()

  const decoded = await decodeProductImage(file)
  const scale = Math.min(1, PRODUCT_IMAGE_MAX_DIMENSION / Math.max(decoded.width, decoded.height))
  const width = Math.max(1, Math.round(decoded.width * scale))
  const height = Math.max(1, Math.round(decoded.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  try {
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas 2D context is unavailable')
    context.drawImage(decoded.source, 0, 0, width, height)
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((result) => {
        if (!result) {
          reject(new Error('WebP encoding failed'))
          return
        }
        resolve(result)
      }, PRODUCT_IMAGE_OUTPUT_TYPE, PRODUCT_IMAGE_QUALITY)
    })
    if (blob.type !== PRODUCT_IMAGE_OUTPUT_TYPE) throw new Error('WebP encoding is unavailable')
    return new File([blob], optimizedFileName(file.name), { type: PRODUCT_IMAGE_OUTPUT_TYPE, lastModified: file.lastModified })
  } catch (error) {
    throw optimizationError(error)
  } finally {
    decoded.close?.()
  }
}
