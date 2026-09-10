// core/domain/access/permissions — права админки (раздел 5 стандарта).
// Чистый модуль: типы, справочники и правила без ввода-вывода.
// Загрузка роли пользователя из БД — в infrastructure (репозиторий), не здесь.

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
  manage_content: 'Редагування контенту лендингу: тексти, послуги, кейси, FAQ, контакти.',
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

/** Ранг ролі «admin» — завжди найвищий. */
export const ADMIN_RANK = -1

/** Ефективний ранг ролі: admin → -1, інакше hierarchy_order (1000, якщо не задано). */
export function effectiveRank(role: { name: string; hierarchy_order?: number | null }): number {
  if (role.name === 'admin') return ADMIN_RANK
  return Number(role.hierarchy_order ?? 1000)
}

/** Чи є у ролі хоча б одне з прав. Деактивований користувач — жодних прав. */
export function roleGrants(info: UserRoleInfo | null, anyOf: Permission[]): boolean {
  if (!info || !info.isActive) return false
  return anyOf.some((p) => info.permissions.includes(p))
}

/** Лишає тільки валідні ключі прав, прибирає дублі. */
export function sanitizePermissions(input: unknown): Permission[] {
  if (!Array.isArray(input)) return []
  const valid = new Set<string>(ALL_PERMISSIONS)
  return Array.from(
    new Set(input.filter((p): p is Permission => typeof p === 'string' && valid.has(p))),
  )
}

/** Фільтрує довільний jsonb-масив прав до відомих значень (без дедупу — як у permissions.ts). */
export function filterKnownPermissions(raw: unknown): Permission[] {
  if (!Array.isArray(raw)) return []
  const valid = new Set<string>(ALL_PERMISSIONS)
  return raw.filter((p): p is Permission => typeof p === 'string' && valid.has(p))
}
