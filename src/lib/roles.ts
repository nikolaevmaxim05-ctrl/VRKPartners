// Хелпери для керування ролями (спільні для API-роутів).
import { hasPermission, ALL_PERMISSIONS, type Permission } from '@/lib/permissions'
import { createServiceClient } from '@/lib/supabase/service'

// Активні призначення ролей: хто яку роль має + права цієї ролі.
// Використовується, щоб не дати залишити систему без адміна (lockout-guard).
export type ActiveAssignment = { user_id: string; role_id: string | null; permissions: Permission[] }

export async function getActiveRoleAssignments(): Promise<ActiveAssignment[]> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('user_roles')
    .select('user_id, role_id, is_active, role:admin_roles(permissions)')

  const valid = new Set<string>(ALL_PERMISSIONS)
  return (data ?? [])
    .filter((r) => (r as { is_active?: boolean }).is_active !== false)
    .map((r) => {
      const roleObj = (r as { role: unknown }).role
      const role = Array.isArray(roleObj) ? roleObj[0] : roleObj
      const rawPerms = (role as { permissions?: unknown })?.permissions
      const permissions = Array.isArray(rawPerms)
        ? (rawPerms.filter((p): p is Permission => typeof p === 'string' && valid.has(p)))
        : []
      return {
        user_id: (r as { user_id: string }).user_id,
        role_id: (r as { role_id: string | null }).role_id ?? null,
        permissions,
      }
    })
}

// Права конкретної ролі (для перевірки, що дасть нова роль користувачу).
export async function getRolePermissions(roleId: string): Promise<Permission[]> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('admin_roles')
    .select('permissions')
    .eq('id', roleId)
    .maybeSingle()
  const valid = new Set<string>(ALL_PERMISSIONS)
  const raw = (data as { permissions?: unknown } | null)?.permissions
  return Array.isArray(raw)
    ? raw.filter((p): p is Permission => typeof p === 'string' && valid.has(p))
    : []
}

// Право редагувати ролі: окреме manage_roles АБО загальне manage_users
// (щоб не залочити існуючих адмінів, у яких ще немає manage_roles).
export async function canManageRoles(userId: string): Promise<boolean> {
  const [a, b] = await Promise.all([
    hasPermission(userId, 'manage_roles'),
    hasPermission(userId, 'manage_users'),
  ])
  return a || b
}

// ── Ієрархія ролей ───────────────────────────────────────────────────────────
// Менший order = вище в ієрархії (більше повноважень). «admin» завжди зверху.
// Роль може керувати лише тими, що СТРОГО нижче (більший order) за неї.

const ADMIN_RANK = -1

export function effectiveRank(role: { name: string; hierarchy_order?: number | null }): number {
  if (role.name === 'admin') return ADMIN_RANK
  return Number(role.hierarchy_order ?? 1000)
}

// Карта roleId → ефективний ранг (для порівнянь у enforcement).
export async function getRoleRanks(): Promise<Map<string, number>> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('admin_roles')
    .select('id, name, hierarchy_order')
  const map = new Map<string, number>()
  for (const r of (data ?? []) as { id: string; name: string; hierarchy_order: number | null }[]) {
    map.set(r.id, effectiveRank(r))
  }
  return map
}

// Ранг ролі поточного користувача (Infinity = немає ролі → нічим не керує).
export async function getActorRank(userId: string): Promise<number> {
  const supabase = createServiceClient()
  const { data } = await supabase
    .from('user_roles')
    .select('role:admin_roles(name, hierarchy_order)')
    .eq('user_id', userId)
    .maybeSingle()
  const roleObj = (data as { role: unknown } | null)?.role
  const role = Array.isArray(roleObj) ? roleObj[0] : roleObj
  if (!role) return Number.POSITIVE_INFINITY
  return effectiveRank(role as { name: string; hierarchy_order: number | null })
}

// Лишає тільки валідні ключі прав, прибирає дублі.
export function sanitizePermissions(input: unknown): Permission[] {
  if (!Array.isArray(input)) return []
  const valid = new Set<string>(ALL_PERMISSIONS)
  return Array.from(
    new Set(input.filter((p): p is Permission => typeof p === 'string' && valid.has(p))),
  )
}
