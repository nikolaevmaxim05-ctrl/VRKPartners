// core/application/ports/referrals — реферальные ссылки партнёров (таблица referral_links, миграция 035).
import type { DbResult } from './common'
import type { ReferralLink, ReferralLinkRef } from '../../domain/referral/link-rules'

export type ReferralLinkInsert = { name: string; code: string; notes: string | null; created_by: string | null }
export type ReferralLinkPatch = { name?: string; notes?: string | null; is_active?: boolean; updated_at: string }

/** Заявки со ссылкой для статистики; truncated — выборка обрезана лимитом (10 000). */
export type ReferralLeadRows = { rows: Array<{ referral_link_id: string; created_at: string }>; truncated: boolean }

export interface ReferralLinkRepository {
  list(): Promise<DbResult<ReferralLink[]>>
  /** Справочник для фильтров/бейджей (все, в т.ч. выключенные). */
  listRefs(): Promise<DbResult<ReferralLinkRef[]>>
  get(id: string): Promise<DbResult<ReferralLink | null>>
  /** Для приёмника заявок: ссылка по коду (в любом состоянии) или null. */
  findByCode(code: string): Promise<DbResult<ReferralLinkRef | null>>
  insert(values: ReferralLinkInsert): Promise<DbResult<ReferralLink>>
  update(id: string, patch: ReferralLinkPatch): Promise<DbResult<ReferralLink>>
  delete(id: string): Promise<DbResult<void>>
  leadRows(): Promise<DbResult<ReferralLeadRows>>
}
