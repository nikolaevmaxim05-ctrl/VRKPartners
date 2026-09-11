// core/domain/funnel/enhanced-conversions — нормалізація та хеш для Google Ads
// Enhanced Conversions (розділ 15). Чистий модуль: без window/gtag.
// Одні й ті самі функції на сайті (gtag('set','user_data')) і в офлайн-вигрузці (Google Sheets):
// телефон — єдина normalizePhone (E.164), email — без крапок у gmail перед хешем.
import { normalizePhone } from '../lead/phone'
import { emailForHash } from '../lead/email'

export { normalizeEmail, emailForHash } from '../lead/email'
export { normalizePhone } from '../lead/phone'

/** Значення, які треба хешувати для user_data (порожні → пропускаються). */
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
 * SHA-256 hex lowercase через Web Crypto API (доступний у браузері та Node ≥ 19).
 * Ніколи не кидає: без subtle → ''.
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
