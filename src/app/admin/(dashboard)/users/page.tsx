import { getRoleUseCases, getUserUseCases } from '@composition/container'
import { getAdminAccess } from '@/presentation/admin-page'
import { effectiveRank } from '@core/domain/access/permissions'
import { UsersTable } from '@/features/admin/components/users-table'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Користувачі | Адмін' }

export default async function UsersPage() {
  const [{ actor, roleInfo, permissions }, usersRes, rolesRes] = await Promise.all([
    getAdminAccess(),
    getUserUseCases().listUsers(),
    getRoleUseCases().listRoles(),
  ])

  const users = usersRes.ok ? usersRes.value : []
  const adminRoles = (rolesRes.ok ? rolesRes.value : []).map((r) => ({
    id: r.id,
    name: r.name,
    is_system: r.is_system,
    rank: effectiveRank(r),
  }))

  // Карта roleId → ранг для гейтингу рядків таблиці
  const roleRanks: Record<string, number> = Object.fromEntries(adminRoles.map((r) => [r.id, r.rank]))
  const canManageUsers = permissions.includes('manage_users')
  // Ранг поточного користувача (велике число = немає ролі; Infinity не серіалізується)
  const actorRank = roleInfo?.roleRank ?? 999999

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
        currentUserId={actor?.id ?? ''}
        canManageUsers={canManageUsers}
        actorRank={actorRank}
        roleRanks={roleRanks}
      />
    </div>
  )
}
