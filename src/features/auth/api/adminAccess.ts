import { insforge } from '../../../lib/insforge'

export async function getAdminAccess() {
  const session = await insforge.auth.getCurrentUser()
  if (session.error) {
    if ((session.error as { statusCode?: number }).statusCode === 401) return false
    throw session.error
  }
  if (!session.data.user) return false

  const { data, error } = await insforge.database.rpc('get_admin_context')
  if (error) throw error
  const context = (Array.isArray(data) ? data[0] : data) as { authorized?: boolean } | null
  return context?.authorized === true
}

export async function signIn(email: string, password: string) {
  const { error } = await insforge.auth.signInWithPassword({ email, password })
  if (error) throw error
}
