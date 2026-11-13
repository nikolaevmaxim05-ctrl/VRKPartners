// GET /api/admin/content — тексты сайта для редактора (редактируемые разделы + дефолты + версия)
// PUT /api/admin/content — сохранить полные значения: валидация по разделу 9 → только дифф от
//   дефолтов → БД → revalidate сайта. Чужой верхнеуровневый раздел → 400.
import { NextRequest, NextResponse } from 'next/server'
import { getContentUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { readJson, respond } from '@/presentation/http'

export const runtime = 'nodejs'

export const GET = () =>
  withAdmin(['manage_content'], async () => NextResponse.json(await getContentUseCases().getMessagesForEditor()))

export const PUT = (request: NextRequest) =>
  withAdmin(['manage_content'], async (actor) => {
    const body = await readJson<{ overrides?: unknown; baseUpdatedAt?: string | null }>(request)
    if (!body.ok) return body.response
    return respond(await getContentUseCases().saveMessages(body.body, actor), ({ updatedAt }) => ({ ok: true, updatedAt }))
  })
