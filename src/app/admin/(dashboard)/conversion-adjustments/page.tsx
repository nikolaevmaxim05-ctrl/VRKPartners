import { ConversionAdjustmentsTable } from '@/components/admin/conversion-adjustments-table'
import { requireSectionAccess } from '@/lib/admin-guard'
import { getIntegration } from '@/lib/integrations/get-integration'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Корекції конверсій Google Ads | Адмін' }

export default async function ConversionAdjustmentsPage() {
  await requireSectionAccess(['manage_conversions', 'manage_users'])

  // Окрема таблиця корекцій (з налаштувань Google Sheets). Будуємо публічне посилання.
  const spreadsheetId = (await getIntegration('google_adjustments_spreadsheet_id'))?.trim() || null
  const sheetUrl = spreadsheetId
    ? `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`
    : null

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
