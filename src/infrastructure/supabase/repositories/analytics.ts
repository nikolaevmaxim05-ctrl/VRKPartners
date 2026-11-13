// infrastructure/supabase/repositories/analytics — выборки для отчётов и выгрузок.
import type { Db } from '../service'
import { dbOk, dbFail } from '@core/application/ports/common'
import type { AnalyticsRepository } from '@core/application/ports/analytics'
import type { DbLeadRow } from '@core/domain/analytics/report-breakdown'
import type { ExportLeadRow, ExportHistoryRow, ExportCommentRow } from '@core/domain/analytics/export-leads'

const CHUNK_SIZE = 500 // id лидов в одном фильтре .in(...) при дочитывании полей, истории и комментариев

// referral_links!left — название партнёра для разреза/разбивки/экспорта (селекты держать синхронно).
const REPORT_SELECT = `
  id, created_at, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
  gclid, service, assigned_to, deal_amount, deal_profit, status_id,
  referral_link_id, referral_code,
  lead_statuses!left(id, name, color, conversion_type),
  referral_links!left(id, name)
`

const EXPORT_SELECT = `
  id, created_at, utm_source, utm_medium, utm_campaign, utm_term, utm_content,
  gclid, fbclid, ttclid, referrer, phone, email, service, assigned_to,
  deal_amount, deal_profit, status_id,
  referral_link_id, referral_code,
  lead_statuses!left(id, name, color, conversion_type),
  referral_links!left(id, name)
`

/** Фильтр реферальной ссылки: 'none' → без ссылки, UUID → конкретная, '' → без фильтра. */
function applyReferralFilter<Q extends { is(col: string, v: null): Q; eq(col: string, v: string): Q }>(query: Q, referralLinkId: string): Q {
  if (referralLinkId === 'none') return query.is('referral_link_id', null)
  if (referralLinkId) return query.eq('referral_link_id', referralLinkId)
  return query
}

async function inChunks<T>(ids: string[], fn: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) out.push(...(await fn(ids.slice(i, i + CHUNK_SIZE))))
  return out
}

/**
 * Выборки отчётов и выгрузок аналитики. Клиент — service_role (RLS не действует): право смотреть
 * отчёт уже проверил withAdmin в роуте (решение 2 Фазы 2). Защиту от слишком больших выборок держит
 * сценарий: он просит limit + 1 строк и по лишней строке понимает, что диапазон надо сузить.
 * Справочники (statusFlags, statusNames, customFieldDefs) и дочитывание по id при ошибке БД молча
 * отдают пустой список — отчёт или файл выгрузки строится без этих данных.
 */
export function makeAnalyticsRepository(db: () => Db): AnalyticsRepository {
  return {
    // count: 'exact' — общее число подходящих строк без учёта limit (сценарий сравнивает его с лимитом).
    async reportLeads(q) {
      let query = db()
        .from('leads')
        .select(REPORT_SELECT, { count: 'exact' })
        .gte('created_at', q.utcFrom)
        .lte('created_at', q.utcTo)
      if (q.utmSource) query = query.eq('utm_source', q.utmSource)
      if (q.service) query = query.eq('service', q.service)
      // Несколько ответственных (assigneeIds) важнее одного (assignedTo), если пришли оба.
      if (q.assigneeIds.length > 0) query = query.in('assigned_to', q.assigneeIds)
      else if (q.assignedTo) query = query.eq('assigned_to', q.assignedTo)
      if (q.gclid === 'with') query = query.not('gclid', 'is', null)
      else if (q.gclid === 'without') query = query.is('gclid', null)
      if (q.statusIds.length > 0) query = query.in('status_id', q.statusIds)
      query = applyReferralFilter(query, q.referralLinkId)

      const { data, error, count } = await query.limit(q.limit)
      if (error) return dbFail(error.message)
      return dbOk({ rows: (data ?? []) as unknown as DbLeadRow[], count: count ?? null })
    },

    // Без count: здесь count всегда null, и сценарий узнаёт о превышении лимита по числу строк (limit + 1).
    async exportLeads(q) {
      let query = db()
        .from('leads')
        .select(EXPORT_SELECT)
        .gte('created_at', q.utcFrom)
        .lte('created_at', q.utcTo)
        .order('created_at', { ascending: false })
      if (q.utmSource) query = query.eq('utm_source', q.utmSource)
      if (q.service) query = query.eq('service', q.service)
      // Только один ответственный: фильтр по нескольким выгрузка не учитывает — как до перестройки
      // (решение владельца 2026-09-11 «не исправлять»).
      if (q.assignedTo) query = query.eq('assigned_to', q.assignedTo)
      if (q.gclid === 'with') query = query.not('gclid', 'is', null)
      if (q.gclid === 'without') query = query.is('gclid', null)
      if (q.statusIds.length > 0) query = query.in('status_id', q.statusIds)
      query = applyReferralFilter(query, q.referralLinkId)

      const { data, error, count } = await query.limit(q.limit)
      if (error) return dbFail(error.message)
      return dbOk({ rows: (data ?? []) as unknown as ExportLeadRow[], count: count ?? null })
    },

    async statusFlags() {
      const { data } = await db().from('lead_statuses').select('conversion_type, amount_is_profit').limit(500)
      return (data ?? []) as Array<{ conversion_type: string | null; amount_is_profit?: boolean }>
    },

    async statusNames() {
      const { data } = await db().from('lead_statuses').select('id, name').limit(500)
      return (data ?? []) as Array<{ id: string; name: string }>
    },

    async customFieldValuesByField(fieldId, limit) {
      let query = db().from('lead_custom_field_values').select('lead_id, value').eq('field_id', fieldId)
      if (limit) query = query.limit(limit)
      const { data, error } = await query
      if (error) return dbFail(error.message)
      return dbOk((data ?? []) as Array<{ lead_id: string; value: string | null }>)
    },

    async customFieldDefs() {
      const { data } = await db().from('lead_custom_fields').select('id, name').order('position', { ascending: true })
      return (data ?? []) as Array<{ id: string; name: string }>
    },

    async customFieldValuesByLeads(leadIds) {
      return inChunks(leadIds, async (chunk) => {
        const { data } = await db().from('lead_custom_field_values').select('lead_id, field_id, value').in('lead_id', chunk)
        return (data ?? []) as Array<{ lead_id: string; field_id: string; value: string }>
      })
    },

    async historyByLeads(leadIds) {
      return inChunks(leadIds, async (chunk) => {
        const { data } = await db()
          .from('lead_status_history')
          .select('lead_id, from_status_id, to_status_id, to_conversion_type, changed_by_email, created_at')
          .in('lead_id', chunk)
          .order('created_at', { ascending: true })
        return (data ?? []) as ExportHistoryRow[]
      })
    },

    async commentsByLeads(leadIds) {
      return inChunks(leadIds, async (chunk) => {
        const { data } = await db()
          .from('lead_comments')
          .select('lead_id, created_at, user_email, content, type')
          .in('lead_id', chunk)
          // Системные комментарии (смена стадии, повтор) в выгрузку не входят — только записи людей.
          .in('type', ['comment', 'note'])
          .order('created_at', { ascending: true })
        return (data ?? []) as ExportCommentRow[]
      })
    },

    // Значения UTM-колонки за период (список значений измерения, getDimensionValues), с повторами — уникальные отбирает сценарий.
    async utmValues(col, utcFrom, utcTo, limit) {
      const { data, error } = await db()
        .from('leads')
        .select(col)
        .gte('created_at', utcFrom)
        .lte('created_at', utcTo)
        .not(col, 'is', null)
        .limit(limit)
      if (error) return dbFail(error.message)
      return dbOk(((data ?? []) as unknown as Record<string, unknown>[]).map((r) => r[col]))
    },
  }
}
