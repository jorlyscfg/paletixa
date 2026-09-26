import { PassThrough } from 'node:stream'
import { describe, expect, it, vi } from 'vitest'
import { createInsforgeProxy, shouldLogInsforgeProxyErrors } from '../../vite.config'

type TestProxyResponse = PassThrough & {
  statusCode: number
  statusMessage: string
  headers: {
    'set-cookie'?: string[]
    'content-type'?: string
  }
}

describe('local InsForge proxy cookies', () => {
  it('rewrites insecure cookie attributes while preserving auth cookie routing', () => {
    const proxyOptions = createInsforgeProxy('https://example.insforge.app')['/api']
    const onProxyResponse = vi.fn()

    proxyOptions.configure?.({ on: onProxyResponse } as never, proxyOptions)

    expect(proxyOptions.cookieDomainRewrite).toBe('')
    expect(proxyOptions.cookiePathRewrite).toBe(false)
    expect(onProxyResponse).toHaveBeenCalledWith('proxyRes', expect.any(Function))

    const proxyResponseHandler = onProxyResponse.mock.calls[0]?.[1] as
      | ((response: { headers: { 'set-cookie'?: string[] } }) => void)
      | undefined
    const proxyResponse = {
      headers: {
        'set-cookie': [
          'refresh_token=secret; Domain=example.insforge.app; Path=/api/auth; Secure; HttpOnly; SameSite=None',
        ],
      },
    }

    proxyResponseHandler?.(proxyResponse)

    expect(proxyResponse.headers['set-cookie']).toEqual([
      'refresh_token=secret; Domain=example.insforge.app; Path=/api/auth; HttpOnly; SameSite=Lax',
    ])
  })

  it('proxies the Socket.IO realtime endpoint over WebSocket', () => {
    const proxy = createInsforgeProxy('https://example.insforge.app')

    expect(proxy['/socket.io'].ws).toBe(true)
    expect(proxy['/realtime'].ws).toBe(true)
    expect(proxy['/api'].ws).toBe(false)
  })

  it('logs opt-in proxy failures without exposing request secrets', () => {
    const proxyOptions = createInsforgeProxy('https://example.insforge.app', true)['/api']
    const onProxyEvent = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      proxyOptions.configure?.({ on: onProxyEvent } as never, proxyOptions)

      const responseHandler = onProxyEvent.mock.calls.find(([event]) => event === 'proxyRes')?.[1] as
        | ((response: { statusCode: number; statusMessage: string; headers: Record<string, string[]> }, request: { method: string; url: string }) => void)
        | undefined
      const errorHandler = onProxyEvent.mock.calls.find(([event]) => event === 'error')?.[1] as
        | ((error: { message: string }, request: { method: string; url: string }) => void)
        | undefined

      responseHandler?.(
        { statusCode: 401, statusMessage: 'Unauthorized', headers: {} },
        { method: 'POST', url: '/api/database/rpc/complete_wholesale_order?access_token=access-token-secret' },
      )
      errorHandler?.(
        { message: 'socket failure token=transport-secret' },
        { method: 'GET', url: '/api/health?api_key=api-key-secret' },
      )

      expect(consoleError).toHaveBeenNthCalledWith(1, '[vite] InsForge proxy POST /api/database/rpc/complete_wholesale_order failed (401)')
      expect(consoleError).toHaveBeenNthCalledWith(2, '[vite] InsForge proxy GET /api transport error')
      const output = consoleError.mock.calls.flat().join(' ')
      expect(output).not.toContain('access-token-secret')
      expect(output).not.toContain('api-key-secret')
      expect(output).not.toContain('transport-secret')
    } finally {
      consoleError.mockRestore()
    }
  })

  it('logs structured JSON fields from a 400 response without consuming the response stream', async () => {
    const proxyOptions = createInsforgeProxy('https://example.insforge.app', true)['/api']
    const onProxyEvent = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const response = Object.assign(new PassThrough(), {
      statusCode: 400,
      statusMessage: 'Bad Request for alice@example.com',
      headers: { 'content-type': 'application/json; charset=utf-8' },
    }) as TestProxyResponse
    const responseBody = JSON.stringify({
      code: '42702',
      message: 'column reference "name" is ambiguous for Alice Example at 123 Main Street; customer_id=customer-9482; alice@example.com; +52 55 1234-5678; token=body-secret',
      details: 'Key (email)=(alice@example.com); external ID user-77291',
      hint: 'Try Alice Example at 123 Main Street; record id 7654321; phone 5512345678; token=body-secret',
    })
    let forwardedBody = ''
    const forwardedResponse = new PassThrough()
    forwardedResponse.on('data', (chunk: Uint8Array) => {
      forwardedBody += new TextDecoder().decode(chunk)
    })

    try {
      proxyOptions.configure?.({ on: onProxyEvent } as never, proxyOptions)
      const responseHandler = onProxyEvent.mock.calls.find(([event]) => event === 'proxyRes')?.[1] as
        | ((response: TestProxyResponse, request: { method: string; url: string }) => void)
        | undefined

      responseHandler?.(response, {
        method: 'POST',
        url: '/api/database/rpc/rename_branch?access_token=query-secret&address=123+Main+Street',
      })
      const forwardingComplete = new Promise<void>((resolve) => {
        forwardedResponse.on('end', () => resolve())
      })
      response.pipe(forwardedResponse)
      response.end(responseBody)
      await forwardingComplete

      expect(forwardedBody).toBe(responseBody)
      expect(consoleError).toHaveBeenNthCalledWith(
        1,
        '[vite] InsForge proxy POST /api/database/rpc/rename_branch failed (400)',
      )
      expect(consoleError).toHaveBeenNthCalledWith(
        2,
        '[vite] InsForge proxy POST /api/database/rpc/rename_branch error code=42702 category=ambiguous SQL reference',
      )
      const output = consoleError.mock.calls.flat().join(' ')
      expect(output).not.toContain('alice@example.com')
      expect(output).not.toContain('Alice Example')
      expect(output).not.toContain('123 Main Street')
      expect(output).not.toContain('customer-9482')
      expect(output).not.toContain('user-77291')
      expect(output).not.toContain('7654321')
      expect(output).not.toContain('5512345678')
      expect(output).not.toContain('body-secret')
      expect(output).not.toContain('query-secret')
      expect(output).not.toContain('Key (email)')
      expect(output).not.toContain('message=')
      expect(output).not.toContain('hint=')
      expect(output).toContain('code=42702')
      expect(output).toContain('category=ambiguous SQL reference')
      expect(output).toContain('/api/database/rpc/rename_branch')
    } finally {
      consoleError.mockRestore()
    }
  })

  it('does not log successful responses or failures from the default proxy mode', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const optInOptions = createInsforgeProxy('https://example.insforge.app', true)['/api']
    const defaultOptions = createInsforgeProxy('https://example.insforge.app')['/api']
    const optInEvents = vi.fn()
    const defaultEvents = vi.fn()

    try {
      optInOptions.configure?.({ on: optInEvents } as never, optInOptions)
      defaultOptions.configure?.({ on: defaultEvents } as never, defaultOptions)
      const optInResponseHandler = optInEvents.mock.calls.find(([event]) => event === 'proxyRes')?.[1] as
        | ((response: { statusCode: number; statusMessage: string; headers: Record<string, string[]> }) => void)
        | undefined
      const defaultResponseHandler = defaultEvents.mock.calls.find(([event]) => event === 'proxyRes')?.[1] as
        | ((response: { statusCode: number; statusMessage: string; headers: Record<string, string[]> }) => void)
        | undefined

      optInResponseHandler?.({ statusCode: 200, statusMessage: 'OK', headers: {} })
      defaultResponseHandler?.({ statusCode: 400, statusMessage: 'Bad Request', headers: {} })

      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('normalizes arbitrary path segments and identifiers to static endpoints', () => {
    const proxyOptions = createInsforgeProxy('https://example.insforge.app', true)['/api']
    const onProxyEvent = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    try {
      proxyOptions.configure?.({ on: onProxyEvent } as never, proxyOptions)
      const responseHandler = onProxyEvent.mock.calls.find(([event]) => event === 'proxyRes')?.[1] as
        | ((response: { statusCode: number; statusMessage: string; headers: Record<string, string[]> }, request: { method: string; url: string }) => void)
        | undefined

      responseHandler?.(
        { statusCode: 400, statusMessage: 'Alice Example', headers: {} },
        { method: 'POST', url: '/api/database/records/Alice-Example/4815162342?address=123+Main+Street' },
      )
      responseHandler?.(
        { statusCode: 400, statusMessage: 'alice@example.com', headers: {} },
        { method: 'POST', url: '/api/database/rpc/alice?email=alice@example.com' },
      )

      expect(consoleError).toHaveBeenNthCalledWith(1, '[vite] InsForge proxy POST /api/database/records failed (400)')
      expect(consoleError).toHaveBeenNthCalledWith(2, '[vite] InsForge proxy POST /api/database/rpc failed (400)')
      const output = consoleError.mock.calls.flat().join(' ')
      expect(output).not.toContain('Alice Example')
      expect(output).not.toContain('4815162342')
      expect(output).not.toContain('123+Main+Street')
      expect(output).not.toContain('alice@example.com')
      expect(output).not.toContain('/rpc/alice')
    } finally {
      consoleError.mockRestore()
    }
  })

  it('logs automatically only for the development server, not preview or production builds', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const contexts = [
      { command: 'serve' as const },
      { command: 'serve' as const, isPreview: true },
      { command: 'build' as const },
    ]

    try {
      for (const context of contexts) {
        const proxyOptions = createInsforgeProxy(
          'https://example.insforge.app',
          shouldLogInsforgeProxyErrors(context),
        )['/api']
        const onProxyEvent = vi.fn()
        proxyOptions.configure?.({ on: onProxyEvent } as never, proxyOptions)
        const responseHandler = onProxyEvent.mock.calls.find(([event]) => event === 'proxyRes')?.[1] as
          | ((response: { statusCode: number; statusMessage: string; headers: Record<string, string[]> }) => void)
          | undefined

        responseHandler?.({ statusCode: 400, statusMessage: 'Bad Request', headers: {} })
      }

      expect(consoleError).toHaveBeenCalledTimes(1)
      expect(consoleError).toHaveBeenCalledWith('[vite] InsForge proxy UNKNOWN /unknown failed (400)')
    } finally {
      consoleError.mockRestore()
    }
  })

  it('falls back to status-only output for malformed, oversized, or unvalidated errors', async () => {
    const proxyOptions = createInsforgeProxy('https://example.insforge.app', true)['/api']
    const onProxyEvent = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const responseBodies = [
      '{"code":',
      JSON.stringify({ code: '23505', details: 'x'.repeat(16 * 1024) }),
      JSON.stringify({ code: 'ALICE', message: 'Alice Example at 123 Main Street' }),
    ]

    try {
      proxyOptions.configure?.({ on: onProxyEvent } as never, proxyOptions)
      const responseHandler = onProxyEvent.mock.calls.find(([event]) => event === 'proxyRes')?.[1] as
        | ((response: TestProxyResponse, request: { method: string; url: string }) => void)
        | undefined

      for (const body of responseBodies) {
        const response = Object.assign(new PassThrough(), {
          statusCode: 400,
          statusMessage: 'Bad Request',
          headers: { 'content-type': 'application/json' },
        }) as TestProxyResponse
        const completed = new Promise<void>((resolve) => response.on('end', () => resolve()))
        responseHandler?.(response, { method: 'POST', url: '/api/database/records/orders' })
        response.end(body)
        await completed
      }

      expect(consoleError).toHaveBeenCalledTimes(3)
      expect(consoleError).toHaveBeenNthCalledWith(
        1,
        '[vite] InsForge proxy POST /api/database/records failed (400)',
      )
      expect(consoleError).toHaveBeenNthCalledWith(
        2,
        '[vite] InsForge proxy POST /api/database/records failed (400)',
      )
      expect(consoleError).toHaveBeenNthCalledWith(
        3,
        '[vite] InsForge proxy POST /api/database/records failed (400)',
      )
      expect(consoleError.mock.calls.flat().join(' ')).not.toContain('Alice Example')
    } finally {
      consoleError.mockRestore()
    }
  })
})
