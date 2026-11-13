// core/domain/tracking/tags — общие типы и валидация Google-тегов (GA4 / GTM / AW).
// Используется в admin API-роутах, редакторе тегов и в layout сайта.

export type TrackingTagType = 'ga4' | 'gtm' | 'aw'

export type TrackingTag = {
  id: string
  type: TrackingTagType
  tag_id: string
  label: string | null
  /** Google Ads conversion label — вторая половина send_to (`AW-XXX/LABEL`); только для type = aw. */
  conversion_label: string | null
  enabled: boolean
  position: number
  created_at: string
}

export const VALID_TAG_TYPES: readonly TrackingTagType[] = ['ga4', 'gtm', 'aw'] as const

// Серверная валидация формата tag_id по типу (промпт 015)
export const TAG_ID_PATTERNS: Record<TrackingTagType, RegExp> = {
  ga4: /^G-[A-Z0-9]+$/,
  gtm: /^GTM-[A-Z0-9]+$/,
  aw: /^AW-[0-9]+$/,
}

// Подсказки формата для ошибок валидации (на украинском)
export const TAG_ID_FORMAT_HINTS: Record<TrackingTagType, string> = {
  ga4: 'G-XXXXXXXXXX (великі літери та цифри)',
  gtm: 'GTM-XXXXXXX (великі літери та цифри)',
  aw: 'AW-XXXXXXXXXXX (лише цифри)',
}

/** Conversion label Google Ads: буквы/цифры/_/-, до 64 символов. */
export const CONVERSION_LABEL_RE = /^[A-Za-z0-9_-]{1,64}$/

export function isValidTagType(value: unknown): value is TrackingTagType {
  return typeof value === 'string' && VALID_TAG_TYPES.includes(value as TrackingTagType)
}

export function isValidTagId(type: TrackingTagType, tagId: string): boolean {
  return TAG_ID_PATTERNS[type].test(tagId)
}

export function isValidConversionLabel(label: string): boolean {
  return CONVERSION_LABEL_RE.test(label)
}

/** `AW-XXX/LABEL` для gtag('event','conversion',{send_to}) — только aw-теги с label. */
export function adsSendToList(tags: ReadonlyArray<{ type: TrackingTagType; tag_id: string; conversion_label: string | null }>): string[] {
  return tags
    .filter((t) => t.type === 'aw' && !!t.conversion_label && isValidConversionLabel(t.conversion_label) && isValidTagId('aw', t.tag_id))
    .map((t) => `${t.tag_id}/${t.conversion_label}`)
}
