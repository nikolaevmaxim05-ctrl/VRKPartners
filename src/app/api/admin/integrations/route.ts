// GET /api/admin/integrations — ключі інтеграцій зі статусом і замаскованим значенням.
import { getIntegrationUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { respond } from '@/presentation/http'

export const runtime = 'nodejs'

export const GET = () =>
  withAdmin(['manage_settings', 'manage_integrations'], async () => respond(await getIntegrationUseCases().listIntegrations()))
