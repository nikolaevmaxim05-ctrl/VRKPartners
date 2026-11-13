// core/application/ports/leads — лиды, стадии, комментарии, история, кастомные поля.
import type { DbResult } from './common'
import type { StageCurrent, ConversionType } from '../../domain/funnel/stage-rules'
import type { StatusForTransition } from '../../domain/funnel/transition'

// ── Лиды ─────────────────────────────────────────────────────────────────────

export type LeadInsert = {
  name: string
  phone: string
  email: string | null
  service: string | null
  message: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  gclid: string | null
  fbclid: string | null
  ttclid: string | null
  referrer: string | null
  source_url: string | null
  ip_address: string | null
  user_agent: string | null
  status_id: string | null
  /** Язык страницы заявки (leads.locale, миграция 029). */
  locale?: string | null
  /** Реферальная ссылка (миграция 035): id активной ссылки; код — снимок на момент заявки. */
  referral_link_id?: string | null
  referral_code?: string | null
  /** Первый переход по зачтённому коду (миграция 037, first-touch). */
  referral_touched_at?: string | null
}

export type LeadListFilters = {
  page: number
  limit: number
  search: string
  service: string
  utmSource: string
  utmField: string
  utmValue: string
  statusId: string
  assignedTo: string
  dateFrom: string
  dateTo: string
  /** uuid ссылки | 'none' (без ссылки) | '' (все). */
  referralLinkId?: string
}

export type LeadRow = Record<string, unknown> & { id: string; assigned_to: string | null }

export type LeadState = {
  status_id: string | null
  assigned_to: string | null
  deal_amount: number | string | null
  deal_profit: number | string | null
}

export interface LeadRepository {
  findFirstIdByPhone(phone: string): Promise<DbResult<string | null>>
  findFirstIdByIpSince(ip: string, sinceIso: string): Promise<DbResult<string | null>>
  /** Количество заявок с IP начиная с sinceIso — rate limit формы (раздел 8). */
  countByIpSince(ip: string, sinceIso: string): Promise<DbResult<number>>
  markRepeat(id: string): Promise<DbResult<void>>
  insert(row: LeadInsert): Promise<DbResult<void>>
  list(filters: LeadListFilters): Promise<DbResult<{ rows: LeadRow[]; total: number }>>
  /** Лид + статус + оригинал (для карточки). */
  getDetail(id: string): Promise<DbResult<LeadRow | null>>
  /** Все лиды с тем же телефоном (история повторов). */
  listByPhone(phone: string): Promise<Array<{ id: string; created_at: string; status_id: string | null }>>
  getState(id: string): Promise<DbResult<LeadState | null>>
  /**
   * UPDATE с возвратом строки + статуса. Если cas задан — обновляет только когда
   * текущий status_id равен cas.statusId (optimistic CAS). null = CAS-промах/нет строки.
   */
  update(id: string, patch: Record<string, unknown>, cas?: { statusId: string | null }): Promise<DbResult<LeadRow | null>>
  /** Удаляет лид (сначала offline_conversions лида). */
  delete(id: string): Promise<DbResult<void>>
  exists(id: string): Promise<boolean>
  getClickIds(id: string): Promise<DbResult<{ gclid: string | null; gbraid: string | null; wbraid: string | null } | null>>
  countByStatus(statusId: string): Promise<number>
  /** Заявки, зачтённые ссылке (запрет удаления ссылки). */
  countByReferralLink(linkId: string): Promise<number>
}

// ── Стадии ───────────────────────────────────────────────────────────────────

export type LeadStatusRow = {
  id: string
  name: string
  color: string
  position: number
  is_final: boolean
  is_initial: boolean
  conversion_type: ConversionType | null
  conversion_action: string | null
  requires_amount: boolean
  amount_is_profit: boolean
  allowed_next_status_ids: string[]
  allowed_prev_status_ids: string[]
}

export interface LeadStatusRepository {
  list(): Promise<DbResult<LeadStatusRow[]>>
  getForTransition(ids: string[]): Promise<StatusForTransition[]>
  getCurrent(id: string): Promise<StageCurrent | null>
  getForDelete(id: string): Promise<{ id: string; name: string; is_initial: boolean } | null>
  findInitialId(): Promise<string | null>
  findIdByName(name: string): Promise<string | null>
  /** Снимает is_initial со всех стадий, кроме exceptId. */
  clearInitialExcept(exceptId: string): Promise<void>
  countInitialExcept(exceptId: string): Promise<number>
  maxPosition(): Promise<number>
  insert(values: Record<string, unknown>): Promise<DbResult<LeadStatusRow>>
  update(id: string, patch: Record<string, unknown>): Promise<DbResult<LeadStatusRow>>
  delete(id: string): Promise<DbResult<void>>
  setPosition(id: string, position: number): Promise<DbResult<void>>
}

// ── Комментарии и история ────────────────────────────────────────────────────

export type LeadCommentType = 'comment' | 'note' | 'system'

export type LeadCommentRow = {
  id: string
  lead_id: string
  user_id: string | null
  user_email: string | null
  type: LeadCommentType
  content: string
  created_at: string
}

export type NewLeadComment = {
  lead_id: string
  user_id: string | null
  user_email: string | null
  type: LeadCommentType
  content: string
}

export interface LeadCommentRepository {
  list(leadId: string, type?: LeadCommentType): Promise<DbResult<LeadCommentRow[]>>
  insert(row: NewLeadComment): Promise<DbResult<LeadCommentRow>>
  insertMany(rows: NewLeadComment[]): Promise<DbResult<void>>
}

export type StatusHistoryInsert = {
  lead_id: string
  from_status_id: string | null
  to_status_id: string | null
  to_conversion_type: string | null
  changed_by: string
  changed_by_email: string | null
}

export interface LeadHistoryRepository {
  insert(row: StatusHistoryInsert): Promise<DbResult<void>>
}

// ── Кастомные поля ───────────────────────────────────────────────────────────

export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'boolean'

export type CustomFieldRow = {
  id: string
  name: string
  field_key: string
  type: CustomFieldType
  options: string[] | null
  required: boolean | null
  position: number | null
  created_at?: string
}

export interface CustomFieldRepository {
  /** Для списка настроек (с created_at). */
  list(): Promise<DbResult<CustomFieldRow[]>>
  /** Для карточки лида (без created_at). */
  listForLead(): Promise<CustomFieldRow[]>
  get(id: string): Promise<Pick<CustomFieldRow, 'id' | 'type' | 'options' | 'required'> | null>
  maxPosition(): Promise<number>
  insert(values: Record<string, unknown>): Promise<DbResult<CustomFieldRow>>
  update(id: string, patch: Record<string, unknown>): Promise<DbResult<CustomFieldRow>>
  delete(id: string): Promise<DbResult<void>>
  valuesForLead(leadId: string): Promise<Array<{ field_id: string; value: string | null }>>
  upsertValue(leadId: string, fieldId: string, value: string | null): Promise<DbResult<{ field_id: string; value: string | null }>>
}
