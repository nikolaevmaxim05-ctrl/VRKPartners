// POST /api/admin/conversion-adjustments/[id]/resend — повторна відправка корекції у таблицю корекцій.
import { getConversionExportUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { errorResponse } from '@/presentation/http'
import { resendResponse } from '@/presentation/conversions'

export const runtime = 'nodejs'

export const POST = (_request: Request, { params }: { params: Promise<{ id: string }> }) =>
  withAdmin(['manage_conversions', 'manage_users'], async () => {
    const { id } = await params
    const result = await getConversionExportUseCases().resendAdjustment(id)
    return result.ok ? resendResponse(result.value, 'Таблицю корекцій не налаштовано — нічого не відправлено') : errorResponse(result)
  })
