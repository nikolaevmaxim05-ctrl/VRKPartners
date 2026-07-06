import { createServiceClient } from '@/lib/supabase/service'

export type Permission =
  | 'manage_leads'
  | 'manage_users'
  | 'manage_settings'
  | 'view_reports'
  | 'manage_roles'
  | 'export_data'
  | 'delete_leads'
  | 'manage_integrations'
  | 'manage_content'
  | 'manage_conversions'

export const ALL_PERMISSIONS: Permission[] = [
  'manage_leads',
  'manage_users',
  'manage_settings',
  'view_reports',
  'manage_roles',
  'export_data',
  'delete_leads',
  'manage_integrations',
  'manage_content',
  'manage_conversions',
]

export const PERMISSION_LABELS: Record<Permission, string> = {
  manage_leads: 'Управління лідами',
  manage_users: 'Управління користувачами',
  manage_settings: 'Налаштування системи',
  view_reports: 'Перегляд звітів',
  manage_roles: 'Управління ролями',
  export_data: 'Експорт даних',
  delete_leads: 'Видалення лідів',
  manage_integrations: 'Інтеграції',
  manage_content: 'Редагування контенту сайту',
  manage_conversions: 'Офлайн конверсії',
}

// Пояснення для кожного права (показуються підказками в редакторі ролей).
export const PERMISSION_DESCRIPTIONS: Record<Permission, string> = {
  manage_leads: 'Зміна статусів, призначення відповідальних, коментарі до заявок.',
  manage_users: 'Запрошення, видалення та зміна ролей користувачів.',
  manage_settings: 'Загальні налаштування, стадії, кастомні поля, телефонія.',
  view_reports: 'Доступ до сторінки аналітики та звітів.',
  manage_roles: 'Створення і редагування ролей та їхніх прав.',
  export_data: 'Вивантаження лідів та аналітики (CSV/XLSX).',
  delete_leads: 'Видалення заявок.',
  manage_integrations: 'Telegram, CRM, Google-теги та інші інтеграції.',
  manage_content: 'Редагування контенту сайту: контент, контакти, лікарі, відгуки.',
  manage_conversions: 'Перегляд офлайн-конверсій та вивантаження в Google Ads.',
}

export type UserRoleInfo = {
  roleId: string
  roleName: string
  roleIsSystem: boolean
  permissions: Permission[]
  isActive: boolean
  displayName: string | null
  // Ранг в ієрархії: менше = вище. admin завжди -1. Для гейтингу UI.
  roleRank: number
}

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
  const roleRaw = (
    Array.isArray(data.role) ? data.role[0] : data.role
  ) as RoleRow | null

  if (!roleRaw) return null

  const perms = Array.isArray(roleRaw.permissions)
    ? (roleRaw.permissions as string[]).filter((p): p is Permission =>
        ALL_PERMISSIONS.includes(p as Permission)
      )
    : []

  return {
    roleId: data.role_id as string,
    roleName: roleRaw.name,
    roleIsSystem: roleRaw.is_system,
    permissions: perms,
    isActive: data.is_active ?? true,
    displayName: (data.name as string | null) ?? null,
    roleRank: roleRaw.name === 'admin' ? -1 : Number(roleRaw.hierarchy_order ?? 1000),
  }
}

export async function hasPermission(userId: string, permission: Permission): Promise<boolean> {
  const info = await getUserRoleInfo(userId)
  if (!info || !info.isActive) return false
  return info.permissions.includes(permission)
}

// Достатньо мати ХОЧА Б ОДНЕ з прав (один запит до БД).
export async function hasAnyPermission(userId: string, permissions: Permission[]): Promise<boolean> {
  const info = await getUserRoleInfo(userId)
  if (!info || !info.isActive) return false
  return permissions.some((p) => info.permissions.includes(p))
}
