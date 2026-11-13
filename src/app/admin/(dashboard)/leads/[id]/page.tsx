// Детальная страница лида /admin/leads/[id]
// Серверный shell: сессия — layout, право на раздел — requireSectionAccess. Данные тянет клиентский LeadDetail.
import { requireSectionAccess } from '@/presentation/admin-page'
import { LEAD_VIEW_PERMISSIONS } from '@/presentation/permissions'
import { LeadDetail } from '@/features/admin/components/lead-detail'

export const dynamic = 'force-dynamic'

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireSectionAccess(LEAD_VIEW_PERMISSIONS)
  const { id } = await params
  return <LeadDetail leadId={id} />
}
