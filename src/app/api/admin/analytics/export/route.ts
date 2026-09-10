// POST /api/admin/analytics/export — конструктор вивантаження (CSV / XLSX).
import { NextRequest, NextResponse } from 'next/server'
import { getExportAnalytics } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { errorResponse, readJson } from '@/presentation/http'

export const runtime = 'nodejs'

export const POST = (request: NextRequest) =>
  withAdmin(['view_reports'], async () => {
    const body = await readJson(request, 'Невалідний JSON')
    if (!body.ok) return body.response
    const result = await getExportAnalytics()(body.body)
    if (!result.ok) return errorResponse(result)
    const file = result.value
    return new NextResponse(file.body, {
      status: 200,
      headers: {
        'Content-Type': file.contentType,
        'Content-Disposition': `attachment; filename="${file.fileName}"`,
      },
    })
  })
