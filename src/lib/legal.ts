// Юридичні документи (Політика конфіденційності, Публічна оферта):
// дефолти живуть у src/content/legal/*, оверрайди — в БД (таблиця site_content,
// окремий рядок id='legal', колонка data JSONB). Механізм і fail-safe — той самий,
// що для контенту лендингу (див. lib/content.ts), але зберігаємо в окремому рядку,
// щоб «останнє оновлення» документів було незалежним від правок лендингу.

import { privacyPolicy } from '@/content/legal/privacy-policy'
import { publicOffer } from '@/content/legal/public-offer'
import type { LegalDocument, LegalSection } from '@/content/legal/types'

export const LEGAL_CONTENT_ID = 'legal'

/** Ключі документів у сховищі. */
export type LegalDocKey = 'privacy' | 'offer'

/** Повний набір документів після мержу дефолтів з оверрайдами. */
export type LegalContent = Record<LegalDocKey, LegalDocument>

/** Оверрайд: лише секції (заголовок документа й дефолтний updatedAt лишаються з коду). */
export type LegalDocOverride = { sections: LegalSection[] }
export type LegalOverrides = Partial<Record<LegalDocKey, LegalDocOverride>>

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v))
}

/** Дефолти з коду (config/site + content-файли) у мутабельному вигляді. */
export function getDefaultLegalContent(): LegalContent {
  return {
    privacy: clone(privacyPolicy),
    offer: clone(publicOffer),
  }
}

/** Санітизація однієї секції з довільного JSON — лише plain-текст, без HTML-обробки. */
function cleanSection(raw: unknown): LegalSection | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const heading = typeof r.heading === 'string' ? r.heading : ''
  const paragraphs = Array.isArray(r.paragraphs)
    ? r.paragraphs.filter((p): p is string => typeof p === 'string')
    : []
  const items = Array.isArray(r.items)
    ? r.items.filter((p): p is string => typeof p === 'string')
    : undefined
  // Порожня секція (без заголовка, абзаців і пунктів) — відкидаємо.
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
export function mergeLegalContent(overrides: LegalOverrides | null | undefined): LegalContent {
  const base = getDefaultLegalContent()
  if (!overrides || typeof overrides !== 'object') return base
  return {
    privacy: mergeDoc(base.privacy, overrides.privacy),
    offer: mergeDoc(base.offer, overrides.offer),
  }
}

/** Лишає лише документи, чиї секції ВІДРІЗНЯЮТЬСЯ від дефолтів (не заморожуємо код). */
export function diffLegalOverrides(
  incoming: LegalOverrides,
  defaults: LegalContent,
): LegalOverrides {
  const out: LegalOverrides = {}
  const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
  ;(['privacy', 'offer'] as LegalDocKey[]).forEach((key) => {
    const inc = incoming[key]
    if (inc && Array.isArray(inc.sections) && !eq(inc.sections, defaults[key].sections)) {
      out[key] = { sections: inc.sections }
    }
  })
  return out
}

/** Серверне читання оверрайдів. Будь-яка помилка → {} (сторінки падають на дефолти). */
export async function getLegalOverrides(): Promise<LegalOverrides> {
  try {
    const { createServiceClient } = await import('@/lib/supabase/service')
    const service = createServiceClient()
    const { data, error } = await service
      .from('site_content')
      .select('data')
      .eq('id', LEGAL_CONTENT_ID)
      .maybeSingle()
    if (error || !data?.data) return {}
    return data.data as LegalOverrides
  } catch {
    return {}
  }
}

/** updated_at рядка легальних документів — дата останнього збереження (або null). */
export async function getLegalUpdatedAt(): Promise<string | null> {
  try {
    const { createServiceClient } = await import('@/lib/supabase/service')
    const service = createServiceClient()
    const { data } = await service
      .from('site_content')
      .select('updated_at')
      .eq('id', LEGAL_CONTENT_ID)
      .maybeSingle()
    return (data?.updated_at as string | null) ?? null
  } catch {
    return null
  }
}

/** Дата для показу під заголовком: збереження оверрайду або дефолтна дата документа. */
export function formatLegalUpdatedAt(
  updatedAtIso: string | null,
  fallback?: string,
): string | undefined {
  if (updatedAtIso) {
    const d = new Date(updatedAtIso)
    if (!Number.isNaN(d.getTime())) {
      return d.toLocaleDateString('uk-UA', { day: '2-digit', month: '2-digit', year: 'numeric' })
    }
  }
  return fallback
}
