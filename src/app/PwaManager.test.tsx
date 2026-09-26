import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PwaManager } from './PwaManager'
import { isIosOrIpadOS, isStandaloneDisplayMode } from './pwaEnvironment'

const swMock = vi.hoisted(() => ({
  offlineReady: false,
  needRefresh: false,
  setOfflineReady: vi.fn(),
  setNeedRefresh: vi.fn(),
  updateServiceWorker: vi.fn(async () => undefined),
}))

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    offlineReady: [swMock.offlineReady, swMock.setOfflineReady],
    needRefresh: [swMock.needRefresh, swMock.setNeedRefresh],
    updateServiceWorker: swMock.updateServiceWorker,
  }),
}))

function createBeforeInstallPromptEvent() {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
    prompt: ReturnType<typeof vi.fn>
    userChoice: Promise<{ outcome: 'accepted'; platform: string }>
  }
  event.prompt = vi.fn(async () => undefined)
  event.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'web' })
  return event
}

describe('PwaManager', () => {
  beforeEach(() => {
    swMock.offlineReady = false
    swMock.needRefresh = false
    swMock.setOfflineReady.mockReset()
    swMock.setNeedRefresh.mockReset()
    swMock.updateServiceWorker.mockClear()
    vi.restoreAllMocks()
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0' })
    Object.defineProperty(navigator, 'platform', { configurable: true, value: 'Linux' })
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 0 })
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: vi.fn(() => ({ matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList)) })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it('shows offline readiness in Spanish and only dismisses it on user action', () => {
    swMock.offlineReady = true
    render(<PwaManager />)

    expect(screen.getByRole('status')).toHaveTextContent('Paletixa está lista para usarse sin conexión.')
    expect(screen.getByText(/Los datos y operaciones con InsForge requieren conexión/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar aviso de disponibilidad sin conexión' }))

    expect(swMock.setOfflineReady).toHaveBeenCalledWith(false)
  })

  it('prompts for a new version only after an explicit update action', async () => {
    swMock.needRefresh = true
    render(<PwaManager />)

    expect(screen.getByRole('status')).toHaveTextContent('Hay una nueva versión de Paletixa.')
    expect(swMock.updateServiceWorker).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Actualizar ahora' }))
    await waitFor(() => expect(swMock.updateServiceWorker).toHaveBeenCalledWith(true))
    fireEvent.click(screen.getByRole('button', { name: 'Descartar aviso de nueva versión' }))

    expect(swMock.setNeedRefresh).toHaveBeenCalledWith(false)
  })

  it('captures install capability without opening the browser prompt automatically', async () => {
    render(<PwaManager />)
    const event = createBeforeInstallPromptEvent()
    window.dispatchEvent(event)

    const installButton = await screen.findByRole('button', { name: 'Instalar Paletixa' })
    expect(event.defaultPrevented).toBe(true)
    expect(event.prompt).not.toHaveBeenCalled()
    fireEvent.click(installButton)
    await waitFor(() => expect(event.prompt).toHaveBeenCalledTimes(1))

    window.dispatchEvent(new Event('appinstalled'))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Instalar Paletixa' })).not.toBeInTheDocument())
  })

  it('offers manual iOS instructions and detects standalone display mode safely', () => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone)' })
    render(<PwaManager />)

    expect(screen.getByText(/Compartir → Añadir a pantalla de inicio/)).toBeInTheDocument()
    expect(screen.getByText(/Safari no ofrece un diálogo de instalación automático/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar instrucciones para instalar Paletixa' }))
    expect(screen.queryByText(/Compartir → Añadir a pantalla de inicio/)).not.toBeInTheDocument()

    expect(isIosOrIpadOS()).toBe(true)
    expect(isStandaloneDisplayMode()).toBe(false)
  })

  it('does not advertise installation while already running standalone', () => {
    Object.defineProperty(navigator, 'userAgent', { configurable: true, value: 'Mozilla/5.0 (iPhone)' })
    vi.mocked(window.matchMedia).mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() } as unknown as MediaQueryList)
    render(<PwaManager />)

    expect(isStandaloneDisplayMode()).toBe(true)
    expect(screen.queryByText(/Compartir → Añadir a pantalla de inicio/)).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Instalar Paletixa' })).not.toBeInTheDocument()
  })
})
