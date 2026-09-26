import { insforge } from '../../../lib/insforge'

export const DEFAULT_EVENT_CART_CAPACITY = 7
export const DEFAULT_POS_USD_MXN_RATE = 15
export const DEFAULT_POS_WHOLESALE_THRESHOLD = 10
export const DEFAULT_REPORT_TIMEZONE = 'America/Cancun' as const
export const REPORT_TIMEZONES = ['America/Cancun', 'America/Mexico_City'] as const
export type ReportTimezone = typeof REPORT_TIMEZONES[number]

export const OPERATIONAL_CONFIGURATION_KEYS = ['event_daily_capacity', 'pos_usd_mxn_rate', 'pos_wholesale_threshold'] as const
export type OperationalConfigurationKey = typeof OPERATIONAL_CONFIGURATION_KEYS[number]
export type ConfigurationSettingType = 'integer' | 'rate'
export type ConfigurationSettingState = 'configured' | 'compatibility-default'

export const OPERATIONAL_CONFIGURATION_BOUNDS: Record<OperationalConfigurationKey, { type: ConfigurationSettingType; min: number; max: number }> = {
  event_daily_capacity: { type: 'integer', min: 1, max: 10000 },
  pos_usd_mxn_rate: { type: 'rate', min: 0.01, max: 10000 },
  pos_wholesale_threshold: { type: 'integer', min: 1, max: 10000 },
}

export type EffectiveSetting = {
  key: OperationalConfigurationKey
  type: ConfigurationSettingType
  value: number
  scope: 'global'
  ownerId: string
  state: ConfigurationSettingState
  effectiveAt: string | null
}

export type ConfigurationMutationResult = EffectiveSetting & { resultStatus: 'created' | 'replayed' }
export type OperationalConfiguration = EffectiveSetting[]

export type EventConfiguration = {
  eventCartsPerDay: number
}

export type ReportTimezoneConfiguration = {
  timezone: ReportTimezone
  scope: 'global'
  ownerId: string
  state: ConfigurationSettingState
  effectiveAt: string | null
}

export type ReportTimezoneMutationResult = ReportTimezoneConfiguration & { resultStatus: 'created' | 'replayed' }

type ConfigurationRow = {
  key?: unknown
  type?: unknown
  value?: unknown
  scope?: unknown
  owner_id?: unknown
  state?: unknown
  effective_at?: unknown
  result_status?: unknown
}

function firstRow(data: unknown): ConfigurationRow {
  const row = Array.isArray(data) ? data[0] : data
  if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error('Operational configuration response is invalid')
  return row as ConfigurationRow
}

function configurationKey(value: unknown): OperationalConfigurationKey {
  if (typeof value !== 'string' || !OPERATIONAL_CONFIGURATION_KEYS.includes(value as OperationalConfigurationKey)) throw new Error('Unknown operational configuration setting')
  return value as OperationalConfigurationKey
}

export function validateReportTimezone(value: unknown): ReportTimezone {
  if (typeof value !== 'string' || !REPORT_TIMEZONES.includes(value as ReportTimezone)) throw new Error('Reporting timezone is invalid')
  return value as ReportTimezone
}

export function validateOperationalConfigurationValue(key: OperationalConfigurationKey, value: unknown) {
  const bounds = OPERATIONAL_CONFIGURATION_BOUNDS[key]
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Operational configuration value must be finite')
  if (bounds.type === 'integer' && !Number.isSafeInteger(value)) throw new Error('Operational configuration value must be an integer')
  if (value < bounds.min || value > bounds.max) throw new Error(`Operational configuration value must be between ${bounds.min} and ${bounds.max}`)
  if (bounds.type === 'rate' && Number(value.toFixed(4)) !== value) throw new Error('POS USD/MXN rate must use at most four decimal places')
  return value
}

function numericValue(value: unknown) {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  if (!Number.isFinite(parsed)) throw new Error('Operational configuration response has an invalid value')
  return parsed
}

function mapSetting(data: unknown): EffectiveSetting {
  const row = firstRow(data)
  const key = configurationKey(row.key)
  const bounds = OPERATIONAL_CONFIGURATION_BOUNDS[key]
  const value = validateOperationalConfigurationValue(key, numericValue(row.value))
  if (row.type !== bounds.type || row.scope !== 'global' || typeof row.owner_id !== 'string' || row.owner_id.trim() === '') throw new Error('Operational configuration metadata is invalid')
  if (row.state !== 'configured' && row.state !== 'compatibility-default') throw new Error('Operational configuration state is invalid')
  const effectiveAt = row.effective_at === null || row.effective_at === undefined ? null : typeof row.effective_at === 'string' && row.effective_at !== '' ? row.effective_at : null
  if ((row.state === 'configured') !== (effectiveAt !== null)) throw new Error('Operational configuration effective timing is invalid')
  return { key, type: bounds.type, value, scope: 'global', ownerId: row.owner_id, state: row.state, effectiveAt }
}

function mapMutation(data: unknown): ConfigurationMutationResult {
  const row = firstRow(data)
  const setting = mapSetting(row)
  if (row.result_status !== 'created' && row.result_status !== 'replayed') throw new Error('Operational configuration mutation status is invalid')
  return { ...setting, resultStatus: row.result_status }
}

function mapConfiguration(data: unknown): EventConfiguration {
  const row = (Array.isArray(data) ? data[0] : data) as { event_carts_per_day?: unknown; carts_per_day?: unknown } | null | undefined
  const value = Number(row?.event_carts_per_day ?? row?.carts_per_day ?? DEFAULT_EVENT_CART_CAPACITY)
  return { eventCartsPerDay: Number.isInteger(value) && value > 0 ? value : DEFAULT_EVENT_CART_CAPACITY }
}

type ReportTimezoneRow = {
  timezone?: unknown
  scope?: unknown
  owner_id?: unknown
  state?: unknown
  effective_at?: unknown
  result_status?: unknown
}

function mapReportTimezone(data: unknown): ReportTimezoneConfiguration {
  const row = firstRow(data) as ReportTimezoneRow
  const timezone = validateReportTimezone(row.timezone)
  if (row.scope !== 'global' || typeof row.owner_id !== 'string' || row.owner_id.trim() === '') throw new Error('Report timezone metadata is invalid')
  if (row.state !== 'configured' && row.state !== 'compatibility-default') throw new Error('Report timezone state is invalid')
  const effectiveAt = row.effective_at === null || row.effective_at === undefined ? null : typeof row.effective_at === 'string' && row.effective_at !== '' ? row.effective_at : null
  if ((row.state === 'configured') !== (effectiveAt !== null)) throw new Error('Report timezone effective timing is invalid')
  return { timezone, scope: 'global', ownerId: row.owner_id, state: row.state, effectiveAt }
}

function mapReportTimezoneMutation(data: unknown): ReportTimezoneMutationResult {
  const row = firstRow(data) as ReportTimezoneRow
  const configuration = mapReportTimezone(row)
  if (row.result_status !== 'created' && row.result_status !== 'replayed') throw new Error('Report timezone mutation status is invalid')
  return { ...configuration, resultStatus: row.result_status }
}

function mapConfigurationRows(data: unknown): OperationalConfiguration {
  if (!Array.isArray(data)) throw new Error('Operational configuration response is invalid')
  const settings = data.map(mapSetting)
  if (settings.length !== OPERATIONAL_CONFIGURATION_KEYS.length || new Set(settings.map((setting) => setting.key)).size !== settings.length) throw new Error('Operational configuration response is incomplete')
  return OPERATIONAL_CONFIGURATION_KEYS.map((key) => settings.find((setting) => setting.key === key) as EffectiveSetting)
}

export async function getEventConfiguration(): Promise<EventConfiguration> {
  const { data, error } = await insforge.database.rpc('get_event_configuration')
  if (error) throw error
  return mapConfiguration(data)
}

export async function setEventConfiguration(input: { requestId: string; eventCartsPerDay: number }): Promise<EventConfiguration> {
  validateOperationalConfigurationValue('event_daily_capacity', input.eventCartsPerDay)
  const { data, error } = await insforge.database.rpc('set_event_capacity', {
    p_request_id: input.requestId,
    p_carts_per_day: input.eventCartsPerDay,
  })
  if (error) throw error
  return mapConfiguration(data)
}

export async function getOperationalConfiguration(): Promise<OperationalConfiguration> {
  const { data, error } = await insforge.database.rpc('get_operational_configuration', { p_scope: 'global' })
  if (error) throw error
  return mapConfigurationRows(data)
}

export async function setOperationalConfiguration(input: { requestId: string; key: OperationalConfigurationKey; value: number }): Promise<ConfigurationMutationResult> {
  if (typeof input.requestId !== 'string' || input.requestId.trim() === '') throw new Error('Configuration request ID is required')
  const key = configurationKey(input.key)
  validateOperationalConfigurationValue(key, input.value)
  const { data, error } = await insforge.database.rpc('set_operational_configuration', {
    p_request_id: input.requestId.trim(), p_key: key, p_value: input.value, p_scope: 'global',
  })
  if (error) throw error
  return mapMutation(data)
}

export async function getReportTimezoneConfiguration(): Promise<ReportTimezoneConfiguration> {
  const { data, error } = await insforge.database.rpc('get_report_timezone_configuration')
  if (error) throw error
  return mapReportTimezone(data)
}

export async function setReportTimezoneConfiguration(input: { requestId: string; timezone: ReportTimezone }): Promise<ReportTimezoneMutationResult> {
  if (typeof input.requestId !== 'string' || input.requestId.trim() === '') throw new Error('Report timezone request ID is required')
  const timezone = validateReportTimezone(input.timezone)
  const { data, error } = await insforge.database.rpc('set_report_timezone_configuration', {
    p_request_id: input.requestId.trim(),
    p_timezone: timezone,
  })
  if (error) throw error
  return mapReportTimezoneMutation(data)
}

export function isConfigurationUnauthorizedError(error: unknown): boolean {
  if (typeof error === 'object' && error !== null) {
    const details = error as { status?: unknown; statusCode?: unknown; code?: unknown; message?: unknown; error?: unknown }
    if ([details.status, details.statusCode].some((value) => Number(value) === 401 || Number(value) === 403)) return true
    if ([details.code, details.message].some((value) => typeof value === 'string' && /access denied|unauthorized|forbidden|permission/i.test(value))) return true
    return details.error !== error && isConfigurationUnauthorizedError(details.error)
  }
  return error instanceof Error && /access denied|unauthorized|forbidden|permission/i.test(error.message)
}
