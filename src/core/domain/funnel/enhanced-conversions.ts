// core/domain/funnel/enhanced-conversions — нормализация и хеш для Google Ads
// Enhanced Conversions (раздел 15). Чистый модуль: без window/gtag.
// Одни и те же функции на сайте (gtag('set','user_data')) и в офлайн-выгрузке (Google Sheets):
// телефон — единая normalizePhone (E.164), email — без точек в gmail перед хешем.
import { normalizePhone } from '../lead/phone'
import { emailForHash } from '../lead/email'

export { normalizeEmail, emailForHash } from '../lead/email'
export { normalizePhone } from '../lead/phone'

/** Значения, которые нужно хешировать для user_data (пустые → пропускаются). */
export function hashableUserData(data: { email?: string | null; phone?: string | null }): {
  email?: string
  phone?: string
} {
  const out: { email?: string; phone?: string } = {}
  if (data.email) {
    const e = emailForHash(data.email)
    if (e) out.email = e
  }
  if (data.phone) {
    const p = normalizePhone(data.phone)
    if (p) out.phone = p
  }
  return out
}

/**
 * SHA-256 hex lowercase через Web Crypto API (доступен в браузере и Node ≥ 19).
 * Никогда не бросает: без subtle → ''.
 */
export async function sha256Hex(input: string): Promise<string> {
  try {
    const subtle = (typeof crypto !== 'undefined' ? crypto : globalThis.crypto)?.subtle
    if (!subtle) return ''
    const data = new TextEncoder().encode(input)
    const hashBuffer = await subtle.digest('SHA-256', data)
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
  } catch {
    return ''
  }
}
