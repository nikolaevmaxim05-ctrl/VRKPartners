// use-cases/admin/manage-tracking-tags — Google-теги (GA4 / GTM / Ads). Після змін — revalidate сайту.
import { ok, fail, type Result } from '../../result'
import { UNIQUE_VIOLATION, type Actor, type CacheInvalidator } from '../../ports/common'
import { noopAudit, type AuditLog } from '../../audit'
import type { TrackingTagRepository } from '../../ports/settings'
import { TAG_ID_PATTERNS, type TrackingTag, type TrackingTagType } from '../../../domain/tracking/tags'
import { planNewTag, planTagPatch } from '../../../domain/tracking/tag-rules'

export function makeTrackingTagUseCases(deps: { tags: TrackingTagRepository; cache: CacheInvalidator; audit?: AuditLog }) {
  const { tags, cache } = deps
  const audit = deps.audit ?? noopAudit

  async function listTags(): Promise<Result<TrackingTag[]>> {
    const res = await tags.list()
    if (!res.ok) {
      console.error('[admin/tracking-tags] query_failed', res.error)
      return fail('failed', res.error)
    }
    return ok(res.data)
  }

  async function createTag(body: Parameters<typeof planNewTag>[0], actor?: Actor): Promise<Result<TrackingTag>> {
    const plan = planNewTag(body)
    if (!plan.ok) return fail('invalid', plan.message)
    const nextPosition = (await tags.maxPosition()) + 1
    const res = await tags.insert({ ...plan.value, position: nextPosition })
    if (!res.ok) {
      if (res.code === UNIQUE_VIOLATION) return fail('conflict', 'Тег з таким ID вже існує')
      console.error('[admin/tracking-tags] insert_failed', res.error)
      return fail('failed', res.error)
    }
    cache.invalidateSite()
    await audit.record(actor, 'tracking_tag.create', `tracking_tags/${res.data.id}`, { new: plan.value })
    return ok(res.data)
  }

  async function updateTag(id: string, body: Parameters<typeof planTagPatch>[0], actor?: Actor): Promise<Result<TrackingTag>> {
    const current = await tags.getType(id)
    if (!current) return fail('not_found', 'Тег не знайдено')
    const plan = planTagPatch(body, current.type)
    if (!plan.ok) return fail('invalid', plan.message)
    const res = await tags.update(id, plan.value)
    if (!res.ok) {
      if (res.code === UNIQUE_VIOLATION) return fail('conflict', 'Тег з таким ID вже існує')
      console.error('[admin/tracking-tags/[id]] update_failed', res.error)
      return fail('failed', res.error)
    }
    cache.invalidateSite()
    await audit.record(actor, 'tracking_tag.update', `tracking_tags/${id}`, { new: plan.value })
    return ok(res.data)
  }

  async function deleteTag(id: string, actor?: Actor): Promise<Result<void>> {
    if (!(await tags.exists(id))) return fail('not_found', 'Тег не знайдено')
    const res = await tags.delete(id)
    if (!res.ok) {
      console.error('[admin/tracking-tags/[id]] delete_failed', res.error)
      return fail('failed', res.error)
    }
    cache.invalidateSite()
    await audit.record(actor, 'tracking_tag.delete', `tracking_tags/${id}`)
    return ok(undefined)
  }

  /** Увімкнені теги для сайту; ID ще раз перевіряються форматом (defense-in-depth). */
  async function listEnabledForSite(): Promise<Array<{ type: TrackingTagType; tag_id: string; conversion_label: string | null }>> {
    const res = await tags.listEnabled()
    if (!res.ok) {
      console.error('[marketing/layout] tracking_tags_query_failed', res.error)
      return []
    }
    return res.data.filter((t) => TAG_ID_PATTERNS[t.type]?.test(t.tag_id))
  }

  return { listTags, createTag, updateTag, deleteTag, listEnabledForSite }
}
