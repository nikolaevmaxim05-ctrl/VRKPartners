// core/application/audit — журнал дій адмінів (audit_log, розділ 16 стандарту).
// Сценарії викликають audit.record(...) ПІСЛЯ успішної мутації; помилка запису в журнал
// ніколи не валить запит (лише лог). Секрети в журнал не потрапляють — сценарії передають
// лише ключі/метадані, не значення.
import type { Actor } from './ports/common'
import type { AuditLogRepository } from './ports/system'

export type AuditValues = { old?: unknown; new?: unknown }

export interface AuditLog {
  /** action — `<ресурс>.<дія>` (lead.update, stage.delete…); resource — `<таблиця>/<id>`. */
  record(actor: Actor | null | undefined, action: string, resource: string, values?: AuditValues): Promise<void>
}

export function makeAuditLog(repo: Pick<AuditLogRepository, 'insert'>): AuditLog {
  return {
    async record(actor, action, resource, values = {}) {
      try {
        const res = await repo.insert({
          user_id: actor?.id ?? null,
          user_email: actor?.email ?? null,
          action,
          resource,
          old_value: values.old ?? null,
          new_value: values.new ?? null,
          ip_address: actor?.ip && actor.ip !== 'unknown' ? actor.ip : null,
        })
        if (!res.ok) console.error('[audit] write_failed', action, resource, res.error)
      } catch (err) {
        console.error('[audit] write_threw', action, resource, err)
      }
    },
  }
}

/** Заглушка для тестів і випадків без журналу. */
export const noopAudit: AuditLog = { async record() {} }
