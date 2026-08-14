import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

let loadBrowserInsforgeConfig: typeof import('./insforge').loadBrowserInsforgeConfig

beforeAll(async () => {
  vi.stubEnv('VITE_INSFORGE_URL', 'https://example.insforge.app')
  vi.stubEnv('VITE_INSFORGE_ANON_KEY', 'public-anon-key')
  ;({ loadBrowserInsforgeConfig } = await import('./insforge'))
})

afterAll(() => {
  vi.unstubAllEnvs()
})

describe('browser InsForge configuration', () => {
  it.each(['apiKey', 'VITE_INSFORGE_ADMIN_KEY'])(
    'rejects privileged key %s',
    (key) => {
      expect(() =>
        loadBrowserInsforgeConfig({
          VITE_INSFORGE_URL: 'https://example.insforge.app',
          VITE_INSFORGE_ANON_KEY: 'public-anon-key',
          [key]: 'must-not-reach-the-browser',
        }),
      ).toThrow(`Privileged InsForge key is not allowed in browser config: ${key}`)
    },
  )
})
