// use-cases/admin/analytics-events — конфіг подій аналітики (site_settings.analytics_events).
// Реєстр і дефолтні імена подій НЕ змінюються (клієнтські GTM-тригери).
import { ok, fail, type Result } from '../../result'
import type { Actor, CacheInvalidator, Clock } from '../../ports/common'
import { noopAudit, type AuditLog } from '../../audit'
import type { SettingsRepository } from '../../ports/settings'
import {
  ANALYTICS_REGISTRY,
  ANALYTICS_EVENTS_SETTING_KEY,
  getDefaultAnalyticsEvents,
  parseAnalyticsEventsConfig,
  type AnalyticsEventsConfig,
} from '../../../domain/analytics/registry'
import { validateEventsPatch } from '../../../domain/analytics/events-config'

export function makeAnalyticsEventsUseCases(deps: { settings: SettingsRepository; cache: CacheInvalidator; clock: Clock; audit?: AuditLog }) {
  const { settings, cache, clock } = deps
  const audit = deps.audit ?? noopAudit

  async function readStored(): Promise<AnalyticsEventsConfig> {
    const raw = await settings.get(ANALYTICS_EVENTS_SETTING_KEY)
    if (!raw) return {}
    try {
      return parseAnalyticsEventsConfig(JSON.parse(raw))
    } catch (err) {
      console.error('[marketing/layout] analytics_events_unavailable', err)
      return {}
    }
  }

  /** Повний конфіг: дефолти + збережені перекриття. */
  async function getMergedConfig(): Promise<AnalyticsEventsConfig> {
    try {
      return { ...getDefaultAnalyticsEvents(), ...(await readStored()) }
    } catch (err) {
      console.error('[marketing/layout] analytics_events_unavailable', err)
      return getDefaultAnalyticsEvents()
    }
  }

  async function getEvents() {
    return { registry: ANALYTICS_REGISTRY, events: await getMergedConfig() }
  }

  /** МЕРЖ присланих ключів зі збереженим конфігом (per-row save). */
  async function patchEvents(body: { events?: unknown }, actor: Actor): Promise<Result<{ events: AnalyticsEventsConfig }>> {
    const v = validateEventsPatch(body.events)
    if (!v.ok) return fail('invalid', v.message)

    if (v.patch !== null) {
      const merged = { ...(await readStored()), ...v.patch }
      const res = await settings.upsertMany([
        {
          key: ANALYTICS_EVENTS_SETTING_KEY,
          value: JSON.stringify(merged),
          type: 'json',
          updated_at: clock.now().toISOString(),
          updated_by: actor.id,
        },
      ])
      if (!res.ok) {
        console.error('[admin/analytics-events] upsert_events_failed', res.error)
        return fail('failed', 'Помилка сервера')
      }
      await audit.record(actor, 'analytics_events.update', 'site_settings/analytics_events', { new: v.patch })
    }

    cache.invalidateSite()
    return ok({ events: await getMergedConfig() })
  }

  return { getEvents, patchEvents, getMergedConfig }
}
