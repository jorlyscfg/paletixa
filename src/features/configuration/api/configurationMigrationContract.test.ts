import { describe, expect, it } from 'vitest'
import migration from '../../../../migrations/20260830000000_expose-configuration-capability.sql?raw'

describe('configuration consumer migration', () => {
  it('exposes configuration capability data through the existing access context', () => {
    expect(migration).toContain("'configuration.manage'")
    expect(migration).toContain("public.has_capability('configuration.manage')")
    expect(migration).toContain('grant execute on function public.get_access_context() to authenticated')
  })

  it('uses the configured POS rate only as an omitted USD fallback', () => {
    expect(migration).toContain("public.operational_pos_usd_mxn_rate()")
    expect(migration).toContain("not (p_details ? 'usd_mxn_rate')")
    expect(migration).toContain("lower(coalesce(p_details->>'payment_currency', 'mxn')) = 'usd'")
    expect(migration).toContain("and wanted_channel = 'pos'")
  })

  it('applies the configured threshold to new POS lines without rewriting existing or wholesale sales', () => {
    expect(migration).toContain('public.operational_pos_wholesale_threshold()')
    expect(migration).toContain("old_result.result_status = 'created'")
    expect(migration).toContain("and wanted_channel = 'pos' then")
    expect(migration).toContain('existing sales, wholesale behavior, allocations, and open-shift rates unchanged')
  })
})
