import { SettingsPanel } from '@/features/admin/components/settings-panel'
import { requireSectionAccess } from '@/presentation/admin-page'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  await requireSectionAccess(['manage_settings'])
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Налаштування</h1>
      <SettingsPanel />
    </div>
  )
}
