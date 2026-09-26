import { createClient } from '@insforge/sdk'

type BrowserEnvironment = Readonly<
  Record<string, string | boolean | undefined>
>

const privilegedKeyPattern =
  /^(?:(?:VITE_)?INSFORGE_)?(?:ADMIN|API|SERVICE_ROLE)_?KEY$/i

export function loadBrowserInsforgeConfig(
  environment: BrowserEnvironment,
  isDevelopment = import.meta.env.DEV,
) {
  const privilegedKey = Object.keys(environment).find((name) =>
    privilegedKeyPattern.test(name),
  )

  if (privilegedKey) {
    throw new Error(`Privileged InsForge key is not allowed in browser config: ${privilegedKey}`)
  }

  const baseUrl = isDevelopment ? window.location.origin : environment.VITE_INSFORGE_URL
  const anonKey = environment.VITE_INSFORGE_ANON_KEY

  if (typeof baseUrl !== 'string' || typeof anonKey !== 'string') {
    throw new Error('VITE_INSFORGE_URL and VITE_INSFORGE_ANON_KEY are required')
  }

  return { baseUrl, anonKey }
}

export const insforge = createClient(loadBrowserInsforgeConfig(import.meta.env))
