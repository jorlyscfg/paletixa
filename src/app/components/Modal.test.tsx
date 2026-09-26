import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

describe('Modal', () => {
  afterEach(() => {
    cleanup()
    document.body.innerHTML = ''
    document.body.style.overflow = ''
  })

  it('provides shared dialog mechanics and restores focus and body scroll', () => {
    const opener = document.createElement('button')
    opener.type = 'button'
    opener.setAttribute('aria-label', 'Abrir modal')
    document.body.append(opener)
    opener.focus()
    const onClose = vi.fn()

    const { unmount } = render(<Modal title="Título" description="Descripción" closeLabel="Cerrar modal" onClose={onClose}>
      <button type="button">Acción</button>
    </Modal>)

    const dialog = screen.getByRole('dialog', { name: 'Título' })
    const closeButton = screen.getByRole('button', { name: 'Cerrar modal' })
    const actionButton = screen.getByRole('button', { name: 'Acción' })
    expect(dialog).toHaveAccessibleDescription('Descripción')
    expect(closeButton).toHaveClass('ops-icon-button')
    expect(closeButton).toHaveFocus()
    expect(document.body.style.overflow).toBe('hidden')

    actionButton.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(closeButton).toHaveFocus()
    closeButton.focus()
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(actionButton).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(dialog.parentElement!)
    expect(onClose).toHaveBeenCalledTimes(2)

    unmount()
    expect(document.body.style.overflow).toBe('')
    expect(opener).toHaveFocus()
  })

  it('disables close behavior while busy', () => {
    const onClose = vi.fn()
    render(<Modal title="Título" closeLabel="Cerrar modal" onClose={onClose} busy>
      <p>Contenido</p>
    </Modal>)

    expect(screen.getByRole('button', { name: 'Cerrar modal' })).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('keeps an active form field focused when the parent rerenders with a new close callback', () => {
    function EditableModal() {
      const [name, setName] = useState('Central')
      const [closedName, setClosedName] = useState('')

      return <Modal title="Editar sucursal" closeLabel="Cerrar modal" onClose={() => setClosedName(name)}>
        <label>Nombre de la sucursal
          <input aria-label="Nombre de la sucursal" value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <output>{closedName}</output>
      </Modal>
    }

    render(<EditableModal />)
    const nameInput = screen.getByRole('textbox', { name: 'Nombre de la sucursal' })
    nameInput.focus()

    fireEvent.change(nameInput, { target: { value: 'Central Norte' } })

    expect(nameInput).toHaveValue('Central Norte')
    expect(nameInput).toHaveFocus()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByText('Central Norte')).toBeInTheDocument()
  })

  it('can focus the dialog instead of the close action without changing default modal focus', () => {
    render(<Modal title="Título" closeLabel="Cerrar modal" onClose={vi.fn()} autoFocusCloseButton={false}>
      <button type="button">Acción</button>
    </Modal>)

    const dialog = screen.getByRole('dialog', { name: 'Título' })
    const closeButton = screen.getByRole('button', { name: 'Cerrar modal' })
    const actionButton = screen.getByRole('button', { name: 'Acción' })
    expect(dialog).toHaveFocus()
    expect(dialog).toHaveClass('focus:outline-none')
    expect(closeButton).not.toHaveFocus()

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(actionButton).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(closeButton).toHaveFocus()
  })

  it('places supplied header actions immediately before the single close action', () => {
    render(<Modal title="Título" closeLabel="Cerrar modal" onClose={vi.fn()} headerActions={<button type="button">Guardar</button>}>
      <p>Contenido</p>
    </Modal>)

    const header = screen.getByRole('heading', { name: 'Título' }).closest('header')
    expect(header).toHaveAttribute('data-modal-header', 'true')
    expect(within(header!).getAllByRole('button').map((button) => button.getAttribute('aria-label') ?? button.textContent)).toEqual(['Guardar', 'Cerrar modal'])
    expect(screen.queryByRole('button', { name: 'Cancelar' })).not.toBeInTheDocument()
  })

  it('allows a modal to keep its body fixed while a child owns scrolling', () => {
    render(<Modal title="Título" closeLabel="Cerrar modal" onClose={vi.fn()} bodyOverflowClassName="overflow-hidden">
      <p>Contenido</p>
    </Modal>)

    const body = screen.getByRole('dialog').querySelector('.min-h-0.flex-1')
    expect(body).toHaveClass('overflow-hidden', 'overscroll-contain')
    expect(body).not.toHaveClass('overflow-y-auto')
  })
})
