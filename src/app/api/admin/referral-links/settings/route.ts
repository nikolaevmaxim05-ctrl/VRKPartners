// GET/PATCH /api/admin/referral-links/settings — вікно атрибуції first-touch (днів, 1–400, дефолт 90).
// Зберігається в site_settings.referral_attribution_days через сценарій налаштувань (аудит settings.update);
// право — manage_referrals (окно задає той, хто веде партнерів), а не manage_settings.
import { NextRequest } from 'next/server'
import { getReferralLinkUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { readJson, respond } from '@/presentation/http'
import { REFERRAL_PERMISSIONS } from '@/presentation/permissions'

export const runtime = 'nodejs'

export const GET = () =>
  withAdmin(REFERRAL_PERMISSIONS, async () => respond(await getReferralLinkUseCases().getAttributionWindow(), (data) => ({ data })))

export const PATCH = (request: NextRequest) =>
  withAdmin(REFERRAL_PERMISSIONS, async (actor) => {
    const body = await readJson<{ days?: unknown }>(request)
    if (!body.ok) return body.response
    return respond(await getReferralLinkUseCases().setAttributionWindow(body.body, actor), (data) => ({ data }))
  })
