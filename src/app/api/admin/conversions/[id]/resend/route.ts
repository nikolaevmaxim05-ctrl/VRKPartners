// POST /api/admin/conversions/[id]/resend — повторная отправка конверсии в Google Sheets.
import { getConversionExportUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { errorResponse, isUuid, notFound } from '@/presentation/http'
import { resendResponse } from '@/presentation/conversions'

export const runtime = 'nodejs'

export const POST = (_request: Request, { params }: { params: Promise<{ id: string }> }) =>
  withAdmin(['manage_conversions', 'manage_users'], async () => {
    const { id } = await params
    if (!isUuid(id)) return notFound()
    const result = await getConversionExportUseCases().resendConversion(id)
    return result.ok ? resendResponse(result.value, 'Google Sheets не налаштовано — нічого не відправлено') : errorResponse(result)
  })
