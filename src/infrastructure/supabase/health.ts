// infrastructure/supabase/health — keepalive: легкий запит, щоб безкоштовний проєкт не засинав.
import type { Db } from './service'
import { dbOk, dbFail } from '@core/application/ports/common'
import type { HealthCheck } from '@core/application/ports/system'

export function makeHealthCheck(db: () => Db): HealthCheck {
  return {
    async ping() {
      const { error } = await db().from('lead_statuses').select('id').limit(1)
      return error ? dbFail(error.message) : dbOk(undefined)
    },
    async cleanupRateLimits(cutoffIso) {
      const { error } = await db().from('rate_limits').delete().lt('window_started_at', cutoffIso)
      return error ? dbFail(error.message) : dbOk(undefined)
    },
  }
}
