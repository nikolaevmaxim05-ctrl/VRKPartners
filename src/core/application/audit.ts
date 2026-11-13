// core/application/audit — журнал действий админов (audit_log, раздел 16 стандарта).
// Сценарии вызывают audit.record(...) ПОСЛЕ успешной мутации; ошибка записи в журнал
// никогда не валит запрос (только лог). Секреты в журнал не попадают — сценарии передают
// только ключи/метаданные, не значения.
import type { Actor } from './ports/common'
import type { AuditLogRepository } from './ports/system'

export type AuditValues = { old?: unknown; new?: unknown }

export interface AuditLog {
  /** action — `<ресурс>.<действие>` (lead.update, stage.delete…); resource — `<таблица>/<id>`. */
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

/** Заглушка для тестов и случаев без журнала. */
export const noopAudit: AuditLog = { async record() {} }
