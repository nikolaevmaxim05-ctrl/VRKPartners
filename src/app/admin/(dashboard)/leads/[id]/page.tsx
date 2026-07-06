// Детальна сторінка лида /admin/leads/[id]
// Серверний shell — auth-guard виконує layout. Дані тягне клієнтський LeadDetail.
import { LeadDetail } from '@/components/admin/lead-detail'

export const dynamic = 'force-dynamic'

export default async function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <LeadDetail leadId={id} />
}
