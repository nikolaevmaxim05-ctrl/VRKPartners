import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getUserRoleInfo } from '@/lib/permissions'
import { IntegrationsForm } from '@/components/admin/integrations-form'
import { TrackingTagsSection } from '@/components/admin/tracking-tags-section'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Інтеграції | Адмін' }

export default async function IntegrationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/admin/login')

  const info = await getUserRoleInfo(user.id)
  const allowed = !!info?.isActive &&
    (info.permissions.includes('manage_settings') || info.permissions.includes('manage_integrations'))
  if (!allowed) redirect('/admin/leads')

  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-3xl font-bold">Інтеграції</h1>
        <p className="text-muted-foreground text-sm">
          API-ключі зберігаються в зашифрованому вигляді (AES-256-GCM). Значення ніколи не відображаються повністю.
        </p>
      </div>
      <TrackingTagsSection />
      <IntegrationsForm />
    </div>
  )
}
