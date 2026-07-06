import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { PERMISSION_LABELS, PERMISSION_DESCRIPTIONS, getUserRoleInfo } from '@/lib/permissions'
import { RolesSection } from '@/components/admin/roles-section'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Ролі | Адмін' }

export default async function RolesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const service = createServiceClient()
  const [{ data: roles }, roleInfo] = await Promise.all([
    service
      .from('admin_roles')
      .select('id, name, permissions, is_system, hierarchy_order')
      .order('hierarchy_order', { ascending: true })
      .order('name'),
    getUserRoleInfo(user.id),
  ])

  const canManage =
    !!roleInfo?.isActive &&
    (roleInfo.permissions.includes('manage_roles') ||
      roleInfo.permissions.includes('manage_users'))

  // Без права керування ролями розділ недоступний для перегляду
  if (!canManage) redirect('/admin/leads')

  const normalizedRoles = (roles ?? []).map((r) => ({
    id: r.id as string,
    name: r.name as string,
    permissions: Array.isArray(r.permissions) ? (r.permissions as string[]) : [],
    is_system: !!r.is_system,
    // Ранг: admin завжди -1 (зверху), решта — за hierarchy_order
    rank: r.name === 'admin' ? -1 : Number((r as { hierarchy_order?: number }).hierarchy_order ?? 1000),
  }))

  // Ранг поточного користувача (велике число = немає ролі). Infinity не серіалізується в JSON.
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
          {canManage
            ? 'Налаштуйте, що може робити кожна роль. Призначте роль користувачу на сторінці '
            : 'Ролі визначають, що може робити кожен користувач. Призначте роль користувачу на сторінці '}
          <a href="/admin/users" className="underline underline-offset-2">Користувачі</a>.
        </p>
      </div>

      <RolesSection
        initialRoles={normalizedRoles}
        permissionList={permissionList}
        canManage={canManage}
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
          <strong>Редагування контенту сайту</strong> — контент, контакти, лікарі, відгуки.<br />
          <strong>Офлайн конверсії</strong> — перегляд і вивантаження конверсій у Google Ads.<br />
          <strong>Перегляд звітів</strong> — доступ до аналітики та звітів.
        </p>
      </div>
    </div>
  )
}
