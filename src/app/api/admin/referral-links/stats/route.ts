// GET /api/admin/referral-links/stats — заявки по ссылкам: всего / за 30 дней / последняя (v1 без визитов)
import { getReferralLinkUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { respond } from '@/presentation/http'
import { REFERRAL_PERMISSIONS } from '@/presentation/permissions'

export const runtime = 'nodejs'

export const GET = () =>
  withAdmin(REFERRAL_PERMISSIONS, async () => respond(await getReferralLinkUseCases().getStats(), ({ stats, truncated }) => ({ data: stats, truncated })))
