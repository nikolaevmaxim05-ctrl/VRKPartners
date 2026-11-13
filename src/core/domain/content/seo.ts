// core/domain/content/seo — метаданные (SEO) главной: мерж/дифф/наследование.
// Отклонение 2 (AGENTS.md): вкладка «Метадані» редактируется из админки; хранилище —
// строка site_content id='seo'. Дефолты приходят параметром (ядро не знает config/site).

export const SEO_CONTENT_ID = 'seo'

export type SeoMeta = {
  title: string
  description: string
  ogTitle: string
  ogDescription: string
  ogImage: string
  orgName: string
  orgDescription: string
}

export type SeoOverrides = Partial<SeoMeta>

/** Порядок/набор полей — единый источник правды (для diff/whitelist). */
export const SEO_KEYS: readonly (keyof SeoMeta)[] = [
  'title', 'description', 'ogTitle', 'ogDescription', 'ogImage',
  'orgName', 'orgDescription',
]

function cleanStrings(ov: SeoOverrides | null | undefined): Partial<SeoMeta> {
  const out: Partial<SeoMeta> = {}
  if (!ov) return out
  for (const k of SEO_KEYS) {
    const v = ov[k]
    if (typeof v === 'string' && v.trim().length > 0) out[k] = v
  }
  return out
}

/** Мерж дефолтов с оверрайдами. Пустые/невалидные оверрайды → остаётся дефолт. */
export function mergeSeo(defaults: SeoMeta, overrides: SeoOverrides | null | undefined): SeoMeta {
  return { ...defaults, ...cleanStrings(overrides) }
}

/** OG-заголовок/описание с наследованием: пусто → основные title/description. */
export function effectiveOg(m: SeoMeta): { title: string; description: string } {
  return {
    title: m.ogTitle.trim() || m.title,
    description: m.ogDescription.trim() || m.description,
  }
}

/** Данные организации для JSON-LD с наследованием пустых полей. */
export function effectiveOrg(m: SeoMeta, siteName: string): { name: string; description: string } {
  return {
    name: m.orgName.trim() || siteName,
    description: m.orgDescription.trim() || m.description,
  }
}

/** Diff от дефолтов: только непустые поля, которые отличаются. */
export function diffSeo(incoming: SeoOverrides, defaults: SeoMeta): SeoOverrides {
  const out: SeoOverrides = {}
  for (const k of SEO_KEYS) {
    const v = incoming[k]
    if (typeof v === 'string' && v.trim().length > 0 && v !== defaults[k]) out[k] = v
  }
  return out
}
