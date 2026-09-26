import { afterEach, describe, expect, it, vi } from 'vitest'
import { createBranchRequestId } from './requestId'

describe('createBranchRequestId', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('prefers the native randomUUID implementation', () => {
    const randomUUID = vi.fn(() => 'native-uuid')
    vi.stubGlobal('crypto', { randomUUID })

    expect(createBranchRequestId()).toBe('native-uuid')
    expect(randomUUID).toHaveBeenCalledOnce()
  })

  it('creates an RFC 4122 UUID v4 with getRandomValues when randomUUID is unavailable', () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => {
      bytes.fill(0)
      return bytes
    })
    vi.stubGlobal('crypto', { getRandomValues })

    expect(createBranchRequestId()).toBe('00000000-0000-4000-8000-000000000000')
    expect(getRandomValues).toHaveBeenCalledOnce()
  })

  it('keeps a UUID v4 format when Web Crypto is unavailable', () => {
    vi.stubGlobal('crypto', undefined)
    vi.spyOn(Math, 'random').mockReturnValue(0)

    expect(createBranchRequestId()).toBe('00000000-0000-4000-8000-000000000000')
  })
})
