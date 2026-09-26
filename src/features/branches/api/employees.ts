import { insforge } from '../../../lib/insforge'

export type EmployeeStatus = 'active' | 'suspended'

export type Employee = {
  userId: string
  username: string
  displayName: string
  branchId: string
  branchName: string
  status: EmployeeStatus
  branchStatus: 'active' | 'suspended'
}

export type CreateEmployeeInput = {
  username: string
  displayName: string
  password: string
  branchId: string
}

export type UpdateEmployeeInput = {
  userId: string
  username: string
  displayName: string
  branchId: string
}

export type SetEmployeePasswordInput = {
  userId: string
  password: string
}

export type EmployeeProvisioningErrorCode = 'EMPLOYEE_USERNAME_TAKEN' | 'EMPLOYEE_CLEANUP_REQUIRED'

export class EmployeeProvisioningError extends Error {
  constructor(
    public readonly code: EmployeeProvisioningErrorCode,
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'EmployeeProvisioningError'
  }

  get retryable() {
    return false
  }
}

export type EmployeeMutationErrorCode = 'EMPLOYEE_USERNAME_TAKEN'

export class EmployeeMutationError extends Error {
  constructor(
    public readonly code: EmployeeMutationErrorCode,
    public readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'EmployeeMutationError'
  }
}

type EmployeeRow = {
  employee_user_id: string
  username: string
  display_name: string
  branch_id: string
  branch_name: string
  employee_status: EmployeeStatus
  branch_status: 'active' | 'suspended'
}

function mapEmployee(data: unknown): Employee {
  const row = (Array.isArray(data) ? data[0] : data) as EmployeeRow | undefined
  if (!row) throw new Error('Employee response was empty')
  return {
    userId: row.employee_user_id,
    username: row.username,
    displayName: row.display_name,
    branchId: row.branch_id,
    branchName: row.branch_name,
    status: row.employee_status,
    branchStatus: row.branch_status,
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null
}

function numericStatus(value: unknown) {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  return null
}

export function mapEmployeeProvisioningError(error: unknown): EmployeeProvisioningError | null {
  const source = record(error)
  if (!source) return null

  const nestedError = record(source.error)
  const body = record(source.body) ?? record(source.data)
  const codes = [source.code, nestedError?.code, body?.code, typeof source.error === 'string' ? source.error : null, typeof body?.error === 'string' ? body.error : null]
    .filter((value): value is string => typeof value === 'string')
  const code = codes.find((value) => value === 'EMPLOYEE_CLEANUP_REQUIRED' || value === 'EMPLOYEE_USERNAME_TAKEN') ?? codes[0]
  const status = numericStatus(source.statusCode) ?? numericStatus(source.status) ?? numericStatus(nestedError?.statusCode) ?? numericStatus(body?.statusCode)

  if (code === 'EMPLOYEE_CLEANUP_REQUIRED') {
    return new EmployeeProvisioningError('EMPLOYEE_CLEANUP_REQUIRED', status ?? 500, 'Employee access requires administrative recovery before retrying')
  }
  if (code === 'EMPLOYEE_USERNAME_TAKEN' || status === 409) {
    return new EmployeeProvisioningError('EMPLOYEE_USERNAME_TAKEN', 409, 'Employee username is already taken')
  }
  return null
}

export function mapEmployeeMutationError(error: unknown): EmployeeMutationError | null {
  const source = record(error)
  if (!source) return null

  const nestedError = record(source.error)
  const body = record(source.body) ?? record(source.data)
  const values = [
    source.code,
    nestedError?.code,
    body?.code,
    source.message,
    nestedError?.message,
    body?.message,
    typeof source.error === 'string' ? source.error : null,
    typeof body?.error === 'string' ? body.error : null,
  ].filter((value): value is string => typeof value === 'string')
  const status = numericStatus(source.statusCode) ?? numericStatus(source.status) ?? numericStatus(nestedError?.statusCode) ?? numericStatus(body?.statusCode)

  if (status === 409 || values.some((value) => /employee.*username.*(already exists|duplicate|taken)/i.test(value) || /employee_identities_username_key/i.test(value))) {
    return new EmployeeMutationError('EMPLOYEE_USERNAME_TAKEN', 409, 'Employee username is already taken')
  }
  return null
}

export async function listEmployees(): Promise<Employee[]> {
  const { data, error } = await insforge.database.rpc('list_employees')
  if (error) throw error
  return ((data ?? []) as EmployeeRow[]).map((row) => mapEmployee(row))
}

export async function createEmployee(input: CreateEmployeeInput): Promise<Employee> {
  const { data, error } = await insforge.functions.invoke('provision-employee', { body: input })
  if (error) throw mapEmployeeProvisioningError(error) ?? error
  const response = (data as { employee?: unknown } | null)?.employee
  return mapEmployee(response)
}

export async function setEmployeeStatus(userId: string, status: EmployeeStatus): Promise<Employee> {
  const { data, error } = await insforge.database.rpc('set_employee_status', {
    p_user_id: userId,
    p_status: status,
  })
  if (error) throw error
  return mapEmployee(data)
}

export async function updateEmployee(input: UpdateEmployeeInput): Promise<Employee> {
  const { data, error } = await insforge.database.rpc('update_employee', {
    p_user_id: input.userId,
    p_username: input.username,
    p_display_name: input.displayName,
    p_branch_id: input.branchId,
  })
  if (error) throw mapEmployeeMutationError(error) ?? error
  return mapEmployee(data)
}

export async function setEmployeePassword(input: SetEmployeePasswordInput): Promise<boolean> {
  const { data, error } = await insforge.database.rpc('set_employee_password', {
    p_user_id: input.userId,
    p_password: input.password,
  })
  if (error) throw error
  if (data === true) return true
  if (Array.isArray(data)) {
    const first = data[0]
    return first === true || (typeof first === 'object' && first !== null && (first as Record<string, unknown>).set_employee_password === true)
  }
  if (typeof data === 'object' && data !== null) {
    const result = data as Record<string, unknown>
    return result.set_employee_password === true
  }
  return false
}
