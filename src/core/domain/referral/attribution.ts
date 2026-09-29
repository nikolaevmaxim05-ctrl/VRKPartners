// core/domain/referral/attribution — з яких джерел збираються касання партнерських посилань.
// Джерела: cookie lead_ref (HttpOnly, список касань) ⊕ тіло заявки (refTouches — дзеркало
// localStorage; легасі-поле ref — одне касання «зараз») ⊕ ?ref= в URL сторінки (касання «зараз»).
// Списки обʼєднуються (за кодом — мінімальний ts), вибір касання — pickReferralTouch у приймачі.
import { normalizeRefCode, REF_QUERY_KEY } from './code'
import { decodeRefCookie, mergeTouches, normalizeTouches, type ReferralTouch } from './touches'

export type ReferralSources = {
  cookie?: string | null
  /** refTouches із тіла (уже нормалізовані Zod або сирі — нормалізуються ще раз). */
  body?: unknown
  /** Легасі-поле ref (клієнти зі старим бандлом). */
  legacyBody?: string | null
  pageUrl?: string | null
}

/** ?ref= з повного URL сторінки (невалідний URL → null). */
export function refCodeFromPageUrl(pageUrl: string | null | undefined): string | null {
  if (!pageUrl) return null
  try {
    return normalizeRefCode(new URL(pageUrl).searchParams.get(REF_QUERY_KEY))
  } catch {
    return null
  }
}

/** Усі касання з трьох джерел, обʼєднані за кодом (мінімальний ts), відсортовані за часом. */
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
