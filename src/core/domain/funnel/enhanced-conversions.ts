// core/domain/funnel/enhanced-conversions — нормалізація та хеш для Google Ads
// Enhanced Conversions (раздел 15). Чистий модуль: без window/gtag.
// Виклик gtag('set','user_data') — у features/landing (Фаза 1: поки lib/enhanced-conversions.ts).
//
// Фаза 4: normalizePhoneE164 буде замінено на єдину normalizePhone (core/domain/lead/phone),
// а для gmail.com/googlemail.com перед хешем прибиратимуться крапки.

/** Нормалізація email: trim + lowercase */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

/**
 * Нормалізація телефону у формат E.164: лишає тільки '+' та цифри.
 * (Поведінка Фази 1 — як було; у формах телефон уже +380\d{9} після Zod.)
 */
export function normalizePhoneE164(raw: string): string {
  return raw.replace(/[^+\d]/g, '')
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
