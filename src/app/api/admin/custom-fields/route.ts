// GET  /api/admin/custom-fields — кастомні поля ліда
// POST /api/admin/custom-fields — створити поле (manage_settings)
import { NextRequest } from 'next/server'
import { getCustomFieldUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { readJson, respond } from '@/presentation/http'

export const runtime = 'nodejs'

export const GET = () => withAdmin([], async () => respond(await getCustomFieldUseCases().listFields()))

export const POST = (request: NextRequest) =>
  withAdmin(['manage_settings'], async () => {
    const body = await readJson(request)
    if (!body.ok) return body.response
    return respond(await getCustomFieldUseCases().createField(body.body))
  })
