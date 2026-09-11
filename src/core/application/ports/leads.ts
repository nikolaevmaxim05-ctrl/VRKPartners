// core/application/ports/leads — ліди, стадії, коментарі, історія, кастомні поля.
import type { DbResult } from './common'
import type { StageCurrent, ConversionType } from '../../domain/funnel/stage-rules'
import type { StatusForTransition } from '../../domain/funnel/transition'

// ── Ліди ─────────────────────────────────────────────────────────────────────

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
  /** Мова сторінки заявки (leads.locale, міграція 029). */
  locale?: string | null
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
  /** Кількість заявок з IP від sinceIso — rate limit форми (розділ 8). */
  countByIpSince(ip: string, sinceIso: string): Promise<DbResult<number>>
  markRepeat(id: string): Promise<DbResult<void>>
  insert(row: LeadInsert): Promise<DbResult<void>>
  list(filters: LeadListFilters): Promise<DbResult<{ rows: LeadRow[]; total: number }>>
  /** Лід + статус + оригінал (для картки). */
  getDetail(id: string): Promise<DbResult<LeadRow | null>>
  /** Усі ліди з тим самим телефоном (історія повторів). */
  listByPhone(phone: string): Promise<Array<{ id: string; created_at: string; status_id: string | null }>>
  getState(id: string): Promise<DbResult<LeadState | null>>
  /**
   * UPDATE з поверненням рядка + статусу. Якщо cas задано — оновлює лише коли
   * поточний status_id дорівнює cas.statusId (optimistic CAS). null = CAS-промах/нема рядка.
   */
  update(id: string, patch: Record<string, unknown>, cas?: { statusId: string | null }): Promise<DbResult<LeadRow | null>>
  /** Видаляє лід (спершу offline_conversions ліда). */
  delete(id: string): Promise<DbResult<void>>
  exists(id: string): Promise<boolean>
  getClickIds(id: string): Promise<DbResult<{ gclid: string | null; gbraid: string | null; wbraid: string | null } | null>>
  countByStatus(statusId: string): Promise<number>
}

// ── Стадії ───────────────────────────────────────────────────────────────────

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
  /** Знімає is_initial з усіх стадій, крім exceptId. */
  clearInitialExcept(exceptId: string): Promise<void>
  countInitialExcept(exceptId: string): Promise<number>
  maxPosition(): Promise<number>
  insert(values: Record<string, unknown>): Promise<DbResult<LeadStatusRow>>
  update(id: string, patch: Record<string, unknown>): Promise<DbResult<LeadStatusRow>>
  delete(id: string): Promise<DbResult<void>>
  setPosition(id: string, position: number): Promise<DbResult<void>>
}

// ── Коментарі та історія ─────────────────────────────────────────────────────

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

// ── Кастомні поля ────────────────────────────────────────────────────────────

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
  /** Для списку налаштувань (з created_at). */
  list(): Promise<DbResult<CustomFieldRow[]>>
  /** Для картки ліда (без created_at). */
  listForLead(): Promise<CustomFieldRow[]>
  get(id: string): Promise<Pick<CustomFieldRow, 'id' | 'type' | 'options' | 'required'> | null>
  maxPosition(): Promise<number>
  insert(values: Record<string, unknown>): Promise<DbResult<CustomFieldRow>>
  update(id: string, patch: Record<string, unknown>): Promise<DbResult<CustomFieldRow>>
  delete(id: string): Promise<DbResult<void>>
  valuesForLead(leadId: string): Promise<Array<{ field_id: string; value: string | null }>>
  upsertValue(leadId: string, fieldId: string, value: string | null): Promise<DbResult<{ field_id: string; value: string | null }>>
}
