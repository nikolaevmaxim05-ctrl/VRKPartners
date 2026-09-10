// core/domain/tracking/tag-rules — валідація створення/редагування Google-тегів.
import { isValidTagType, isValidTagId, TAG_ID_FORMAT_HINTS, type TrackingTagType } from './tags'

type Plan<T> = { ok: true; value: T } | { ok: false; message: string }

function normalizeLabel(raw: unknown): Plan<string | null> {
  const trimmed = typeof raw === 'string' ? raw.trim() : null
  const label = trimmed || null
  if (label && label.length > 128) return { ok: false, message: 'Мітка: до 128 символів' }
  return { ok: true, value: label }
}

export function planNewTag(body: { type?: string; tag_id?: string; label?: string | null; enabled?: boolean }):
  Plan<{ type: TrackingTagType; tag_id: string; label: string | null; enabled: boolean }> {
  if (!isValidTagType(body.type)) return { ok: false, message: 'Тип тегу: ga4 / gtm / aw' }
  const type: TrackingTagType = body.type
  const tagId = (body.tag_id ?? '').trim()
  if (!isValidTagId(type, tagId)) {
    return { ok: false, message: `Невірний формат ID тегу. Очікується: ${TAG_ID_FORMAT_HINTS[type]}` }
  }
  const label = normalizeLabel(body.label)
  if (!label.ok) return label
  const enabled = body.enabled === undefined ? true : !!body.enabled
  return { ok: true, value: { type, tag_id: tagId, label: label.value, enabled } }
}

export function planTagPatch(
  body: Partial<{ enabled: boolean; label: string | null; tag_id: string }>,
  currentType: TrackingTagType,
): Plan<Record<string, unknown>> {
  const update: Record<string, unknown> = {}
  if (body.enabled !== undefined) update.enabled = !!body.enabled
  if (body.label !== undefined) {
    const label = normalizeLabel(body.label)
    if (!label.ok) return label
    update.label = label.value
  }
  if (body.tag_id !== undefined) {
    const tagId = (body.tag_id ?? '').trim()
    // tag_id валідується за поточним типом тегу — тип змінювати не можна
    if (!isValidTagId(currentType, tagId)) {
      return { ok: false, message: `Невірний формат ID тегу. Очікується: ${TAG_ID_FORMAT_HINTS[currentType]}` }
    }
    update.tag_id = tagId
  }
  if (Object.keys(update).length === 0) return { ok: false, message: 'Нічого оновлювати' }
  return { ok: true, value: update }
}
