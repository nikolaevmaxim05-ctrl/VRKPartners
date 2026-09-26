// use-cases/admin/manage-referral-links — реферальні посилання партнерів (відхилення 11).
// Код генерує сервер (випадковий, незмінний); колізія коду → одна повторна спроба; назва партнера
// унікальна без урахування регістру; посилання із заявками не видаляється (лише вимикається).
import { ok, fail, type Result } from '../../result'
import { UNIQUE_VIOLATION, type Actor, type Clock } from '../../ports/common'
import { noopAudit, type AuditLog } from '../../audit'
import type { ReferralLinkRepository } from '../../ports/referrals'
import { generateRefCode } from '../../../domain/referral/code'
import {
  planNewReferralLink,
  planReferralLinkPatch,
  aggregateLeadStats,
  REF_ERRORS,
  type ReferralLink,
  type ReferralLinkRef,
  type ReferralLinkStats,
  type NewReferralLinkBody,
  type ReferralLinkPatchBody,
} from '../../../domain/referral/link-rules'

/** Код Postgres «foreign_key_violation» — лід посилається на посилання. */
export const FOREIGN_KEY_VIOLATION = '23503'

export type ReferralLinkDeps = {
  links: ReferralLinkRepository
  leads: { countByReferralLink(linkId: string): Promise<number> }
  clock: Clock
  /** randomInt(maxExclusive) → [0, maxExclusive), криптографічно стійкий (node:crypto в контейнері). */
  randomInt: (maxExclusive: number) => number
  audit?: AuditLog
}

export function makeReferralLinkUseCases(deps: ReferralLinkDeps) {
  const { links, leads, clock, randomInt } = deps
  const audit = deps.audit ?? noopAudit

  async function listLinks(): Promise<Result<ReferralLink[]>> {
    const res = await links.list()
    if (!res.ok) {
      console.error('[admin/referral-links] query_failed', res.error)
      return fail('failed', res.error)
    }
    return ok(res.data)
  }

  async function listRefs(): Promise<Result<ReferralLinkRef[]>> {
    const res = await links.listRefs()
    if (!res.ok) {
      console.error('[admin/referral-links] refs_query_failed', res.error)
      return fail('failed', res.error)
    }
    return ok(res.data)
  }

  /** 23505: розрізняємо унікальність назви (lower(name)) і коду за іменем constraint у тексті помилки. */
  const isNameConflict = (message: string) => /name_lower/i.test(message)

  async function createLink(body: NewReferralLinkBody, actor?: Actor): Promise<Result<ReferralLink>> {
    const plan = planNewReferralLink(body)
    if (!plan.ok) return fail('invalid', plan.message)
    for (let attempt = 0; attempt < 2; attempt++) {
      const code = generateRefCode(randomInt)
      const res = await links.insert({ name: plan.value.name, code, notes: plan.value.notes, created_by: actor?.id ?? null })
      if (res.ok) {
        await audit.record(actor, 'referral_link.create', `referral_links/${res.data.id}`, { new: { name: res.data.name, code: res.data.code } })
        return ok(res.data)
      }
      if (res.code === UNIQUE_VIOLATION) {
        if (isNameConflict(res.error)) return fail('conflict', REF_ERRORS.nameTaken)
        // Колізія випадкового коду — ще одна спроба з новим кодом.
        if (attempt === 0) continue
        return fail('conflict', REF_ERRORS.codeTaken)
      }
      console.error('[admin/referral-links] insert_failed', res.error)
      return fail('failed', res.error)
    }
    return fail('conflict', REF_ERRORS.codeTaken)
  }

  async function updateLink(id: string, body: ReferralLinkPatchBody, actor?: Actor): Promise<Result<ReferralLink>> {
    const plan = planReferralLinkPatch(body)
    if (!plan.ok) return fail('invalid', plan.message)
    const cur = await links.get(id)
    if (!cur.ok) return fail('failed', cur.error)
    if (!cur.data) return fail('not_found', REF_ERRORS.notFound)
    const res = await links.update(id, { ...plan.value, updated_at: clock.now().toISOString() })
    if (!res.ok) {
      if (res.code === UNIQUE_VIOLATION) return fail('conflict', REF_ERRORS.nameTaken)
      console.error('[admin/referral-links/[id]] update_failed', res.error)
      return fail('failed', res.error)
    }
    await audit.record(actor, 'referral_link.update', `referral_links/${id}`, {
      old: { name: cur.data.name, notes: cur.data.notes, is_active: cur.data.is_active },
      new: plan.value,
    })
    return ok(res.data)
  }

  async function deleteLink(id: string, actor?: Actor): Promise<Result<void>> {
    const cur = await links.get(id)
    if (!cur.ok) return fail('failed', cur.error)
    if (!cur.data) return fail('not_found', REF_ERRORS.notFound)
    const n = await leads.countByReferralLink(id)
    if (n > 0) return fail('conflict', REF_ERRORS.hasLeads(n))
    const res = await links.delete(id)
    if (!res.ok) {
      // Гонка: заявка зʼявилась між підрахунком і видаленням — FK on delete restrict.
      if (res.code === FOREIGN_KEY_VIOLATION) return fail('conflict', REF_ERRORS.hasLeads(await leads.countByReferralLink(id)))
      console.error('[admin/referral-links/[id]] delete_failed', res.error)
      return fail('failed', res.error)
    }
    await audit.record(actor, 'referral_link.delete', `referral_links/${id}`, { old: { name: cur.data.name, code: cur.data.code } })
    return ok(undefined)
  }

  async function getStats(): Promise<Result<{ stats: ReferralLinkStats[]; truncated: boolean }>> {
    const res = await links.leadRows()
    if (!res.ok) {
      console.error('[admin/referral-links/stats] query_failed', res.error)
      return fail('failed', res.error)
    }
    return ok({ stats: aggregateLeadStats(res.data.rows, clock.now()), truncated: res.data.truncated })
  }

  return { listLinks, listRefs, createLink, updateLink, deleteLink, getStats }
}
