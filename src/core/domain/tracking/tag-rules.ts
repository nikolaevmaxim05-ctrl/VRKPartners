// core/domain/tracking/tag-rules — валидация создания/редактирования Google-тегов.
import { isValidTagType, isValidTagId, isValidConversionLabel, TAG_ID_FORMAT_HINTS, type TrackingTagType } from './tags'

type Plan<T> = { ok: true; value: T } | { ok: false; message: string }

function normalizeLabel(raw: unknown): Plan<string | null> {
  const trimmed = typeof raw === 'string' ? raw.trim() : null
  const label = trimmed || null
  if (label && label.length > 128) return { ok: false, message: 'Мітка: до 128 символів' }
  return { ok: true, value: label }
}

/** Conversion label: только для aw; пустое → null; для ga4/gtm непустое → ошибка (раздел 5). */
function normalizeConversionLabel(raw: unknown, type: TrackingTagType): Plan<string | null> {
  const trimmed = typeof raw === 'string' ? raw.trim() : ''
  if (!trimmed) return { ok: true, value: null }
  if (type !== 'aw') return { ok: false, message: 'Conversion label — лише для тегів Google Ads (AW-…)' }
  if (!isValidConversionLabel(trimmed)) {
    return { ok: false, message: 'Conversion label: лише літери, цифри, _ та -, до 64 символів' }
  }
  return { ok: true, value: trimmed }
}

export type NewTagBody = {
  type?: string
  tag_id?: string
  label?: string | null
  conversion_label?: string | null
  enabled?: boolean
}

export function planNewTag(body: NewTagBody):
  Plan<{ type: TrackingTagType; tag_id: string; label: string | null; conversion_label: string | null; enabled: boolean }> {
  if (!isValidTagType(body.type)) return { ok: false, message: 'Тип тегу: ga4 / gtm / aw' }
  const type: TrackingTagType = body.type
  const tagId = (body.tag_id ?? '').trim()
  if (!isValidTagId(type, tagId)) {
    return { ok: false, message: `Невірний формат ID тегу. Очікується: ${TAG_ID_FORMAT_HINTS[type]}` }
  }
  const label = normalizeLabel(body.label)
  if (!label.ok) return label
  const conversionLabel = normalizeConversionLabel(body.conversion_label, type)
  if (!conversionLabel.ok) return conversionLabel
  const enabled = body.enabled === undefined ? true : !!body.enabled
  return { ok: true, value: { type, tag_id: tagId, label: label.value, conversion_label: conversionLabel.value, enabled } }
}

export type TagPatchBody = Partial<{ enabled: boolean; label: string | null; tag_id: string; conversion_label: string | null }>

export function planTagPatch(body: TagPatchBody, currentType: TrackingTagType): Plan<Record<string, unknown>> {
  const update: Record<string, unknown> = {}
  if (body.enabled !== undefined) update.enabled = !!body.enabled
  if (body.label !== undefined) {
    const label = normalizeLabel(body.label)
    if (!label.ok) return label
    update.label = label.value
  }
  if (body.conversion_label !== undefined) {
    const cl = normalizeConversionLabel(body.conversion_label, currentType)
    if (!cl.ok) return cl
    update.conversion_label = cl.value
  }
  if (body.tag_id !== undefined) {
    const tagId = (body.tag_id ?? '').trim()
    // tag_id валидируется по текущему типу тега — тип менять нельзя
    if (!isValidTagId(currentType, tagId)) {
      return { ok: false, message: `Невірний формат ID тегу. Очікується: ${TAG_ID_FORMAT_HINTS[currentType]}` }
    }
    update.tag_id = tagId
  }
  if (Object.keys(update).length === 0) return { ok: false, message: 'Нічого оновлювати' }
  return { ok: true, value: update }
}
