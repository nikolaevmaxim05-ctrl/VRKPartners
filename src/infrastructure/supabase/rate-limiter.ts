// infrastructure/supabase/rate-limiter — rate limit форми на Postgres (таблиця rate_limits +
// функція check_rate_limit, міграція 026). Поведінка без змін; у Фазі 4 замінюється
// підрахунком по таблиці leads (3 заявки / 10 хв, раздел 8 стандарту).
//
// Результат розрізняє:
//   • "limited"     — чесний перебір ліміту (429);
//   • "unavailable" — технічна недоступність БД (503, fail-closed у production).
import type { Db } from './service'
import type { RateLimiter, RateLimitResult } from '@core/application/ports/system'

const MAX_REQUESTS = 5
const WINDOW_SECONDS = 10 * 60

type RpcRow = { allowed: boolean; remaining: number; reset_at: string }

export function makePostgresRateLimiter(db: () => Db): RateLimiter {
  return {
    async check(identifier): Promise<RateLimitResult> {
      // Байпас для тестів на Preview/локально: ТІЛЬКИ поза production і за явним прапором.
      if (process.env.VERCEL_ENV !== 'production' && process.env.RATE_LIMIT_DISABLED === '1') {
        return { status: 'ok', remaining: MAX_REQUESTS, reset: Date.now() + WINDOW_SECONDS * 1000 }
      }
      // У dev без сервіс-ключа не блокуємо локальну розробку.
      if (process.env.NODE_ENV === 'development' && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        console.warn('[rate-limit] no service key in development — skipping rate limit')
        return { status: 'ok', remaining: MAX_REQUESTS, reset: Date.now() + WINDOW_SECONDS * 1000 }
      }

      const degraded = (): RateLimitResult =>
        process.env.NODE_ENV === 'production'
          ? { status: 'unavailable', reason: 'db_error' }
          : { status: 'ok', remaining: 0, reset: Date.now() + WINDOW_SECONDS * 1000 }

      try {
        const { data, error } = await db().rpc('check_rate_limit', {
          p_key: `lead:${identifier}`,
          p_max: MAX_REQUESTS,
          p_window_seconds: WINDOW_SECONDS,
        })
        if (error) {
          console.error('[rate-limit] supabase rpc error (fail-closed unavailable):', error.message)
          return degraded()
        }
        const row = (Array.isArray(data) ? data[0] : data) as RpcRow | undefined
        if (!row) {
          console.error('[rate-limit] empty rpc result (fail-closed unavailable)')
          return degraded()
        }
        const reset = new Date(row.reset_at).getTime()
        return row.allowed
          ? { status: 'ok', remaining: row.remaining, reset }
          : { status: 'limited', remaining: row.remaining, reset }
      } catch (err) {
        console.error('[rate-limit] unexpected error (fail-closed unavailable):', err)
        return degraded()
      }
    },
  }
}
