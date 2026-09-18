// core/domain/analytics/events-config — валідація PATCH конфігу подій аналітики.
// Перенесено з /api/admin/analytics-events без зміни поведінки (тексти помилок ті самі).
import {
  ANALYTICS_REGISTRY,
  ANALYTICS_EVENT_KEYS,
  MAX_EVENT_NAMES_PER_KEY,
  isValidEventName,
  RESERVED_EVENT_NAMES,
  type AnalyticsEventsConfig,
} from './registry'

type PatchEventsEntry = { enabled?: unknown; eventNames?: unknown; eventName?: unknown }

export type EventsPatchResult =
  | { ok: true; patch: AnalyticsEventsConfig | null }
  | { ok: false; message: string }

/** Валідує поле events тіла PATCH. undefined → patch=null (нічого не міняємо). */
export function validateEventsPatch(events: unknown): EventsPatchResult {
  if (events === undefined) return { ok: true, patch: null }
  if (events === null || typeof events !== 'object' || Array.isArray(events)) {
    return { ok: false, message: 'Поле events має бути обʼєктом' }
  }

  const labelByKey = new Map(
    ANALYTICS_REGISTRY.map((e) => [e.key, `${e.blockLabel} — ${e.interactionLabel}`]),
  )
  const reservedName = (name: string, key: string) =>
    `Імʼя «${name}» заборонене: збігається з автоподією GA4 (${labelByKey.get(key)})`
  const invalidName = (key: string) =>
    `Невірне імʼя події для «${labelByKey.get(key)}»: дозволені малі латинські літери, цифри та _, до 40 символів`

  const patch: AnalyticsEventsConfig = {}

  for (const [key, raw] of Object.entries(events as Record<string, unknown>)) {
    if (!ANALYTICS_EVENT_KEYS.has(key)) {
      return { ok: false, message: `Невідома точка взаємодії: ${key}` }
    }
    if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, message: `Невірний формат налаштування для: ${labelByKey.get(key)}` }
    }
    const value = raw as PatchEventsEntry
    if (typeof value.enabled !== 'boolean') {
      return { ok: false, message: `Поле enabled має бути true/false (${labelByKey.get(key)})` }
    }

    let resolvedNames: string[]
    if (Array.isArray(value.eventNames)) {
      if (value.eventNames.length > MAX_EVENT_NAMES_PER_KEY) {
        return { ok: false, message: `Максимум 5 подій на одну взаємодію (${labelByKey.get(key)})` }
      }
      for (const name of value.eventNames) {
        if (!isValidEventName(name)) return { ok: false, message: invalidName(key) }
        if (RESERVED_EVENT_NAMES.has(name)) return { ok: false, message: reservedName(name, key) }
      }
      const names = value.eventNames as string[]
      if (new Set(names).size !== names.length) {
        return { ok: false, message: `Імена подій не повинні повторюватись (${labelByKey.get(key)})` }
      }
      resolvedNames = names
    } else if (typeof value.eventName === 'string') {
      const trimmed = value.eventName.trim()
      if (!isValidEventName(trimmed)) return { ok: false, message: invalidName(key) }
      if (RESERVED_EVENT_NAMES.has(trimmed)) return { ok: false, message: reservedName(trimmed, key) }
      resolvedNames = [trimmed]
    } else {
      // Ні eventNames, ні eventName — пустий масив допустимий (точка мовчить)
      resolvedNames = []
    }

    patch[key] = { enabled: value.enabled, eventNames: resolvedNames, eventName: resolvedNames[0] ?? key }
  }

  return { ok: true, patch }
}
