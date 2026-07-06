import { ConversionsTable } from '@/components/admin/conversions-table'
import { requireSectionAccess } from '@/lib/admin-guard'
import { getIntegration } from '@/lib/integrations/get-integration'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Офлайн конверсії Google Ads | Адмін' }

export default async function ConversionsPage() {
  await requireSectionAccess(['manage_conversions', 'manage_users'])

  // Поточна підвʼязана таблиця (з налаштувань Інтеграцій). Будуємо публічне посилання.
  const spreadsheetId = (await getIntegration('google_spreadsheet_id'))?.trim() || null
  const sheetUrl = spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    : null

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold">Офлайн конверсії Google Ads</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Ліди, що змінили статус. Дані автоматично записуються в Google Sheets і доступні для
          CSV-експорту у Google Ads через <em>Інструменти → Конверсії → Завантаження</em>.
        </p>
      </div>
      <ConversionsTable sheetUrl={sheetUrl} />
    </div>
  )
}
