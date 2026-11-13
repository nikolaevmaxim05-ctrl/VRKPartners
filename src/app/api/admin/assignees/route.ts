// GET /api/admin/assignees — пользователи для селекта «Відповідальний» (неактивные исключены).
import { getUserUseCases } from '@composition/container'
import { withAdmin } from '@/presentation/admin-route'
import { respond } from '@/presentation/http'

export const runtime = 'nodejs'

export const GET = () => withAdmin([], async () => respond(await getUserUseCases().listAssignees()))
