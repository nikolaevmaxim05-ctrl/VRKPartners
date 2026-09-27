// use-cases/admin/leads — список, картка, зміна ліда (воронка), видалення, коментарі, кастомні поля.
// Логіка PATCH перенесена з /api/admin/leads/[id] без зміни поведінки; правила — у домені
// (core/domain/funnel/transition), сценарій лише виконує план.
import { ok, fail, type Result } from '../../result'
import type { Actor } from '../../ports/common'
import { noopAudit, type AuditLog } from '../../audit'
import type {
  LeadRepository,
  LeadStatusRepository,
  LeadCommentRepository,
  LeadHistoryRepository,
  CustomFieldRepository,
  LeadRow,
  LeadCommentRow,
  LeadCommentType,
} from '../../ports/leads'
import type { UserRepository } from '../../ports/access'
import type { ConversionSheetExporter } from '../../ports/conversions'
import type { ConversionFlow } from './conversion-flow'
import { pageMeta } from '../../paging'
import { parseLeadPatch } from '../../../domain/lead/patch'
import { validateNewComment, isCommentType } from '../../../domain/lead/comments'
import { validateCustomFieldValue } from '../../../domain/lead/custom-fields'
import {
  planDealClearing,
  resolveConversionValue,
  classifyLeadChange,
  decideAdjustment,
  decideLeave,
  decideAmountAdjustment,
  type AdjustmentDecision,
  type StatusForTransition,
} from '../../../domain/funnel/transition'
import type { ConversionType } from '../../../domain/funnel/stage-rules'

export type LeadUseCaseDeps = {
  leads: LeadRepository
  statuses: LeadStatusRepository
  comments: LeadCommentRepository
  history: LeadHistoryRepository
  customFields: CustomFieldRepository
  users: UserRepository
  conversionFlow: ConversionFlow
  sheets: ConversionSheetExporter
  audit?: AuditLog
}

export function makeLeadUseCases(deps: LeadUseCaseDeps) {
  const { leads, statuses, comments, history, customFields, users, conversionFlow, sheets } = deps
  const audit = deps.audit ?? noopAudit

  // ── Список ─────────────────────────────────────────────────────────────────
  async function listLeads(get: (k: string) => string | null): Promise<Result<Record<string, unknown>>> {
    const page = Math.max(1, parseInt(get('page') ?? '1') || 1)
    const limit = Math.min(100, Math.max(1, parseInt(get('limit') ?? '20') || 20))
    const t = (k: string) => (get(k) ?? '').trim()

    const res = await leads.list({
      page,
      limit,
      search: t('search'),
      service: t('service'),
      utmSource: t('utm_source'),
      utmField: t('utm_field'),
      utmValue: t('utm_value'),
      statusId: t('status_id'),
      assignedTo: t('assigned_to'),
      dateFrom: t('date_from'),
      dateTo: t('date_to'),
      // uuid посилання | 'none' — без посилання (відхилення 11)
      referralLinkId: t('referral_link_id'),
    })
    if (!res.ok) {
      console.error('[admin/leads] query_failed', res.error)
      return fail('failed', res.error)
    }

    // Резолв email і display name відповідальних (user_roles джойниться окремо).
    const assignedIds = Array.from(new Set(res.data.rows.map((r) => r.assigned_to).filter((v): v is string => !!v)))
    const { emailById, nameById } = await users.getEmailsAndNames(assignedIds)
    const enriched = res.data.rows.map((r) => ({
      ...r,
      assignee_email: r.assigned_to ? emailById.get(r.assigned_to) ?? null : null,
      assignee_name: r.assigned_to ? nameById.get(r.assigned_to) ?? null : null,
    }))
    return ok({ data: enriched, ...pageMeta(res.data.total, page, limit) })
  }

  // ── Картка ─────────────────────────────────────────────────────────────────
  async function getLeadDetail(id: string): Promise<Result<Record<string, unknown>>> {
    const res = await leads.getDetail(id)
    if (!res.ok) {
      console.error('[admin/leads/[id]] query_failed', res.error)
      return fail('failed', res.error)
    }
    const lead = res.data
    if (!lead) return fail('not_found', 'Not found')

    let assigneeEmail: string | null = null
    let assigneeName: string | null = null
    if (lead.assigned_to) {
      const r = await users.getEmailAndName(lead.assigned_to)
      assigneeEmail = r.email
      assigneeName = r.name
    }

    const [fields, values] = await Promise.all([customFields.listForLead(), customFields.valuesForLead(id)])
    const valuesByFieldId = new Map<string, string | null>()
    for (const v of values) valuesByFieldId.set(v.field_id, v.value)
    const fieldsWithValues = fields.map((f) => ({ ...f, value: valuesByFieldId.get(f.id) ?? null }))

    const phone = lead.phone as string | null | undefined
    const historyRows = phone ? await leads.listByPhone(phone) : []

    return ok({
      data: {
        ...lead,
        assignee_email: assigneeEmail,
        assignee_name: assigneeName,
        custom_fields: fieldsWithValues,
        history: historyRows,
      },
    })
  }

  // ── Зміна ліда ─────────────────────────────────────────────────────────────
  async function updateLead(id: string, raw: unknown, actor: Actor): Promise<Result<LeadRow>> {
    const patch = parseLeadPatch(raw)
    if (!patch.ok) return fail('invalid', patch.message)
    const update = patch.update

    const beforeRes = await leads.getState(id)
    if (!beforeRes.ok || !beforeRes.data) {
      return fail('not_found', beforeRes.ok ? 'Not found' : beforeRes.error)
    }
    const before = beforeRes.data

    const statusInfoById = new Map<string, StatusForTransition>()
    let clearedDealOnTransition = false
    const statusChanging = 'status_id' in update && update.status_id !== before.status_id

    const amountKeys = 'deal_amount' in update || 'deal_profit' in update
    if (statusChanging || (amountKeys && before.status_id)) {
      const ids = [before.status_id, statusChanging ? update.status_id : null].filter((v): v is string => !!v)
      for (const s of await statuses.getForTransition(ids)) statusInfoById.set(s.id, s)
    }

    if (statusChanging) {

      const oldConversionType = before.status_id ? statusInfoById.get(before.status_id)?.conversion_type ?? null : null
      const newConversionType = update.status_id
        ? statusInfoById.get(update.status_id as string)?.conversion_type ?? null
        : null

      // Перехід «з угоди → без угоди» — обнуляємо суму/прибуток, крім переданих явно.
      const clearing = planDealClearing({ before, bodyKeys: patch.bodyKeys, oldConversionType, newConversionType })
      Object.assign(update, clearing.update)
      clearedDealOnTransition = clearing.cleared
    }

    // C8: CAS по status_id — паралельна зміна стадії → 409.
    const updatedRes = await leads.update(id, update, statusChanging ? { statusId: before.status_id } : undefined)
    if (!updatedRes.ok) {
      console.error('[admin/leads/[id]] update_failed', updatedRes.error)
      return fail('failed', updatedRes.error)
    }
    const updated = updatedRes.data
    if (!updated) {
      return fail('conflict', 'Статус ліда змінився паралельно. Оновіть сторінку й повторіть.')
    }

    // ── System-коментарі ──
    const systemMessages: string[] = []
    if (statusChanging) {
      const oldName = before.status_id ? statusInfoById.get(before.status_id)?.name ?? 'без стадії' : 'без стадії'
      const newName = update.status_id ? statusInfoById.get(update.status_id as string)?.name ?? 'без стадії' : 'без стадії'
      systemMessages.push(`Стадія: ${oldName} → ${newName}`)
      if (clearedDealOnTransition) systemMessages.push('Сума угоди очищена (перехід на стадію без угоди)')
    }
    if ('assigned_to' in update && update.assigned_to !== before.assigned_to) {
      const resolve = async (uid: string | null) => (uid ? users.getDisplayLabel(uid) : 'не призначено')
      const [oldA, newA] = await Promise.all([
        resolve(before.assigned_to),
        resolve((update.assigned_to as string | null) ?? null),
      ])
      systemMessages.push(`Відповідальний: ${oldA} → ${newA}`)
    }
    if ('deal_amount' in update && Number(before.deal_amount ?? 0) !== Number(update.deal_amount ?? 0)) {
      systemMessages.push(`Сума угоди: ${before.deal_amount ?? '—'} → ${update.deal_amount ?? '—'}`)
    }
    if ('deal_profit' in update && Number(before.deal_profit ?? 0) !== Number(update.deal_profit ?? 0)) {
      systemMessages.push(`Прибуток: ${before.deal_profit ?? '—'} → ${update.deal_profit ?? '—'}`)
    }
    if (systemMessages.length > 0) {
      const ins = await comments.insertMany(
        systemMessages.map((content) => ({
          lead_id: id,
          user_id: actor.id,
          user_email: actor.email,
          type: 'system' as const,
          content,
        })),
      )
      if (!ins.ok) console.error('[admin/leads/[id]] system_comment_failed', ins.error)
    }

    // ── Історія стадій (best effort) ──
    if (statusChanging) {
      const toType = update.status_id ? statusInfoById.get(update.status_id as string)?.conversion_type ?? null : null
      try {
        const h = await history.insert({
          lead_id: id,
          from_status_id: before.status_id ?? null,
          to_status_id: (update.status_id as string | null) ?? null,
          to_conversion_type: toType,
          changed_by: actor.id,
          changed_by_email: actor.email,
        })
        if (!h.ok) console.error('[admin/leads/[id]] status_history_insert_failed', h.error)
      } catch (e) {
        console.error('[admin/leads/[id]] status_history_unexpected', e)
      }
    }

    // ── Розділ 6: enter / leave / amount (стадія береться ПІСЛЯ зміни) ──
    // Усі відправки await-яться до відповіді; помилки логуються і НЕ валять PATCH.
    const newStatus = (updated as {
      status?: {
        is_final?: boolean
        conversion_type?: ConversionType | null
        conversion_action?: string | null
        requires_amount?: boolean
      } | null
    }).status ?? null
    const oldStatus = before.status_id ? statusInfoById.get(before.status_id) ?? null : null
    const u = updated as unknown as {
      order_no: number
      email: string | null
      phone: string
      gclid: string | null
      gbraid: string | null
      wbraid: string | null
      deal_amount: unknown
      deal_profit: unknown
    }
    const orderNo = Number(u.order_no)
    const conversionValue = newStatus ? resolveConversionValue(newStatus, u) : null
    const amountChanged = !!newStatus && resolveConversionValue(newStatus, before) !== conversionValue

    const change = classifyLeadChange({ statusChanged: statusChanging, oldStatus, newStatus, amountChanged })

    const runAdjustment = async (decision: AdjustmentDecision) => {
      if (decision.kind === 'none') return
      const adj = await conversionFlow.recordAdjustment(
        decision.kind === 'retract'
          ? { leadId: id, orderNo, conversionAction: decision.conversionAction, type: 'retract', offlineConversionId: decision.offlineConversionId }
          : { leadId: id, orderNo, conversionAction: decision.conversionAction, type: 'restate', value: decision.value },
      )
      if (adj) await conversionFlow.dispatchAdjustment(adj)
    }

    // Офлайн-лист: рядок ОСТАННЬОГО стану конверсії (без дублів — лише при реальній зміні).
    const sendConversionRow = async (action: string | null) => {
      try {
        const sent = await sheets.sendConversion({
          lead_id: id,
          order_no: orderNo,
          email: u.email ?? null,
          phone: u.phone ?? '',
          gclid: u.gclid ?? null,
          gbraid: u.gbraid ?? null,
          wbraid: u.wbraid ?? null,
          conversionValue,
          conversionAction: action,
        })
        if (sent) await conversionFlow.markConversionExportedByLead(id)
      } catch (err) {
        console.error('[google-sheets] send_failed', err instanceof Error ? err.message : err)
      }
    }

    const recordConversionSafe = async (action: string | null, type: ConversionType | null) => {
      try {
        return await conversionFlow.recordConversion(id, conversionValue, action, type)
      } catch (err) {
        console.error('[leads/PATCH] recordConversion failed', err instanceof Error ? err.message : err)
        return { outcome: 'error' as const }
      }
    }

    if (change === 'enter' && newStatus) {
      const statusConversionAction = newStatus.conversion_action ?? null
      const statusConversionType = newStatus.conversion_type ?? null
      const oldConversionType = oldStatus?.conversion_type ?? null
      console.log('[leads/PATCH] enter → recording conversion', {
        leadId: id, orderNo, newStatusId: update.status_id, oldConversionType, conversionType: statusConversionType, conversionValue, statusConversionAction,
      })
      // Стан конверсії ДО апдейту — для RETRACT потрібні оригінальні action + export_status.
      const ocBefore = await conversionFlow.getConversionByLead(id)
      const outcome = await recordConversionSafe(statusConversionAction, statusConversionType)
      await runAdjustment(decideAdjustment({ oldConversionType, newConversionType: statusConversionType, outcome, ocBefore, conversionValue }))
      // Відкликана (retracted) конверсія повертається в чергу: якщо відправка нижче не вдасться,
      // її підбере масове вивантаження.
      if (ocBefore?.export_status === 'retracted' && outcome.outcome !== 'error') {
        await conversionFlow.markConversionPendingByLead(id)
      }
      if (outcome.outcome === 'inserted' || outcome.outcome === 'updated') {
        await sendConversionRow(statusConversionAction)
      } else if (outcome.outcome === 'noop' && ocBefore && ocBefore.export_status !== 'exported') {
        // Той самий стан, але конверсія не вивантажена (після RETRACT або Sheets був недоступний) —
        // відправляємо заново, щоб Google знову її отримав.
        await sendConversionRow(statusConversionAction)
      }
    } else if (change === 'leave') {
      // Пішли з конверсійної стадії: відкликаємо вивантажену конверсію (RETRACT).
      const ocBefore = await conversionFlow.getConversionByLead(id)
      const decision = decideLeave(ocBefore)
      console.log('[leads/PATCH] leave', { leadId: id, orderNo, retract: decision.kind === 'retract' })
      await runAdjustment(decision)
    } else if (change === 'amount' && newStatus) {
      // Та сама конверсійна стадія, змінилась сума: оновити стан; вивантажена → RESTATE,
      // ще pending → рядок конверсії піде з новою сумою.
      const statusConversionAction = newStatus.conversion_action ?? null
      const statusConversionType = newStatus.conversion_type ?? null
      const ocBefore = await conversionFlow.getConversionByLead(id)
      const outcome = await recordConversionSafe(statusConversionAction, statusConversionType)
      console.log('[leads/PATCH] amount', { leadId: id, orderNo, conversionValue, outcome: outcome.outcome })
      const decision = decideAmountAdjustment({ outcome, ocBefore, conversionValue })
      await runAdjustment(decision)
      if (decision.kind === 'none' && (outcome.outcome === 'inserted' || outcome.outcome === 'updated')) {
        await sendConversionRow(statusConversionAction)
      }
    }

    await audit.record(actor, 'lead.update', `leads/${id}`, { old: before, new: update })
    return ok(updated)
  }

  // ── Видалення ──────────────────────────────────────────────────────────────
  async function deleteLead(id: string, actor?: Actor): Promise<Result<void>> {
    if (!(await leads.exists(id))) return fail('not_found', 'Лід не знайдено')
    const res = await leads.delete(id)
    if (!res.ok) {
      console.error('[admin/leads/:id] delete_failed', res.error)
      return fail('failed', res.error)
    }
    await audit.record(actor, 'lead.delete', `leads/${id}`)
    return ok(undefined)
  }

  // ── Коментарі ──────────────────────────────────────────────────────────────
  async function listComments(leadId: string, typeFilter: string | null): Promise<Result<LeadCommentRow[]>> {
    const type = typeFilter && isCommentType(typeFilter) ? (typeFilter as LeadCommentType) : undefined
    const res = await comments.list(leadId, type)
    if (!res.ok) {
      console.error('[admin/leads/[id]/comments] query_failed', res.error)
      return fail('failed', res.error)
    }
    return ok(res.data)
  }

  async function addComment(leadId: string, body: { type?: string; content?: string }, actor: Actor): Promise<Result<LeadCommentRow>> {
    const v = validateNewComment(body)
    if (!v.ok) return fail('invalid', v.message)
    const res = await comments.insert({ lead_id: leadId, user_id: actor.id, user_email: actor.email, type: v.type, content: v.content })
    if (!res.ok) {
      console.error('[admin/leads/[id]/comments] insert_failed', res.error)
      return fail('failed', res.error)
    }
    await audit.record(actor, 'lead.comment', `leads/${leadId}`, { new: { type: v.type, comment_id: res.data.id } })
    return ok(res.data)
  }

  // ── Кастомні поля ліда ─────────────────────────────────────────────────────
  async function setCustomFieldValue(
    leadId: string,
    body: { field_id?: string; value?: string | null },
    actor?: Actor,
  ): Promise<Result<{ field_id: string; value: string | null }>> {
    const fieldId = (body.field_id ?? '').trim()
    if (!fieldId) return fail('invalid', 'field_id обовʼязковий')

    const field = await customFields.get(fieldId)
    if (!field) return fail('not_found', 'Поле не знайдено')

    const v = validateCustomFieldValue(field, body.value)
    if (!v.ok) return fail('invalid', v.message)

    if (!(await leads.exists(leadId))) return fail('not_found', 'Лід не знайдено')

    const res = await customFields.upsertValue(leadId, fieldId, v.value)
    if (!res.ok) {
      console.error('[admin/leads/[id]/custom-fields] upsert_failed', res.error)
      return fail('failed', res.error)
    }
    await audit.record(actor, 'lead.custom_field', `leads/${leadId}`, { new: { field_id: fieldId, value: v.value } })
    return ok(res.data)
  }

  return { listLeads, getLeadDetail, updateLead, deleteLead, listComments, addComment, setCustomFieldValue }
}
