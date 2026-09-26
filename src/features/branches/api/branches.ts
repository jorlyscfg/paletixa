import { insforge } from '../../../lib/insforge'

export type Branch = { id: string; name: string; status: 'active' | 'suspended' }
type CommandRow = { branch_id: string; name: string; result_status: Branch['status'] }

function commandResult(data: unknown): Branch {
  const row = (Array.isArray(data) ? data[0] : data) as CommandRow
  return { id: row.branch_id, name: row.name, status: row.result_status }
}

export async function listBranches(): Promise<Branch[]> {
  const { data, error } = await insforge.database.from('branches')
    .select('id, name, status').order('name')
  if (error) throw error
  return data as Branch[]
}

export async function createBranch(name: string, requestId: string) {
  const { data, error } = await insforge.database.rpc('create_branch', { p_name: name, p_request_id: requestId })
  if (error) throw error
  return commandResult(data)
}

export async function renameBranch(id: string, name: string, requestId: string) {
  const { data, error } = await insforge.database.rpc('rename_branch', { p_branch_id: id, p_name: name, p_request_id: requestId })
  if (error) throw error
  return commandResult(data)
}

export async function setBranchStatus(id: string, status: Branch['status'], requestId: string) {
  const { data, error } = await insforge.database.rpc('set_branch_status', { p_branch_id: id, p_status: status, p_request_id: requestId })
  if (error) throw error
  return commandResult(data)
}
