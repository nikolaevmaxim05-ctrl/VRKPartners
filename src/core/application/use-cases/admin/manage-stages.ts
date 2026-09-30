// use-cases/admin/manage-stages — стадії воронки: список, створення, зміна, видалення, порядок.
import { ok, fail, type Result } from '../../result'
import { UNIQUE_VIOLATION, type Actor } from '../../ports/common'
import { noopAudit, type AuditLog } from '../../audit'
import type { LeadRepository, LeadStatusRepository, LeadStatusRow } from '../../ports/leads'
import type { SettingsRepository } from '../../ports/settings'
import {
  planStagePatch,
  planNewStage,
  STAGE_ERRORS,
  type StagePatchBody,
  type StageCreateBody,
} from '../../../domain/funnel/stage-rules'

/** id-заглушка для «скинути is_initial у всіх» при створенні. */
const NO_ID = '00000000-0000-0000-0000-000000000000'

export function makeStageUseCases(deps: {
  statuses: LeadStatusRepository
  leads: LeadRepository
  settings: SettingsRepository
  audit?: AuditLog
}) {
  const { statuses, leads, settings } = deps
  const audit = deps.audit ?? noopAudit

  async function listStages(): Promise<Result<{ data: LeadStatusRow[]; pipelines_enabled: boolean }>> {
    const [list, pipelines] = await Promise.all([statuses.list(), settings.get('pipelines_enabled')])
    if (!list.ok) {
      console.error('[admin/lead-statuses] query_failed', list.error)
      return fail('failed', list.error)
    }
    return ok({ data: list.data, pipelines_enabled: pipelines === 'true' })
  }

  async function createStage(body: StageCreateBody, actor?: Actor): Promise<Result<LeadStatusRow>> {
    const plan = planNewStage(body)
    if (!plan.ok) return fail('invalid', plan.error)
    const nextPosition = (await statuses.maxPosition()) + 1
    if (plan.values.is_initial) await statuses.clearInitialExcept(NO_ID)
    const res = await statuses.insert({ ...plan.values, position: nextPosition })
    if (!res.ok) {
      if (res.code === UNIQUE_VIOLATION) return fail('conflict', 'Стадія з такою назвою вже існує')
      console.error('[admin/lead-statuses] insert_failed', res.error)
      return fail('failed', res.error)
    }
    await audit.record(actor, 'stage.create', `lead_statuses/${res.data.id}`, { new: plan.values })
    return ok(res.data)
  }

  async function updateStage(id: string, body: StagePatchBody, actor?: Actor): Promise<Result<LeadStatusRow>> {
    const current = await statuses.getCurrent(id)
    if (!current) return fail('not_found', 'Стадія не знайдена')

    const plan = planStagePatch(body, current)
    if (!plan.ok) return fail('invalid', plan.error)
    const update = plan.update

    // is_initial — radio-поведінка
    if (plan.initial === 'set') {
      await statuses.clearInitialExcept(id)
      update.is_initial = true
    } else if (plan.initial === 'unset') {
      if (current.is_initial && (await statuses.countInitialExcept(id)) === 0) {
        return fail('invalid', STAGE_ERRORS.lastInitial)
      }
      update.is_initial = false
    }

    if (Object.keys(update).length === 0) return fail('invalid', 'Нічого оновлювати')

    const res = await statuses.update(id, update)
    if (!res.ok) {
      console.error('[admin/lead-statuses/[id]] update_failed', res.error)
      return fail('failed', res.error)
    }
    await audit.record(actor, 'stage.update', `lead_statuses/${id}`, { old: current, new: update })
    return ok(res.data)
  }

  async function deleteStage(id: string, actor?: Actor): Promise<Result<void>> {
    const target = await statuses.getForDelete(id)
    if (!target) return fail('not_found', 'Стадія не знайдена')
    if (target.is_initial) return fail('invalid', 'Спочатку призначте іншу стадію первинною')
    const leadsCount = await leads.countByStatus(id)
    if (leadsCount > 0) {
      return fail(
        'invalid',
        `Не можна видалити: на стадії знаходиться ${leadsCount} лід(ів). Спочатку переведіть їх на іншу стадію.`,
      )
    }
    const res = await statuses.delete(id)
    if (!res.ok) {
      console.error('[admin/lead-statuses/[id]] delete_failed', res.error)
      return fail('failed', res.error)
    }
    await audit.record(actor, 'stage.delete', `lead_statuses/${id}`, { old: target })
    return ok(undefined)
  }

  async function reorderStages(body: { items?: unknown }, actor?: Actor): Promise<Result<void>> {
    const items = body.items
    if (!Array.isArray(items) || items.length === 0) return fail('invalid', 'Порожній items')
    for (const item of items as Array<{ id?: string; position?: number }>) {
      if (!item.id || !Number.isFinite(item.position) || (item.position as number) < 0) {
        return fail('invalid', 'Невірні дані')
      }
    }
    // UPDATE-и незалежні (кожен — свій рядок) → паралельно, а не по одному; частковий збій лишає
    // валідний проміжний стан (позиції — звичайні числа без унікальності).
    const list = items as Array<{ id: string; position: number }>
    const results = await Promise.all(list.map((item) => statuses.setPosition(item.id, Math.floor(item.position))))
    const errors: string[] = []
    results.forEach((res, i) => {
      if (!res.ok) errors.push(`${list[i].id}: ${res.error}`)
    })
    if (errors.length > 0) {
      console.error('[admin/lead-statuses/reorder] partial_failure', errors)
      return fail('failed', errors.join('; '))
    }
    await audit.record(actor, 'stage.reorder', 'lead_statuses', { new: items })
    return ok(undefined)
  }

  return { listStages, createStage, updateStage, deleteStage, reorderStages }
}
