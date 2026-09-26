export const EMPLOYEE_AUTH_EMAIL_DOMAIN = 'employees.paletixa.internal'
export const EMPLOYEE_USERNAME_MIN_LENGTH = 3
export const EMPLOYEE_USERNAME_MAX_LENGTH = 32

const employeeUsernamePattern = /^[a-z0-9](?:[a-z0-9._-]{1,30}[a-z0-9])?$/

export function normalizeEmployeeUsername(value: unknown) {
  if (typeof value !== 'string') throw new Error('Username is required')

  const normalized = value.trim().normalize('NFKC').toLocaleLowerCase('en-US')
  if (
    normalized.length < EMPLOYEE_USERNAME_MIN_LENGTH ||
    normalized.length > EMPLOYEE_USERNAME_MAX_LENGTH ||
    !employeeUsernamePattern.test(normalized)
  ) {
    throw new Error('Username must use 3 to 32 lowercase letters, numbers, dots, underscores, or hyphens')
  }

  return normalized
}

export function employeeAuthEmail(value: unknown) {
  return `${normalizeEmployeeUsername(value)}@${EMPLOYEE_AUTH_EMAIL_DOMAIN}`
}
