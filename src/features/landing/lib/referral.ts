// features/landing/lib/referral — клієнтське дзеркало реферального коду (відхилення 11).
// Основна атрибуція — HttpOnly-cookie lead_ref, яку ставить middleware. Дзеркало в localStorage —
// фолбек, якщо cookie не дійшла (блокувальники, Safari без cookie): код із ?ref= зберігається на
// REF_TTL_DAYS і йде у тіло заявки полем `ref` (сервер бере cookie → тіло → ?ref сторінки).
import { normalizeRefCode, REF_QUERY_KEY, REF_TTL_DAYS } from '@core/domain/referral/code'

export const REF_STORAGE_KEY = 'lead_ref'

type Stored = { code: string; at: number }

/** Зчитує ?ref= з поточного URL і зберігає (last-touch). SSR-safe. */
export function captureRefFromUrl(): void {
  if (typeof window === 'undefined') return
  try {
    const code = normalizeRefCode(new URLSearchParams(window.location.search).get(REF_QUERY_KEY))
    if (!code) return
    const value: Stored = { code, at: Date.now() }
    window.localStorage.setItem(REF_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // localStorage недоступний — cookie від middleware лишається основним каналом
  }
}

/** Збережений код, якщо не протермінований; інакше undefined. */
export function getStoredRef(): string | undefined {
  if (typeof window === 'undefined') return undefined
  try {
    const raw = window.localStorage.getItem(REF_STORAGE_KEY)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as Partial<Stored>
    const code = normalizeRefCode(parsed.code)
    const at = typeof parsed.at === 'number' ? parsed.at : 0
    if (!code || Date.now() - at > REF_TTL_DAYS * 24 * 3600 * 1000) return undefined
    return code
  } catch {
    return undefined
  }
}
