// /admin → редірект залежно від прав (Фаза 5: головна з картками розділів).
// view_reports → /admin/analytics, інакше → /admin/leads.
import { redirect } from 'next/navigation'
import { getAdminAccess } from '@/presentation/admin-page'

export const dynamic = 'force-dynamic'

export default async function AdminRootPage() {
  const { actor, permissions } = await getAdminAccess()
  if (!actor) redirect('/admin/login')
  redirect(permissions.includes('view_reports') ? '/admin/analytics' : '/admin/leads')
}
