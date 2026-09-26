// core/application/ports/referrals — реферальні посилання партнерів (таблиця referral_links, міграція 035).
import type { DbResult } from './common'
import type { ReferralLink, ReferralLinkRef } from '../../domain/referral/link-rules'

export type ReferralLinkInsert = { name: string; code: string; notes: string | null; created_by: string | null }
export type ReferralLinkPatch = { name?: string; notes?: string | null; is_active?: boolean; updated_at: string }

/** Заявки з посиланням для статистики; truncated — вибірка обрізана лімітом (10 000). */
export type ReferralLeadRows = { rows: Array<{ referral_link_id: string; created_at: string }>; truncated: boolean }

export interface ReferralLinkRepository {
  list(): Promise<DbResult<ReferralLink[]>>
  /** Довідник для фільтрів/бейджів (усі, в т.ч. вимкнені). */
  listRefs(): Promise<DbResult<ReferralLinkRef[]>>
  get(id: string): Promise<DbResult<ReferralLink | null>>
  /** Для приймача заявок: посилання за кодом (будь-якого стану) або null. */
  findByCode(code: string): Promise<DbResult<ReferralLinkRef | null>>
  insert(values: ReferralLinkInsert): Promise<DbResult<ReferralLink>>
  update(id: string, patch: ReferralLinkPatch): Promise<DbResult<ReferralLink>>
  delete(id: string): Promise<DbResult<void>>
  leadRows(): Promise<DbResult<ReferralLeadRows>>
}
