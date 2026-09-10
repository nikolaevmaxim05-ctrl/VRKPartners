// POST /api/admin/conversions/export-pending — масове вивантаження pending-конверсій у Google Sheets.
import { getConversionExportUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { respond } from '@/presentation/http'

export const runtime = 'nodejs'

export const POST = () =>
  withAdmin(['manage_conversions', 'manage_users'], async () =>
    respond(await getConversionExportUseCases().exportPendingConversions(), (counts) => ({ ok: true, ...counts })),
  )
