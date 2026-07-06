import { SettingsPanel } from '@/components/admin/settings-panel'
import { requireSectionAccess } from '@/lib/admin-guard'

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
