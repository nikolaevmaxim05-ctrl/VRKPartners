// GET /api/admin/conversion-adjustments — корекції конверсій (RETRACT/RESTATE) з даними ліда.
import { NextRequest } from 'next/server'
import { getConversionExportUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { queryGetter, respond } from '@/presentation/http'
import { parsePaging } from '@core/application/paging'

export const runtime = 'nodejs'

export const GET = (request: NextRequest) =>
  withAdmin(['manage_conversions', 'manage_users'], async () => {
    const { page, limit } = parsePaging(queryGetter(request), 50)
    return respond(await getConversionExportUseCases().listAdjustments(page, limit), (v) => v)
  })
