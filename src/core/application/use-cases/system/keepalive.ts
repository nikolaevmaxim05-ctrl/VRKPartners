// use-cases/system/keepalive — пінг БД (cron раз на 5 днів), щоб безкоштовний проєкт не засинав.
import { ok, fail, type Result } from '../../result'
import type { Clock } from '../../ports/common'
import type { HealthCheck } from '../../ports/system'

export function makeKeepalive(deps: { health: HealthCheck; clock: Clock }) {
  return async function keepalive(): Promise<Result<{ ts: string }>> {
    const ping = await deps.health.ping()
    if (!ping.ok) {
      console.error('[cron/keepalive] supabase_error', ping.error)
      return fail('failed', ping.error, { ok: false })
    }
    const ts = deps.clock.now().toISOString()
    console.log('[cron/keepalive] ping ok', ts)
    return ok({ ts })
  }
}
