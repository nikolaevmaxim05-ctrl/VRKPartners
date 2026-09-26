// PATCH  /api/admin/referral-links/[id] — назва / нотатки / вмикач (код незмінний → 400)
// DELETE /api/admin/referral-links/[id] — видалення (із заявками → 409 «вимкніть замість видалення»)
import { NextRequest, NextResponse } from 'next/server'
import { getReferralLinkUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { readJson, respond, isUuid, notFound } from '@/presentation/http'
import { REFERRAL_PERMISSIONS } from '@/presentation/permissions'

export const runtime = 'nodejs'

type RouteParams = { params: Promise<{ id: string }> }

export const PATCH = (request: NextRequest, { params }: RouteParams) =>
  withAdmin(REFERRAL_PERMISSIONS, async (actor) => {
    const { id } = await params
    if (!isUuid(id)) return notFound()
    const body = await readJson(request)
    if (!body.ok) return body.response
    return respond(await getReferralLinkUseCases().updateLink(id, body.body, actor))
  })

export const DELETE = (_request: NextRequest, { params }: RouteParams) =>
  withAdmin(REFERRAL_PERMISSIONS, async (actor) => {
    const { id } = await params
    if (!isUuid(id)) return notFound()
    const result = await getReferralLinkUseCases().deleteLink(id, actor)
    return result.ok ? NextResponse.json({ ok: true }) : respond(result)
  })
