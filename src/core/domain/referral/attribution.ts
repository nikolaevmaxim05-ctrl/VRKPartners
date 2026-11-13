// core/domain/referral/attribution — из каких источников собираются касания партнёрских ссылок.
// Источники: cookie lead_ref (HttpOnly, список касаний) ⊕ тело заявки (refTouches — зеркало
// localStorage; легаси-поле ref — одно касание «сейчас») ⊕ ?ref= в URL страницы (касание «сейчас»).
// Списки объединяются (по коду — минимальный ts), выбор касания — pickReferralTouch в приёмнике.
import { normalizeRefCode, REF_QUERY_KEY } from './code'
import { decodeRefCookie, mergeTouches, normalizeTouches, type ReferralTouch } from './touches'

export type ReferralSources = {
  cookie?: string | null
  /** refTouches из тела (уже нормализованные Zod или сырые — нормализуются ещё раз). */
  body?: unknown
  /** Легаси-поле ref (клиенты со старым бандлом). */
  legacyBody?: string | null
  pageUrl?: string | null
}

/** ?ref= из полного URL страницы (невалидный URL → null). */
export function refCodeFromPageUrl(pageUrl: string | null | undefined): string | null {
  if (!pageUrl) return null
  try {
    return normalizeRefCode(new URL(pageUrl).searchParams.get(REF_QUERY_KEY))
  } catch {
    return null
  }
}

/** Все касания из трёх источников, объединённые по коду (минимальный ts), отсортированные по времени. */
export function collectReferralTouches(sources: ReferralSources, now: number): ReferralTouch[] {
  const fromCookie = decodeRefCookie(sources.cookie, now)
  const fromBody = normalizeTouches(sources.body)
  const legacy = normalizeRefCode(sources.legacyBody)
  const pageCode = refCodeFromPageUrl(sources.pageUrl)
  const extra: ReferralTouch[] = []
  if (legacy) extra.push({ code: legacy, at: now })
  if (pageCode) extra.push({ code: pageCode, at: now })
  return mergeTouches(fromCookie, fromBody, extra)
}
