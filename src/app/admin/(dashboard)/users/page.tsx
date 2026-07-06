import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { getUserRoleInfo } from '@/lib/permissions'
import { UsersTable } from '@/components/admin/users-table'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Користувачі | Адмін' }

export default async function UsersPage() {
  const supabase = await createClient()
  const { data: { user: currentUser } } = await supabase.auth.getUser()

  const service = createServiceClient()

  const [authResult, rolesResult, adminRolesResult, currentRoleInfo] = await Promise.all([
    service.auth.admin.listUsers({ perPage: 200 }),
    service
      .from('user_roles')
      .select('user_id, name, is_active, role_id, role:admin_roles(id, name)'),
    service
      .from('admin_roles')
      .select('id, name, is_system, hierarchy_order')
      .order('hierarchy_order', { ascending: true })
      .order('name'),
    currentUser ? getUserRoleInfo(currentUser.id) : Promise.resolve(null),
  ])

  type RoleJoin = { id: string; name: string }
  type RoleRow = {
    user_id: string
    name: string | null
    is_active: boolean
    role_id: string | null
    role: RoleJoin | RoleJoin[] | null
  }

  const rolesByUserId = new Map<string, RoleRow>()
  for (const r of (rolesResult.data ?? []) as RoleRow[]) {
    rolesByUserId.set(r.user_id, r)
  }

  const users = (authResult.data?.users ?? []).map((u) => {
    const roleRow = rolesByUserId.get(u.id)
    const roleObj = roleRow?.role
    const role = Array.isArray(roleObj) ? roleObj[0] : roleObj
    return {
      id: u.id,
      email: u.email ?? '',
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at ?? null,
      email_confirmed: !!u.email_confirmed_at,
      display_name: roleRow?.name ?? null,
      role_id: roleRow?.role_id ?? null,
      role_name: role?.name ?? null,
      is_active: roleRow?.is_active ?? true,
    }
  })

  const adminRoles = (adminRolesResult.data ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    is_system: r.is_system as boolean,
    rank: r.name === 'admin' ? -1 : Number((r as { hierarchy_order?: number }).hierarchy_order ?? 1000),
  }))

  // Карта roleId → ранг для гейтингу рядків таблиці
  const roleRanks: Record<string, number> = Object.fromEntries(adminRoles.map((r) => [r.id, r.rank]))

  const canManageUsers = currentRoleInfo?.permissions.includes('manage_users') ?? false
  // Ранг поточного користувача (велике число = немає ролі; Infinity не серіалізується)
  const actorRank = currentRoleInfo?.roleRank ?? 999999

  return (
    <div className="max-w-4xl space-y-4">
      <div>
        <h1 className="text-3xl font-bold">Користувачі</h1>
        <p className="text-muted-foreground text-sm">
          Адміністратори з доступом до цієї панелі.
          {canManageUsers
            ? ' Запросіть нового адміна або змініть роль.'
            : ' Для керування потрібна роль адміністратора.'}
        </p>
      </div>
      <UsersTable
        initialUsers={users}
        adminRoles={adminRoles}
        currentUserId={currentUser?.id ?? ''}
        canManageUsers={canManageUsers}
        actorRank={actorRank}
        roleRanks={roleRanks}
      />
    </div>
  )
}
