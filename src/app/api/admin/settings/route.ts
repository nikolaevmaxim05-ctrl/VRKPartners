// GET /api/admin/settings — ключі site_settings (без секретів)
// PUT /api/admin/settings — items: [{ key, value, type? }] (білий список ключів)
import { NextRequest, NextResponse } from 'next/server'
import { getSettingsUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { readJson, respond } from '@/presentation/http'

export const runtime = 'nodejs'

export const GET = () => withAdmin([], async () => respond(await getSettingsUseCases().getSettings()))

export const PUT = (request: NextRequest) =>
  withAdmin(['manage_settings'], async (actor) => {
    const body = await readJson<{ items?: unknown }>(request)
    if (!body.ok) return body.response
    const result = await getSettingsUseCases().updateSettings(body.body, actor)
    return result.ok ? NextResponse.json({ ok: true }) : respond(result)
  })
