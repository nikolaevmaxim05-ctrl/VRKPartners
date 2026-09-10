// core/domain/content/legal — юридичні документи (відхилення 3, AGENTS.md):
// мерж секцій, дифф, санітизація, формат дати. Дефолти приходять параметром.

export const LEGAL_CONTENT_ID = 'legal'

export type LegalSection = { heading: string; paragraphs: string[]; items?: string[] }
export type LegalDocument = { title: string; updatedAt?: string; sections: LegalSection[] }

/** Ключі документів у сховищі. */
export type LegalDocKey = 'privacy' | 'offer'

export type LegalContent = Record<LegalDocKey, LegalDocument>

/** Оверрайд: лише секції (заголовок документа й дефолтний updatedAt лишаються з коду). */
export type LegalDocOverride = { sections: LegalSection[] }
export type LegalOverrides = Partial<Record<LegalDocKey, LegalDocOverride>>

export const LEGAL_DOC_KEYS: readonly LegalDocKey[] = ['privacy', 'offer']

/** Санітизація однієї секції з довільного JSON — лише plain-текст. */
export function cleanSection(raw: unknown): LegalSection | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const heading = typeof r.heading === 'string' ? r.heading : ''
  const paragraphs = Array.isArray(r.paragraphs)
    ? r.paragraphs.filter((p): p is string => typeof p === 'string')
    : []
  const items = Array.isArray(r.items)
    ? r.items.filter((p): p is string => typeof p === 'string')
    : undefined
  if (!heading.trim() && paragraphs.length === 0 && (!items || items.length === 0)) return null
  const section: LegalSection = { heading, paragraphs }
  if (items && items.length > 0) section.items = items
  return section
}

function mergeDoc(base: LegalDocument, ov?: LegalDocOverride): LegalDocument {
  if (!ov || !Array.isArray(ov.sections) || ov.sections.length === 0) return base
  const sections = ov.sections.map(cleanSection).filter((s): s is LegalSection => s !== null)
  if (sections.length === 0) return base
  return { ...base, sections }
}

/** Мерж дефолтів з оверрайдами. Порожні/невалідні оверрайди → лишаються дефолти. */
export function mergeLegalContent(
  defaults: LegalContent,
  overrides: LegalOverrides | null | undefined,
): LegalContent {
  if (!overrides || typeof overrides !== 'object') return defaults
  return {
    privacy: mergeDoc(defaults.privacy, overrides.privacy),
    offer: mergeDoc(defaults.offer, overrides.offer),
  }
}

/** Лишає лише документи, чиї секції ВІДРІЗНЯЮТЬСЯ від дефолтів. */
export function diffLegalOverrides(incoming: LegalOverrides, defaults: LegalContent): LegalOverrides {
  const out: LegalOverrides = {}
  const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  for (const key of LEGAL_DOC_KEYS) {
    const inc = incoming[key]
    if (inc && Array.isArray(inc.sections) && !eq(inc.sections, defaults[key].sections)) {
      out[key] = { sections: inc.sections }
    }
  }
  return out
}

/** Дата для показу під заголовком: збереження оверрайду або дефолтна дата документа. */
export function formatLegalUpdatedAt(updatedAtIso: string | null, fallback?: string): string | undefined {
  if (updatedAtIso) {
    const d = new Date(updatedAtIso)
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
    }
  }
  return fallback
}
