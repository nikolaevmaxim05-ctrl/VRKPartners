// presentation/permissions — наборы прав, общие для нескольких роутов/страниц.
import type { Permission } from '@core/domain/access/permissions'

/** Данные лида (PII: телефон, email, IP, UTM) — только тем, кто работает с лидами/отчётами. */
export const LEAD_VIEW_PERMISSIONS: Permission[] = ['manage_leads', 'view_reports', 'export_data', 'manage_conversions']

/** Мутация лида (статус/ответственный/сумма). manage_users — полный админ. */
export const LEAD_EDIT_PERMISSIONS: Permission[] = ['manage_leads', 'manage_users']

export const LEAD_DELETE_PERMISSIONS: Permission[] = ['delete_leads', 'manage_users']

export const CONVERSION_PERMISSIONS: Permission[] = ['manage_conversions', 'manage_users']

export const INTEGRATION_PERMISSIONS: Permission[] = ['manage_settings', 'manage_integrations']

/** Роли: отдельное manage_roles ИЛИ общее manage_users. */
export const ROLE_PERMISSIONS: Permission[] = ['manage_roles', 'manage_users']

/** Реферальные ссылки (отклонение 11): мутации — только отдельное право, без фолбэка на manage_users. */
export const REFERRAL_PERMISSIONS: Permission[] = ['manage_referrals']

/** Справочник названий партнёров (фильтры заявок, бейджи, аналитика) — все, кто видит заявки/отчёты. */
export const REFERRAL_READ_PERMISSIONS: Permission[] = ['manage_leads', 'view_reports', 'export_data', 'manage_conversions', 'manage_referrals']
