import { requireSectionAccess } from '@/presentation/admin-page'
import { LEAD_DELETE_PERMISSIONS, LEAD_VIEW_PERMISSIONS } from '@/presentation/permissions'
import { LeadsTable } from '@/features/admin/components/leads-table'

export const dynamic = 'force-dynamic'

export default async function LeadsPage() {
  const { permissions } = await requireSectionAccess(LEAD_VIEW_PERMISSIONS)
  const canDelete = LEAD_DELETE_PERMISSIONS.some((p) => permissions.includes(p))
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Заявки</h1>
      <LeadsTable canDelete={canDelete} />
    </div>
  )
}
