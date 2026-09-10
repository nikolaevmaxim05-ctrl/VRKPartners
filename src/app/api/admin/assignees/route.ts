// GET /api/admin/assignees — користувачі для селекта «Відповідальний» (неактивні виключено).
import { getUserUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { respond } from '@/presentation/http'

export const runtime = 'nodejs'

export const GET = () => withAdmin([], async () => respond(await getUserUseCases().listAssignees()))
