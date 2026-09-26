import { useRef, useState } from 'react'
import { Modal } from './Modal'
import { ResponsiveActionButton } from './ResponsiveActionButton'

export type LogoutConfirmationVariant = 'admin' | 'wholesale'

type LogoutConfirmationModalProps = {
  open: boolean
  variant: LogoutConfirmationVariant
  onClose: () => void
  onConfirm: () => void | Promise<void>
}

const copy: Record<LogoutConfirmationVariant, {
  title: string
  description: string
  message: string
}> = {
  admin: {
    title: '¿Cerrar la sesión administrativa?',
    description: 'Estás a punto de cerrar la sesión de administración.',
    message: 'Se cerrará tu acceso al espacio administrativo.',
  },
  wholesale: {
    title: '¿Cerrar la sesión del portal mayorista?',
    description: 'Estás a punto de cerrar la sesión del portal mayorista.',
    message: 'Se cerrará tu sesión del portal mayorista. Tu borrador local se conservará.',
  },
}

export function LogoutConfirmationModal({ open, variant, onClose, onConfirm }: LogoutConfirmationModalProps) {
  const [busy, setBusy] = useState(false)
  const confirmingRef = useRef(false)
  const modalCopy = copy[variant]

  if (!open) return null

  async function confirmLogout() {
    if (confirmingRef.current) return
    confirmingRef.current = true
    setBusy(true)
    try {
      await onConfirm()
      onClose()
    } finally {
      confirmingRef.current = false
      setBusy(false)
    }
  }

  return <Modal
    title={modalCopy.title}
    description={modalCopy.description}
    closeLabel="Cancelar cierre de sesión"
    onClose={onClose}
    busy={busy}
    closeDisabled={busy}
    maxWidthClassName="max-w-md"
    headerActions={<ResponsiveActionButton type="button" label="Cerrar sesión" icon="power" showLabel loading={busy} loadingLabel="Cerrando sesión…" onClick={() => void confirmLogout()} className="bg-rose-600 text-white hover:bg-rose-500" />}
  >
    <div className="grid gap-4 p-4 sm:p-6">
      <p className="text-sm leading-relaxed text-slate-300">{modalCopy.message} Confirma si deseas continuar.</p>
      <div className="flex justify-end border-t border-slate-800 pt-4">
        <ResponsiveActionButton type="button" label="Cancelar" icon="close" showLabel disabled={busy} onClick={onClose} />
      </div>
    </div>
  </Modal>
}
