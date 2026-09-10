// LEGACY-адаптер (Фаза 1): чисті правила прав живуть у @core/domain/access/permissions;
// тут лишається лише читання ролі з БД (Фаза 2 → infrastructure/supabase/repositories/users).
import { createServiceClient } from '@/lib/supabase/service'
import {
  ALL_PERMISSIONS,
  effectiveRank,
  filterKnownPermissions,
  roleGrants,
  type Permission,
  type UserRoleInfo,
} from '@core/domain/access/permissions'

export {
  ALL_PERMISSIONS,
  PERMISSION_LABELS,
  PERMISSION_DESCRIPTIONS,
  type Permission,
  type UserRoleInfo,
} from '@core/domain/access/permissions'

type RoleRow = {
  id: string
  name: string
  permissions: unknown
  is_system: boolean
  hierarchy_order: number | null
}

export async function getUserRoleInfo(userId: string): Promise<UserRoleInfo | null> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from('user_roles')
    .select('name, is_active, role_id, role:admin_roles(id, name, permissions, is_system, hierarchy_order)')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    console.error('[permissions] getUserRoleInfo_failed', error.message)
    return null
  }
  if (!data) return null

  // Supabase can return role as object or single-item array depending on FK direction
  const roleRaw = (Array.isArray(data.role) ? data.role[0] : data.role) as RoleRow | null
  if (!roleRaw) return null

  const perms = filterKnownPermissions(roleRaw.permissions)
  void ALL_PERMISSIONS

  return {
    roleId: data.role_id as string,
    roleName: roleRaw.name,
    roleIsSystem: roleRaw.is_system,
    permissions: perms,
    isActive: data.is_active ?? true,
    displayName: (data.name as string | null) ?? null,
    roleRank: effectiveRank(roleRaw),
  }
}

export async function hasPermission(userId: string, permission: Permission): Promise<boolean> {
  const info = await getUserRoleInfo(userId)
  return roleGrants(info, [permission])
}

// Достатньо мати ХОЧА Б ОДНЕ з прав (один запит до БД).
export async function hasAnyPermission(userId: string, permissions: Permission[]): Promise<boolean> {
  const info = await getUserRoleInfo(userId)
  return roleGrants(info, permissions)
}
