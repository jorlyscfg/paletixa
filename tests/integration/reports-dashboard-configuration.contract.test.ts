import { execFile } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { createClient, type InsForgeClient } from '@insforge/sdk'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const exec = promisify(execFile)
const repeatable = process.env.REPORTS_DASHBOARD_REPEATABLE === '1'
// `dev` is shared, so every repeatable run must remove all of its marker fixtures.
const validationBranch = 'dev'
const runId = randomUUID()
const marker = `reports-dashboard-contract:${runId}`

const ids = {
  admin: '20000000-0000-0000-0000-000000000051',
  eventManager: '20000000-0000-0000-0000-000000000052',
  denied: '20000000-0000-0000-0000-000000000053',
  eventManagerRole: '30000000-0000-0000-0000-000000000051',
  branchA: randomUUID(),
  branchB: randomUUID(),
  suspendedBranch: randomUUID(),
  category: randomUUID(),
  product: randomUUID(),
  customer: randomUUID(),
  shift: randomUUID(),
  posBoundary: randomUUID(),
  posAtStart: randomUUID(),
  posReversed: randomUUID(),
  posBranchB: randomUUID(),
  wholesaleOld: randomUUID(),
  wholesaleCurrent: randomUUID(),
  wholesaleReversed: randomUUID(),
  wholesalePending: randomUUID(),
  wholesaleProcessing: randomUUID(),
  wholesaleCancelled: randomUUID(),
  wholesaleDeleted: randomUUID(),
  eventPending: randomUUID(),
  eventReserved: randomUUID(),
  eventCompleted: randomUUID(),
  eventCancelled: randomUUID(),
}

const requestIds = {
  wholesaleOld: randomUUID(),
  wholesaleCurrent: randomUUID(),
  wholesaleReversed: randomUUID(),
  wholesalePending: randomUUID(),
  wholesaleProcessing: randomUUID(),
  wholesaleCancelled: randomUUID(),
  wholesaleDeleted: randomUUID(),
  eventPending: randomUUID(),
  eventReserved: randomUUID(),
  eventCompleted: randomUUID(),
  eventCancelled: randomUUID(),
  eventCompletionMutation: randomUUID(),
}

const passwords = {
  admin: `${randomBytes(32).toString('base64url')}aA1!`,
  eventManager: `${randomBytes(32).toString('base64url')}aA1!`,
  denied: `${randomBytes(32).toString('base64url')}aA1!`,
}

const emails = {
  admin: 'reports-dashboard-contract-admin@example.invalid',
  eventManager: 'reports-dashboard-contract-event-manager@example.invalid',
  denied: 'reports-dashboard-contract-denied@example.invalid',
}

const eventManagerRoleKey = `reports_dashboard_event_manager_${runId.replaceAll('-', '')}`
const customerMobile = `+5255${String(Number.parseInt(runId.replaceAll('-', '').slice(0, 8), 16) % 100000000).padStart(8, '0')}`

type CliProject = { project_id: string; project_name?: string; oss_host: string; branched_from?: { project_name?: string } }
type CliBranch = { id: string; parent_project_id: string; name: string; branch_metadata?: { mode?: string } }
type QueryRow = Record<string, unknown>

type SettingRow = {
  key: string
  type: 'integer' | 'rate'
  value: number | string
  scope: 'global'
  owner_id: string
  state: 'configured' | 'compatibility-default'
  effective_at: string | null
  result_status: 'created' | 'replayed' | null
}
type ReportTimezoneRow = {
  timezone: 'America/Cancun' | 'America/Mexico_City'
  scope: 'global'
  owner_id: string
  state: 'configured' | 'compatibility-default'
  effective_at: string | null
  result_status: 'created' | 'replayed' | null
}

type ChannelTotal = { channel: string; sale_count: number | string; total_mxn: number | string }
type DailyPoint = { date: string; sale_count: number | string; total_mxn: number | string }
type ProductAggregate = {
  line_kind: 'product' | 'category'
  product_id: string | null
  product_name: string
  category_id: string | null
  category_name: string | null
  quantity: number | string
  total_mxn: number | string
}
type ReportSnapshot = {
  from: string
  to: string
  timezone: string
  utc_from: string
  utc_to: string
  scope: { kind: string; branch_id: string | null; branch_name: string | null; includes_unassigned: boolean }
  sales: {
    total_mxn: number | string
    count: number | string
    average_ticket_mxn: number | string
    average_state: string
    channels: ChannelTotal[]
    daily: DailyPoint[]
    products: ProductAggregate[]
  }
  operations: {
    wholesale: { scope: string; pending_count: number | string; processing_count: number | string; workload_count: number | string }
    event: { scope: string; pending_count: number | string; reserved_count: number | string; allocated_count: number | string; capacity_limit: number | string; available_count: number | string }
    pos: { scope: string; open_shift_count: number | string }
  }
}

type PosSaleRow = {
  sale_id: string
  total_mxn: number | string
  usd_mxn_rate: number | string | null
  usd_equivalent: number | string | null
  result_status: string
  items: Array<Record<string, unknown>> | null
}

let client: InsForgeClient
let eventManagerClient: InsForgeClient
let deniedClient: InsForgeClient
let baseUrl = ''
let baselineAll: ReportSnapshot
let baselineBranchA: ReportSnapshot
let baselineBranchB: ReportSnapshot
let initialConfiguration: SettingRow[] = []
let initialReportTimezone: ReportTimezoneRow
const createdSaleIds: string[] = []

function sqlText(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

async function cli(command: string[]) {
  const { stdout } = await exec('npx', ['-y', '@insforge/cli', ...command, '--json'], {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024,
  })
  return JSON.parse(stdout) as QueryRow
}

const query = async (sql: string) => (await cli(['db', 'query', sql])).rows as QueryRow[]

async function data<T>(operation: PromiseLike<{ data: T; error: unknown }>) {
  const result = await operation
  if (result.error) throw result.error
  return result.data
}

async function assertValidationBranch() {
  const current = (await cli(['current'])).project as unknown as CliProject
  const branches = (await cli(['branch', 'list'])).data as unknown as CliBranch[]
  const activeBranch = branches.find((branch) => branch.id === current.project_id)
  if (current.project_name !== validationBranch || activeBranch?.name !== validationBranch || activeBranch.branch_metadata?.mode !== 'schema-only' || current.branched_from?.project_name !== 'paletixa') {
    throw new Error('Refusing reports dashboard mutations outside the paletixa schema-only dev branch')
  }
  return current
}

async function signIn(email: string, password: string) {
  const auth = createClient({ baseUrl })
  const session = await data(auth.auth.signInWithPassword({ email, password }))
  return createClient({ baseUrl, accessToken: session!.accessToken! })
}

async function snapshot(scope = 'all', branchId: string | null = null, requestedTimezone = 'America/Cancun') {
  return data<ReportSnapshot>(client.database.rpc('report_dashboard_snapshot', {
    p_from: '2026-08-27',
    p_to: '2026-08-28',
    p_timezone: requestedTimezone,
    p_scope: scope,
    p_branch_id: branchId,
  }))
}

function numeric(value: number | string) {
  return Number(value)
}

function channel(report: ReportSnapshot, name: string) {
  const value = report.sales.channels.find((row) => row.channel === name)
  if (!value) throw new Error(`Missing channel ${name}`)
  return value
}

function day(report: ReportSnapshot, date: string) {
  const value = report.sales.daily.find((row) => row.date === date)
  if (!value) throw new Error(`Missing report day ${date}`)
  return value
}

function setting(rows: SettingRow[], key: string) {
  const value = rows.find((row) => row.key === key)
  if (!value) throw new Error(`Missing setting ${key}`)
  return value
}

function setConfiguration(key: string, value: unknown, requestId = randomUUID(), scope = 'global') {
  return data<SettingRow[]>(client.database.rpc('set_operational_configuration', {
    p_request_id: requestId,
    p_key: key,
    p_value: value,
    p_scope: scope,
  }))
}

function setReportTimezone(timezone: string, requestId = randomUUID()) {
  return data<ReportTimezoneRow[]>(client.database.rpc('set_report_timezone_configuration', {
    p_request_id: requestId,
    p_timezone: timezone,
  }))
}

async function recordPosSale(items: unknown[], details: Record<string, unknown>) {
  const rows = await data<PosSaleRow[]>(client.database.rpc('record_sale', {
    p_request_id: randomUUID(),
    p_channel: 'pos',
    p_items: items,
    p_details: details,
  }))
  if (!rows[0]) throw new Error('POS contract sale was not created')
  createdSaleIds.push(rows[0].sale_id)
  return rows[0]
}

function eventReservationInsert(id: string, requestId: string, status: string) {
  return `insert into public.event_reservations(
    id, request_id, created_by, origin, status, event_date,
    customer_name, customer_phone, payment_plan, total_mxn,
    declared_payment_amount, declared_payment_method, payload_hash
  ) values (
    ${sqlText(id)}, ${sqlText(requestId)}, ${sqlText(ids.admin)}, 'phone', ${sqlText(status)}, '2026-08-28',
    'Reports Event', ${sqlText(customerMobile)}, 'full', 10,
    10, 'cash', ${sqlText(`${marker}:${id}`)}
  )`
}

async function cleanupCatalogFixtures() {
  let firstError: unknown
  for (const statement of [
    `delete from public.products where id = ${sqlText(ids.product)};`,
    `delete from public.product_categories where id = ${sqlText(ids.category)};`,
  ]) {
    try {
      await query(statement)
    } catch (error) {
      firstError ??= error
    }
  }
  if (firstError) throw firstError
}

async function workflowSnapshot() {
  const eventRows = await query(`
    select
      (select count(*)::int from public.event_reservations
       where id in (${sqlText(ids.eventPending)}, ${sqlText(ids.eventReserved)}, ${sqlText(ids.eventCompleted)}, ${sqlText(ids.eventCancelled)})) as event_rows,
      (select count(*)::int from public.event_reservations
       where id in (${sqlText(ids.eventPending)}, ${sqlText(ids.eventReserved)}, ${sqlText(ids.eventCompleted)}, ${sqlText(ids.eventCancelled)})
         and status = 'reserved') as event_reserved_rows,
      (select count(*)::int from public.event_reservations
       where id in (${sqlText(ids.eventPending)}, ${sqlText(ids.eventReserved)}, ${sqlText(ids.eventCompleted)}, ${sqlText(ids.eventCancelled)})
         and status = 'completed') as event_completed_rows,
      (select count(*)::int from public.event_reservations
       where id in (${sqlText(ids.eventPending)}, ${sqlText(ids.eventReserved)}, ${sqlText(ids.eventCompleted)}, ${sqlText(ids.eventCancelled)})
         and status = 'cancelled') as event_cancelled_rows,
      (select count(*)::int from public.event_reservations
       where id in (${sqlText(ids.eventPending)}, ${sqlText(ids.eventReserved)}, ${sqlText(ids.eventCompleted)}, ${sqlText(ids.eventCancelled)})
         and cart_allocated = true) as event_allocated_rows,
      (select count(*)::int from public.pos_shifts where id = ${sqlText(ids.shift)}) as shift_rows,
      (select usd_mxn_rate from public.pos_shifts where id = ${sqlText(ids.shift)}) as shift_rate
  `)
  return [{
    event_rows: eventRows[0].event_rows,
    event_reserved_rows: eventRows[0].event_reserved_rows,
    event_completed_rows: eventRows[0].event_completed_rows,
    event_cancelled_rows: eventRows[0].event_cancelled_rows,
    event_allocated_rows: eventRows[0].event_allocated_rows,
    shift_rows: eventRows[0].shift_rows,
    shift_rate: eventRows[0].shift_rate,
  }]
}

beforeAll(async () => {
  if (!repeatable) return

  const current = await assertValidationBranch()
  baseUrl = current.oss_host

  await query(`
    insert into auth.users(id, email, password, email_verified) values
      (${sqlText(ids.admin)}, ${sqlText(emails.admin)}, crypt(${sqlText(passwords.admin)}, gen_salt('bf')), true),
      (${sqlText(ids.eventManager)}, ${sqlText(emails.eventManager)}, crypt(${sqlText(passwords.eventManager)}, gen_salt('bf')), true),
      (${sqlText(ids.denied)}, ${sqlText(emails.denied)}, crypt(${sqlText(passwords.denied)}, gen_salt('bf')), true)
    on conflict (id) do update set
      email = excluded.email,
      password = excluded.password,
      email_verified = true;
    insert into public.profiles(user_id, is_active) values
      (${sqlText(ids.admin)}, true),
      (${sqlText(ids.eventManager)}, true),
      (${sqlText(ids.denied)}, true)
    on conflict (user_id) do update set is_active = true;
    insert into public.roles(id, key)
    values (${sqlText(ids.eventManagerRole)}, ${sqlText(eventManagerRoleKey)})
    on conflict (id) do update set key = excluded.key;
    delete from public.user_roles where user_id in (${sqlText(ids.eventManager)}, ${sqlText(ids.denied)});
    insert into public.user_roles(user_id, role_id)
    select ${sqlText(ids.admin)}, role.id from public.roles as role where role.key = 'admin'
    on conflict do nothing;
    insert into public.user_roles(user_id, role_id)
    select ${sqlText(ids.eventManager)}, role.id from public.roles as role where role.id = ${sqlText(ids.eventManagerRole)}
    on conflict do nothing;
    insert into public.role_capabilities(role_id, capability_id)
    select ${sqlText(ids.eventManagerRole)}, capability.id
    from public.capabilities as capability
    where capability.key = 'events.manage'
    on conflict do nothing;
    insert into public.branches(id, name, status) values
      (${sqlText(ids.branchA)}, ${sqlText(`${marker} Branch A`)}, 'active'),
      (${sqlText(ids.branchB)}, ${sqlText(`${marker} Branch B`)}, 'active'),
      (${sqlText(ids.suspendedBranch)}, ${sqlText(`${marker} Suspended`)}, 'suspended');
    insert into public.product_categories(id, name) values
      (${sqlText(ids.category)}, ${sqlText(`${marker} Category`)});
    insert into public.products(id, name, sku, category_id, retail_price_mxn, wholesale_price_mxn, active) values
      (${sqlText(ids.product)}, ${sqlText(`${marker} Product`)}, ${sqlText(`REPORTS-${runId.slice(0, 8)}`)}, ${sqlText(ids.category)}, 13, 10, true);
    insert into public.wholesale_customers(id, name, mobile, email, pin_hash, current_pin)
    values (${sqlText(ids.customer)}, ${sqlText(`${marker} Customer`)}, ${sqlText(customerMobile)}, 'reports@example.invalid', crypt('1234', gen_salt('bf')), '1234');
  `)

  client = await signIn(emails.admin, passwords.admin)
  eventManagerClient = await signIn(emails.eventManager, passwords.eventManager)
  deniedClient = await signIn(emails.denied, passwords.denied)

  initialConfiguration = await data<SettingRow[]>(client.database.rpc('get_operational_configuration', { p_scope: 'global' }))
  expect(initialConfiguration).toHaveLength(3)
  expect(initialConfiguration.map((row) => [row.key, row.type, numeric(row.value), row.scope, row.state, row.effective_at])).toEqual([
    ['event_daily_capacity', 'integer', 7, 'global', 'compatibility-default', null],
    ['pos_usd_mxn_rate', 'rate', 15, 'global', 'compatibility-default', null],
    ['pos_wholesale_threshold', 'integer', 10, 'global', 'compatibility-default', null],
  ])
  initialConfiguration.forEach((row) => expect(row.owner_id).toMatch(/^[0-9a-f-]{36}$/i))

  const timezoneRows = await data<ReportTimezoneRow[]>(client.database.rpc('get_report_timezone_configuration'))
  expect(timezoneRows).toHaveLength(1)
  expect(timezoneRows[0]).toMatchObject({ timezone: 'America/Cancun', scope: 'global', state: 'compatibility-default', effective_at: null, result_status: null })
  initialReportTimezone = timezoneRows[0]

  baselineAll = await snapshot()
  baselineBranchA = await snapshot('branch', ids.branchA)
  baselineBranchB = await snapshot('branch', ids.branchB)

  await query(`
    insert into public.pos_shifts(id, cashier_id, branch_id, status, opening_cash_mxn, usd_mxn_rate, opened_at)
    values (${sqlText(ids.shift)}, ${sqlText(ids.admin)}, ${sqlText(ids.branchA)}, 'open', 100, 23.5, '2026-08-27 12:00:00+00');

    ${eventReservationInsert(ids.eventPending, requestIds.eventPending, 'pending')};
    ${eventReservationInsert(ids.eventReserved, requestIds.eventReserved, 'reserved')};
    ${eventReservationInsert(ids.eventCompleted, requestIds.eventCompleted, 'reserved')};
    ${eventReservationInsert(ids.eventCancelled, requestIds.eventCancelled, 'reserved')};
    update public.event_reservations
    set confirmed_payment_amount = 10, confirmed_payment_method = 'cash',
        payment_confirmed_at = now(), payment_confirmed_by = ${sqlText(ids.admin)},
        remaining_payment_amount = 0, reserved_at = now(), reserved_by = ${sqlText(ids.admin)},
        cart_allocated = true
    where id in (${sqlText(ids.eventReserved)}, ${sqlText(ids.eventCompleted)}, ${sqlText(ids.eventCancelled)});
    insert into public.event_reservation_items(
      reservation_id, line_kind, product_id, product_name, unit_price_mxn, quantity, line_total_mxn
    ) values (${sqlText(ids.eventCompleted)}, 'product', ${sqlText(ids.product)}, ${sqlText(`${marker} Product`)}, 10, 3, 30);

    insert into public.wholesale_orders(
      id, request_id, customer_id, created_by, source, status, payment_method, total_mxn, payload_hash,
      created_at, completed_at, payment_amount, payment_currency, payment_confirmed_at,
      payment_confirmed_by, delivery_agreement, cancelled_at, deleted_at, deleted_by, deletion_reason, sale_id
    ) values
      (${sqlText(ids.wholesaleOld)}, ${sqlText(requestIds.wholesaleOld)}, ${sqlText(ids.customer)}, ${sqlText(ids.admin)}, 'admin', 'completed', 'cash', 20, ${sqlText(`${marker}:wholesale-old`)}, '2026-08-27 10:00:00+00', '2026-08-27 10:00:00+00', 20, 'mxn', '2026-08-27 10:00:00+00', ${sqlText(ids.admin)}, 'pickup', null, null, null, null, null),
      (${sqlText(ids.wholesaleCurrent)}, ${sqlText(requestIds.wholesaleCurrent)}, ${sqlText(ids.customer)}, ${sqlText(ids.admin)}, 'admin', 'completed', 'cash', 20, ${sqlText(`${marker}:wholesale-current`)}, '2026-08-28 13:00:00+00', '2026-08-28 13:00:00+00', 20, 'mxn', '2026-08-28 13:00:00+00', ${sqlText(ids.admin)}, 'pickup', null, null, null, null, null),
      (${sqlText(ids.wholesaleReversed)}, ${sqlText(requestIds.wholesaleReversed)}, ${sqlText(ids.customer)}, ${sqlText(ids.admin)}, 'admin', 'completed', 'cash', 20, ${sqlText(`${marker}:wholesale-reversed`)}, '2026-08-28 16:00:00+00', '2026-08-28 16:00:00+00', 20, 'mxn', '2026-08-28 16:00:00+00', ${sqlText(ids.admin)}, 'pickup', null, null, null, null, null);
    insert into public.wholesale_orders(
      id, request_id, customer_id, source, status, payment_method, total_mxn, payload_hash, created_at
    ) values
      (${sqlText(ids.wholesalePending)}, ${sqlText(requestIds.wholesalePending)}, ${sqlText(ids.customer)}, 'customer', 'pending', 'cash', 10, ${sqlText(`${marker}:wholesale-pending`)}, '2026-08-28 09:00:00+00'),
      (${sqlText(ids.wholesaleProcessing)}, ${sqlText(requestIds.wholesaleProcessing)}, ${sqlText(ids.customer)}, 'customer', 'processing', 'cash', 10, ${sqlText(`${marker}:wholesale-processing`)}, '2026-08-28 09:30:00+00');
    insert into public.wholesale_orders(
      id, request_id, customer_id, source, status, payment_method, total_mxn, payload_hash, created_at, cancelled_at
    ) values (
      ${sqlText(ids.wholesaleCancelled)}, ${sqlText(requestIds.wholesaleCancelled)}, ${sqlText(ids.customer)}, 'customer', 'cancelled', 'cash', 10, ${sqlText(`${marker}:wholesale-cancelled`)}, '2026-08-28 09:45:00+00', '2026-08-28 09:50:00+00'
    );
    insert into public.wholesale_orders(
      id, request_id, customer_id, created_by, source, status, payment_method, total_mxn, payload_hash,
      created_at, completed_at, payment_amount, payment_currency, payment_confirmed_at, payment_confirmed_by,
      delivery_agreement, deleted_at, deleted_by, deletion_reason, sale_id
    ) values (
      ${sqlText(ids.wholesaleDeleted)}, ${sqlText(requestIds.wholesaleDeleted)}, ${sqlText(ids.customer)}, ${sqlText(ids.admin)}, 'admin', 'completed', 'cash', 20, ${sqlText(`${marker}:wholesale-deleted`)},
      '2026-08-28 09:55:00+00', '2026-08-28 09:55:00+00', 20, 'mxn', '2026-08-28 09:55:00+00', ${sqlText(ids.admin)},
      'pickup', '2026-08-28 10:00:00+00', ${sqlText(ids.admin)}, 'contract fixture deletion', null
    );

    insert into public.sales(id, request_id, created_by, channel, branch_id, total_mxn, payload_hash, created_at, business_context) values
      (${sqlText(ids.posBoundary)}, ${sqlText(randomUUID())}, ${sqlText(ids.admin)}, 'pos', ${sqlText(ids.branchA)}, 11, ${sqlText(`${marker}:pos-boundary`)}, '2026-08-28 05:59:59+00', jsonb_build_object('test_run', ${sqlText(runId)}, 'payment_method', 'cash')),
      (${sqlText(ids.posAtStart)}, ${sqlText(randomUUID())}, ${sqlText(ids.admin)}, 'pos', ${sqlText(ids.branchA)}, 13, ${sqlText(`${marker}:pos-start`)}, '2026-08-28 06:00:00+00', jsonb_build_object('test_run', ${sqlText(runId)}, 'payment_method', 'cash')),
      (${sqlText(ids.posReversed)}, ${sqlText(randomUUID())}, ${sqlText(ids.admin)}, 'pos', ${sqlText(ids.branchA)}, 17, ${sqlText(`${marker}:pos-reversed`)}, '2026-08-28 15:00:00+00', jsonb_build_object('test_run', ${sqlText(runId)}, 'payment_method', 'cash')),
      (${sqlText(ids.posBranchB)}, ${sqlText(randomUUID())}, ${sqlText(ids.admin)}, 'pos', ${sqlText(ids.branchB)}, 19, ${sqlText(`${marker}:pos-branch-b`)}, '2026-08-28 12:00:00+00', jsonb_build_object('test_run', ${sqlText(runId)}, 'payment_method', 'cash')),
      (${sqlText(ids.wholesaleOld)}, ${sqlText(randomUUID())}, ${sqlText(ids.admin)}, 'wholesale', null, 20, ${sqlText(`${marker}:sale-wholesale-old`)}, '2026-08-28 11:00:00+00', jsonb_build_object('test_run', ${sqlText(runId)}, 'wholesale_order_id', ${sqlText(ids.wholesaleOld)}, 'sale_generation', 1)),
      (${sqlText(ids.wholesaleCurrent)}, ${sqlText(randomUUID())}, ${sqlText(ids.admin)}, 'wholesale', null, 20, ${sqlText(`${marker}:sale-wholesale-current`)}, '2026-08-28 13:00:00+00', jsonb_build_object('test_run', ${sqlText(runId)}, 'wholesale_order_id', ${sqlText(ids.wholesaleCurrent)}, 'sale_generation', 2)),
      (${sqlText(ids.wholesaleReversed)}, ${sqlText(randomUUID())}, ${sqlText(ids.admin)}, 'wholesale', null, 20, ${sqlText(`${marker}:sale-wholesale-reversed`)}, '2026-08-28 16:00:00+00', jsonb_build_object('test_run', ${sqlText(runId)}, 'wholesale_order_id', ${sqlText(ids.wholesaleReversed)}, 'sale_generation', 1)),
      (${sqlText(ids.wholesaleDeleted)}, ${sqlText(randomUUID())}, ${sqlText(ids.admin)}, 'wholesale', null, 20, ${sqlText(`${marker}:sale-wholesale-deleted`)}, '2026-08-28 17:00:00+00', jsonb_build_object('test_run', ${sqlText(runId)}, 'wholesale_order_id', ${sqlText(ids.wholesaleDeleted)}, 'sale_generation', 1));

    update public.wholesale_orders
    set sale_id = case id
      when ${sqlText(ids.wholesaleCurrent)} then ${sqlText(ids.wholesaleCurrent)}::uuid
      when ${sqlText(ids.wholesaleReversed)} then ${sqlText(ids.wholesaleReversed)}::uuid
      when ${sqlText(ids.wholesaleDeleted)} then ${sqlText(ids.wholesaleDeleted)}::uuid
    end
    where id in (${sqlText(ids.wholesaleCurrent)}, ${sqlText(ids.wholesaleReversed)}, ${sqlText(ids.wholesaleDeleted)});

    insert into public.sale_items(sale_id, line_kind, product_id, category_id, category_name, product_name, unit_price_mxn, quantity, line_total_mxn) values
      (${sqlText(ids.posBoundary)}, 'product', ${sqlText(ids.product)}, ${sqlText(ids.category)}, null, ${sqlText(`${marker} Product`)}, 11, 1, 11),
      (${sqlText(ids.posAtStart)}, 'product', ${sqlText(ids.product)}, ${sqlText(ids.category)}, null, ${sqlText(`${marker} Product`)}, 13, 1, 13),
      (${sqlText(ids.posReversed)}, 'product', ${sqlText(ids.product)}, ${sqlText(ids.category)}, null, ${sqlText(`${marker} Product`)}, 17, 1, 17),
      (${sqlText(ids.posBranchB)}, 'category', null, ${sqlText(ids.category)}, ${sqlText(`${marker} Category`)}, ${sqlText(`${marker} Category`)}, 9.5, 2, 19),
      (${sqlText(ids.wholesaleOld)}, 'product', ${sqlText(ids.product)}, ${sqlText(ids.category)}, null, ${sqlText(`${marker} Product`)}, 10, 2, 20),
      (${sqlText(ids.wholesaleCurrent)}, 'product', ${sqlText(ids.product)}, ${sqlText(ids.category)}, null, ${sqlText(`${marker} Product`)}, 10, 2, 20),
      (${sqlText(ids.wholesaleReversed)}, 'product', ${sqlText(ids.product)}, ${sqlText(ids.category)}, null, ${sqlText(`${marker} Product`)}, 10, 2, 20),
      (${sqlText(ids.wholesaleDeleted)}, 'product', ${sqlText(ids.product)}, ${sqlText(ids.category)}, null, ${sqlText(`${marker} Product`)}, 10, 2, 20);

    insert into public.wholesale_order_items(order_id, line_kind, product_id, category_id, category_name, product_name, unit_price_mxn, quantity, line_total_mxn) values
      (${sqlText(ids.wholesaleOld)}, 'product', ${sqlText(ids.product)}, ${sqlText(ids.category)}, null, ${sqlText(`${marker} Product`)}, 10, 2, 20),
      (${sqlText(ids.wholesaleCurrent)}, 'product', ${sqlText(ids.product)}, ${sqlText(ids.category)}, null, ${sqlText(`${marker} Product`)}, 10, 2, 20),
      (${sqlText(ids.wholesaleReversed)}, 'product', ${sqlText(ids.product)}, ${sqlText(ids.category)}, null, ${sqlText(`${marker} Product`)}, 10, 2, 20),
      (${sqlText(ids.wholesaleDeleted)}, 'product', ${sqlText(ids.product)}, ${sqlText(ids.category)}, null, ${sqlText(`${marker} Product`)}, 10, 2, 20);

    insert into public.sale_reversals(id, sale_id, wholesale_order_id, reason, reversed_by, reversed_at, request_id, correlation_id) values
      (${sqlText(randomUUID())}, ${sqlText(ids.posReversed)}, ${sqlText(ids.wholesaleCancelled)}, 'contract POS reversal', ${sqlText(ids.admin)}, now(), ${sqlText(randomUUID())}, ${sqlText(randomUUID())}),
      (${sqlText(randomUUID())}, ${sqlText(ids.wholesaleOld)}, ${sqlText(ids.wholesaleCurrent)}, 'replacement reversal', ${sqlText(ids.admin)}, now(), ${sqlText(randomUUID())}, ${sqlText(randomUUID())}),
      (${sqlText(randomUUID())}, ${sqlText(ids.wholesaleReversed)}, ${sqlText(ids.wholesaleReversed)}, 'completed reversal', ${sqlText(ids.admin)}, now(), ${sqlText(randomUUID())}, ${sqlText(randomUUID())}),
      (${sqlText(randomUUID())}, ${sqlText(ids.wholesaleDeleted)}, ${sqlText(ids.wholesaleDeleted)}, 'deleted order reversal', ${sqlText(ids.admin)}, now(), ${sqlText(randomUUID())}, ${sqlText(randomUUID())});

    insert into public.wholesale_order_sales(sale_id, order_id, generation, predecessor_sale_id, prior_reversal_id, created_by) values
      (${sqlText(ids.wholesaleOld)}, ${sqlText(ids.wholesaleCurrent)}, 1, null, null, ${sqlText(ids.admin)}),
      (${sqlText(ids.wholesaleCurrent)}, ${sqlText(ids.wholesaleCurrent)}, 2, ${sqlText(ids.wholesaleOld)}, (select reversal.id from public.sale_reversals as reversal where reversal.sale_id = ${sqlText(ids.wholesaleOld)}), ${sqlText(ids.admin)}),
      (${sqlText(ids.wholesaleReversed)}, ${sqlText(ids.wholesaleReversed)}, 1, null, null, ${sqlText(ids.admin)}),
      (${sqlText(ids.wholesaleDeleted)}, ${sqlText(ids.wholesaleDeleted)}, 1, null, null, ${sqlText(ids.admin)});

    insert into public.event_reservation_mutations(request_id, operation, reservation_id, payload_hash)
    values (${sqlText(requestIds.eventCompletionMutation)}, 'complete', ${sqlText(ids.eventCompleted)}, ${sqlText(`${marker}:event-complete`)});
    insert into public.sales(id, request_id, created_by, channel, branch_id, total_mxn, payload_hash, created_at, business_context)
    values (${sqlText(ids.eventCompleted)}, ${sqlText(requestIds.eventCompletionMutation)}, ${sqlText(ids.admin)}, 'event', null, 30, ${sqlText(`${marker}:event-complete`)}, '2026-08-28 14:00:00+00', jsonb_build_object('test_run', ${sqlText(runId)}, 'event_reservation_id', ${sqlText(ids.eventCompleted)}, 'event_date', '2026-08-20'));
    insert into public.sale_items(sale_id, line_kind, product_id, category_id, category_name, product_name, unit_price_mxn, quantity, line_total_mxn)
    values (${sqlText(ids.eventCompleted)}, 'product', ${sqlText(ids.product)}, ${sqlText(ids.category)}, null, ${sqlText(`${marker} Product`)}, 10, 3, 30);
    update public.event_reservations
    set status = 'completed', completed_at = now(), sale_id = ${sqlText(ids.eventCompleted)}, final_payment_amount = 0,
        remaining_payment_amount = 0, updated_at = now()
    where id = ${sqlText(ids.eventCompleted)};

    insert into public.sales(created_by, request_id, channel, branch_id, total_mxn, payload_hash, created_at, business_context)
    select ${sqlText(ids.admin)}, gen_random_uuid(), 'pos', ${sqlText(ids.branchA)}, 1,
      'bulk-${runId}-' || series.n::text, '2026-08-28 00:00:00+00'::timestamptz,
      jsonb_build_object('test_run', ${sqlText(runId)}, 'payment_method', 'cash')
    from generate_series(1, 101) as series(n);
    insert into public.sale_items(sale_id, line_kind, product_id, category_id, category_name, product_name, unit_price_mxn, quantity, line_total_mxn)
    select sale.id, 'product', ${sqlText(ids.product)}, ${sqlText(ids.category)}, null, ${sqlText(`${marker} Product`)}, 1, 1, 1
    from public.sales as sale
    where sale.business_context ->> 'test_run' = ${sqlText(runId)}
      and sale.payload_hash like ${sqlText(`bulk-${runId}-%`)};
  `)
}, 30_000)

afterAll(async () => {
  if (!repeatable || !baseUrl) return

  await assertValidationBranch()
  const orderIds = [ids.wholesaleOld, ids.wholesaleCurrent, ids.wholesaleReversed, ids.wholesalePending, ids.wholesaleProcessing, ids.wholesaleCancelled, ids.wholesaleDeleted]
  const reservationIds = [ids.eventPending, ids.eventReserved, ids.eventCompleted, ids.eventCancelled]
  const orderList = orderIds.map(sqlText).join(', ')
  const reservationList = reservationIds.map(sqlText).join(', ')
  const createdSaleList = createdSaleIds.map(sqlText).join(', ')
  const createdSaleCleanup = createdSaleIds.length > 0 ? `
    delete from public.sale_items where sale_id in (${createdSaleList});
    delete from public.sales where id in (${createdSaleList});
  ` : ''
  const cleanupErrors: unknown[] = []
  const attemptCleanup = async (operation: () => Promise<unknown>) => {
    try {
      await operation()
    } catch (error) {
      cleanupErrors.push(error)
    }
  }

  if (initialConfiguration.length === 3) {
    const eventInitial = setting(initialConfiguration, 'event_daily_capacity')
    const rateInitial = setting(initialConfiguration, 'pos_usd_mxn_rate')
    const thresholdInitial = setting(initialConfiguration, 'pos_wholesale_threshold')
    await attemptCleanup(() => query(`
      update public.event_configuration
      set carts_per_day = ${numeric(eventInitial.value)}, effective_at = null, updated_by = owner_id, updated_at = now()
      where singleton;
    `))
    await attemptCleanup(() => query(`
      update public.pos_configuration
      set usd_mxn_rate = ${numeric(rateInitial.value)}, usd_mxn_rate_effective_at = null,
          wholesale_threshold = ${numeric(thresholdInitial.value)}, wholesale_threshold_effective_at = null,
          updated_by = owner_id, updated_at = now()
      where singleton;
    `))
  }

  if (initialReportTimezone) {
    await attemptCleanup(() => query(`
      update public.report_timezone_configuration
      set timezone = ${sqlText(initialReportTimezone.timezone)},
          effective_at = ${initialReportTimezone.effective_at ? sqlText(initialReportTimezone.effective_at) : 'null'},
          updated_by = owner_id,
          updated_at = now()
      where singleton;
    `))
  }

  try {
    await attemptCleanup(() => query(`
      alter table public.sale_reversals disable trigger user;
      alter table public.wholesale_order_sales disable trigger user;
      alter table public.event_reservation_mutations disable trigger user;
      alter table public.wholesale_orders disable trigger user;
      alter table public.wholesale_order_events disable trigger user;
    `))
    await attemptCleanup(() => query(`
      delete from public.event_reservation_events where reservation_id in (${reservationList});
      delete from public.event_reservation_mutations where reservation_id in (${reservationList});
      delete from public.event_reservation_items where reservation_id in (${reservationList});
      delete from public.event_reservations where id in (${reservationList});
      delete from public.wholesale_order_events where order_id in (${orderList});
      delete from public.wholesale_order_sales where order_id in (${orderList});
      delete from public.sale_reversals
      where sale_id in (select sale.id from public.sales as sale where sale.business_context ->> 'test_run' = ${sqlText(runId)})
         or wholesale_order_id in (${orderList});
      delete from public.wholesale_order_items where order_id in (${orderList});
      delete from public.wholesale_orders where id in (${orderList});
      delete from public.wholesale_customers where id = ${sqlText(ids.customer)};
      delete from public.sale_items where sale_id in (select sale.id from public.sales as sale where sale.business_context ->> 'test_run' = ${sqlText(runId)});
      delete from public.sales where business_context ->> 'test_run' = ${sqlText(runId)};
      ${createdSaleCleanup}
      delete from public.pos_shifts where id = ${sqlText(ids.shift)};
      delete from public.branches where id in (${sqlText(ids.branchA)}, ${sqlText(ids.branchB)}, ${sqlText(ids.suspendedBranch)});
    `))
  } finally {
    await attemptCleanup(() => cleanupCatalogFixtures())
    await attemptCleanup(() => query(`
      alter table public.wholesale_order_events enable trigger user;
      alter table public.wholesale_orders enable trigger user;
      alter table public.event_reservation_mutations enable trigger user;
      alter table public.wholesale_order_sales enable trigger user;
      alter table public.sale_reversals enable trigger user;
    `))
  }

  await attemptCleanup(() => query(`
    delete from public.user_roles where user_id = ${sqlText(ids.eventManager)};
    delete from public.role_capabilities where role_id = ${sqlText(ids.eventManagerRole)};
    delete from public.roles where id = ${sqlText(ids.eventManagerRole)};
    delete from auth.users where id in (${sqlText(ids.eventManager)}, ${sqlText(ids.denied)});
  `))
  if (cleanupErrors.length === 1) throw cleanupErrors[0]
  if (cleanupErrors.length > 1) throw new AggregateError(cleanupErrors, 'Reports dashboard fixture cleanup failed')
}, 30_000)

describe.skipIf(!repeatable)('reports dashboard and operational configuration contracts', () => {
  it('counts recognized lifecycle data, complete aggregates, dates, scope, and separate operations', async () => {
    const report = await snapshot()
     expect(report).toMatchObject({ from: '2026-08-27', to: '2026-08-28', timezone: 'America/Cancun' })
    expect(report.scope).toEqual({ kind: 'all', branch_id: null, branch_name: null, includes_unassigned: true })
    expect(numeric(report.sales.count) - numeric(baselineAll.sales.count)).toBe(106)
    expect(numeric(report.sales.total_mxn) - numeric(baselineAll.sales.total_mxn)).toBe(194)
    expect(numeric(report.sales.average_ticket_mxn)).toBeCloseTo(numeric(report.sales.total_mxn) / numeric(report.sales.count), 2)
    expect(report.sales.average_state).toBe('value')

    expect(numeric(channel(report, 'pos').sale_count) - numeric(channel(baselineAll, 'pos').sale_count)).toBe(104)
    expect(numeric(channel(report, 'pos').total_mxn) - numeric(channel(baselineAll, 'pos').total_mxn)).toBe(144)
    expect(numeric(channel(report, 'wholesale').sale_count) - numeric(channel(baselineAll, 'wholesale').sale_count)).toBe(1)
    expect(numeric(channel(report, 'wholesale').total_mxn) - numeric(channel(baselineAll, 'wholesale').total_mxn)).toBe(20)
    expect(numeric(channel(report, 'event').sale_count) - numeric(channel(baselineAll, 'event').sale_count)).toBe(1)
    expect(numeric(channel(report, 'event').total_mxn) - numeric(channel(baselineAll, 'event').total_mxn)).toBe(30)

     expect(numeric(day(report, '2026-08-27').sale_count) - numeric(day(baselineAll, '2026-08-27').sale_count)).toBe(101)
     expect(numeric(day(report, '2026-08-27').total_mxn) - numeric(day(baselineAll, '2026-08-27').total_mxn)).toBe(101)
     expect(numeric(day(report, '2026-08-28').sale_count) - numeric(day(baselineAll, '2026-08-28').sale_count)).toBe(5)
     expect(numeric(day(report, '2026-08-28').total_mxn) - numeric(day(baselineAll, '2026-08-28').total_mxn)).toBe(93)

    expect(report.sales.products).toEqual(expect.arrayContaining([
      expect.objectContaining({ line_kind: 'product', product_id: ids.product, category_id: ids.category, quantity: 108, total_mxn: 175 }),
      expect.objectContaining({ line_kind: 'category', product_id: null, category_id: ids.category, quantity: 2, total_mxn: 19 }),
    ]))

    expect(numeric(report.operations.wholesale.pending_count) - numeric(baselineAll.operations.wholesale.pending_count)).toBe(1)
    expect(numeric(report.operations.wholesale.processing_count) - numeric(baselineAll.operations.wholesale.processing_count)).toBe(1)
    expect(numeric(report.operations.wholesale.workload_count) - numeric(baselineAll.operations.wholesale.workload_count)).toBe(2)
    expect(numeric(report.operations.event.pending_count) - numeric(baselineAll.operations.event.pending_count)).toBe(1)
    expect(numeric(report.operations.event.reserved_count) - numeric(baselineAll.operations.event.reserved_count)).toBe(2)
    expect(numeric(report.operations.event.allocated_count) - numeric(baselineAll.operations.event.allocated_count)).toBe(3)
    expect(numeric(report.operations.pos.open_shift_count) - numeric(baselineAll.operations.pos.open_shift_count)).toBe(1)
    expect(report.operations.wholesale.scope).toBe('global')
    expect(report.operations.event.scope).toBe('global')

    const branchA = await snapshot('branch', ids.branchA)
    expect(branchA.scope).toEqual({ kind: 'branch', branch_id: ids.branchA, branch_name: `${marker} Branch A`, includes_unassigned: false })
    expect(numeric(branchA.sales.count) - numeric(baselineBranchA.sales.count)).toBe(103)
    expect(numeric(branchA.sales.total_mxn) - numeric(baselineBranchA.sales.total_mxn)).toBe(125)
    expect(numeric(channel(branchA, 'wholesale').sale_count) - numeric(channel(baselineBranchA, 'wholesale').sale_count)).toBe(0)
    expect(numeric(channel(branchA, 'event').sale_count) - numeric(channel(baselineBranchA, 'event').sale_count)).toBe(0)
    expect(numeric(branchA.operations.pos.open_shift_count) - numeric(baselineBranchA.operations.pos.open_shift_count)).toBe(1)
    expect(branchA.operations.wholesale).toEqual(report.operations.wholesale)
    expect(branchA.operations.event).toEqual(report.operations.event)

    const branchB = await snapshot('branch', ids.branchB)
    expect(numeric(branchB.sales.count) - numeric(baselineBranchB.sales.count)).toBe(1)
    expect(numeric(branchB.sales.total_mxn) - numeric(baselineBranchB.sales.total_mxn)).toBe(19)
    expect(branchB.sales.products).toEqual(expect.arrayContaining([
      expect.objectContaining({ line_kind: 'category', category_id: ids.category, quantity: 2, total_mxn: 19 }),
    ]))

    const empty = await data<ReportSnapshot>(client.database.rpc('report_dashboard_snapshot', {
      p_from: '2099-01-01', p_to: '2099-01-02', p_timezone: 'America/Mexico_City', p_scope: 'all', p_branch_id: null,
    }))
    expect(numeric(empty.sales.count)).toBe(0)
    expect(numeric(empty.sales.total_mxn)).toBe(0)
    expect(numeric(empty.sales.average_ticket_mxn)).toBe(0)
    expect(empty.sales.average_state).toBe('no-data')
    expect(empty.sales.daily).toHaveLength(2)
    expect(empty.sales.daily).toEqual([
      { date: '2099-01-01', sale_count: 0, total_mxn: 0 },
      { date: '2099-01-02', sale_count: 0, total_mxn: 0 },
    ])

    const eventDate = await query(`select event_date::text, status, sale_id from public.event_reservations where id = ${sqlText(ids.eventCompleted)}`)
    expect(eventDate).toEqual([{ event_date: '2026-08-28', status: 'completed', sale_id: ids.eventCompleted }])

    await query(`
      update public.event_reservations
      set status = 'cancelled', cart_allocated = false, cancelled_at = now(),
          cancelled_by = ${sqlText(ids.admin)}, cancellation_reason = 'contract cancellation release'
      where id = ${sqlText(ids.eventCancelled)} and status = 'reserved';
    `)
    const afterCancellation = await snapshot()
    expect(numeric(afterCancellation.operations.event.reserved_count)).toBe(numeric(report.operations.event.reserved_count) - 1)
    expect(numeric(afterCancellation.operations.event.allocated_count)).toBe(numeric(report.operations.event.allocated_count) - 1)
    expect(await query(`select status, cart_allocated from public.event_reservations where id = ${sqlText(ids.eventCancelled)}`)).toEqual([
      { status: 'cancelled', cart_allocated: false },
    ])
  }, 30_000)

  it('uses the configured timezone for boundaries and grouping even when the request is stale', async () => {
    const requestId = randomUUID()
    const mexico = await setReportTimezone('America/Mexico_City', requestId)
    expect(mexico).toEqual([expect.objectContaining({ timezone: 'America/Mexico_City', scope: 'global', state: 'configured', result_status: 'created' })])

    const replay = await setReportTimezone('America/Mexico_City', requestId)
    expect(replay).toEqual([expect.objectContaining({ timezone: 'America/Mexico_City', result_status: 'replayed' })])
    await expect(setReportTimezone('UTC')).rejects.toThrow(/timezone/i)

    const report = await snapshot('all', null, 'America/Cancun')
    expect(report.timezone).toBe('America/Mexico_City')
    expect(report.utc_from).toBe('2026-08-27T06:00:00.000Z')
    expect(report.utc_to).toBe('2026-08-29T06:00:00.000Z')
    expect(numeric(day(report, '2026-08-27').total_mxn) - numeric(day(baselineAll, '2026-08-27').total_mxn)).toBe(112)
    expect(numeric(day(report, '2026-08-28').total_mxn) - numeric(day(baselineAll, '2026-08-28').total_mxn)).toBe(82)

    const cancun = await setReportTimezone('America/Cancun')
    expect(cancun[0].timezone).toBe('America/Cancun')
    const cancunReport = await snapshot()
    expect(cancunReport.timezone).toBe('America/Cancun')
    expect(cancunReport.utc_from).toBe('2026-08-27T05:00:00.000Z')
    expect(cancunReport.utc_to).toBe('2026-08-29T05:00:00.000Z')
  }, 30_000)

  it('rejects invalid calendar, timezone, scope, lifecycle, and range selectors', async () => {
    const invalidRequest = (from: string, to: string, timezone = 'America/Cancun', scope = 'all', branchId: string | null = null) => data<ReportSnapshot>(client.database.rpc('report_dashboard_snapshot', {
      p_from: from, p_to: to, p_timezone: timezone, p_scope: scope, p_branch_id: branchId,
    }))

    await expect(invalidRequest('2026-02-30', '2026-03-01')).rejects.toThrow(/invalid report date range/i)
    await expect(invalidRequest('2026-08-28', '2026-08-27')).rejects.toThrow(/invalid report date range/i)
    await expect(invalidRequest('2026-01-01', '2027-01-01')).resolves.toMatchObject({ from: '2026-01-01', to: '2027-01-01', timezone: 'America/Cancun' })
    await expect(invalidRequest('2026-01-01', '2027-01-02')).rejects.toThrow(/366/i)
    await expect(invalidRequest('2026-01-01', '2027-01-01', 'UTC')).rejects.toThrow(/timezone/i)
    await expect(invalidRequest('2026-08-27', '2026-08-28', 'America/Mexico_City', 'branch')).rejects.toThrow(/branch scope requires/i)
    await expect(invalidRequest('2026-08-27', '2026-08-28', 'America/Mexico_City', 'all', ids.branchA)).rejects.toThrow(/scope selector|branch scope/i)
    await expect(invalidRequest('2026-08-27', '2026-08-28', 'America/Mexico_City', 'branch', ids.suspendedBranch)).rejects.toThrow(/not permitted/i)
    await expect(invalidRequest('2026-08-27', '2026-08-28', 'America/Mexico_City', 'branch', randomUUID())).rejects.toThrow(/not permitted/i)

    await expect(query(eventReservationInsert(randomUUID(), randomUUID(), 'processing'))).rejects.toThrow()
    await expect(query(eventReservationInsert(randomUUID(), randomUUID(), 'deleted'))).rejects.toThrow()
  }, 30_000)

  it('denies missing capabilities, protected tables, and new configuration access without widening legacy Event access', async () => {
    const reportArgs = { p_from: '2026-08-27', p_to: '2026-08-28', p_timezone: 'America/Mexico_City', p_scope: 'all', p_branch_id: null }
    await expect(data(deniedClient.database.rpc('report_dashboard_snapshot', reportArgs))).rejects.toThrow(/access denied/i)
    await expect(data(deniedClient.database.rpc('get_operational_configuration', { p_scope: 'global' }))).rejects.toThrow(/access denied/i)
    await expect(data(deniedClient.database.rpc('set_operational_configuration', {
      p_request_id: randomUUID(), p_key: 'event_daily_capacity', p_value: 8, p_scope: 'global',
    }))).rejects.toThrow(/access denied/i)
    await expect(data(createClient({ baseUrl }).database.rpc('report_dashboard_snapshot', reportArgs))).rejects.toThrow()

    await expect(data(deniedClient.database.from('pos_configuration').select('*'))).rejects.toThrow()
    await expect(data(client.database.from('operational_configuration_receipts').select('*'))).rejects.toThrow()

    const legacyRead = await data<{ event_carts_per_day: number | string }[]>(eventManagerClient.database.rpc('get_event_configuration'))
    expect(legacyRead).toHaveLength(1)
    await data(eventManagerClient.database.rpc('set_event_capacity', { p_request_id: randomUUID(), p_carts_per_day: 8 }))
    await expect(data(eventManagerClient.database.rpc('get_operational_configuration', { p_scope: 'global' }))).rejects.toThrow(/access denied/i)
    await expect(data(eventManagerClient.database.rpc('set_operational_configuration', {
      p_request_id: randomUUID(), p_key: 'event_daily_capacity', p_value: 9, p_scope: 'global',
    }))).rejects.toThrow(/access denied/i)
  }, 30_000)

  it('validates typed settings, effective timing, replay/conflict audit, bounds, and workflow preservation', async () => {
    const beforeWorkflow = await workflowSnapshot()
    const availabilityBefore = await data<{ capacity_limit: number | string; allocated_count: number | string }[]>(client.database.rpc('get_event_availability', { p_event_date: '2026-08-28' }))

    const capacityRequest = randomUUID()
    const capacity = await setConfiguration('event_daily_capacity', 8, capacityRequest)
    expect(capacity).toEqual([expect.objectContaining({ key: 'event_daily_capacity', type: 'integer', scope: 'global', state: 'configured', result_status: 'created' })])
    expect(numeric(capacity[0].value)).toBe(8)
    expect(capacity[0].effective_at).not.toBeNull()
    const availability = await data<{ capacity_limit: number | string; allocated_count: number | string }[]>(client.database.rpc('get_event_availability', { p_event_date: '2026-08-28' }))
    expect(Number(availability[0].capacity_limit)).toBe(8)
    expect(Number(availability[0].allocated_count)).toBe(Number(availabilityBefore[0].allocated_count))
    const replay = await setConfiguration('event_daily_capacity', 8, capacityRequest)
    expect(replay).toEqual([expect.objectContaining({ key: 'event_daily_capacity', result_status: 'replayed', effective_at: capacity[0].effective_at })])
    expect(numeric(replay[0].value)).toBe(8)
    await expect(setConfiguration('event_daily_capacity', 9, capacityRequest)).rejects.toThrow(/conflict/i)
    expect(await query(`
      select
        (select count(*)::int from public.operational_configuration_audit where request_id = ${sqlText(capacityRequest)}) as audit_count,
        (select count(*)::int from public.operational_configuration_receipts where request_id = ${sqlText(capacityRequest)}) as receipt_count
    `)).toEqual([{ audit_count: 1, receipt_count: 1 }])

    const rate = await setConfiguration('pos_usd_mxn_rate', 12.3456)
    expect(rate).toEqual([expect.objectContaining({ key: 'pos_usd_mxn_rate', type: 'rate', state: 'configured', result_status: 'created' })])
    expect(numeric(rate[0].value)).toBe(12.3456)
    expect(rate[0].effective_at).not.toBeNull()
    const threshold = await setConfiguration('pos_wholesale_threshold', 11)
    expect(threshold).toEqual([expect.objectContaining({ key: 'pos_wholesale_threshold', type: 'integer', state: 'configured', result_status: 'created' })])
    expect(numeric(threshold[0].value)).toBe(11)
    expect(threshold[0].effective_at).not.toBeNull()
    expect(Number((await query('select public.operational_pos_usd_mxn_rate() as rate'))[0].rate)).toBe(12.3456)

    const explicitRateSale = await recordPosSale(
      [{ product_id: ids.product, quantity: 1 }],
      { payment_method: 'cash', payment_currency: 'usd', usd_mxn_rate: 20, usd_paid: 1 },
    )
    expect(Number(explicitRateSale.usd_mxn_rate)).toBe(20)
    expect(Number(explicitRateSale.usd_equivalent)).toBe(0.65)

    const invalidInputs: [string, unknown][] = [
      ['event_daily_capacity', 0],
      ['event_daily_capacity', 10001],
      ['event_daily_capacity', 1.5],
      ['event_daily_capacity', '8'],
      ['pos_usd_mxn_rate', 0.009],
      ['pos_usd_mxn_rate', 10000.0001],
      ['pos_usd_mxn_rate', 12.34567],
      ['pos_usd_mxn_rate', Number.NaN],
      ['pos_usd_mxn_rate', Number.POSITIVE_INFINITY],
      ['pos_wholesale_threshold', 0],
      ['pos_wholesale_threshold', 10001],
      ['pos_wholesale_threshold', 1.5],
      ['pos_wholesale_threshold', {}],
    ]
    const invalidRequestIds: string[] = []
    for (const [key, value] of invalidInputs) {
      const requestId = randomUUID()
      invalidRequestIds.push(requestId)
      await expect(setConfiguration(key, value, requestId)).rejects.toThrow()
    }
    expect(await query(`select count(*)::int as count from public.operational_configuration_audit where request_id in (${invalidRequestIds.map(sqlText).join(', ')})`)).toEqual([{ count: 0 }])
    await expect(setConfiguration('unknown_setting', 1)).rejects.toThrow(/unknown/i)
    await expect(setConfiguration('event_daily_capacity', 8, randomUUID(), ids.branchA)).rejects.toThrow(/global|branch/i)

    const afterWorkflow = await workflowSnapshot()
    expect(afterWorkflow).toEqual(beforeWorkflow)
    expect(Number(afterWorkflow[0].shift_rate)).toBe(23.5)
  }, 30_000)

  it('uses the configured POS fallback rate for a new USD sale when no explicit rate is supplied', async () => {
    const fallbackSale = await recordPosSale(
      [{ product_id: ids.product, quantity: 1 }],
      { payment_method: 'cash', payment_currency: 'usd', usd_paid: 2 },
    )
    expect(Number(fallbackSale.usd_mxn_rate)).toBe(12.3456)
    expect(Number(fallbackSale.usd_equivalent)).toBe(1.05)
  }, 30_000)

  it('uses the configured POS wholesale threshold for a new sale', async () => {
    const thresholdSale = await recordPosSale(
      [{ product_id: ids.product, quantity: 10 }],
      { payment_method: 'cash', payment_currency: 'mxn', received_amount_mxn: 130 },
    )
    expect(Number(thresholdSale.total_mxn)).toBe(130)
    expect(thresholdSale.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ quantity: 10, unit_price_mxn: 13, line_total_mxn: 130 }),
    ]))
  }, 30_000)
})
