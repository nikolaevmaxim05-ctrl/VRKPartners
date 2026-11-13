// GET /api/admin/settings — ключи site_settings (без секретов)
// PUT /api/admin/settings — items: [{ key, value, type? }] (белый список ключей)
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
