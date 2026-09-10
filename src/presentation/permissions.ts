// presentation/permissions — набори прав, спільні для кількох роутів/сторінок.
import type { Permission } from '@core/domain/access/permissions'

/** Дані ліда (PII: телефон, email, IP, UTM) — лише тим, хто працює з лідами/звітами. */
export const LEAD_VIEW_PERMISSIONS: Permission[] = ['manage_leads', 'view_reports', 'export_data', 'manage_conversions']

/** Мутація ліда (статус/відповідальний/сума). manage_users — повний адмін. */
export const LEAD_EDIT_PERMISSIONS: Permission[] = ['manage_leads', 'manage_users']

export const LEAD_DELETE_PERMISSIONS: Permission[] = ['delete_leads', 'manage_users']

export const CONVERSION_PERMISSIONS: Permission[] = ['manage_conversions', 'manage_users']

export const INTEGRATION_PERMISSIONS: Permission[] = ['manage_settings', 'manage_integrations']

/** Ролі: окреме manage_roles АБО загальне manage_users. */
export const ROLE_PERMISSIONS: Permission[] = ['manage_roles', 'manage_users']
