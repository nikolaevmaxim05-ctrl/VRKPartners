import Link from 'next/link'
import { getRoleUseCases } from '@composition/container'
import { requireSectionAccess } from '@/presentation/admin-page'
import { ROLE_PERMISSIONS } from '@/presentation/permissions'
import { PERMISSION_LABELS, PERMISSION_DESCRIPTIONS, effectiveRank } from '@core/domain/access/permissions'
import { RolesSection } from '@/features/admin/components/roles-section'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Ролі | Адмін' }

export default async function RolesPage() {
  // Без права управления ролями раздел недоступен для просмотра
  const { roleInfo } = await requireSectionAccess(ROLE_PERMISSIONS)
  const rolesRes = await getRoleUseCases().listRoles()
  const roles = rolesRes.ok ? rolesRes.value : []

  const normalizedRoles = roles.map((r) => ({
    id: r.id,
    name: r.name,
    permissions: Array.isArray(r.permissions) ? (r.permissions as string[]) : [],
    is_system: !!r.is_system,
    // Ранг: admin всегда -1 (сверху), остальные — по hierarchy_order
    rank: effectiveRank(r),
  }))

  // Ранг текущего пользователя (большое число = нет роли; Infinity не сериализуется в JSON).
  const actorRank = roleInfo?.roleRank ?? 999999

  const permissionList = Object.entries(PERMISSION_LABELS).map(([key, label]) => ({
    key,
    label,
    description: PERMISSION_DESCRIPTIONS[key as keyof typeof PERMISSION_DESCRIPTIONS] ?? '',
  }))

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Ролі</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Налаштуйте, що може робити кожна роль. Призначте роль користувачу на сторінці{' '}
          <Link href="/admin/users" className="underline underline-offset-2">Користувачі</Link>.
        </p>
      </div>

      <RolesSection
        initialRoles={normalizedRoles}
        permissionList={permissionList}
        canManage
        ownRoleId={roleInfo?.roleId ?? null}
        actorRank={actorRank}
      />

      <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground space-y-1 max-w-3xl">
        <p className="font-medium text-foreground">Як це працює</p>
        <p>Кожен активний користувач має одну роль. Без ролі або при деактивації — доступ лише до читання лідів.</p>
        <p className="mt-1">
          <strong>Управління користувачами</strong> — запрошення, видалення, зміна ролей.<br />
          <strong>Налаштування системи</strong> — налаштування, стадії, кастомні поля, телефонія.<br />
          <strong>Управління лідами</strong> — зміна статусів, призначення, коментарі.<br />
          <strong>Управління ролями</strong> — створення і редагування ролей та прав.<br />
          <strong>Видалення лідів</strong> — видалення заявок.<br />
          <strong>Експорт даних</strong> — вивантаження лідів/аналітики.<br />
          <strong>Інтеграції</strong> — Telegram, CRM, Google-теги (GTM/GA4/Google Ads).<br />
          <strong>Редагування контенту лендингу</strong> — тексти, послуги, кейси, FAQ, контакти.<br />
          <strong>Офлайн конверсії</strong> — перегляд і вивантаження конверсій у Google Ads.<br />
          <strong>Перегляд звітів</strong> — доступ до аналітики та звітів.<br />
          <strong>Реферальні посилання</strong> — посилання партнерів, вимкнення, статистика заявок за ними.
        </p>
      </div>
    </div>
  )
}
