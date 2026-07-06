// /admin → редирект залежно від прав.
// view_reports → /admin/analytics, інакше → /admin/leads.
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { hasPermission } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

export default async function AdminRootPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/admin/login')

  const canViewReports = await hasPermission(user.id, 'view_reports')

  if (canViewReports) {
    redirect('/admin/analytics')
  } else {
    redirect('/admin/leads')
  }
}
