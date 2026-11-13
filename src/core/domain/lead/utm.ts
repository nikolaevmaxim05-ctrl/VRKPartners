// core/domain/lead/utm — UTM / атрибуция переходов: чистые ключи, нормализация, подписи.
// Работа с sessionStorage (getStoredUtm) — в презентации (lib/utm.ts → features/landing).

export const UTM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'ttclid',
  'referrer',
] as const

// Ключи, наличие которых в URL триггерит запись в sessionStorage (referrer — не из URL).
export const UTM_URL_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_term',
  'utm_content',
  'gclid',
  'fbclid',
  'ttclid',
] as const

export type UtmKey = (typeof UTM_KEYS)[number]
export type UtmData = Partial<Record<UtmKey, string>>

export const UTM_STORAGE_KEY = 'lead_utm'

// Безопасный парсинг сохранённого объекта — оставляем только известные ключи с непустыми строками.
export function normalizeUtm(raw: unknown): UtmData {
  if (!raw || typeof raw !== 'object') return {}
  const src = raw as Record<string, unknown>
  const out: UtmData = {}
  for (const key of UTM_KEYS) {
    const value = src[key]
    if (typeof value === 'string' && value.trim().length > 0) out[key] = value
  }
  return out
}

// Есть ли в объекте хоть одна содержательная метка.
export function hasUtm(utm: UtmData | undefined | null): utm is UtmData {
  if (!utm) return false
  return UTM_KEYS.some((key) => typeof utm[key] === 'string' && utm[key]!.length > 0)
}

// Человекочитаемые подписи ключей — для уведомлений (Telegram / email / CRM).
export const UTM_LABELS: Record<UtmKey, string> = {
  utm_source: 'Source',
  utm_medium: 'Medium',
  utm_campaign: 'Campaign',
  utm_term: 'Term',
  utm_content: 'Content',
  gclid: 'gclid',
  fbclid: 'fbclid',
  ttclid: 'ttclid',
  referrer: 'Referrer',
}

// Упорядоченный список имеющихся меток как пары [Label, value].
export function utmEntries(utm: UtmData | undefined | null): Array<[string, string]> {
  const out: Array<[string, string]> = []
  if (!utm) return out
  for (const key of UTM_KEYS) {
    const value = utm[key]
    if (typeof value === 'string' && value.length > 0) out.push([UTM_LABELS[key], value])
  }
  return out
}

// Краткая сводка для email-таблицы, напр.: "google → cpc → implant_kyiv (term: ..., content: ...)"
export function formatUtmSummary(utm: UtmData | undefined | null): string {
  if (!utm) return ''
  const chain = [utm.utm_source, utm.utm_medium, utm.utm_campaign]
    .filter((v): v is string => typeof v === 'string' && v.length > 0)
    .join(' → ')
  const extras: string[] = []
  if (utm.utm_term) extras.push(`term: ${utm.utm_term}`)
  if (utm.utm_content) extras.push(`content: ${utm.utm_content}`)
  const tail = extras.length ? `${chain ? ' ' : ''}(${extras.join(', ')})` : ''
  return `${chain}${tail}`.trim()
}
