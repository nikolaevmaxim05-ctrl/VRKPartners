// core/domain/content/seo — метадані (SEO) головної: мерж/дифф/наслідування.
// Відхилення 2 (AGENTS.md): вкладка «Метадані» редагується з адмінки; хранилище —
// рядок site_content id='seo'. Дефолти приходять параметром (ядро не знає config/site).

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

/** Порядок/набір полів — єдине джерело правди (для diff/whitelist). */
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

/** Мерж дефолтів з оверрайдами. Порожні/невалідні оверрайди → лишається дефолт. */
export function mergeSeo(defaults: SeoMeta, overrides: SeoOverrides | null | undefined): SeoMeta {
  return { ...defaults, ...cleanStrings(overrides) }
}

/** OG-заголовок/опис із наслідуванням: порожньо → основні title/description. */
export function effectiveOg(m: SeoMeta): { title: string; description: string } {
  return {
    title: m.ogTitle.trim() || m.title,
    description: m.ogDescription.trim() || m.description,
  }
}

/** Дані організації для JSON-LD з наслідуванням порожніх полів. */
export function effectiveOrg(m: SeoMeta, siteName: string): { name: string; description: string } {
  return {
    name: m.orgName.trim() || siteName,
    description: m.orgDescription.trim() || m.description,
  }
}

/** Diff від дефолтів: лише непорожні поля, що відрізняються. */
export function diffSeo(incoming: SeoOverrides, defaults: SeoMeta): SeoOverrides {
  const out: SeoOverrides = {}
  for (const k of SEO_KEYS) {
    const v = incoming[k]
    if (typeof v === 'string' && v.trim().length > 0 && v !== defaults[k]) out[k] = v
  }
  return out
}
