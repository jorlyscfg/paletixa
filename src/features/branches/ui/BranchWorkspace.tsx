import { type FormEvent, type KeyboardEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CustomSelect } from '../../../app/components/CustomSelect'
import { Modal } from '../../../app/components/Modal'
import { ResponsiveActionButton } from '../../../app/components/ResponsiveActionButton'
import { SearchInput } from '../../../app/components/SearchInput'
import { Icon } from '../../../app/components/icons'
import { isSessionBoolean, isSessionRecord, isSessionString, useAdminSessionPersistence } from '../../../app/sessionPersistence'
import { createBranch, listBranches, renameBranch, setBranchStatus, type Branch } from '../api/branches'
import { createEmployee, listEmployees, setEmployeePassword, setEmployeeStatus, updateEmployee, type CreateEmployeeInput, type Employee, type EmployeeProvisioningError, type EmployeeStatus } from '../api/employees'
import { createBranchRequestId } from '../requestId'

type BranchMutation =
  | { kind: 'create'; name: string; requestId: string }
  | { kind: 'rename'; branch: Branch; name: string; requestId: string }
  | { kind: 'status'; branch: Branch; status: Branch['status']; requestId: string }
  | { kind: 'delete'; branch: Branch; requestId: string }
type FailedBranch = Extract<BranchMutation, { kind: 'create' | 'status' }>
type EmployeeAction = { kind: 'create'; input: CreateEmployeeInput } | { kind: 'status'; employee: Employee; status: EmployeeStatus }
type FailedEmployee = { kind: 'status'; employee: Employee; status: EmployeeStatus; error?: EmployeeProvisioningError }
type BranchTab = 'branches' | 'employees'
type EmployeeDialog = { kind: 'edit'; employee: Employee } | { kind: 'password'; employee: Employee }
type BranchSessionState = {
  activeTab: BranchTab
  employeeSearch: string
  employeeBranchId: string
  newBranchName: string
  employeeCreateDialogOpen: boolean
  createDisplayName: string
  createUsername: string
  employeeDialog: { kind: 'edit' | 'password'; userId: string; displayName: string; username: string; branchId: string } | null
}

function isBranchSessionState(value: unknown): value is BranchSessionState {
  if (!isSessionRecord(value) || !isSessionString(value.activeTab) || !['branches', 'employees'].includes(value.activeTab) || !isSessionString(value.employeeSearch) || !isSessionString(value.employeeBranchId) || !isSessionString(value.newBranchName) || !isSessionBoolean(value.employeeCreateDialogOpen) || !isSessionString(value.createDisplayName) || !isSessionString(value.createUsername)) return false
  if (value.employeeDialog === null) return true
  const dialog = value.employeeDialog
  return isSessionRecord(dialog) && isSessionString(dialog.kind) && ['edit', 'password'].includes(dialog.kind) && isSessionString(dialog.userId) && isSessionString(dialog.displayName) && isSessionString(dialog.username) && isSessionString(dialog.branchId)
}

const branchTabs: { key: BranchTab; label: string }[] = [
  { key: 'branches', label: 'Sucursales' },
  { key: 'employees', label: 'Empleados' },
]

function employeeStatusLabel(status: EmployeeStatus) {
  return status === 'active' ? 'Activo' : 'Suspendido'
}

export function BranchWorkspace() {
  const persistence = useAdminSessionPersistence()
  const sessionModule = 'branches'
  const [restoredSession] = useState<BranchSessionState | null>(() => persistence?.read(sessionModule, isBranchSessionState) ?? null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchState, setBranchState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [branchFailure, setBranchFailure] = useState<FailedBranch | null>(null)
  const [employeeState, setEmployeeState] = useState<'loading' | 'ready' | 'error'>('loading')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [employeeFailure, setEmployeeFailure] = useState<FailedEmployee | null>(null)
  const [activeTab, setActiveTab] = useState<BranchTab>(restoredSession?.activeTab ?? 'branches')
  const [employeeSearch, setEmployeeSearch] = useState(restoredSession?.employeeSearch ?? '')
  const [employeeBranchId, setEmployeeBranchId] = useState(restoredSession?.employeeBranchId ?? '')
  const [newBranchName, setNewBranchName] = useState(restoredSession?.newBranchName ?? '')
  const [editingBranch, setEditingBranch] = useState<Branch | null>(null)
  const [branchEditName, setBranchEditName] = useState('')
  const [branchEditRequestId, setBranchEditRequestId] = useState('')
  const [branchEditError, setBranchEditError] = useState('')
  const [deletingBranch, setDeletingBranch] = useState<Branch | null>(null)
  const [branchDeleteRequestId, setBranchDeleteRequestId] = useState('')
  const [branchDeleteError, setBranchDeleteError] = useState('')
  const [showEmployeePassword, setShowEmployeePassword] = useState(false)
  const [employeeCreateDialogOpen, setEmployeeCreateDialogOpen] = useState(restoredSession?.employeeCreateDialogOpen ?? false)
  const [employeeDialog, setEmployeeDialog] = useState<EmployeeDialog | null>(null)
  const [editDisplayName, setEditDisplayName] = useState('')
  const [editUsername, setEditUsername] = useState('')
  const [editBranchId, setEditBranchId] = useState('')
  const [createDisplayName, setCreateDisplayName] = useState(restoredSession?.createDisplayName ?? '')
  const [createUsername, setCreateUsername] = useState(restoredSession?.createUsername ?? '')
  const [newEmployeePassword, setNewEmployeePassword] = useState('')
  const [newEmployeePasswordConfirmation, setNewEmployeePasswordConfirmation] = useState('')
  const [showNewEmployeePassword, setShowNewEmployeePassword] = useState(false)
  const [showNewEmployeePasswordConfirmation, setShowNewEmployeePasswordConfirmation] = useState(false)
  const [employeeDialogError, setEmployeeDialogError] = useState('')
  const [employeeDialogValidationError, setEmployeeDialogValidationError] = useState('')
  const [employeeValidationError, setEmployeeValidationError] = useState('')
  const [notice, setNotice] = useState('')
  const [employeeNotice, setEmployeeNotice] = useState('')
  const [mutating, setMutating] = useState(false)
  const [employeeMutating, setEmployeeMutating] = useState(false)
  const branchMutation = useRef(false)
  const employeeMutation = useRef(false)
  const readSequence = useRef(0)
  const employeeReadSequence = useRef(0)
  const alert = useRef<HTMLDivElement>(null)
  const employeeAlert = useRef<HTMLDivElement>(null)
  const employeeCreateAlert = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const dialog = employeeDialog ? { kind: employeeDialog.kind, userId: employeeDialog.employee.userId, displayName: editDisplayName, username: editUsername, branchId: editBranchId } : null
    persistence?.write(sessionModule, { activeTab, employeeSearch, employeeBranchId, newBranchName, employeeCreateDialogOpen, createDisplayName, createUsername, employeeDialog: dialog })
  }, [activeTab, createDisplayName, createUsername, editBranchId, editDisplayName, editUsername, employeeBranchId, employeeCreateDialogOpen, employeeDialog, employeeSearch, newBranchName, persistence, sessionModule])

  const load = useCallback(async () => {
    if (branchMutation.current) return
    const current = ++readSequence.current
    setBranchState('loading')
    try {
      const next = await listBranches()
      if (current === readSequence.current) {
        setBranches(next)
        setBranchState('ready')
      }
    } catch {
      if (current === readSequence.current) setBranchState('error')
    }
  }, [])

  const loadEmployees = useCallback(async () => {
    if (employeeMutation.current) return
    const current = ++employeeReadSequence.current
    setEmployeeState('loading')
    try {
      const next = await listEmployees()
      if (current === employeeReadSequence.current) {
        setEmployees(next)
        const restoredDialog = restoredSession?.employeeDialog
        const restoredEmployee = restoredDialog ? next.find((employee) => employee.userId === restoredDialog.userId) : undefined
        if (restoredDialog && restoredEmployee) {
          setEmployeeDialog({ kind: restoredDialog.kind, employee: restoredEmployee })
          setEditDisplayName(restoredDialog.displayName)
          setEditUsername(restoredDialog.username)
          setEditBranchId(restoredDialog.branchId)
        }
        setEmployeeState('ready')
      }
    } catch {
      if (current === employeeReadSequence.current) setEmployeeState('error')
    }
  }, [restoredSession])

  useEffect(() => { queueMicrotask(() => { void load(); void loadEmployees() }) }, [load, loadEmployees])
  useLayoutEffect(() => {
    if (activeTab === 'branches' && (branchState === 'error' || branchFailure)) alert.current?.focus()
    if (activeTab === 'employees' && (employeeState === 'error' || employeeFailure)) employeeAlert.current?.focus()
  }, [activeTab, branchState, branchFailure, employeeState, employeeFailure])
  useEffect(() => {
    if (!employeeCreateDialogOpen || (!employeeDialogError && !employeeValidationError)) return
    queueMicrotask(() => employeeCreateAlert.current?.focus())
  }, [employeeCreateDialogOpen, employeeDialogError, employeeValidationError])

  function mergeBranch(next: Branch) {
    setBranches((items) => [...items.filter(({ id }) => id !== next.id), next].sort((a, b) => a.name.localeCompare(b.name)))
    setEmployees((items) => items.map((employee) => employee.branchId === next.id
      ? { ...employee, branchName: next.name, branchStatus: next.status }
      : employee))
  }

  function mergeEmployee(next: Employee) {
    setEmployees((items) => [...items.filter(({ userId }) => userId !== next.userId), next].sort((a, b) => a.displayName.localeCompare(b.displayName)))
  }

  function clearEmployeeDialog() {
    setEmployeeDialog(null)
    setEditDisplayName('')
    setEditUsername('')
    setEditBranchId('')
    setNewEmployeePassword('')
    setNewEmployeePasswordConfirmation('')
    setShowNewEmployeePassword(false)
    setShowNewEmployeePasswordConfirmation(false)
    setEmployeeDialogError('')
    setEmployeeDialogValidationError('')
  }

  function openBranchEditor(branch: Branch) {
    if (mutating || employeeMutating) return
    setEditingBranch(branch)
    setBranchEditName(branch.name)
    setBranchEditRequestId(createBranchRequestId())
    setBranchEditError('')
  }

  function closeBranchEditor() {
    setEditingBranch(null)
    setBranchEditName('')
    setBranchEditRequestId('')
    setBranchEditError('')
  }

  function openBranchRemoval(branch: Branch) {
    if (mutating || employeeMutating) return
    setDeletingBranch(branch)
    setBranchDeleteRequestId(createBranchRequestId())
    setBranchDeleteError('')
  }

  function closeBranchRemoval() {
    setDeletingBranch(null)
    setBranchDeleteRequestId('')
    setBranchDeleteError('')
  }

  function openEmployeeCreateDialog() {
    if (employeeMutating) return
    setEmployeeCreateDialogOpen(true)
    setEmployeeBranchId('')
    setShowEmployeePassword(false)
    setEmployeeDialogError('')
    setEmployeeValidationError('')
  }

  function closeEmployeeCreateDialog() {
    setEmployeeCreateDialogOpen(false)
    setEmployeeBranchId('')
    setCreateDisplayName('')
    setCreateUsername('')
    setShowEmployeePassword(false)
    setEmployeeDialogError('')
    setEmployeeValidationError('')
  }

  function openEditEmployee(employee: Employee) {
    if (employeeMutating) return
    setEmployeeDialog({ kind: 'edit', employee })
    setEditDisplayName(employee.displayName)
    setEditUsername(employee.username)
    setEditBranchId(employee.branchId)
    setEmployeeDialogError('')
    setEmployeeDialogValidationError('')
  }

  function openPasswordDialog(employee: Employee) {
    if (employeeMutating) return
    setEmployeeDialog({ kind: 'password', employee })
    setNewEmployeePassword('')
    setNewEmployeePasswordConfirmation('')
    setShowNewEmployeePassword(false)
    setShowNewEmployeePasswordConfirmation(false)
    setEmployeeDialogError('')
    setEmployeeDialogValidationError('')
  }

  function employeeMutationErrorMessage(error: unknown, fallback: string) {
    if (typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'EMPLOYEE_USERNAME_TAKEN') {
      return 'Ese usuario ya existe. Elige otro usuario para continuar.'
    }
    return fallback
  }

  function employeeCreateErrorMessage(error: unknown) {
    if (typeof error === 'object' && error !== null) {
      const code = (error as { code?: unknown }).code
      if (code === 'EMPLOYEE_USERNAME_TAKEN') return 'Ese usuario ya existe. Elige otro usuario para continuar.'
      if (code === 'EMPLOYEE_CLEANUP_REQUIRED') return 'No se pudo completar la creación. El acceso requiere recuperación administrativa antes de volver a intentarlo.'
    }
    return 'No se pudo crear el empleado.'
  }

  async function saveEmployeeEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!employeeDialog || employeeDialog.kind !== 'edit' || employeeMutation.current) return
    if (!editBranchId) {
      setEmployeeDialogValidationError('Selecciona una sucursal activa.')
      return
    }
    const input = {
      userId: employeeDialog.employee.userId,
      username: editUsername.trim(),
      displayName: editDisplayName.trim(),
      branchId: editBranchId,
    }
    employeeMutation.current = true
    setEmployeeMutating(true)
    ++employeeReadSequence.current
    setEmployeeDialogError('')
    setEmployeeDialogValidationError('')
    setEmployeeNotice('')
    try {
      const result = await updateEmployee(input)
      mergeEmployee(result)
      setEmployeeState('ready')
      setEmployeeNotice('Datos del empleado actualizados.')
      clearEmployeeDialog()
    } catch (error) {
      setEmployeeDialogError(employeeMutationErrorMessage(error, 'No se pudieron actualizar los datos del empleado.'))
    } finally {
      employeeMutation.current = false
      setEmployeeMutating(false)
    }
  }

  async function saveEmployeePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!employeeDialog || employeeDialog.kind !== 'password' || employeeMutation.current) return
    if (newEmployeePassword !== newEmployeePasswordConfirmation) {
      setEmployeeDialogValidationError('Las contraseñas no coinciden.')
      return
    }
    if (newEmployeePassword.length < 6 || newEmployeePassword.length > 128) {
      setEmployeeDialogValidationError('La contraseña debe tener entre 6 y 128 caracteres.')
      return
    }

    const password = newEmployeePassword
    const userId = employeeDialog.employee.userId
    setNewEmployeePassword('')
    setNewEmployeePasswordConfirmation('')
    setEmployeeDialogValidationError('')
    setEmployeeDialogError('')
    employeeMutation.current = true
    setEmployeeMutating(true)
    setEmployeeNotice('')
    try {
      await setEmployeePassword({ userId, password })
      setEmployeeNotice('Contraseña actualizada.')
      clearEmployeeDialog()
    } catch (error) {
      setEmployeeDialogError(employeeMutationErrorMessage(error, 'No se pudo cambiar la contraseña. Vuelve a ingresarla para continuar.'))
    } finally {
      employeeMutation.current = false
      setEmployeeMutating(false)
    }
  }

  async function runBranch(action: BranchMutation): Promise<boolean> {
    if (branchMutation.current) return false
    branchMutation.current = true
    setMutating(true)
    ++readSequence.current
    setBranchFailure(null)
    setNotice('')
    if (action.kind === 'rename') setBranchEditError('')
    if (action.kind === 'delete') setBranchDeleteError('')
    try {
      const result = action.kind === 'create'
        ? await createBranch(action.name, action.requestId)
        : action.kind === 'rename'
          ? await renameBranch(action.branch.id, action.name, action.requestId)
          : await setBranchStatus(action.branch.id, action.kind === 'delete' ? 'suspended' : action.status, action.requestId)
      mergeBranch(result)
      setBranchState('ready')
      setNotice(action.kind === 'create'
        ? 'Sucursal creada.'
        : action.kind === 'rename'
          ? 'Nombre de la sucursal actualizado.'
          : action.kind === 'delete'
            ? 'Sucursal eliminada de forma reversible; quedó suspendida.'
            : 'Estado de la sucursal actualizado.')
      if (action.kind === 'rename') closeBranchEditor()
      if (action.kind === 'delete') closeBranchRemoval()
      return true
    } catch {
      setBranchState('ready')
      if (action.kind === 'rename') setBranchEditError('No se pudo actualizar el nombre de la sucursal. Verifica el nombre e inténtalo nuevamente.')
      else if (action.kind === 'delete') setBranchDeleteError('No se pudo confirmar la eliminación. Inténtalo nuevamente; la sucursal y sus datos se conservarán.')
      else setBranchFailure(action)
      return false
    } finally {
      branchMutation.current = false
      setMutating(false)
    }
  }

  async function runEmployee(action: EmployeeAction) {
    if (employeeMutation.current) return false
    employeeMutation.current = true
    setEmployeeMutating(true)
    ++employeeReadSequence.current
    setEmployeeFailure(null)
    setEmployeeNotice('')
    try {
      const result = action.kind === 'create'
        ? await createEmployee(action.input)
        : await setEmployeeStatus(action.employee.userId, action.status)
      mergeEmployee(result)
      setEmployeeState('ready')
      setEmployeeNotice(action.kind === 'create' ? 'Empleado creado y asignado.' : 'Estado del empleado actualizado.')
      return true
    } catch (error) {
      setEmployeeState('ready')
      if (action.kind === 'create') {
        setEmployeeDialogError(employeeCreateErrorMessage(error))
      } else {
        setEmployeeFailure({ ...action, error: isEmployeeProvisioningError(error) ? error : undefined })
      }
      return false
    } finally {
      employeeMutation.current = false
      setEmployeeMutating(false)
    }
  }

  function isEmployeeProvisioningError(error: unknown): error is EmployeeProvisioningError {
    if (typeof error !== 'object' || error === null) return false
    const code = (error as { code?: unknown }).code
    return code === 'EMPLOYEE_USERNAME_TAKEN' || code === 'EMPLOYEE_CLEANUP_REQUIRED'
  }

  function employeeFailureMessage(failure: FailedEmployee) {
    if (failure.error?.code === 'EMPLOYEE_USERNAME_TAKEN') return 'Ese usuario ya existe. Elige otro usuario para continuar.'
    if (failure.error?.code === 'EMPLOYEE_CLEANUP_REQUIRED') return 'No se pudo completar la creación. El acceso requiere recuperación administrativa antes de volver a intentarlo.'
    return 'No se pudo cambiar el estado del empleado.'
  }

  function canRetryEmployee(failure: FailedEmployee) {
    return failure.error?.code !== 'EMPLOYEE_USERNAME_TAKEN' && failure.error?.code !== 'EMPLOYEE_CLEANUP_REQUIRED'
  }

  function submitBranch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const submittedDraft = newBranchName
    void runBranch({ kind: 'create', name: submittedDraft.trim(), requestId: createBranchRequestId() }).then((created) => {
      if (created) setNewBranchName((currentDraft) => currentDraft === submittedDraft ? '' : currentDraft)
    })
  }

  function submitBranchEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editingBranch || branchMutation.current) return
    const name = branchEditName.trim()
    if (!name) {
      setBranchEditError('Escribe un nombre para la sucursal.')
      return
    }
    void runBranch({ kind: 'rename', branch: editingBranch, name, requestId: branchEditRequestId })
  }

  function confirmBranchRemoval() {
    if (!deletingBranch || branchMutation.current) return
    void runBranch({ kind: 'delete', branch: deletingBranch, requestId: branchDeleteRequestId })
  }

  function submitEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    if (!selectedEmployeeBranchId) {
      setEmployeeValidationError('Selecciona una sucursal activa antes de crear el empleado.')
      return
    }
    const values = new FormData(form)
    const input: CreateEmployeeInput = {
      displayName: createDisplayName.trim(),
      username: createUsername.trim(),
      password: String(values.get('password') ?? ''),
      branchId: selectedEmployeeBranchId,
    }
    setEmployeeValidationError('')
    setEmployeeDialogError('')
    void runEmployee({ kind: 'create', input }).then((created) => {
      const passwordInput = form.elements.namedItem('password')
      if (passwordInput instanceof HTMLInputElement) passwordInput.value = ''
      setShowEmployeePassword(false)
      if (created) {
        form.reset()
        closeEmployeeCreateDialog()
      }
    })
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, tab: BranchTab) {
    const currentIndex = branchTabs.findIndex(({ key }) => key === tab)
    let nextIndex = currentIndex
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % branchTabs.length
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + branchTabs.length) % branchTabs.length
    if (event.key === 'Home') nextIndex = 0
    if (event.key === 'End') nextIndex = branchTabs.length - 1
    if (nextIndex === currentIndex) return
    event.preventDefault()
    const nextTab = branchTabs[nextIndex].key
    setActiveTab(nextTab)
    document.getElementById(`${nextTab}-tab`)?.focus()
  }

  const activeBranches = branches.filter(({ status }) => status === 'active')
  const selectedEmployeeBranchId = activeBranches.some(({ id }) => id === employeeBranchId) ? employeeBranchId : ''
  const visibleEmployees = employees.filter((employee) => {
    const terms = employeeSearch.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
    if (terms.length === 0) return true
    const searchableFields = [employee.displayName, employee.username, employee.branchName].map((field) => field.toLocaleLowerCase())
    return terms.every((term) => searchableFields.some((field) => field.includes(term)))
  })
  const refreshLabel = activeTab === 'branches' ? 'Actualizar sucursales' : 'Actualizar empleados'

  return <section aria-label="Módulo Sucursales" className="ops-workspace-frame flex min-h-0 min-w-0 w-full flex-1 flex-col overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 p-3 text-slate-100 shadow-2xl sm:p-5 lg:p-6">
    <header className="ops-module-header flex shrink-0 flex-col gap-3 border-b border-slate-800 pb-3 sm:flex-row sm:items-center sm:justify-between">
      <ResponsiveActionButton type="button" label={refreshLabel} icon="refresh" iconOnly disabled={mutating || employeeMutating} className="self-end sm:self-auto" onClick={() => void (activeTab === 'branches' ? load() : loadEmployees())} />
    </header>

    <div role="tablist" aria-label="Administración de sucursales" className="ops-horizontal-scroll mt-3 flex min-w-0 shrink-0 gap-2 overflow-x-auto border-b border-slate-800 pb-2 scrollbar-none">
      {branchTabs.map(({ key, label }) => {
        const selected = activeTab === key
        return <ResponsiveActionButton key={key} id={`${key}-tab`} type="button" role="tab" aria-selected={selected} aria-controls={`${key}-panel`} tabIndex={selected ? 0 : -1} label={label} onClick={() => setActiveTab(key)} onKeyDown={(event) => handleTabKeyDown(event, key)} className="ops-tab shrink-0 px-4 text-xs">{label}</ResponsiveActionButton>
      })}
    </div>

    {activeTab === 'branches' && <div id="branches-panel" role="tabpanel" aria-labelledby="branches-tab" tabIndex={0} className="mt-4 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <form aria-label="Crear sucursal" className="ops-panel-frame flex min-w-0 items-end gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-3 sm:p-4" onSubmit={submitBranch}>
         <label className="ops-field-label min-w-0 flex-1 grid gap-1.5 text-sm font-semibold text-slate-300">Nombre de la sucursal<input required maxLength={120} name="name" value={newBranchName} onChange={(event) => setNewBranchName(event.target.value)} className="ops-control w-full min-w-0 px-3" /></label>
        <ResponsiveActionButton type="submit" label="Crear sucursal" icon="plus" iconOnly disabled={mutating || employeeMutating} className="shrink-0" />
      </form>
      <p aria-live="polite" className="min-h-5 pt-2 text-sm font-semibold text-emerald-300">{notice}</p>
      {branchFailure && <div ref={alert} tabIndex={-1} role="alert" className="mt-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100"><p>{branchFailure.kind === 'create' ? 'No se pudo crear la sucursal.' : 'No se pudo cambiar el estado de la sucursal.'}</p><ResponsiveActionButton type="button" label={`Reintentar ${branchFailure.kind === 'create' ? 'creación' : 'cambio de estado'}`} icon="refresh" className="mt-3" onClick={() => void runBranch(branchFailure)} /></div>}
       {branchState === 'loading' && <p role="status" className="ops-state ops-state-loading mt-4 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm font-semibold text-slate-300">Cargando sucursales…</p>}
       {branchState === 'error' && <div ref={alert} tabIndex={-1} role="alert" className="ops-state ops-state-error mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100"><p className="font-semibold">No se pudieron cargar las sucursales.</p><ResponsiveActionButton type="button" label="Reintentar" icon="refresh" className="mt-3" onClick={() => void load()} /></div>}
       {branchState === 'ready' && branches.length === 0 && <p className="ops-state ops-state-empty mt-4 rounded-2xl border border-dashed border-slate-700 bg-slate-950 p-5 text-sm text-slate-300">Aún no hay sucursales.</p>}
       {branchState === 'ready' && branches.length > 0 && <ul className="ops-scroll-region mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-950 px-3 sm:px-4">{branches.map((branch) => <li key={branch.id} className="flex min-w-0 items-center justify-between gap-3 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-bold text-white" title={branch.name}>{branch.name}</h2>
          <p className="mt-1 text-xs font-semibold text-slate-400">{branch.status === 'active' ? 'Activa' : 'Suspendida'}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <ResponsiveActionButton type="button" label={`Editar sucursal ${branch.name}`} icon="edit" iconOnly disabled={mutating || employeeMutating} className="shrink-0" onClick={() => openBranchEditor(branch)} />
          {branch.status === 'active'
            ? <ResponsiveActionButton type="button" label={`Eliminar sucursal ${branch.name}`} icon="trash" iconOnly disabled={mutating || employeeMutating} className="shrink-0" onClick={() => openBranchRemoval(branch)} />
            : <ResponsiveActionButton type="button" label={`Reactivar ${branch.name}`} icon="power" iconOnly disabled={mutating || employeeMutating} className="shrink-0" onClick={() => void runBranch({ kind: 'status', branch, status: 'active', requestId: createBranchRequestId() })} />}
        </div>
      </li>)}</ul>}
    </div>}

    {activeTab === 'employees' && <div id="employees-panel" role="tabpanel" aria-labelledby="employees-tab" tabIndex={0} className="mt-4 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div>
        <h2 className="text-base font-black text-white">Empleados</h2>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-400">Crea usuarios internos con acceso únicamente al punto de venta de la sucursal asignada.</p>
      </div>
       <div className="ops-panel-frame mt-4 flex min-w-0 items-end gap-3 rounded-2xl border border-slate-800 bg-slate-950 p-3 sm:p-4">
        <SearchInput value={employeeSearch} onChange={setEmployeeSearch} label="Buscar empleados" placeholder="Nombre, usuario o sucursal" containerClassName="min-w-0 flex-1" />
        <ResponsiveActionButton type="button" label="Crear empleado" title="Crear empleado" icon="plus" iconOnly disabled={activeBranches.length === 0 || employeeMutating} className="shrink-0" onClick={openEmployeeCreateDialog} />
      </div>
      <p aria-live="polite" className="min-h-5 pt-2 text-sm font-semibold text-emerald-300">{employeeNotice}</p>
      {employeeFailure && <div ref={employeeAlert} tabIndex={-1} role="alert" className="mt-3 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100"><p>{employeeFailureMessage(employeeFailure)}</p>{canRetryEmployee(employeeFailure) && <ResponsiveActionButton type="button" label="Reintentar cambio de estado" icon="refresh" className="mt-3" onClick={() => void runEmployee(employeeFailure)} />}</div>}
       {employeeState === 'loading' && <p role="status" className="ops-state ops-state-loading mt-4 rounded-2xl border border-slate-800 bg-slate-950 p-4 text-sm font-semibold text-slate-300">Cargando empleados…</p>}
       {employeeState === 'error' && <div ref={employeeAlert} tabIndex={-1} role="alert" className="ops-state ops-state-error mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-100"><p className="font-semibold">No se pudieron cargar los empleados.</p><ResponsiveActionButton type="button" label="Reintentar carga de empleados" icon="refresh" className="mt-3" onClick={() => void loadEmployees()} /></div>}
       {employeeState === 'ready' && employees.length === 0 && <p className="ops-state ops-state-empty mt-4 rounded-2xl border border-dashed border-slate-700 bg-slate-950 p-5 text-sm text-slate-300">Aún no hay empleados asignados.</p>}
       {employeeState === 'ready' && employees.length > 0 && visibleEmployees.length === 0 && <p className="ops-state ops-state-filtered-empty mt-4 rounded-2xl border border-dashed border-slate-700 bg-slate-950 p-5 text-sm text-slate-300">No hay empleados que coincidan con la búsqueda.</p>}
       {employeeState === 'ready' && visibleEmployees.length > 0 && <ul className="ops-scroll-region mt-4 min-h-0 flex-1 overflow-y-auto overscroll-contain divide-y divide-slate-800 rounded-2xl border border-slate-800 bg-slate-950 px-3 sm:px-4">{visibleEmployees.map((employee) => { const next: EmployeeStatus = employee.status === 'active' ? 'suspended' : 'active'; const label = `${next === 'active' ? 'Activar' : 'Suspender'} ${employee.displayName}`; return <li key={employee.userId} className="flex min-w-0 items-center justify-between gap-3 py-3"><div className="min-w-0"><h3 className="truncate font-bold text-white" title={employee.displayName}>{employee.displayName}</h3><p className="mt-1 truncate text-xs text-slate-400" title={`Usuario: ${employee.username} · ${employee.branchName}`}>Usuario: {employee.username} · {employee.branchName}</p><p className="mt-1 text-[11px] font-semibold text-slate-500">{employeeStatusLabel(employee.status)} · Sucursal {employee.branchStatus === 'active' ? 'activa' : 'suspendida'}</p></div><div className="flex shrink-0 items-center gap-1"><ResponsiveActionButton type="button" label={`Editar usuario ${employee.displayName}`} icon="edit" iconOnly disabled={employeeMutating} className="shrink-0" onClick={() => openEditEmployee(employee)} /><ResponsiveActionButton type="button" label={`Cambiar contraseña de ${employee.displayName}`} icon="key" iconOnly disabled={employeeMutating} className="shrink-0" onClick={() => openPasswordDialog(employee)} /><ResponsiveActionButton type="button" label={label} icon="power" iconOnly disabled={employeeMutating} className="shrink-0" onClick={() => void runEmployee({ kind: 'status', employee, status: next })} /></div></li> })}</ul>}
     </div>}

    {editingBranch && <Modal title="Editar sucursal" description="Actualiza el nombre sin cambiar el historial ni los empleados asociados." closeLabel="Cerrar edición de sucursal" onClose={closeBranchEditor} busy={mutating} maxWidthClassName="max-w-lg" headerActions={<ResponsiveActionButton type="submit" form="edit-branch-form" label="Guardar cambios" icon="save" loading={mutating} loadingLabel="Guardando…" disabled={mutating} />}>
      <form id="edit-branch-form" aria-label="Editar sucursal" className="grid gap-4 p-4 sm:p-6" onSubmit={submitBranchEdit}>
        {branchEditError && <p role="alert" className="ops-state ops-state-error rounded-xl border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">{branchEditError}</p>}
        <label className="ops-field-label">Nombre de la sucursal<input required maxLength={120} name="name" value={branchEditName} onChange={(event) => { setBranchEditName(event.target.value); setBranchEditRequestId(createBranchRequestId()) }} className="ops-control px-3" /></label>
      </form>
    </Modal>}

    {deletingBranch && <Modal title="Eliminar sucursal" description={`Vas a eliminar ${deletingBranch.name}. Esta acción se puede revertir.`} closeLabel="Cerrar eliminación de sucursal" onClose={closeBranchRemoval} busy={mutating} maxWidthClassName="max-w-lg" headerActions={<ResponsiveActionButton type="button" label="Confirmar eliminación" icon="trash" loading={mutating} loadingLabel="Eliminando…" disabled={mutating} onClick={confirmBranchRemoval} />}>
      <div className="grid gap-4 p-4 sm:p-6">
        <p className="text-sm leading-relaxed text-slate-300">La sucursal quedará suspendida para conservar su historial, ventas y empleados asociados. Podrás reactivarla desde esta misma lista.</p>
        {branchDeleteError && <p role="alert" className="ops-state ops-state-error rounded-xl border border-rose-500/30 bg-rose-950/30 px-3 py-2 text-sm text-rose-100">{branchDeleteError}</p>}
        <div className="flex justify-end">
          <ResponsiveActionButton type="button" label="Cancelar" disabled={mutating} onClick={closeBranchRemoval} />
        </div>
      </div>
    </Modal>}

    {employeeCreateDialogOpen && <Modal title="Crear empleado" description="Crea un usuario interno y asígnalo a una sucursal activa." closeLabel="Cerrar creación de empleado" onClose={closeEmployeeCreateDialog} busy={employeeMutating} headerActions={<ResponsiveActionButton type="submit" form="create-employee-form" label="Crear empleado" icon="plus" loading={employeeMutating} loadingLabel="Creando empleado…" disabled={activeBranches.length === 0} />}>
      <form id="create-employee-form" aria-label="Crear empleado" className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6" onSubmit={submitEmployee}>
         <label className="ops-field-label grid content-start gap-1.5 text-sm font-semibold text-slate-300">Nombre para mostrar<input required maxLength={120} name="displayName" autoComplete="name" value={createDisplayName} onChange={(event) => setCreateDisplayName(event.target.value)} className="ops-control px-3" /></label>
        <div className="grid content-start gap-1.5 text-sm font-semibold text-slate-300"><label htmlFor="employee-username">Usuario</label><input id="employee-username" required minLength={3} maxLength={32} name="username" autoComplete="off" aria-describedby="employee-username-help" value={createUsername} onChange={(event) => setCreateUsername(event.target.value)} className="ops-control px-3" /><span id="employee-username-help" className="text-xs font-normal text-slate-500">Usa letras, números, puntos, guiones o guiones bajos.</span></div>
        <div className="grid content-start gap-1.5 text-sm font-semibold text-slate-300"><label htmlFor="employee-password">Contraseña</label><div className="relative"><input id="employee-password" required minLength={6} maxLength={128} name="password" type={showEmployeePassword ? 'text' : 'password'} autoComplete="new-password" className="ops-control w-full px-3 pr-14" /><button type="button" aria-label={showEmployeePassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} title={showEmployeePassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showEmployeePassword} className="ops-icon-button ops-focus absolute right-0 top-1/2 -translate-y-1/2" onClick={() => setShowEmployeePassword((visible) => !visible)}><Icon name={showEmployeePassword ? 'eye-off' : 'eye'} className="h-5 w-5" /></button></div></div>
        <div className="grid content-start gap-1.5 text-sm font-semibold text-slate-300">
          <span>Sucursal asignada</span>
          <CustomSelect value={selectedEmployeeBranchId} label="Sucursal asignada" required ariaInvalid={Boolean(employeeValidationError)} disabled={activeBranches.length === 0 || employeeMutating} placeholder="Selecciona una sucursal activa" options={activeBranches.map((branch) => ({ value: branch.id, label: branch.name }))} onChange={(value) => { setEmployeeBranchId(value); setEmployeeValidationError('') }} />
        </div>
        <div className="sm:col-span-2">{activeBranches.length === 0 && <p className="mt-2 text-xs text-amber-300">Activa una sucursal para poder asignar un empleado.</p>}{(employeeDialogError || employeeValidationError) && <p ref={employeeCreateAlert} tabIndex={-1} role="alert" className="mt-2 text-xs font-semibold text-rose-300">{employeeDialogError || employeeValidationError}</p>}</div>
      </form>
    </Modal>}

    {employeeDialog?.kind === 'edit' && <Modal title="Editar usuario" description={`Actualiza los datos de ${employeeDialog.employee.displayName}.`} closeLabel="Cerrar edición de usuario" onClose={clearEmployeeDialog} busy={employeeMutating} headerActions={<ResponsiveActionButton type="submit" form="edit-employee-form" label="Guardar cambios" icon="save" loading={employeeMutating} loadingLabel="Guardando cambios…" disabled={!editBranchId} />}>
      <form id="edit-employee-form" aria-label="Editar usuario" className="grid gap-4 p-4 sm:p-6" onSubmit={saveEmployeeEdit}>
        <label className="grid gap-1.5 text-sm font-semibold text-slate-300" htmlFor="edit-employee-display-name">Nombre para mostrar<input id="edit-employee-display-name" required maxLength={120} value={editDisplayName} autoComplete="name" disabled={employeeMutating} className="ops-control px-3" onChange={(event) => setEditDisplayName(event.target.value)} /></label>
        <div className="grid gap-1.5 text-sm font-semibold text-slate-300"><label htmlFor="edit-employee-username">Usuario</label><input id="edit-employee-username" required minLength={3} maxLength={32} value={editUsername} autoComplete="off" aria-describedby="edit-employee-username-help" disabled={employeeMutating} className="ops-control px-3" onChange={(event) => setEditUsername(event.target.value)} /><span id="edit-employee-username-help" className="text-xs font-normal text-slate-500">Usa letras, números, puntos, guiones o guiones bajos.</span></div>
        <div className="grid gap-1.5 text-sm font-semibold text-slate-300"><span>Sucursal activa</span><CustomSelect value={editBranchId} label="Sucursal activa" required ariaInvalid={Boolean(employeeDialogValidationError)} disabled={activeBranches.length === 0 || employeeMutating} placeholder="Selecciona una sucursal activa" emptyLabel="No hay sucursales activas" options={activeBranches.map((branch) => ({ value: branch.id, label: branch.name }))} onChange={(value) => { setEditBranchId(value); setEmployeeDialogValidationError('') }} /></div>
        {activeBranches.length === 0 && <p className="text-xs text-amber-300">Activa una sucursal para poder asignar este empleado.</p>}
        {employeeDialogValidationError && <p role="alert" className="text-xs font-semibold text-rose-300">{employeeDialogValidationError}</p>}
        {employeeDialogError && <p role="alert" className="text-xs font-semibold text-rose-300">{employeeDialogError}</p>}
      </form>
    </Modal>}

    {employeeDialog?.kind === 'password' && <Modal title="Cambiar contraseña" description={`Define una nueva contraseña para ${employeeDialog.employee.displayName}.`} closeLabel="Cerrar cambio de contraseña" onClose={clearEmployeeDialog} busy={employeeMutating} headerActions={<ResponsiveActionButton type="submit" form="password-employee-form" label="Guardar contraseña" icon="save" loading={employeeMutating} loadingLabel="Guardando contraseña…" />}>
      <form id="password-employee-form" aria-label="Cambiar contraseña" className="grid gap-4 p-4 sm:p-6" onSubmit={saveEmployeePassword}>
        <div className="grid gap-1.5 text-sm font-semibold text-slate-300"><label htmlFor="new-employee-password">Nueva contraseña</label><div className="relative"><input id="new-employee-password" required minLength={6} maxLength={128} value={newEmployeePassword} type={showNewEmployeePassword ? 'text' : 'password'} autoComplete="new-password" disabled={employeeMutating} className="ops-control w-full px-3 pr-14" onChange={(event) => { setNewEmployeePassword(event.target.value); setEmployeeDialogValidationError('') }} /><button type="button" aria-label={showNewEmployeePassword ? 'Ocultar nueva contraseña' : 'Mostrar nueva contraseña'} title={showNewEmployeePassword ? 'Ocultar nueva contraseña' : 'Mostrar nueva contraseña'} aria-pressed={showNewEmployeePassword} disabled={employeeMutating} className="ops-icon-button ops-focus absolute right-0 top-1/2 -translate-y-1/2" onClick={() => setShowNewEmployeePassword((visible) => !visible)}><Icon name={showNewEmployeePassword ? 'eye-off' : 'eye'} className="h-5 w-5" /></button></div></div>
        <div className="grid gap-1.5 text-sm font-semibold text-slate-300"><label htmlFor="new-employee-password-confirmation">Confirmar contraseña</label><div className="relative"><input id="new-employee-password-confirmation" required minLength={6} maxLength={128} value={newEmployeePasswordConfirmation} type={showNewEmployeePasswordConfirmation ? 'text' : 'password'} autoComplete="new-password" disabled={employeeMutating} className="ops-control w-full px-3 pr-14" onChange={(event) => { setNewEmployeePasswordConfirmation(event.target.value); setEmployeeDialogValidationError('') }} /><button type="button" aria-label={showNewEmployeePasswordConfirmation ? 'Ocultar confirmación de contraseña' : 'Mostrar confirmación de contraseña'} title={showNewEmployeePasswordConfirmation ? 'Ocultar confirmación de contraseña' : 'Mostrar confirmación de contraseña'} aria-pressed={showNewEmployeePasswordConfirmation} disabled={employeeMutating} className="ops-icon-button ops-focus absolute right-0 top-1/2 -translate-y-1/2" onClick={() => setShowNewEmployeePasswordConfirmation((visible) => !visible)}><Icon name={showNewEmployeePasswordConfirmation ? 'eye-off' : 'eye'} className="h-5 w-5" /></button></div></div>
        {employeeDialogValidationError && <p role="alert" className="text-xs font-semibold text-rose-300">{employeeDialogValidationError}</p>}
        {employeeDialogError && <p role="alert" className="text-xs font-semibold text-rose-300">{employeeDialogError}</p>}
      </form>
    </Modal>}
  </section>
}
