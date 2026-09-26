// GET  /api/admin/referral-links — довідник посилань (id, name, code, is_active) для фільтрів і бейджів
// POST /api/admin/referral-links — створити посилання (код генерує сервер)
import { NextRequest } from 'next/server'
import { getReferralLinkUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { readJson, respond } from '@/presentation/http'
import { REFERRAL_PERMISSIONS, REFERRAL_READ_PERMISSIONS } from '@/presentation/permissions'

export const runtime = 'nodejs'

export const GET = (request: NextRequest) =>
  withAdmin(REFERRAL_READ_PERMISSIONS, async () => {
    // ?full=1 — повні рядки (нотатки, дати) для розділу; за замовчуванням — довідник.
    const full = new URL(request.url).searchParams.get('full') === '1'
    const uc = getReferralLinkUseCases()
    return respond(full ? await uc.listLinks() : await uc.listRefs())
  })

export const POST = (request: NextRequest) =>
  withAdmin(REFERRAL_PERMISSIONS, async (actor) => {
    const body = await readJson(request)
    if (!body.ok) return body.response
    return respond(await getReferralLinkUseCases().createLink(body.body, actor))
  })
