import { beforeEach, describe, expect, it, vi } from 'vitest'

const sdk = vi.hoisted(() => ({ database: { rpc: vi.fn() } }))
vi.mock('../../../lib/insforge', () => ({ insforge: sdk }))
import { closePosShift, DEFAULT_POS_USD_MXN_RATE, getActivePosShift, getCurrentPosShift, getPosDailySales, openPosShift } from './posShifts'

const row = {
  shift_id: 'shift-1', cashier_id: 'cashier-1', branch_id: 'branch-1', branch_name: 'Central', status: 'open',
  opening_cash_mxn: '500.00', usd_mxn_rate: '17.25', opened_at: '2026-08-21T10:00:00Z', closed_at: null,
  cash_sales_mxn: '100.00', cash_sales_usd: '20.00', card_sales_mxn: '250.00',
  closing_cash_mxn: null, closing_cash_usd: null, closing_card_mxn: null,
  cash_mxn_difference: null, cash_usd_difference: null, card_difference: null,
}

describe('POS shift API', () => {
  beforeEach(() => vi.resetAllMocks())

  it('uses the default USD rate and opens with cash only', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [row], error: null })
    await openPosShift({ initialCashMxn: 500 })
    expect(sdk.database.rpc).toHaveBeenCalledWith('open_pos_shift', { p_initial_cash_mxn: 500, p_usd_mxn_rate: DEFAULT_POS_USD_MXN_RATE })
  })

  it('allows an edited USD rate and maps reconciliation fields', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [{ ...row, status: 'closed', closing_cash_mxn: '600', closing_cash_usd: '20', closing_card_mxn: '250', cash_mxn_difference: '0' }], error: null })
    await expect(closePosShift({ shiftId: 'shift-1', closingCashMxn: 600, closingCashUsd: 20, closingCardMxn: 250 })).resolves.toMatchObject({
      status: 'closed', closingCashMxn: 600, closingCashUsd: 20, closingCardMxn: 250, cashMxnDifference: 0,
    })
    expect(sdk.database.rpc).toHaveBeenCalledWith('close_pos_shift', {
      p_shift_id: 'shift-1', p_closing_cash_mxn: 600, p_closing_cash_usd: 20, p_closing_card_mxn: 250,
    })
  })

  it('returns null when there is no active shift', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [], error: null })
    await expect(getActivePosShift()).resolves.toBeNull()
  })

  it('loads the latest reconciled shift for the current operator', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [{ ...row, status: 'closed', closing_cash_mxn: '610.00', closing_cash_usd: '20.00', closing_card_mxn: '250.00', cash_mxn_difference: '10.00' }], error: null })
    await expect(getCurrentPosShift()).resolves.toMatchObject({ status: 'closed', closingCashMxn: 610, cashMxnDifference: 10 })
    expect(sdk.database.rpc).toHaveBeenCalledWith('get_current_pos_shift')
  })

  it('maps the authenticated POS daily-sales summary contract', async () => {
    sdk.database.rpc.mockResolvedValue({ data: [{
      sale_id: 'sale-1',
      created_at: '2026-08-22T10:15:00Z',
      total_mxn: '85.00',
      payment_method: 'cash',
      payment_currency: 'mxn',
      line_items: [{ name: 'Mango', category: 'Paletas', quantity: 2, unit_total_mxn: '42.50' }],
    }], error: null })

    await expect(getPosDailySales()).resolves.toEqual([{
      id: 'sale-1',
      createdAt: '2026-08-22T10:15:00Z',
      totalMxn: 85,
      paymentMethod: 'cash',
      paymentCurrency: 'mxn',
      items: [{ name: 'Mango', category: 'Paletas', quantity: 2, unitTotalMxn: 42.5 }],
    }])
    expect(sdk.database.rpc).toHaveBeenCalledWith('get_pos_daily_sales', { p_limit: 100 })
  })

  it('validates the daily-sales limit before the RPC', async () => {
    await expect(getPosDailySales(101)).rejects.toThrow('between 1 and 100')
    expect(sdk.database.rpc).not.toHaveBeenCalled()
  })

  it('rejects negative opening cash before the RPC', async () => {
    await expect(openPosShift({ initialCashMxn: -1 })).rejects.toThrow('non-negative')
    expect(sdk.database.rpc).not.toHaveBeenCalled()
  })
})
