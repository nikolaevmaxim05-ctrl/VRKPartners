// Розділи адмінки (розділ 5 стандарту): один масив для меню сайдбара і карток головної.
// Пункт показується, якщо в користувача є хоча б одне з прав anyPermission (порожньо — усім).
import {
  PhoneCall, Plug, TrendingUp, Users, Shield, Settings, BarChart3, RotateCcw, FileText, Scale,
  type LucideIcon,
} from 'lucide-react'
import type { Permission } from '@core/domain/access/permissions'

export type AdminSection = {
  href: string
  label: string
  description: string
  icon: LucideIcon
  anyPermission: Permission[]
}

export const ADMIN_SECTIONS: AdminSection[] = [
  { href: '/admin/leads', label: 'Заявки', description: 'Ліди, стадії воронки, відповідальні, коментарі.', icon: PhoneCall, anyPermission: ['manage_leads', 'view_reports', 'export_data', 'manage_conversions'] },
  { href: '/admin/analytics', label: 'Аналітика', description: 'Звіти за джерелами, стадіями та подіями.', icon: BarChart3, anyPermission: ['view_reports'] },
  { href: '/admin/content', label: 'Контент', description: 'Тексти сайту, приховування блоків, метадані (SEO).', icon: FileText, anyPermission: ['manage_content'] },
  { href: '/admin/legal', label: 'Юридичні документи', description: 'Політика конфіденційності та публічна оферта.', icon: Scale, anyPermission: ['manage_content'] },
  { href: '/admin/integrations', label: 'Інтеграції', description: 'Telegram, KeyCRM, пошта, Google Sheets, Google-теги.', icon: Plug, anyPermission: ['manage_settings', 'manage_integrations'] },
  { href: '/admin/users', label: 'Користувачі', description: 'Запрошення, ролі та деактивація користувачів.', icon: Users, anyPermission: ['manage_users'] },
  { href: '/admin/roles', label: 'Ролі', description: 'Права ролей та їх ієрархія.', icon: Shield, anyPermission: ['manage_roles', 'manage_users'] },
  { href: '/admin/conversions', label: 'Офлайн конверсії', description: 'Конверсії Google Ads і вивантаження в Google Sheets.', icon: TrendingUp, anyPermission: ['manage_conversions', 'manage_users'] },
  { href: '/admin/conversion-adjustments', label: 'Корекції конверсій', description: 'RETRACT / RESTATE для вивантажених конверсій.', icon: RotateCcw, anyPermission: ['manage_conversions', 'manage_users'] },
  { href: '/admin/settings', label: 'Налаштування', description: 'Стадії, кастомні поля, дедуп, події аналітики, телефонія.', icon: Settings, anyPermission: ['manage_settings'] },
]

/** Розділи, доступні з набором прав. */
export function visibleSections(permissions: readonly Permission[]): AdminSection[] {
  return ADMIN_SECTIONS.filter((s) => s.anyPermission.length === 0 || s.anyPermission.some((p) => permissions.includes(p)))
}
