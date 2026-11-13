import { getIntegrationConfig } from '@composition/container'
import { requireSectionAccess } from '@/presentation/admin-page'
import { CONVERSION_PERMISSIONS } from '@/presentation/permissions'
import { ConversionAdjustmentsTable } from '@/features/admin/components/conversion-adjustments-table'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Корекції конверсій Google Ads | Адмін' }

export default async function ConversionAdjustmentsPage() {
  await requireSectionAccess(CONVERSION_PERMISSIONS)

  // Отдельная таблица корректировок (из настроек Google Sheets) → публичная ссылка.
  const spreadsheetId = (await getIntegrationConfig().get('google_adjustments_spreadsheet_id'))?.trim() || null
  const sheetUrl = spreadsheetId ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit` : null

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-3xl font-bold">Корекції конверсій Google Ads</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Події зміни конверсій: <strong>RETRACT</strong> — конверсію відкликано (лід став
          нецільовим або конверсію замінено іншою, напр. цільовий → продаж) і{' '}
          <strong>RESTATE</strong> — змінилась сума тієї ж угоди. Order ID збігається з
          офлайн-конверсією, щоб Google Ads зшив корекцію з оригіналом.
        </p>
      </div>
      <ConversionAdjustmentsTable sheetUrl={sheetUrl} />
    </div>
  )
}
