// Серверний guard для адмін-сторінок: пускає лише тих, хто має ХОЧА Б ОДНЕ
// з потрібних прав. Інакше — редірект. Викликати на початку server-компонента сторінки.
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserRoleInfo, type Permission } from '@/lib/permissions'

export async function requireSectionAccess(anyOf: Permission[]): Promise<{ id: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const info = await getUserRoleInfo(user.id)
  const ok = !!info?.isActive && anyOf.some((p) => info.permissions.includes(p))
  if (!ok) redirect('/admin/leads')

  return { id: user.id }
}
