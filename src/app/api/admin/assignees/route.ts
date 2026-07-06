// GET /api/admin/assignees — список авторизованих користувачів для селекта "Відповідальний"
// Бере всіх auth.users + збагачує даними з user_roles (name, role). Неактивні (is_active=false) — виключаємо.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export const runtime = 'nodejs'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const service = createServiceClient()
  const [authResult, rolesResult] = await Promise.all([
    service.auth.admin.listUsers({ perPage: 200 }),
    service
      .from('user_roles')
      .select('user_id, name, is_active, role:admin_roles(name)')
      .eq('is_active', true),
  ])

  if (authResult.error) {
    return NextResponse.json({ error: authResult.error.message }, { status: 500 })
  }
  if (rolesResult.error) {
    console.error('[admin/assignees] user_roles_failed', rolesResult.error.message)
  }

  type RoleRow = {
    user_id: string
    name: string | null
    is_active: boolean
    role: { name: string } | { name: string }[] | null
  }
  const rolesById = new Map<string, RoleRow>()
  for (const r of (rolesResult.data ?? []) as RoleRow[]) {
    rolesById.set(r.user_id, r)
  }

  const users = (authResult.data?.users ?? []).map((u) => {
    const role = rolesById.get(u.id)
    const roleObj = role?.role
    const roleName = Array.isArray(roleObj) ? roleObj[0]?.name ?? null : roleObj?.name ?? null
    return {
      id: u.id,
      email: u.email ?? '',
      // Порожнє ім'я не вважаємо іменем — щоб у селектах падало на email
      name: role?.name?.trim() ? role.name : null,
      role: roleName,
    }
  })

  return NextResponse.json({ data: users })
}
