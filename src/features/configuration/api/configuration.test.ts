import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ database: { rpc: vi.fn() } }))
vi.mock('../../../lib/insforge', () => ({ insforge: sdk }))

import { DEFAULT_REPORT_TIMEZONE, getOperationalConfiguration, getReportTimezoneConfiguration, isConfigurationUnauthorizedError, setOperationalConfiguration, setReportTimezoneConfiguration, validateOperationalConfigurationValue, validateReportTimezone } from './configuration'

const rows = [
  { key: 'event_daily_capacity', type: 'integer', value: '7', scope: 'global', owner_id: 'admin-1', state: 'compatibility-default', effective_at: null, result_status: null },
  { key: 'pos_usd_mxn_rate', type: 'rate', value: '17.2500', scope: 'global', owner_id: 'admin-1', state: 'configured', effective_at: '2026-08-29T12:00:00.000Z', result_status: null },
  { key: 'pos_wholesale_threshold', type: 'integer', value: 10, scope: 'global', owner_id: 'admin-1', state: 'compatibility-default', effective_at: null, result_status: null },
]
const timezoneRow = { timezone: DEFAULT_REPORT_TIMEZONE, scope: 'global', owner_id: 'admin-1', state: 'compatibility-default', effective_at: null, result_status: null }

describe('operational configuration API', () => {
  beforeEach(() => vi.resetAllMocks())

  it('maps the three global settings and preserves effective metadata', async () => {
    sdk.database.rpc.mockResolvedValue({ data: rows, error: null })

    await expect(getOperationalConfiguration()).resolves.toEqual([
      { key: 'event_daily_capacity', type: 'integer', value: 7, scope: 'global', ownerId: 'admin-1', state: 'compatibility-default', effectiveAt: null },
      { key: 'pos_usd_mxn_rate', type: 'rate', value: 17.25, scope: 'global', ownerId: 'admin-1', state: 'configured', effectiveAt: '2026-08-29T12:00:00.000Z' },
      { key: 'pos_wholesale_threshold', type: 'integer', value: 10, scope: 'global', ownerId: 'admin-1', state: 'compatibility-default', effectiveAt: null },
    ])
    expect(sdk.database.rpc).toHaveBeenCalledWith('get_operational_configuration', { p_scope: 'global' })
  })

  it('validates exact bounds and sends a typed mutation request', async () => {
    expect(() => validateOperationalConfigurationValue('event_daily_capacity', 0)).toThrow('between 1 and 10000')
    expect(() => validateOperationalConfigurationValue('pos_usd_mxn_rate', 1.23456)).toThrow('four decimal')
    expect(() => validateOperationalConfigurationValue('pos_wholesale_threshold', 2.5)).toThrow('integer')

    sdk.database.rpc.mockResolvedValue({ data: { ...rows[1], result_status: 'replayed' }, error: null })
    await expect(setOperationalConfiguration({ requestId: 'request-1', key: 'pos_usd_mxn_rate', value: 17.25 })).resolves.toMatchObject({ key: 'pos_usd_mxn_rate', value: 17.25, resultStatus: 'replayed' })
    expect(sdk.database.rpc).toHaveBeenCalledWith('set_operational_configuration', { p_request_id: 'request-1', p_key: 'pos_usd_mxn_rate', p_value: 17.25, p_scope: 'global' })
  })

  it('rejects incomplete responses and recognizes authorization failures', async () => {
    sdk.database.rpc.mockResolvedValue({ data: rows.slice(0, 2), error: null })
    await expect(getOperationalConfiguration()).rejects.toThrow('incomplete')
    expect(isConfigurationUnauthorizedError(new Error('access denied'))).toBe(true)
    expect(isConfigurationUnauthorizedError({ statusCode: 403, message: 'forbidden' })).toBe(true)
    expect(isConfigurationUnauthorizedError(new Error('network offline'))).toBe(false)
  })

  it('maps the server-authoritative default report timezone and reads it with reports access', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [timezoneRow], error: null })

    await expect(getReportTimezoneConfiguration()).resolves.toEqual({
      timezone: 'America/Cancun',
      scope: 'global',
      ownerId: 'admin-1',
      state: 'compatibility-default',
      effectiveAt: null,
    })
    expect(sdk.database.rpc).toHaveBeenCalledWith('get_report_timezone_configuration')
    expect(validateReportTimezone('America/Mexico_City')).toBe('America/Mexico_City')
    expect(() => validateReportTimezone('UTC')).toThrow('invalid')
  })

  it('sends a whitelisted timezone mutation and preserves replay metadata', async () => {
    sdk.database.rpc.mockResolvedValue({ data: { ...timezoneRow, timezone: 'America/Mexico_City', state: 'configured', effective_at: '2026-08-29T12:00:00.000Z', result_status: 'replayed' }, error: null })

    await expect(setReportTimezoneConfiguration({ requestId: 'request-2', timezone: 'America/Mexico_City' })).resolves.toMatchObject({
      timezone: 'America/Mexico_City',
      state: 'configured',
      effectiveAt: '2026-08-29T12:00:00.000Z',
      resultStatus: 'replayed',
    })
    expect(sdk.database.rpc).toHaveBeenCalledWith('set_report_timezone_configuration', { p_request_id: 'request-2', p_timezone: 'America/Mexico_City' })
    await expect(setReportTimezoneConfiguration({ requestId: 'request-3', timezone: 'UTC' as never })).rejects.toThrow('invalid')
    expect(sdk.database.rpc).toHaveBeenCalledTimes(1)
  })
})
