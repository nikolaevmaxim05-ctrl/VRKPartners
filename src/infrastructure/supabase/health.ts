// infrastructure/supabase/health — keepalive: лёгкий запрос, чтобы бесплатный проект не засыпал.
import type { Db } from './service'
import { dbOk, dbFail } from '@core/application/ports/common'
import type { HealthCheck } from '@core/application/ports/system'

export function makeHealthCheck(db: () => Db): HealthCheck {
  return {
    async ping() {
      const { error } = await db().from('lead_statuses').select('id').limit(1)
      return error ? dbFail(error.message) : dbOk(undefined)
    },
  }
}
