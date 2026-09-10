// GET   /api/admin/analytics-events — реєстр точок + поточний конфіг
// PATCH /api/admin/analytics-events — зберегти конфіг подій (мерж з поточним) + revalidate сайту
import { NextRequest, NextResponse } from 'next/server'
import { getAnalyticsEventsUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { readJson, respond } from '@/presentation/http'

export const runtime = 'nodejs'

export const GET = () =>
  withAdmin([], async () => NextResponse.json({ data: await getAnalyticsEventsUseCases().getEvents() }))

export const PATCH = (request: NextRequest) =>
  withAdmin(['manage_settings'], async (actor) => {
    const body = await readJson<{ events?: unknown }>(request)
    if (!body.ok) return body.response
    const result = await getAnalyticsEventsUseCases().patchEvents(body.body, actor)
    return respond(result, (data) => ({ ok: true, data }))
  })
