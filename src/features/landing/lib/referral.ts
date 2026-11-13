// features/landing/lib/referral — клиентское зеркало касаний партнёрских ссылок (отклонение 11).
// Основная атрибуция — HttpOnly-cookie lead_ref со списком касаний, которую ведёт middleware. Зеркало в
// localStorage — фолбэк, если cookie не дошла (блокировщики, Safari без cookie): тот же список
// касаний (первый ts по коду сохраняется, те же лимиты), идёт в тело заявки полем `refTouches`.
// Сервер объединяет cookie ⊕ тело ⊕ ?ref страницы и берёт самое раннее касание в окне атрибуции.
// Зеркало второстепенно: Safari ITP ограничивает script-writable storage 7 днями, серверная cookie — нет.
import { normalizeRefCode, REF_QUERY_KEY } from '@core/domain/referral/code'
import { addTouch, normalizeTouches, type ReferralTouch } from '@core/domain/referral/touches'

export const REF_STORAGE_KEY = 'lead_ref'

type Stored = { touches: ReferralTouch[] }
/** Легаси-формат (прод 2026-09-27): один код с ts в миллисекундах. */
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

/** Считывает ?ref= из текущего URL и добавляет касание (первый ts по коду сохраняется). SSR-safe. */
export function captureRefFromUrl(): void {
  if (typeof window === 'undefined') return
  try {
    const code = normalizeRefCode(new URLSearchParams(window.location.search).get(REF_QUERY_KEY))
    if (!code) return
    const value: Stored = { touches: addTouch(readStored(), code, nowSec()) }
    window.localStorage.setItem(REF_STORAGE_KEY, JSON.stringify(value))
  } catch {
    // localStorage недоступен — cookie от middleware остаётся основным каналом
  }
}

/** Сохранённые касания (не старше потолка cookie) для тела заявки; пустой массив, если ничего. */
export function getStoredRefTouches(): ReferralTouch[] {
  if (typeof window === 'undefined') return []
  const now = nowSec()
  // addTouch без нового кода не бывает — фильтруем тем же правилом «не старше 400 дней».
  return readStored().filter((t) => t.at <= now && now - t.at <= 400 * 24 * 3600)
}
