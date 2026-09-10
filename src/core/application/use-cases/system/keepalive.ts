// use-cases/system/keepalive — пінг БД (cron раз на 5 днів) + прибирання старих лічильників rate-limit.
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
    // Вікно 10 хв → усе старше за годину неактуальне. Помилка не критична.
    const cutoff = new Date(deps.clock.now().getTime() - 60 * 60 * 1000).toISOString()
    const cleanup = await deps.health.cleanupRateLimits(cutoff)
    if (!cleanup.ok) console.error('[cron/keepalive] rate_limits_cleanup_failed', cleanup.error)

    const ts = deps.clock.now().toISOString()
    console.log('[cron/keepalive] ping ok', ts)
    return ok({ ts })
  }
}
