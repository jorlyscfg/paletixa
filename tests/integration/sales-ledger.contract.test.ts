import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { promisify } from 'node:util'
import { createClient, type InsForgeClient } from '@insforge/sdk'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const exec = promisify(execFile)
const validationBranch = 'admin-branch-access-foundation-validation'
const repeatable = process.env.SALES_LEDGER_REPEATABLE === '1'
const fixture = {
  userId: crypto.randomUUID(),
  email: `sales-ledger-${crypto.randomUUID()}@example.invalid`,
  password: `${randomBytes(32).toString('base64url')}aA1!`,
  retailProductId: crypto.randomUUID(),
  inactiveProductId: crypto.randomUUID(),
}
let client: InsForgeClient
let baseUrl: string
let reportFrom: string
let reportTo: string
let baseline: ReportRow[]

type ReportRow = { channel: string; sale_count: number | string; total_mxn: number | string }
type DetailRow = {
  sale_id: string
  sale_date: string
  channel: string
  total_mxn: number | string
  product_name: string
  quantity: number | string
  line_total_mxn: number | string
  context_label: string | null
}
type SaleDetails = Record<string, unknown>

async function cli(command: string[]) {
  const { stdout } = await exec('npx', ['-y', '@insforge/cli', ...command, '--json'], {
    cwd: process.cwd(), maxBuffer: 1024 * 1024,
  })
  return JSON.parse(stdout)
}

const query = async (sql: string) => (await cli(['db', 'query', sql])).rows as Record<string, unknown>[]
async function data<T>(operation: PromiseLike<{ data: T; error: unknown }>) {
  const result = await operation
  if (result.error) throw result.error
  return result.data
}

async function assertValidationBranch() {
  const current = (await cli(['current'])).project
  const branches = (await cli(['branch', 'list'])).data
  const activeBranch = branches.find((branch: { id: string }) => branch.id === current.project_id)
  const parent = activeBranch && await cli(['projects', 'get', '--project', activeBranch.parent_project_id])
  if (activeBranch?.name !== validationBranch || activeBranch.branch_metadata?.mode !== 'schema-only' || parent?.name !== 'paletixa') {
    throw new Error('Refusing sales ledger mutations outside the paletixa schema-only validation branch')
  }
  return current
}

beforeAll(async () => {
  if (!repeatable) return
  const current = await assertValidationBranch()
  baseUrl = current.oss_host
  await query(`insert into auth.users(id,email,password,email_verified) values ('${fixture.userId}','${fixture.email}',crypt('${fixture.password}',gen_salt('bf')),true);
    insert into public.profiles(user_id,is_active) values ('${fixture.userId}',true);
    insert into public.user_roles select '${fixture.userId}',id from public.roles where key='admin';
    insert into public.products(id,name,sku,category,retail_price_mxn,wholesale_price_mxn,active) values
      ('${fixture.retailProductId}','Ledger Mango','LEDGER-MANGO-${fixture.retailProductId.slice(0,8)}','Test',10.50,7.25,true),
      ('${fixture.inactiveProductId}','Inactive Ledger Product','LEDGER-INACTIVE-${fixture.inactiveProductId.slice(0,8)}','Test',12.00,8.00,false)`)
  const auth = createClient({ baseUrl })
  const session = await data(auth.auth.signInWithPassword({ email: fixture.email, password: fixture.password }))
  client = createClient({ baseUrl, accessToken: session!.accessToken! })
  const start = new Date()
  start.setUTCHours(0, 0, 0, 0)
  reportFrom = start.toISOString()
  reportTo = new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString()
  baseline = await data<ReportRow[]>(client.database.rpc('report_sales_by_channel', { p_from: reportFrom, p_to: reportTo }))
}, 30_000)

afterAll(async () => {
  if (!repeatable) return
  await assertValidationBranch()
  await query(`delete from public.sales where created_by='${fixture.userId}';
    delete from public.products where id in ('${fixture.retailProductId}','${fixture.inactiveProductId}');
    delete from auth.users where id='${fixture.userId}'`)
  expect(await query(`select
    (select count(*)::int from auth.users where id='${fixture.userId}') users,
    (select count(*)::int from public.profiles where user_id='${fixture.userId}') profiles,
    (select count(*)::int from public.user_roles where user_id='${fixture.userId}') roles,
    (select count(*)::int from public.sales where created_by='${fixture.userId}') sales,
    (select count(*)::int from public.sale_items where sale_id not in (select id from public.sales)) orphan_items,
    (select count(*)::int from public.products where id in ('${fixture.retailProductId}','${fixture.inactiveProductId}')) products`))
    .toEqual([{ users: 0, profiles: 0, roles: 0, sales: 0, orphan_items: 0, products: 0 }])
}, 30_000)

describe.skipIf(!repeatable)('shared sales ledger contracts', () => {
  const record = (requestId: string, channel: string, items: unknown[], details: SaleDetails) => data<{ sale_id: string; channel: string; total_mxn: number | string; result_status: string }[]>(client.database.rpc('record_sale', {
    p_request_id: requestId, p_channel: channel, p_items: items, p_details: details,
  }))

  it('uses the retail price for POS and events, wholesale price for wholesale, and snapshots items', async () => {
    const posRequest = crypto.randomUUID()
    const wholesaleRequest = crypto.randomUUID()
    const pos = await record(posRequest, 'pos', [{ product_id: fixture.retailProductId, quantity: 2 }], { customer_name: 'Contract POS', payment_method: 'cash' })
    const wholesale = await record(wholesaleRequest, 'wholesale', [{ product_id: fixture.retailProductId, quantity: 2 }], { customer_name: 'Contract Wholesale', phone: '55 1234 5678', delivery_method: 'delivery', payment_method: 'credit' })
    expect(Number(pos[0].total_mxn)).toBe(21)
    expect(Number(wholesale[0].total_mxn)).toBe(14.5)
    const items = await data<Record<string, unknown>[]>(client.database.from('sale_items').select('product_id, product_name, unit_price_mxn, quantity, line_total_mxn').eq('sale_id', pos[0].sale_id))
    expect(items).toEqual([expect.objectContaining({ product_id: fixture.retailProductId, product_name: 'Ledger Mango', quantity: 2 })])
    expect(Number(items[0].unit_price_mxn)).toBe(10.5)
    expect(Number(items[0].line_total_mxn)).toBe(21)
    const contexts = await data<Record<string, unknown>[]>(client.database.from('sales').select('business_context').eq('id', pos[0].sale_id))
    expect(contexts).toEqual([{ business_context: { customer_name: 'Contract POS', payment_method: 'cash' } }])
  }, 20_000)

  it('accepts an event without an advance, rejects a positive advance without a method, and accepts a positive advance with a method', async () => {
    const eventDetails = { event_name: 'Contract Event', event_date: '2026-09-12', responsible_name: 'Contract Responsible' }
    const noAdvance = await record(crypto.randomUUID(), 'event', [{ product_id: fixture.retailProductId, quantity: 3 }], eventDetails)
    expect(Number(noAdvance[0].total_mxn)).toBe(31.5)

    await expect(record(crypto.randomUUID(), 'event', [{ product_id: fixture.retailProductId, quantity: 3 }], {
      ...eventDetails,
      advance_amount_mxn: 250,
    })).rejects.toThrow(/advance payment method/i)

    const paidAdvance = await record(crypto.randomUUID(), 'event', [{ product_id: fixture.retailProductId, quantity: 3 }], {
      ...eventDetails,
      advance_amount_mxn: 250,
      advance_payment_method: 'card',
    })
    expect(Number(paidAdvance[0].total_mxn)).toBe(31.5)
  }, 20_000)

  it('replays the same request without creating another sale and rejects payload conflicts', async () => {
    const requestId = crypto.randomUUID()
    const details = { payment_method: 'cash' }
    const first = await record(requestId, 'pos', [{ product_id: fixture.retailProductId, quantity: 1 }], details)
    const replay = await record(requestId, 'pos', [{ product_id: fixture.retailProductId, quantity: 1 }], details)
    expect(replay).toEqual(first.map((row) => ({ ...row, result_status: 'replayed' })))
    await expect(record(requestId, 'pos', [{ product_id: fixture.retailProductId, quantity: 2 }], details)).rejects.toThrow(/conflict/i)
    await expect(record(requestId, 'pos', [{ product_id: fixture.retailProductId, quantity: 1 }], { payment_method: 'card' })).rejects.toThrow(/conflict/i)
    const rows = await data<Record<string, unknown>[]>(client.database.from('sales').select('id').eq('request_id', requestId))
    expect(rows).toHaveLength(1)
  }, 20_000)

  it('rejects invalid channels, quantities, missing products, and inactive products atomically', async () => {
    await expect(record(crypto.randomUUID(), 'counter', [{ product_id: fixture.retailProductId, quantity: 1 }], { payment_method: 'cash' })).rejects.toThrow(/channel/i)
    await expect(record(crypto.randomUUID(), 'pos', [{ product_id: fixture.retailProductId, quantity: 0 }], { payment_method: 'cash' })).rejects.toThrow(/positive integer/i)
    await expect(record(crypto.randomUUID(), 'pos', [{ product_id: crypto.randomUUID(), quantity: 1 }], { payment_method: 'cash' })).rejects.toThrow(/not found/i)
    await expect(record(crypto.randomUUID(), 'pos', [{ product_id: fixture.inactiveProductId, quantity: 1 }], { payment_method: 'cash' })).rejects.toThrow(/not found or inactive/i)
    await expect(record(crypto.randomUUID(), 'event', [{ product_id: fixture.retailProductId, quantity: 1 }], { event_name: 'Bad Date', event_date: '2026-02-30', responsible_name: 'Tester', advance_payment_method: 'cash' })).rejects.toThrow(/ISO date/i)
    await expect(record(crypto.randomUUID(), 'event', [{ product_id: fixture.retailProductId, quantity: 1 }], { event_name: 'Negative', event_date: '2026-09-12', responsible_name: 'Tester', advance_amount_mxn: -1, advance_payment_method: 'cash' })).rejects.toThrow(/negative/i)
  }, 20_000)

  it('aggregates all three channels and always returns the complete report shape', async () => {
    const report = await data<ReportRow[]>(client.database.rpc('report_sales_by_channel', { p_from: reportFrom, p_to: reportTo }))
    expect(report.map(({ channel }) => channel)).toEqual(['pos', 'wholesale', 'event'])
    const before = Object.fromEntries(baseline.map((row) => [row.channel, row]))
    const after = Object.fromEntries(report.map((row) => [row.channel, row]))
    expect(Number(after.pos.sale_count) - Number(before.pos.sale_count)).toBe(2)
    expect(Number(after.wholesale.sale_count) - Number(before.wholesale.sale_count)).toBe(1)
    expect(Number(after.event.sale_count) - Number(before.event.sale_count)).toBe(2)
    expect(Number(after.pos.total_mxn) - Number(before.pos.total_mxn)).toBe(31.5)
    expect(Number(after.wholesale.total_mxn) - Number(before.wholesale.total_mxn)).toBe(14.5)
    expect(Number(after.event.total_mxn) - Number(before.event.total_mxn)).toBe(63)
  }, 20_000)

  it('returns safe detail rows for all channels and filters by date', async () => {
    const detail = await data<DetailRow[]>(client.database.rpc('report_sales_detail', {
      p_from: reportFrom, p_to: reportTo, p_limit: 100,
    }))
    const fixtureRows = detail.filter((row) => ['Contract POS', 'Contract Wholesale', 'Contract Event'].includes(row.context_label ?? ''))
    expect(fixtureRows.map((row) => row.channel)).toEqual(expect.arrayContaining(['pos', 'wholesale', 'event']))
    expect(fixtureRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ channel: 'pos', product_name: 'Ledger Mango', quantity: 2, line_total_mxn: 21, context_label: 'Contract POS' }),
      expect.objectContaining({ channel: 'wholesale', product_name: 'Ledger Mango', quantity: 2, line_total_mxn: 14.5, context_label: 'Contract Wholesale' }),
      expect.objectContaining({ channel: 'event', product_name: 'Ledger Mango', quantity: 3, line_total_mxn: 31.5, context_label: 'Contract Event' }),
    ]))
    expect(Object.keys(fixtureRows[0])).toEqual([
      'sale_id', 'sale_date', 'channel', 'total_mxn', 'product_name', 'quantity', 'line_total_mxn', 'context_label',
    ])
    const previousDay = new Date(new Date(reportFrom).getTime() - 24 * 60 * 60 * 1000).toISOString()
    const previousDetail = await data<DetailRow[]>(client.database.rpc('report_sales_detail', {
      p_from: previousDay, p_to: reportFrom, p_limit: 100,
    }))
    expect(previousDetail.filter((row) => ['Contract POS', 'Contract Wholesale', 'Contract Event'].includes(row.context_label ?? ''))).toEqual([])
  }, 20_000)

  it('does not expose either privileged RPC to anonymous callers', async () => {
    const anonymous = createClient({ baseUrl })
    await expect(data(anonymous.database.rpc('record_sale', { p_request_id: crypto.randomUUID(), p_channel: 'pos', p_items: [], p_details: { payment_method: 'cash' } }))).rejects.toThrow()
    await expect(data(anonymous.database.rpc('report_sales_by_channel', { p_from: reportFrom, p_to: reportTo }))).rejects.toThrow()
    await expect(data(anonymous.database.rpc('report_sales_detail', { p_from: reportFrom, p_to: reportTo, p_limit: 100 }))).rejects.toThrow()
  }, 20_000)
})
