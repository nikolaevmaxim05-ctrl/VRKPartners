// tracking-tags.ts — спільні типи та валідація Google-тегів (GA4 / GTM / AW)
// Використовується в admin API-роутах і на лендингу ((marketing)/layout.tsx).

export type TrackingTagType = 'ga4' | 'gtm' | 'aw'

export type TrackingTag = {
  id: string
  type: TrackingTagType
  tag_id: string
  label: string | null
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

// Підказки формату для помилок валідації (українською)
export const TAG_ID_FORMAT_HINTS: Record<TrackingTagType, string> = {
  ga4: 'G-XXXXXXXXXX (великі літери та цифри)',
  gtm: 'GTM-XXXXXXX (великі літери та цифри)',
  aw: 'AW-XXXXXXXXXXX (лише цифри)',
}

export function isValidTagType(value: unknown): value is TrackingTagType {
  return typeof value === 'string' && VALID_TAG_TYPES.includes(value as TrackingTagType)
}

export function isValidTagId(type: TrackingTagType, tagId: string): boolean {
  return TAG_ID_PATTERNS[type].test(tagId)
}
