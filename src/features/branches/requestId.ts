export function createBranchRequestId() {
  const cryptoApi = globalThis.crypto
  const randomUUID = cryptoApi?.randomUUID
  if (typeof randomUUID === 'function') return randomUUID.call(cryptoApi)

  const bytes = new Uint8Array(16)
  const getRandomValues = cryptoApi?.getRandomValues
  if (typeof getRandomValues === 'function') {
    getRandomValues.call(cryptoApi, bytes)
  } else {
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256)
  }

  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hexadecimal = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  return `${hexadecimal.slice(0, 8)}-${hexadecimal.slice(8, 12)}-${hexadecimal.slice(12, 16)}-${hexadecimal.slice(16, 20)}-${hexadecimal.slice(20)}`
}
