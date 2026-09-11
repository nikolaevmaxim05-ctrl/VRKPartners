// GET /api/admin/content — тексти сайту для редактора (редаговані розділи + дефолти + версія)
// PUT /api/admin/content — зберегти повні значення: валідація за розділом 9 → лише дифф від
//   дефолтів → БД → revalidate сайту. Чужий верхньорівневий розділ → 400.
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
