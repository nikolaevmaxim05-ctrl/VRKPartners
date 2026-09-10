// POST /api/admin/conversion-adjustments/export-pending — масове вивантаження pending-корекцій.
import { getConversionExportUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { respond } from '@/presentation/http'

export const runtime = 'nodejs'

export const POST = () =>
  withAdmin(['manage_conversions', 'manage_users'], async () =>
    respond(await getConversionExportUseCases().exportPendingAdjustments(), (counts) => ({ ok: true, ...counts })),
  )
