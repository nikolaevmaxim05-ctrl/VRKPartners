import { requireSectionAccess } from '@/presentation/admin-page'
import { AuditLogTable } from '@/features/admin/components/audit-log-table'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Журнал дій | Адмін' }

export default async function AuditLogPage() {
  await requireSectionAccess(['manage_users'])
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold">Журнал дій</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Хто, коли і що змінив в адмінці: ліди, контент, стадії, ролі, користувачі, інтеграції
          (без значень ключів), теги, налаштування. Записи не редагуються.
        </p>
      </div>
      <AuditLogTable />
    </div>
  )
}
