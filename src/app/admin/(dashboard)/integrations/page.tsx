import { requireSectionAccess } from '@/presentation/admin-page'
import { INTEGRATION_PERMISSIONS } from '@/presentation/permissions'
import { IntegrationsForm } from '@/features/admin/components/integrations-form'
import { TrackingTagsSection } from '@/features/admin/components/tracking-tags-section'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Інтеграції | Адмін' }

export default async function IntegrationsPage() {
  await requireSectionAccess(INTEGRATION_PERMISSIONS)
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
