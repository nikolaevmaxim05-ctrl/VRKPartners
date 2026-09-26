// core/domain/referral/attribution — з якого джерела брати реферальний код заявки.
// Пріоритет: cookie lead_ref (HttpOnly, last-touch) → поле ref у тілі (зеркало localStorage)
// → ?ref= в URL сторінки, з якої відправлено форму. Перший ВАЛІДНИЙ виграє; усе інше — null.
import { normalizeRefCode, REF_QUERY_KEY } from './code'

export type ReferralSources = {
  cookie?: string | null
  body?: string | null
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

export function pickReferralCode(sources: ReferralSources): string | null {
  return normalizeRefCode(sources.cookie) ?? normalizeRefCode(sources.body) ?? refCodeFromPageUrl(sources.pageUrl)
}
