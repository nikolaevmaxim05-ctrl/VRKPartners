import { createClient } from '@/lib/supabase/server'
import { getUserRoleInfo } from '@/lib/permissions'
import { LeadsTable } from '@/components/admin/leads-table'

export const dynamic = 'force-dynamic'

export default async function LeadsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const info = user ? await getUserRoleInfo(user.id) : null
  const canDelete = !!info?.isActive &&
    (info.permissions.includes('delete_leads') || info.permissions.includes('manage_users'))

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Заявки</h1>
      <LeadsTable canDelete={canDelete} />
    </div>
  )
}
