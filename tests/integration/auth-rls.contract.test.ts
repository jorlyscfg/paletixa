import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { createClient, type InsForgeClient } from '@insforge/sdk'
import { beforeAll, describe, expect, it } from 'vitest'

const exec = promisify(execFile)
const ids = {
  admin: '10000000-0000-0000-0000-000000000001', other: '10000000-0000-0000-0000-000000000002',
  inactive: '10000000-0000-0000-0000-000000000003', unverified: '10000000-0000-0000-0000-000000000004',
}
const clients = {} as Record<keyof typeof ids, InsForgeClient>
let baseUrl: string
let branchId: string

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

beforeAll(async () => {
  baseUrl = (await cli(['current'])).project.oss_host
  await query(`
    insert into auth.users(id,email,password,email_verified) values
      ('${ids.admin}','admin@example.invalid',crypt('ContractPass123!',gen_salt('bf')),true),
      ('${ids.other}','other@example.invalid',crypt('ContractPass123!',gen_salt('bf')),true),
      ('${ids.inactive}','inactive@example.invalid',crypt('ContractPass123!',gen_salt('bf')),true),
      ('${ids.unverified}','unverified@example.invalid',crypt('ContractPass123!',gen_salt('bf')),true)
    on conflict(id) do update set password=excluded.password,email_verified=true;
    insert into public.profiles(user_id,is_active) values
      ('${ids.admin}',true),('${ids.other}',true),('${ids.inactive}',false),('${ids.unverified}',true)
    on conflict(user_id) do update set is_active=excluded.is_active`)
  for (const [key, id] of Object.entries(ids) as [keyof typeof ids, string][]) {
    const auth = createClient({ baseUrl })
    const session = await data(auth.auth.signInWithPassword({ email: `${key}@example.invalid`, password: 'ContractPass123!' }))
    clients[key] = createClient({ baseUrl, accessToken: session!.accessToken! })
    expect(session!.user.id).toBe(id)
  }
  await query(`update auth.users set email_verified=false where id='${ids.unverified}'`)
}, 30_000)

describe('authorization and direct RLS contracts', () => {
  it.each(['unverified', 'inactive', 'other'] as const)('denies %s at context, RLS, and both RPC boundaries', async (key) => {
    expect(await data(clients[key].database.rpc('get_admin_context'))).toEqual([
      expect.objectContaining({ authorized: false }),
    ])
    expect(await data(clients[key].database.from('branches').select('*'))).toEqual([])
    await expect(data(clients[key].database.rpc('create_branch', {
      p_request_id: crypto.randomUUID(), p_name: 'Denied',
    }))).rejects.toThrow(/access denied/i)
    await expect(data(clients[key].database.rpc('set_branch_status', {
      p_request_id: crypto.randomUUID(), p_branch_id: crypto.randomUUID(), p_status: 'active',
    }))).rejects.toThrow(/access denied/i)
  }, 15_000)

  it.each([
    ['anonymous', () => createClient({ baseUrl })],
    ['expired', () => createClient({ baseUrl, accessToken: 'expired' })],
  ] as const)('denies %s at context, RLS, and both RPC boundaries', async (_, makeClient) => {
    const client = makeClient()
    await expect(data(client.database.rpc('get_admin_context'))).rejects.toThrow()
    await expect(data(client.database.from('branches').select('*'))).rejects.toThrow()
    await expect(data(client.database.rpc('create_branch', {
      p_request_id: crypto.randomUUID(), p_name: 'Denied',
    }))).rejects.toThrow()
    await expect(data(client.database.rpc('set_branch_status', {
      p_request_id: crypto.randomUUID(), p_branch_id: crypto.randomUUID(), p_status: 'active',
    }))).rejects.toThrow()
  }, 15_000)
})

describe('operator bootstrap contracts', () => {
  it('rejects unverified/inactive targets atomically before consumption', async () => {
    await expect(query(`select public.bootstrap_first_admin('${ids.unverified}','bootstrap-v1')`)).rejects.toThrow(/eligible/i)
    await expect(query(`select public.bootstrap_first_admin('${ids.inactive}','bootstrap-v1')`)).rejects.toThrow(/eligible/i)
    expect(await query('select count(*)::int n from public.bootstrap_receipt')).toEqual([{ n: 0 }])
  }, 15_000)

  it('rolls back the grant when bootstrap fails after granting it', async () => {
    await query(`alter table public.bootstrap_receipt add constraint bootstrap_forced_rollback check(false) not valid`)
    try {
      await expect(query(`select public.bootstrap_first_admin('${ids.admin}','bootstrap-v1')`)).rejects.toThrow(/bootstrap_forced_rollback/i)
    } finally {
      await query(`alter table public.bootstrap_receipt drop constraint bootstrap_forced_rollback`)
    }
    expect(await query(`select count(*)::int n from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.user_id='${ids.admin}' and r.key='admin'`)).toEqual([{ n: 0 }])
    expect(await query('select count(*)::int n from public.bootstrap_receipt')).toEqual([{ n: 0 }])
  }, 15_000)

  it('replays, rejects conflicts, preserves consumption, and keeps operators private', async () => {
    await query(`select public.bootstrap_first_admin('${ids.admin}','bootstrap-v1')`)
    await query(`select public.bootstrap_first_admin('${ids.admin}','bootstrap-v1')`)
    await expect(query(`select public.bootstrap_first_admin('${ids.other}','bootstrap-v1')`)).rejects.toThrow(/conflict/i)
    await expect(query(`select public.bootstrap_first_admin('${ids.admin}','bootstrap-v2')`)).rejects.toThrow(/consumed/i)
    await query(`select public.revoke_admin_access('${ids.admin}')`)
    expect(await query('select count(*)::int n from public.bootstrap_receipt')).toEqual([{ n: 1 }])
    await query(`select public.reassign_admin_access('${ids.admin}','${ids.other}')`)
    await expect(data(clients.other.database.rpc('revoke_admin_access', { p_user_id: ids.other }))).rejects.toThrow()
  }, 30_000)
})

describe('branch command receipt contracts', () => {
  it('replays matching create, rejects divergence, and serializes concurrency', async () => {
    const request = crypto.randomUUID()
    const create = (name: string) => data<{ branch_id: string }[]>(clients.other.database.rpc('create_branch', { p_request_id: request, p_name: name }))
    const first = await create('North')
    expect(await create(' North ')).toEqual(first)
    branchId = first[0].branch_id
    await expect(create('South')).rejects.toThrow(/conflict/i)
    const concurrent = crypto.randomUUID()
    const calls = await Promise.all([0, 1].map(() => data(clients.other.database.rpc('create_branch', { p_request_id: concurrent, p_name: 'East' }))))
    expect(calls[0]).toEqual(calls[1])
    expect(await query(`select count(*)::int n from public.branches where name='East'`)).toEqual([{ n: 1 }])
  }, 20_000)

  it('separates replay from fresh same-state and rejects suspended branch use', async () => {
    const suspend = crypto.randomUUID(), activate = crypto.randomUUID()
    const status = (request: string, value: string) => data(clients.other.database.rpc('set_branch_status', {
      p_request_id: request, p_branch_id: branchId, p_status: value,
    }))
    await query(`select public.assert_branch_active('${branchId}')`)
    await status(suspend, 'suspended')
    await expect(query(`select public.assert_branch_active('${branchId}')`)).rejects.toThrow(/branch unavailable/i)
    await status(activate, 'active')
    const sameState = crypto.randomUUID(), fresh = await status(sameState, 'active')
    expect(await status(sameState, 'active')).toEqual(fresh)
    await expect(status(sameState, 'suspended')).rejects.toThrow(/conflict/i)
    await expect(status(crypto.randomUUID(), 'closed')).rejects.toThrow(/status/i)
  }, 15_000)

  it('denies direct INSERT, UPDATE, and DELETE across protected tables', async () => {
    const rows = {
      profiles: { user_id: ids.other, is_active: false }, roles: { id: crypto.randomUUID(), key: 'denied' },
      capabilities: { id: crypto.randomUUID(), key: 'denied' }, user_roles: { user_id: ids.other, role_id: crypto.randomUUID() },
      role_capabilities: { role_id: crypto.randomUUID(), capability_id: crypto.randomUUID() }, branches: { id: branchId, name: 'Denied' },
      bootstrap_receipt: { singleton: true, user_id: ids.admin, change_ref: 'denied' },
      branch_command_receipts: { actor_id: ids.other, request_id: crypto.randomUUID(), operation: 'denied', payload_hash: 'denied', branch_id: branchId, result_status: 'active' },
    }
    for (const [table, row] of Object.entries(rows)) {
      const [column, value] = Object.entries(row)[0]
      await expect(data(clients.other.database.from(table).insert([row]))).rejects.toThrow()
      await expect(data(clients.other.database.from(table).update(row).eq(column, value))).rejects.toThrow()
      await expect(data(clients.other.database.from(table).delete().eq(column, value))).rejects.toThrow()
    }
  }, 30_000)
})
