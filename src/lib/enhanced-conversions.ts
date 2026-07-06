// enhanced-conversions.ts — Google Ads Enhanced Conversions (промпт 021).
// Нормалізація + SHA-256 + gtag('set', 'user_data').
//
// Інваріанти безпеки:
//   • НІКОЛИ не кидає винятків (try/catch вокруг всього).
//   • НІЧОГО не логує (ні сирі значення, ні хеші).
//   • Не записує дані у storage.
//   • Сирі email/телефон у dataLayer/gtag('event') НІКОЛИ не потрапляють —
//     тільки sha256-хеші через gtag('set', 'user_data').
//   • SSR-safe: перевірка typeof window.

/** Нормалізація email: trim + lowercase */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

/**
 * Нормалізація телефону у формат E.164.
 * Видаляє пробіли, дужки, дефіси, крапки — залишає тільки + та цифри.
 * У формах телефон вже строго +380\d{9} після Zod-валідації.
 */
export function normalizePhoneE164(raw: string): string {
  // Залишаємо тільки '+' і цифри
  return raw.replace(/[^+\d]/g, '')
}

/**
 * SHA-256 хеш у hex lowercase через Web Crypto API.
 * В node-оточенні (vitest) доступний через globalThis.crypto.
 */
export async function sha256Hex(input: string): Promise<string> {
  try {
    const subtle = (typeof crypto !== 'undefined' ? crypto : globalThis.crypto)?.subtle
    if (!subtle) return ''

    const encoder = new TextEncoder()
    const data = encoder.encode(input)
    const hashBuffer = await subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return ''
  }
}

/**
 * Нормалізує, хешує та передає user_data у Google Ads Enhanced Conversions.
 * Викликається після успішної відправки форми — до або одночасно з track('...form_submit_success').
 *
 * SSR-safe, no-throw, без логування.
 */
export async function setEnhancedConversionUserData(data: {
  email?: string
  phone?: string
}): Promise<void> {
  try {
    if (typeof window === 'undefined') return
    if (typeof window.gtag !== 'function') return

    // Web Crypto: перевіряємо доступність
    const subtle = (typeof crypto !== 'undefined' ? crypto : globalThis.crypto)?.subtle
    if (!subtle) return

    const userData: Record<string, string> = {}

    if (data.email) {
      const normalized = normalizeEmail(data.email)
      if (normalized) {
        const hash = await sha256Hex(normalized)
        if (hash) userData.sha256_email_address = hash
      }
    }

    if (data.phone) {
      const normalized = normalizePhoneE164(data.phone)
      if (normalized) {
        const hash = await sha256Hex(normalized)
        if (hash) userData.sha256_phone_number = hash
      }
    }

    if (Object.keys(userData).length === 0) return

    window.gtag('set', 'user_data', userData)
  } catch {
    // Аналітика ніколи не повинна ламати UI
  }
}
