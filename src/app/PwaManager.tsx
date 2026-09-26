import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { isIosOrIpadOS, isStandaloneDisplayMode } from './pwaEnvironment'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function PwaManager() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({ immediate: true })
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [standalone, setStandalone] = useState(isStandaloneDisplayMode)
  const [iosFallbackDismissed, setIosFallbackDismissed] = useState(false)
  const [installBusy, setInstallBusy] = useState(false)
  const [updateBusy, setUpdateBusy] = useState(false)

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event) => {
      const promptEvent = event as BeforeInstallPromptEvent
      if (typeof promptEvent.prompt !== 'function') return
      event.preventDefault()
      setInstallPrompt(promptEvent)
    }
    const handleAppInstalled = () => {
      setInstallPrompt(null)
      setInstalled(true)
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleAppInstalled)
    }
  }, [])

  useEffect(() => {
    const displayMode = window.matchMedia?.('(display-mode: standalone)')
    if (!displayMode) return
    const handleDisplayModeChange = () => setStandalone(isStandaloneDisplayMode())
    displayMode.addEventListener?.('change', handleDisplayModeChange)
    return () => displayMode.removeEventListener?.('change', handleDisplayModeChange)
  }, [])

  async function handleInstall() {
    if (!installPrompt || installBusy) return
    setInstallBusy(true)
    try {
      await installPrompt.prompt()
      const choice = await installPrompt.userChoice
      if (choice.outcome === 'accepted' || choice.outcome === 'dismissed') setInstallPrompt(null)
    } catch {
      setInstallPrompt(null)
    } finally {
      setInstallBusy(false)
    }
  }

  async function handleUpdate() {
    if (updateBusy) return
    setUpdateBusy(true)
    try {
      await updateServiceWorker(true)
    } catch {
      setUpdateBusy(false)
    } finally {
      setUpdateBusy(false)
    }
  }

  const showInstallPrompt = !standalone && !installed && installPrompt !== null
  const showIosFallback = !standalone && !installed && isIosOrIpadOS() && !iosFallbackDismissed
  if (!offlineReady && !needRefresh && !showInstallPrompt && !showIosFallback) return null

  return <aside className="pwa-manager" aria-label="Estado e instalación de Paletixa">
    <div className="pwa-manager__stack">
      {needRefresh && <section className="pwa-manager__surface pwa-manager__surface--update" role="status" aria-live="polite" aria-atomic="true">
        <div className="pwa-manager__header">
          <span className="pwa-manager__mark" aria-hidden="true">↻</span>
          <div className="pwa-manager__copy-wrap">
            <p className="pwa-manager__title">Hay una nueva versión de Paletixa.</p>
            <p className="pwa-manager__copy">Actualiza cuando estés listo; no se recargará automáticamente.</p>
          </div>
          <button type="button" className="pwa-manager__close" aria-label="Descartar aviso de nueva versión" onClick={() => setNeedRefresh(false)}>×</button>
        </div>
        <div className="pwa-manager__actions">
          <button type="button" className="pwa-manager__button pwa-manager__button--primary" onClick={() => void handleUpdate()} disabled={updateBusy} aria-busy={updateBusy}>{updateBusy ? 'Actualizando…' : 'Actualizar ahora'}</button>
          <button type="button" className="pwa-manager__button pwa-manager__button--secondary" onClick={() => setNeedRefresh(false)}>Más tarde</button>
        </div>
      </section>}

      {!needRefresh && offlineReady && <section className="pwa-manager__surface" role="status" aria-live="polite" aria-atomic="true">
        <div className="pwa-manager__header">
          <span className="pwa-manager__mark pwa-manager__mark--ready" aria-hidden="true">✓</span>
          <div className="pwa-manager__copy-wrap">
            <p className="pwa-manager__title">Paletixa está lista para usarse sin conexión.</p>
            <p className="pwa-manager__copy">La app shell está disponible. Los datos y operaciones con InsForge requieren conexión.</p>
          </div>
          <button type="button" className="pwa-manager__close" aria-label="Cerrar aviso de disponibilidad sin conexión" onClick={() => setOfflineReady(false)}>×</button>
        </div>
      </section>}

      {showInstallPrompt && <section className="pwa-manager__surface" aria-labelledby="pwa-install-title">
        <div className="pwa-manager__header">
          <span className="pwa-manager__mark pwa-manager__mark--install" aria-hidden="true">P</span>
          <div className="pwa-manager__copy-wrap">
            <p id="pwa-install-title" className="pwa-manager__title">Lleva Paletixa contigo.</p>
            <p className="pwa-manager__copy">Instálala para abrirla como una aplicación desde tu dispositivo.</p>
          </div>
          <button type="button" className="pwa-manager__close" aria-label="Ocultar opción para instalar Paletixa" onClick={() => setInstallPrompt(null)}>×</button>
        </div>
        <div className="pwa-manager__actions">
          <button type="button" className="pwa-manager__button pwa-manager__button--primary" onClick={() => void handleInstall()} disabled={installBusy} aria-busy={installBusy}>{installBusy ? 'Abriendo instalación…' : 'Instalar Paletixa'}</button>
          <button type="button" className="pwa-manager__button pwa-manager__button--secondary" onClick={() => setInstallPrompt(null)}>Ahora no</button>
        </div>
      </section>}

      {showIosFallback && <section className="pwa-manager__surface" aria-labelledby="pwa-ios-title">
        <div className="pwa-manager__header">
          <span className="pwa-manager__mark pwa-manager__mark--install" aria-hidden="true">P</span>
          <div className="pwa-manager__copy-wrap">
            <p id="pwa-ios-title" className="pwa-manager__title">Instala Paletixa en tu iPhone o iPad.</p>
            <p className="pwa-manager__copy">En Safari, toca <strong>Compartir → Añadir a pantalla de inicio</strong>. Safari no ofrece un diálogo de instalación automático aquí.</p>
          </div>
          <button type="button" className="pwa-manager__close" aria-label="Ocultar instrucciones para instalar Paletixa" onClick={() => setIosFallbackDismissed(true)}>×</button>
        </div>
      </section>}
    </div>
  </aside>
}
