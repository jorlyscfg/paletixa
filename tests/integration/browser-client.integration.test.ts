import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

let insforge: typeof import('../../src/lib/insforge').insforge

beforeAll(async () => {
  vi.stubEnv('VITE_INSFORGE_URL', 'https://example.insforge.app')
  vi.stubEnv('VITE_INSFORGE_ANON_KEY', 'public-anon-key')
  ;({ insforge } = await import('../../src/lib/insforge'))
})

afterAll(() => {
  vi.unstubAllEnvs()
})

describe('InsForge browser client integration', () => {
  it('initializes the SDK auth and database modules from public configuration', () => {
    expect(insforge.auth).toBeDefined()
    expect(insforge.database).toBeDefined()
  })
})
