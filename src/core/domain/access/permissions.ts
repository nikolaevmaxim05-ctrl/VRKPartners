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
  | 'manage_referrals'

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
  'manage_referrals',
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
  manage_referrals: 'Реферальні посилання',
}

// Пояснения для каждого права (показываются подсказками в редакторе ролей).
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
  manage_referrals: 'Реферальні посилання партнерів: створення, вимкнення, статистика заявок.',
}

export type UserRoleInfo = {
  roleId: string
  roleName: string
  roleIsSystem: boolean
  permissions: Permission[]
  isActive: boolean
  displayName: string | null
  // Ранг в иерархии: меньше = выше. admin всегда -1. Для гейтинга UI.
  roleRank: number
}

/** Ранг роли «admin» — всегда наивысший. */
export const ADMIN_RANK = -1

/** Эффективный ранг роли: admin → -1, иначе hierarchy_order (1000, если не задан). */
export function effectiveRank(role: { name: string; hierarchy_order?: number | null }): number {
  if (role.name === 'admin') return ADMIN_RANK
  return Number(role.hierarchy_order ?? 1000)
}

/** Есть ли у роли хотя бы одно из прав. Деактивированный пользователь — никаких прав. */
export function roleGrants(info: UserRoleInfo | null, anyOf: Permission[]): boolean {
  if (!info || !info.isActive) return false
  return anyOf.some((p) => info.permissions.includes(p))
}

/** Оставляет только валидные ключи прав, убирает дубли. */
export function sanitizePermissions(input: unknown): Permission[] {
  if (!Array.isArray(input)) return []
  const valid = new Set<string>(ALL_PERMISSIONS)
  return Array.from(
    new Set(input.filter((p): p is Permission => typeof p === 'string' && valid.has(p))),
  )
}

/** Фильтрует произвольный jsonb-массив прав до известных значений (без дедупа — как в permissions.ts). */
export function filterKnownPermissions(raw: unknown): Permission[] {
  if (!Array.isArray(raw)) return []
  const valid = new Set<string>(ALL_PERMISSIONS)
  return raw.filter((p): p is Permission => typeof p === 'string' && valid.has(p))
}
