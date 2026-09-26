import { defineConfig, loadEnv, type ProxyOptions } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

const insforgeProxyPaths = [
  '/api',
  '/rpc',
  '/products',
  '/product_categories',
  '/product_tags',
  '/branches',
  '/buckets',
  '/functions',
  '/realtime',
  '/socket.io',
]

type LocalProxyResponse = {
  statusCode?: number
  statusMessage?: string
  headers: {
    'set-cookie'?: string[]
    'content-type'?: string | string[]
    'content-encoding'?: string | string[]
  }
  on?: (
    event: 'data' | 'end',
    listener: (chunk?: Uint8Array | string) => void,
  ) => void
}

type LocalProxyRequest = {
  method?: string
  url?: string
}

type LocalProxyError = {
  message?: string
}

type ProxyResponseEvents = {
  on(
    event: 'proxyRes',
    listener: (proxyResponse: LocalProxyResponse, request?: LocalProxyRequest) => void,
  ): void
  on(
    event: 'error',
    listener: (error: LocalProxyError, request?: LocalProxyRequest) => void,
  ): void
}

const MAX_PROXY_RESPONSE_BYTES = 16 * 1024
const sqlStateClasses = new Set([
  '00', '01', '02', '03', '08', '09', '0A', '0B', '0C', '0D', '0E', '0F', '0L', '0P', '0S', '0T', '0U', '0V', '0W', '0X', '0Y', '0Z',
  '10', '20', '21', '22', '23', '24', '25', '26', '27', '28', '2B', '2D', '2F', '34', '38', '39', '3B', '3D', '3F', '40', '42', '44', '53', '54', '55', '57', '58',
  'F0', 'HV', 'P0', 'XX',
])
const safeProxyMethods = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'])
const safeRpcNamePattern = /^[a-z][a-z0-9_]{0,62}$/

export function rewriteLocalProxySetCookie(setCookie: string[] | undefined) {
  return setCookie?.map((cookie) => cookie
    .replace(/;\s*Secure(?=\s*(?:;|$))/gi, '')
    .replace(/;\s*SameSite=None(?=\s*(?:;|$))/gi, '; SameSite=Lax'))
}

function proxyRequestPath(request: LocalProxyRequest | undefined) {
  const rawPath = (request?.url ?? '/').split(/[?#]/, 1)[0]
  const segments = rawPath.split('/').filter(Boolean)
  if (segments[0] === 'api') {
    if (segments[1] === 'database') {
      if (segments[2] === 'rpc') {
        const rpcName = segments[3]
        return rpcName && safeRpcNamePattern.test(rpcName) && rpcName.includes('_')
          ? `/api/database/rpc/${rpcName}`
          : '/api/database/rpc'
      }
      return segments[2] === 'records' ? '/api/database/records' : '/api/database'
    }
    if (segments[1] === 'auth') return '/api/auth'
    if (segments[1] === 'storage') return '/api/storage'
    return '/api'
  }

  const rootPath = segments[0] ? `/${segments[0]}` : '/unknown'
  return insforgeProxyPaths.includes(rootPath) ? rootPath : '/unknown'
}

function proxyRequestMethod(request: LocalProxyRequest | undefined) {
  const method = request?.method?.toUpperCase()
  return method && safeProxyMethods.has(method) ? method : 'UNKNOWN'
}

function getSafeProxyErrorCode(value: unknown) {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined
  const code = String(value).toUpperCase()
  if (/^PGRST\d{3}$/.test(code)) return code
  if (/^[0-9A-Z]{5}$/.test(code) && sqlStateClasses.has(code.slice(0, 2))) return code
  return undefined
}

function proxyErrorCategory(code: string | undefined) {
  if (code === '42702') return 'ambiguous SQL reference'
  if (code === '23505') return 'unique constraint violation'
  if (code === '23503') return 'foreign key violation'
  if (code === '23502') return 'not-null constraint violation'
  if (code === '42501') return 'database permission denied'
  if (code?.startsWith('22')) return 'invalid database value'
  if (code?.startsWith('23')) return 'database constraint violation'
  if (code?.startsWith('42')) return 'SQL syntax or access rule error'
  if (code?.startsWith('PGRST')) return 'PostgREST request error'
  return 'backend request error'
}

function proxyResponseHeader(response: LocalProxyResponse, name: 'content-type' | 'content-encoding') {
  const value = response.headers[name]
  return Array.isArray(value) ? value[0] : value
}

function logProxyResponseCode(response: LocalProxyResponse, method: string, path: string) {
  if (!response.on) return
  const contentType = proxyResponseHeader(response, 'content-type')?.split(';', 1)[0].trim().toLowerCase()
  const contentEncoding = proxyResponseHeader(response, 'content-encoding')?.trim().toLowerCase()
  if (!contentType || !(contentType === 'application/json' || (contentType.startsWith('application/') && contentType.endsWith('+json')))) return
  if (contentEncoding && contentEncoding !== 'identity') return

  const chunks: Uint8Array[] = []
  let capturedBytes = 0
  let truncated = false
  response.on('data', (chunk) => {
    if (truncated || chunk === undefined) return
    const bytes = typeof chunk === 'string' ? new TextEncoder().encode(chunk) : chunk
    if (capturedBytes + bytes.byteLength > MAX_PROXY_RESPONSE_BYTES) {
      truncated = true
      chunks.length = 0
      return
    }
    chunks.push(bytes.slice())
    capturedBytes += bytes.byteLength
  })
  response.on('end', () => {
    if (truncated || capturedBytes === 0) return
    const body = new Uint8Array(capturedBytes)
    let offset = 0
    for (const chunk of chunks) {
      body.set(chunk, offset)
      offset += chunk.byteLength
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(new TextDecoder().decode(body))
    } catch {
      return
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return

    const bodyFields = parsed as Record<string, unknown>
    const code = getSafeProxyErrorCode(bodyFields.code)
    if (!code) return

    const terminalConsole = (globalThis as { console?: { error: (value: string) => void } }).console
    terminalConsole?.error(`[vite] InsForge proxy ${method} ${path} error code=${code} category=${proxyErrorCategory(code)}`)
  })
}

function logProxyResponseFailure(response: LocalProxyResponse, request?: LocalProxyRequest) {
  const statusCode = response.statusCode
  if (typeof statusCode !== 'number' || !Number.isInteger(statusCode) || statusCode < 400 || statusCode > 599) return
  const method = proxyRequestMethod(request)
  const path = proxyRequestPath(request)
  const terminalConsole = (globalThis as { console?: { error: (value: string) => void } }).console
  terminalConsole?.error(`[vite] InsForge proxy ${method} ${path} failed (${statusCode})`)
  logProxyResponseCode(response, method, path)
}

function logProxyTransportError(_error: LocalProxyError, request?: LocalProxyRequest) {
  const method = proxyRequestMethod(request)
  const path = proxyRequestPath(request)
  const terminalConsole = (globalThis as { console?: { error: (value: string) => void } }).console
  terminalConsole?.error(`[vite] InsForge proxy ${method} ${path} transport error`)
}

export function createInsforgeProxy(insforgeUrl: string, logErrors = false) {
  const createProxyOptions = (path: string): ProxyOptions => ({
    target: insforgeUrl,
    changeOrigin: true,
    ws: path === '/realtime' || path === '/socket.io',
    cookieDomainRewrite: '',
    cookiePathRewrite: false,
    configure: (proxy) => {
      const responseEvents = proxy as unknown as ProxyResponseEvents
      responseEvents.on('proxyRes', (proxyResponse, request) => {
        proxyResponse.headers['set-cookie'] = rewriteLocalProxySetCookie(
          proxyResponse.headers['set-cookie'],
        )
        if (logErrors) logProxyResponseFailure(proxyResponse, request)
      })
      if (logErrors) responseEvents.on('error', logProxyTransportError)
    },
  })

  return Object.fromEntries(
    insforgeProxyPaths.map((path) => [path, createProxyOptions(path)]),
  )
}

export function shouldLogInsforgeProxyErrors(config: { command: 'build' | 'serve'; isPreview?: boolean }) {
  return config.command === 'serve' && config.isPreview !== true
}

export default defineConfig(({ command, mode, isPreview }) => {
  const environment = loadEnv(mode, '.', 'VITE_')
  const insforgeUrl = environment.VITE_INSFORGE_URL

  if (!insforgeUrl) {
    throw new Error('VITE_INSFORGE_URL is required for the InsForge proxy')
  }

  const proxy = createInsforgeProxy(insforgeUrl, shouldLogInsforgeProxyErrors({ command, isPreview }))

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'prompt',
        injectRegister: 'auto',
        includeManifestIcons: false,
        manifest: {
          id: '/',
          name: "La Paleti'Xa",
          short_name: 'Paletixa',
          description: "Catálogo y operaciones de La Paleti'Xa.",
          lang: 'es',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          display_override: ['standalone', 'minimal-ui', 'browser'],
          theme_color: '#fff8e7',
          background_color: '#fff8e7',
          icons: [
            { src: '/paletixa-icon-v1-192.svg', sizes: '192x192', type: 'image/svg+xml', purpose: 'any' },
            { src: '/paletixa-icon-v1-512.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'any' },
            { src: '/paletixa-icon-v1-512-maskable.svg', sizes: '512x512', type: 'image/svg+xml', purpose: 'maskable' },
          ],
          shortcuts: [
            { name: 'Catálogo', short_name: 'Catálogo', url: '/', icons: [{ src: '/paletixa-icon-v1-192.svg', sizes: '192x192', type: 'image/svg+xml' }] },
            { name: 'Mayoristas', short_name: 'Mayoristas', url: '/mayoristas', icons: [{ src: '/paletixa-icon-v1-192.svg', sizes: '192x192', type: 'image/svg+xml' }] },
            { name: 'Reservas', short_name: 'Reservas', url: '/reservas', icons: [{ src: '/paletixa-icon-v1-192.svg', sizes: '192x192', type: 'image/svg+xml' }] },
          ],
        },
        workbox: {
          cleanupOutdatedCaches: true,
          globPatterns: ['**/*.{js,css,html,ico,svg,png,jpg,jpeg,webp,avif}'],
          navigateFallback: '/',
          navigateFallbackDenylist: [
            /^\/(?:api|rpc|products|product_categories|product_tags|branches|buckets|functions|realtime|socket\.io)(?:\/|$)/,
          ],
        },
        // Keep the development server free of a persistent worker and stale test caches.
        devOptions: { enabled: false },
      }),
    ],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: true,
      proxy,
    },
    preview: { proxy },
  }
})
