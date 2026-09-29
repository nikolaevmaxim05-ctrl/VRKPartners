// features/landing/lib/referral — клієнтське дзеркало касань партнерських посилань (відхилення 11).
// Основна атрибуція — HttpOnly-cookie lead_ref зі списком касань, яку веде middleware. Дзеркало в
// localStorage — фолбек, якщо cookie не дійшла (блокувальники, Safari без cookie): той самий список
// касань (перший ts за кодом зберігається, ті самі ліміти), йде у тіло заявки полем `refTouches`.
// Сервер обʼєднує cookie ⊕ тіло ⊕ ?ref сторінки і бере найраніше касання у вікні атрибуції.
// Дзеркало другорядне: Safari ITP обмежує script-writable storage 7 днями, серверна cookie — ні.
import { normalizeRefCode, REF_QUERY_KEY } from '@core/domain/referral/code'
import { addTouch, normalizeTouches, type ReferralTouch } from '@core/domain/referral/touches'

export const REF_STORAGE_KEY = 'lead_ref'

type Stored = { touches: ReferralTouch[] }
/** Легасі-формат (прод 2026-09-27): один код із ts у мілісекундах. */
type LegacyStored = { code?: unknown; at?: unknown }

function nowSec(): number {
  return Math.floor(Date.now() / 1000)
}

function readStored(): ReferralTouch[] {
  try {
    const raw = window.localStorage.getItem(REF_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<Stored> & LegacyStored
    if (Array.isArray(parsed.touches)) return normalizeTouches(parsed.touches)
    const legacy = normalizeRefCode(parsed.code)
    const at = typeof parsed.at === 'number' ? Math.floor(parsed.at / 1000) : nowSec()
    return legacy ? normalizeTouches([{ code: legacy, at }]) : []
  } catch {
    return []
  }
}

/** Зчитує ?ref= з поточного URL і додає касання (перший ts за кодом зберігається). SSR-safe. */
export function captureRefFromUrl(): void {
  if (typeof window === 'undefined') return
  try {
    const code = normalizeRefCode(new URLSearchParams(window.location.search).get(REF_QUERY_KEY))
    if (!code) return
    const value: Stored = { touches: addTouch(readStored(), code, nowSec()) }
    window.localStorage.setItem(REF_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // localStorage недоступний — cookie від middleware лишається основним каналом
  }
}

/** Збережені касання (не старші за стелю cookie) для тіла заявки; порожній масив, якщо нічого. */
export function getStoredRefTouches(): ReferralTouch[] {
  if (typeof window === 'undefined') return []
  const now = nowSec()
  // addTouch без нового коду не буває — фільтруємо тим самим правилом «не старші за 400 днів».
  return readStored().filter((t) => t.at <= now && now - t.at <= 400 * 24 * 3600)
}
